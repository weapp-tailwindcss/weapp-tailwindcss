import type { NativeRuntimeIdentity } from '../../examples/react-native-expo/src/compatibility/protocol'
import type { ReactNativeReport } from './catalog'
import type { NativeRuntimePhase } from './phase-contract'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { RN_FIXTURE_HASH } from './catalog'
import { runtimeIdentity, validateRuntimeIdentity, validateRuntimeInstallation } from './installation-evidence'
import { nativeEncodingArtifactNames, nativeRuntimePhases, RN_PHASE_EVIDENCE_VERSION } from './phase-contract'

export const phaseIndexName = 'phase-index.json'
export const phaseArtifactDefinitions = [
  { name: 'report', segments: ['report.json'] },
  ...nativeEncodingArtifactNames.map(name => ({ name: `encoding:${name}`, segments: ['encoding', name] })),
  { name: 'source:css', segments: ['sources', 'global.css'] },
  { name: 'source:marker', segments: ['sources', 'hmr-marker.ts'] },
  { name: 'source:virtual', segments: ['sources', 'virtual.js'] },
]

export interface NativePhaseEntry {
  phase: NativeRuntimePhase['id']
  revision: NativeRuntimePhase['revision']
  artifacts: Array<{ name: string, sha256: string, byteLength: number }>
  runtimeInstallation: NativeRuntimeIdentity & { evidence: 'runtime-installation', serializedManifestSha256: string }
  sourceArchive: {
    evidence: 'metro-input'
    servedBundle: 'not-captured'
    cssInput: string
    markerInput: ['src', 'hmr-marker.ts']
    virtualInput: string
    publicationRevision: string
  }
}

export interface NativePhaseIndex {
  version: number
  fixtureHash: string
  runId: string
  platform: ReactNativeReport['platform']
  runtimeInstanceId: string
  phases: NativePhaseEntry[]
}

export function nativePhaseDirectory(directory: string, phase: NativeRuntimePhase) {
  return path.join(directory, 'phases', phase.id)
}

export function createNativePhaseIndex(report: ReactNativeReport): NativePhaseIndex {
  validateRuntimeInstallation(report.runtimeInstallation)
  return { version: RN_PHASE_EVIDENCE_VERSION, fixtureHash: RN_FIXTURE_HASH, runId: report.runId, platform: report.platform, runtimeInstanceId: report.runtimeInstallation.runtimeInstanceId, phases: [] }
}

/** 前缀只用于逐阶段写入；离线验收始终要求全部固定阶段且顺序唯一。 */
export function validateNativePhaseIndex(index: NativePhaseIndex, report: ReactNativeReport, complete = true) {
  validateRuntimeInstallation(report.runtimeInstallation)
  if (index?.runtimeInstanceId !== report.runtimeInstallation.runtimeInstanceId) {
    throw new Error('React Native 阶段运行实例改变，不能以整包刷新冒充 HMR')
  }
  if (index?.version !== RN_PHASE_EVIDENCE_VERSION || index.fixtureHash !== RN_FIXTURE_HASH
    || index.runId !== report.runId || index.platform !== report.platform || !Array.isArray(index.phases)
    || (complete ? index.phases.length !== nativeRuntimePhases.length : index.phases.length > nativeRuntimePhases.length)) {
    throw new Error('React Native 阶段索引缺少完整协议或本轮身份')
  }
  for (const [position, entry] of index.phases.entries()) {
    const phase = nativeRuntimePhases[position]!
    validateRuntimeIdentity(entry.runtimeInstallation)
    if (entry.runtimeInstallation.evidence !== 'runtime-installation' || entry.runtimeInstallation.runtimeInstanceId !== index.runtimeInstanceId || !/^[a-f\d]{64}$/.test(entry.runtimeInstallation.serializedManifestSha256)) {
      throw new Error(`React Native 阶段实际安装或运行实例证据缺失：${phase.id}`)
    }
    if (entry?.phase !== phase.id || entry.revision !== phase.revision
      || !Array.isArray(entry.artifacts) || entry.artifacts.length !== phaseArtifactDefinitions.length
      || entry.artifacts.some((item, offset) => item?.name !== phaseArtifactDefinitions[offset]!.name || !/^[a-f\d]{64}$/.test(item.sha256) || !Number.isSafeInteger(item.byteLength) || item.byteLength <= 0)
      || entry.sourceArchive?.evidence !== 'metro-input' || entry.sourceArchive.servedBundle !== 'not-captured') {
      throw new Error(`React Native 阶段重复、顺序错误或缺少原始产物：${phase.id}`)
    }
  }
  return index
}

/** 对实际保存的文件逐件生成回执，不使用调用方传来的布尔检查点。 */
export async function snapshotNativePhase(directory: string, phase: NativeRuntimePhase): Promise<NativePhaseEntry> {
  const root = nativePhaseDirectory(directory, phase)
  const artifacts = await Promise.all(phaseArtifactDefinitions.map(async ({ name, segments }) => {
    const bytes = await readFile(path.join(root, ...segments))
    return { name, sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.length }
  }))
  const publication = JSON.parse(await readFile(path.join(root, 'encoding', 'manifest.ready'), 'utf8'))
  const input = JSON.parse(await readFile(path.join(root, 'encoding', 'static-evidence.json'), 'utf8'))
  const report = JSON.parse(await readFile(path.join(root, 'report.json'), 'utf8')) as ReactNativeReport
  validateRuntimeInstallation(report.runtimeInstallation)
  return { phase: phase.id, revision: phase.revision, artifacts, runtimeInstallation: { ...runtimeIdentity(report.runtimeInstallation), evidence: 'runtime-installation', serializedManifestSha256: createHash('sha256').update(report.runtimeInstallation.manifestJson).digest('hex') }, sourceArchive: { evidence: 'metro-input', servedBundle: 'not-captured', cssInput: input.generation.runtimeInput.options.input, markerInput: ['src', 'hmr-marker.ts'], virtualInput: publication.virtualPath, publicationRevision: publication.revision } }
}
