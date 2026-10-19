import type { ReactNativeReport } from './catalog'
import type { NativeRuntimePhase } from './phase-contract'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { RN_FIXTURE_HASH } from './catalog'
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
  phases: NativePhaseEntry[]
}

export function nativePhaseDirectory(directory: string, phase: NativeRuntimePhase) {
  return path.join(directory, 'phases', phase.id)
}

export function createNativePhaseIndex(report: ReactNativeReport): NativePhaseIndex {
  return { version: RN_PHASE_EVIDENCE_VERSION, fixtureHash: RN_FIXTURE_HASH, runId: report.runId, platform: report.platform, phases: [] }
}

/** 前缀只用于逐阶段写入；离线验收始终要求全部固定阶段且顺序唯一。 */
export function validateNativePhaseIndex(index: NativePhaseIndex, report: ReactNativeReport, complete = true) {
  if (index?.version !== RN_PHASE_EVIDENCE_VERSION || index.fixtureHash !== RN_FIXTURE_HASH
    || index.runId !== report.runId || index.platform !== report.platform || !Array.isArray(index.phases)
    || (complete ? index.phases.length !== nativeRuntimePhases.length : index.phases.length > nativeRuntimePhases.length)) {
    throw new Error('React Native 阶段索引缺少完整协议或本轮身份')
  }
  for (const [position, entry] of index.phases.entries()) {
    const phase = nativeRuntimePhases[position]!
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
  return { phase: phase.id, revision: phase.revision, artifacts, sourceArchive: { evidence: 'metro-input', servedBundle: 'not-captured', cssInput: input.generation.runtimeInput.options.input, markerInput: ['src', 'hmr-marker.ts'], virtualInput: publication.virtualPath, publicationRevision: publication.revision } }
}
