import type { ReactNativeReport } from '../examples/react-native-expo/src/compatibility/protocol'
import type { RunContext } from './tailwind-capabilities/context'
import type { CapabilityReport } from './tailwind-capabilities/types'
import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nativeBuildCases, nativeBuildFixtures, nativeFixtures, rejectedNativeCases } from '../examples/react-native-expo/src/compatibility/protocol'
import { nativeEncodingArtifactNames, nativeRuntimePhases } from './react-native/phase-contract'
import { updateNativePhaseFixtureReport, writeNativePhaseFixture } from './react-native/phase-fixture'
import { snapshotNativePhase } from './react-native/phase-index'
import { writeRuntimeFixture } from './react-native/runtime-fixture'
import { filesystemObservedAt } from './tailwind-capabilities/artifact-clock'
import { buildNativeCapabilityReport } from './tailwind-capabilities/native-adapter'

vi.mock('./tailwind-capabilities/context', async importOriginal => ({
  ...await importOriginal<typeof import('./tailwind-capabilities/context')>(),
  newReport: vi.fn(async (context: RunContext, target: CapabilityReport['target'], _contracts: unknown, _fixture: unknown, environment: CapabilityReport['environment']): Promise<CapabilityReport> => ({
    schemaVersion: 2,
    runId: context.runId,
    observedAt: context.artifactStartedAt!,
    target,
    environment,
    identity: { sourceHash: 'a'.repeat(64), lockfileHash: 'b'.repeat(64), catalogHash: 'c'.repeat(64), fixtureHash: 'd'.repeat(64), expectationsHash: 'e'.repeat(64), versions: { unit: '1.0.0' } },
    results: [],
    artifacts: [],
  })),
}))

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function fixture(platform: ReactNativeReport['platform'] = 'web') {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tailwind-native-adapter-'))
  directories.push(directory)
  const context: RunContext = { root: directory, directory, runId: 'adapter-current-run', startedAt: new Date().toISOString(), artifactStartedAt: filesystemObservedAt(directory) }
  const artifacts = path.join(directory, 'native')
  const raw = await writeRuntimeFixture(artifacts, platform, context.runId, context.startedAt!)
  await writeNativePhaseFixture(artifacts, raw)
  const save = async () => {
    await writeFile(path.join(artifacts, 'report.json'), JSON.stringify(raw))
    if (nativeRuntimePhases.some(phase => phase.revision === raw.revision)) {
      await updateNativePhaseFixtureReport(artifacts, raw)
    }
  }
  return { context, raw, artifacts, save }
}

describe('原生统一能力报告', () => {
  it.each(['expo-chromium', 'expo-firefox', 'expo-webkit', 'react-native-android', 'react-native-ios'] as const)('%s 逐阶段登记全部编码回执，不会遗漏新增文件', async (target) => {
    const platform = target.startsWith('expo-') ? 'web' : target.endsWith('android') ? 'android' : 'ios'
    const { context, raw, artifacts, save } = await fixture(platform)
    if (platform === 'web') {
      raw.environment.browser!.name = target.slice('expo-'.length) as 'chromium' | 'firefox' | 'webkit'
      await writeNativePhaseFixture(artifacts, raw)
      await save()
    }
    const { report } = await buildNativeCapabilityReport(context, target, raw)
    expect(report.results.filter(item => item.id.startsWith('compatibility/')).every(item => item.status === 'passed')).toBe(true)
    for (const phase of nativeRuntimePhases) {
      for (const name of nativeEncodingArtifactNames) {
        const file = path.join('native', 'phases', phase.id, 'encoding', name)
        expect(report.artifacts.some(item => item.path === file && item.kind === 'bundle')).toBe(true)
        expect(report.results.find(item => item.id === 'compatibility/directive-apply')!.artifacts).toContain(file)
      }
    }
  })

  it.each(['baseline', 'tsx-hmr'])('缺少 %s 编码时，最终兼容入口完整也必须阻断统一报告', async (id) => {
    const { context, raw, artifacts } = await fixture()
    await rm(path.join(artifacts, 'phases', id, 'encoding', 'manifest.json'))
    const { report } = await buildNativeCapabilityReport(context, 'expo-chromium', raw)
    expect(report.results.filter(item => item.status === 'passed')).toEqual([])
  })

  it.each(['android', 'ios'] as const)('%s 将原 HMR 观察原件全部登记并关联案例', async (platform) => {
    const { context, raw, artifacts } = await fixture(platform)
    const { report } = await buildNativeCapabilityReport(context, `react-native-${platform}`, raw)
    const names = await readdir(path.join(artifacts, 'hmr-client'))
    expect(names.length).toBeGreaterThan(8)
    for (const name of names) {
      const file = path.join('native', 'hmr-client', name)
      expect(report.artifacts.some(item => item.path === file && item.kind === 'bundle')).toBe(true)
      for (const item of report.results.filter(item => item.id.startsWith('compatibility/'))) {
        expect(item.artifacts).toContain(file)
      }
    }
  })

  it.each(['missing-directory', 'observer-bytes', 'observer-rehashed', 'resolver-identity', 'installation', 'web-bypass'])('原生 HMR %s 即使重算阶段摘要也不能通过', async (kind) => {
    const { context, raw, artifacts } = await fixture('ios')
    const root = path.join(artifacts, 'hmr-client')
    if (kind === 'missing-directory') {
      await rm(root, { recursive: true })
    }
    else if (kind === 'observer-bytes' || kind === 'observer-rehashed') {
      await writeFile(path.join(root, 'observer-recorder.cjs'), 'unarchived-observer')
      if (kind === 'observer-rehashed') {
        const file = path.join(root, 'ios-resolver.json')
        const record = JSON.parse(await readFile(file, 'utf8'))
        const bytes = await readFile(path.join(root, 'observer-recorder.cjs'))
        record.observers[1] = { name: 'observer-recorder.cjs', sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.length }
        await writeFile(file, JSON.stringify(record))
      }
    }
    else if (kind === 'resolver-identity') {
      const file = path.join(root, 'ios-resolver.json')
      const record = JSON.parse(await readFile(file, 'utf8'))
      record.identity.invocationId = 'previous-invocation'
      await writeFile(file, JSON.stringify(record))
    }
    else {
      const file = path.join(root, 'tsx-hmr.json')
      const record = JSON.parse(await readFile(file, 'utf8'))
      record.installation.manifestJson = '{"rules":{"forged":[]}}'
      const source = kind === 'web-bypass' ? { schemaVersion: 1, evidence: 'not-applicable', platform: 'web' } : record
      await writeFile(file, JSON.stringify(source))
      await writeFile(path.join(artifacts, 'phases', 'tsx-hmr', 'hmr-observation.json'), JSON.stringify(source))
      const indexFile = path.join(artifacts, 'phase-index.json')
      const index = JSON.parse(await readFile(indexFile, 'utf8'))
      index.phases[1] = await snapshotNativePhase(artifacts, nativeRuntimePhases[1]!)
      await writeFile(indexFile, JSON.stringify(index))
    }
    const { report } = await buildNativeCapabilityReport(context, 'react-native-ios', raw)
    expect(report.results.filter(item => item.status === 'passed')).toEqual([])
  })

  it('分别记录 26 项运行时、5 项编码和 87 项拒绝，并保留未覆盖的注册能力', async () => {
    const { context, raw } = await fixture()
    const { report, contracts } = await buildNativeCapabilityReport(context, 'expo-chromium', raw)
    const reviewed = report.results.filter(item => item.id.startsWith('compatibility/'))
    expect(reviewed).toHaveLength(118)
    expect(reviewed.every(item => item.status === 'passed')).toBe(true)
    for (const contract of contracts.filter(item => item.id.startsWith('compatibility/'))) {
      const id = contract.id.slice('compatibility/'.length)
      expect(contract.expectation.stage).toBe(rejectedNativeCases.has(id) ? 'negative' : nativeBuildCases.has(id) ? 'encoding' : 'runtime')
    }
    const missing = report.results.filter(item => item.id.startsWith('inventory/'))
    expect(missing.length).toBeGreaterThan(500)
    expect(missing.every(item => item.status === 'not-run' && item.artifacts.length === 0)).toBe(true)
    expect(missing.some(item => item.id === 'inventory/utility/static/grid')).toBe(true)
    for (const id of ['utility/static/flex', 'utility/static/border-solid', 'utility/functional/shrink', 'utility/static/content-center']) {
      expect(missing.some(item => item.id === `inventory/${id}`)).toBe(true)
    }
    expect(missing.some(item => item.id === 'inventory/utility/functional/bg')).toBe(false)
    const screenshot = report.artifacts.find(item => item.kind === 'screenshot' && item.path === path.join('native', raw.receipts[0]!.artifact.name))!
    expect(screenshot.sha256).toBe(raw.receipts[0]!.artifact.sha256)
    expect(screenshot.path).toBe(path.join('native', raw.receipts[0]!.artifact.name))
    const phases = Object.values(nativeFixtures).reduce((count, item) => count + (item.phases?.length ?? 1), 0)
    expect(report.artifacts.filter(item => item.kind === 'measurements')).toHaveLength(phases * nativeRuntimePhases.length)
    expect(await readFile(path.join(context.directory, 'report.md'), 'utf8')).toContain('未执行')
  })

  it.each(Object.keys(nativeBuildFixtures))('空 %s 编码不能由 encoded=true 放行', async (id) => {
    const { context, raw, save } = await fixture()
    raw.results.find(item => item.id === id)!.encodedStyle = {}
    await save()
    const { report } = await buildNativeCapabilityReport(context, 'expo-chromium', raw)
    expect(report.results.find(item => item.id === `compatibility/${id}`)!.status).toBe('failed')
  })

  it('缺少本轮实际 manifest 归档不能通过编码', async () => {
    const { context, raw, artifacts } = await fixture()
    await rm(path.join(artifacts, 'encoding', 'manifest.json'))
    const { report } = await buildNativeCapabilityReport(context, 'expo-chromium', raw)
    expect(report.results.filter(item => item.status === 'passed')).toEqual([])
  })

  it('没有原始报告时仍持久化完整阻塞报告', async () => {
    const { context } = await fixture()
    const { report } = await buildNativeCapabilityReport(context, 'expo-chromium', undefined)
    expect(report.results.filter(item => item.status === 'blocked')).toHaveLength(118)
    expect(report.artifacts).toEqual([])
    expect(JSON.parse(await readFile(path.join(context.directory, 'report.json'), 'utf8'))).toEqual(report)
  })

  it('重新解析实际样式，拒绝原始布尔检查点掩盖语义错误', async () => {
    const { context, raw, save } = await fixture()
    raw.results.find(item => item.id === 'type-size')!.checkpoints.find(item => item.name === 'runtime:default:style')!.actual = '{"fontSize":99,"lineHeight":28.75}'
    await save()
    const { report } = await buildNativeCapabilityReport(context, 'expo-chromium', raw)
    expect(report.results.find(item => item.id === 'compatibility/type-size')!.status).toBe('failed')
    expect(report.results.find(item => item.id === 'compatibility/background-color')!.status).toBe('passed')
  })

  it('重新回放原始截图，篡改 PNG 会阻断全局并定位失败案例', async () => {
    const { context, raw, artifacts } = await fixture()
    const saved = raw.receipts.find(item => item.id === 'type-size')!
    await writeFile(path.join(artifacts, saved.artifact.name), 'tampered PNG')
    const { report } = await buildNativeCapabilityReport(context, 'expo-chromium', raw)
    expect(report.results.find(item => item.id === 'compatibility/type-size')!.status).toBe('failed')
    expect(report.results.find(item => item.id === 'compatibility/background-color')!.status).toBe('blocked')
  })

  it.each(['runId', 'browser', 'revision'] as const)('拒绝过期或错目标的 %s', async (field) => {
    const { context, raw, save } = await fixture()
    if (field === 'runId') {
      raw.runId = 'previous-run'
    }
    else if (field === 'browser') {
      raw.environment.browser!.name = 'firefox'
    }
    else {
      raw.revision = 'previous-revision'
    }
    await save()
    const { report } = await buildNativeCapabilityReport(context, 'expo-chromium', raw)
    expect(report.results.filter(item => item.id.startsWith('compatibility/')).every(item => item.status === 'blocked')).toBe(true)
  })

  it('归档 JSON 与输入不同不能声明通过', async () => {
    const { context, raw } = await fixture()
    raw.environment.deviceName = 'unarchived'
    const { report } = await buildNativeCapabilityReport(context, 'expo-chromium', raw)
    expect(report.results.filter(item => item.status === 'passed')).toEqual([])
    expect(report.results[0]!.reason).toContain('归档原始 JSON')
  })

  it('保留上层执行失败，即使原始报告本身合法', async () => {
    const { context, raw } = await fixture('ios')
    const { report } = await buildNativeCapabilityReport(context, 'react-native-ios', raw, new Error('host capture failed'))
    expect(report.results.filter(item => item.status === 'blocked')).toHaveLength(118)
    expect(report.results[0]!.reason).toContain('host capture failed')
  })

  it('损坏的原始截图路径不会越过归档边界读取文件', async () => {
    const { context, raw, save } = await fixture()
    raw.receipts[0]!.artifact.name = path.join('..', 'secret.png')
    await save()
    const { report } = await buildNativeCapabilityReport(context, 'expo-chromium', raw)
    expect(report.results.filter(item => item.status === 'passed')).toEqual([])
    expect(report.artifacts).toHaveLength(1)
    expect(report.artifacts[0]!.kind).toBe('bundle')
  })
})
