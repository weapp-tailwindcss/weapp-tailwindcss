import type { NativeRuntimePhase } from './react-native/phase-contract'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { virtualModuleCode } from '../packages/react-native/src/metro/virtual-module'
import { nativeRuntimePhases } from './react-native/phase-contract'
import { validateNativeRuntimePhases } from './react-native/phase-evidence'
import { writeNativePhaseFixture } from './react-native/phase-fixture'
import { nativePhaseDirectory, phaseArtifactDefinitions, phaseIndexName, snapshotNativePhase } from './react-native/phase-index'
import { writeRuntimeFixture } from './react-native/runtime-fixture'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rn-phase-evidence-'))
  directories.push(directory)
  const report = await writeRuntimeFixture(directory, 'web', 'phase-current-run', new Date().toISOString())
  await writeNativePhaseFixture(directory, report)
  return { directory, report }
}

async function resnapshot(directory: string, phase: NativeRuntimePhase) {
  const index = JSON.parse(await readFile(path.join(directory, phaseIndexName), 'utf8'))
  index.phases[nativeRuntimePhases.indexOf(phase)] = await snapshotNativePhase(directory, phase)
  await writeFile(path.join(directory, phaseIndexName), JSON.stringify(index))
}

it('三阶段真实生成 manifest 与独立截图均可离线回放，合法 HMR 源码差异不会被恢复后的源码误拒绝', async () => {
  const { directory, report } = await fixture()
  const result = await validateNativeRuntimePhases(report, directory)
  expect(result.phases.map(phase => phase.report.revision)).toEqual(nativeRuntimePhases.map(phase => phase.revision))
  const baselineCss = await readFile(path.join(nativePhaseDirectory(directory, nativeRuntimePhases[0]), 'sources', 'global.css'), 'utf8')
  const finalCss = await readFile(path.join(nativePhaseDirectory(directory, nativeRuntimePhases[2]), 'sources', 'global.css'), 'utf8')
  expect(baselineCss).toContain('#10b981')
  expect(finalCss).toContain('#f59e0b')
  expect(finalCss).not.toBe(baselineCss)
  const index = JSON.parse(await readFile(path.join(directory, phaseIndexName), 'utf8'))
  for (const phase of index.phases) {
    expect(phase.sourceArchive.evidence).toBe('metro-input')
    expect(phase.sourceArchive.servedBundle).toBe('not-captured')
    expect(phase.artifacts.map((artifact: { name: string }) => artifact.name)).toEqual(phaseArtifactDefinitions.map(item => item.name))
  }
})

it.each(nativeRuntimePhases.flatMap(phase => phaseArtifactDefinitions.map(artifact => [phase.id, artifact.name, phase, artifact] as const)))('缺少 %s 的 %s 时，最终报告和兼容 encoding 完整也不能通过', async (_id, _name, phase, artifact) => {
  const { directory, report } = await fixture()
  await rm(path.join(nativePhaseDirectory(directory, phase), ...artifact.segments))
  await expect(validateNativeRuntimePhases(report, directory)).rejects.toThrow()
})

it.each(['missing', 'duplicate', 'reordered', 'old-version', 'runId', 'platform', 'fixtureHash'] as const)('阶段索引的 %s 必须被拒绝', async (kind) => {
  const { directory, report } = await fixture()
  const index = JSON.parse(await readFile(path.join(directory, phaseIndexName), 'utf8'))
  if (kind === 'missing') {
    index.phases.pop()
  }
  else if (kind === 'duplicate') {
    index.phases[1] = index.phases[0]
  }
  else if (kind === 'reordered') {
    index.phases.reverse()
  }
  else if (kind === 'old-version') {
    delete index.version
  }
  else {
    index[kind] = 'previous-run'
  }
  await writeFile(path.join(directory, phaseIndexName), JSON.stringify(index))
  await expect(validateNativeRuntimePhases(report, directory)).rejects.toThrow(/阶段/)
})

it.each(['encoding', 'report'] as const)('跨 revision 替换 %s 并重算阶段摘要仍被独立身份校验拒绝', async (kind) => {
  const { directory, report } = await fixture()
  const baseline = nativePhaseDirectory(directory, nativeRuntimePhases[0])
  const updated = nativePhaseDirectory(directory, nativeRuntimePhases[1])
  await cp(path.join(updated, kind === 'report' ? 'report.json' : kind), path.join(baseline, kind === 'report' ? 'report.json' : kind), { recursive: true })
  await resnapshot(directory, nativeRuntimePhases[0])
  await expect(validateNativeRuntimePhases(report, directory)).rejects.toThrow(/revision|本轮稳定发布身份/)
})

it.each(['runId', 'revision', 'browser', 'fixtureHash'] as const)('前阶段报告的 %s 不符，即使重算全部阶段摘要也不能放行', async (field) => {
  const { directory, report } = await fixture()
  const baseline = nativePhaseDirectory(directory, nativeRuntimePhases[0])
  const raw = JSON.parse(await readFile(path.join(baseline, 'report.json'), 'utf8'))
  if (field === 'browser') {
    raw.environment.browser.name = 'firefox'
  }
  else {
    raw[field] = 'previous-run'
  }
  await writeFile(path.join(baseline, 'report.json'), JSON.stringify(raw))
  await resnapshot(directory, nativeRuntimePhases[0])
  await expect(validateNativeRuntimePhases(report, directory)).rejects.toThrow(/React Native/)
})

it.each(['global.css', 'hmr-marker.ts', 'virtual.js'])('前阶段 %s 被换成其它阶段或伪造输入，重算摘要也不能通过', async (name) => {
  const { directory, report } = await fixture()
  const baseline = nativePhaseDirectory(directory, nativeRuntimePhases[0])
  const final = nativePhaseDirectory(directory, nativeRuntimePhases[2])
  await cp(path.join(final, 'sources', name), path.join(baseline, 'sources', name))
  await resnapshot(directory, nativeRuntimePhases[0])
  await expect(validateNativeRuntimePhases(report, directory)).rejects.toThrow('阶段原始源码')
})

it('阶段来源不能冒称已保存设备实际加载的完整 bundle', async () => {
  const { directory, report } = await fixture()
  const index = JSON.parse(await readFile(path.join(directory, phaseIndexName), 'utf8'))
  index.phases[0].sourceArchive.servedBundle = 'captured'
  await writeFile(path.join(directory, phaseIndexName), JSON.stringify(index))
  await expect(validateNativeRuntimePhases(report, directory)).rejects.toThrow('原始产物')
})

it.each(['missing', 'other-instance', 'other-publication', 'other-manifest'] as const)('设备实际安装的 %s 证据不能被宿主产物与重算摘要代替', async (kind) => {
  const { directory, report } = await fixture()
  const phase = nativeRuntimePhases[0]
  const root = nativePhaseDirectory(directory, phase)
  const raw = JSON.parse(await readFile(path.join(root, 'report.json'), 'utf8'))
  const ready = JSON.parse(await readFile(path.join(root, 'encoding', 'manifest.ready'), 'utf8'))
  raw.runtimeInstallation ??= { version: 1, runtimeInstanceId: 'synthetic-unit-runtime-instance', publication: { revision: ready.revision, manifestSha256: ready.manifestSha256 }, manifestJson: await readFile(path.join(root, 'encoding', 'manifest.json'), 'utf8') }
  if (kind === 'missing') {
    delete raw.runtimeInstallation
  }
  if (kind === 'other-instance') {
    raw.runtimeInstallation.runtimeInstanceId = 'different-runtime-after-full-reload'
  }
  if (kind === 'other-publication') {
    raw.runtimeInstallation.publication.revision = 'other-publication-same-manifest'
  }
  if (kind === 'other-manifest') {
    raw.runtimeInstallation.manifestJson = '{"version":1,"rules":{}}'
  }
  await writeFile(path.join(root, 'report.json'), JSON.stringify(raw))
  await expect((async () => {
    await resnapshot(directory, phase)
    await validateNativeRuntimePhases(report, directory)
  })()).rejects.toThrow(/安装|运行实例/)
})

it('单阶段报告和全部截图身份一致重写且重算摘要，仍不能用新 realm 冒充 HMR', async () => {
  const { directory, report } = await fixture()
  const phase = nativeRuntimePhases[1]
  const file = path.join(nativePhaseDirectory(directory, phase), 'report.json')
  const raw = JSON.parse(await readFile(file, 'utf8'))
  const replacement = 'different-runtime-after-full-reload'
  raw.runtimeInstallation.runtimeInstanceId = replacement
  for (const receipt of raw.receipts) {
    receipt.runtimeInstallation.runtimeInstanceId = replacement
    const metadataFile = path.join(directory, `${receipt.artifact.name}.json`)
    const metadata = JSON.parse(await readFile(metadataFile, 'utf8'))
    metadata.pair.runtimeInstallation.runtimeInstanceId = replacement
    metadata.receipt.runtimeInstallation.runtimeInstanceId = replacement
    await writeFile(metadataFile, JSON.stringify(metadata))
  }
  await writeFile(file, JSON.stringify(raw))
  await resnapshot(directory, phase)
  await expect(validateNativeRuntimePhases(report, directory)).rejects.toThrow('阶段实际安装或运行实例')
})

it.each(['missing', 'other-publication', 'other-digest'] as const)('虚拟模块 %s 身份时，完整 manifest 和重算归档摘要也不能通过', async (kind) => {
  const { directory, report } = await fixture()
  const phase = nativeRuntimePhases[0]
  const root = nativePhaseDirectory(directory, phase)
  const source = await readFile(path.join(root, 'encoding', 'manifest.json'), 'utf8')
  const manifest = JSON.parse(source)
  const publication = JSON.parse(await readFile(path.join(root, 'encoding', 'manifest.ready'), 'utf8'))
  const identity = kind === 'missing'
    ? undefined
    : { revision: kind === 'other-publication' ? 'other-publication' : publication.revision, manifestSha256: kind === 'other-digest' ? 'a'.repeat(64) : publication.manifestSha256 }
  await writeFile(path.join(root, 'sources', 'virtual.js'), virtualModuleCode(manifest, identity, source))
  await resnapshot(directory, phase)
  await expect(validateNativeRuntimePhases(report, directory)).rejects.toThrow('阶段原始源码')
})
