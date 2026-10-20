import type { NativeCaseResult, NativeGeometryEvidence, NativePlatformReport, NativeRect } from '../examples/react-lynx/src/compatibility/types'
import type { RunContext } from './tailwind-capabilities/context'
import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { skewImage } from './lynx/fixtures/skew-images'
import { PNG } from './lynx/png'
import { digest } from './tailwind-capabilities/identity'
import { buildLynxCapabilityReport, lynxCaseContracts } from './tailwind-capabilities/lynx-adapter'
import { geometryValidators } from './tailwind-capabilities/lynx/contracts'
import { validateCapabilityReport, verifyReportArtifacts } from './tailwind-capabilities/report'

vi.mock('./tailwind-capabilities/identity', async (original) => {
  const module = await original<typeof import('./tailwind-capabilities/identity')>()
  return { ...module, capabilityIdentity: async () => ({
    sourceHash: 'a'.repeat(64),
    lockfileHash: 'b'.repeat(64),
    catalogHash: 'c'.repeat(64),
    fixtureHash: 'd'.repeat(64),
    expectationsHash: 'e'.repeat(64),
    versions: { tailwindcss: '4.3.3' },
  }) }
})

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

function rect(left: number, top: number, width: number, height: number): NativeRect {
  return { left, top, width, height, right: left + width, bottom: top + height }
}

function geometry(): NativeGeometryEvidence {
  return {
    probe: rect(6, 6, 44, 44),
    control: rect(206, 6, 90, 60),
    probeContainer: rect(0, 0, 160, 140),
    controlContainer: rect(200, 0, 160, 140),
    probeChild: rect(6, 6, 8, 8),
    controlChild: rect(206, 6, 8, 8),
  }
}

async function fixture(id = 'sizing-size', status: NativeCaseResult['status'] = 'supported', hostGeometry = true) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lynx adapter 中文 '))
  directories.push(root)
  const context: RunContext = { root, directory: root, runId: '0b12a000-0000-4000-8000-000000000001', startedAt: new Date(Date.now() - 1000).toISOString(), caseFilter: new RegExp(`^${id}$`) }
  const native = path.join(root, 'native')
  await mkdir(native)
  const bundle = Buffer.from('synthetic native bundle')
  const identity = { version: 1 as const, runId: context.runId, bundleSha256: digest(bundle) }
  const raw: NativePlatformReport = {
    schemaVersion: 1,
    platform: 'ios',
    catalogHash: 'fixture',
    verifiedAt: new Date().toISOString(),
    versions: { tailwindcss: '4.3.3', lynxEngine: '4.0.1', engineVersion: '4.0.1', cssDefines: '0.0.18' },
    environment: {
      deviceName: 'synthetic test',
      deviceModel: 'fixture',
      osName: 'iOS',
      osVersion: 'test',
      osBuild: 'test',
      runtimeIdentifier: 'synthetic',
      abi: 'arm64',
      viewport: { width: 400, height: 800, pixelRatio: 1 },
    },
    evidence: { ...identity, artifacts: [] },
    results: [{ id, status, checkpoints: [{ name: 'forged-checkpoint', passed: true }], geometry: geometry(), ...(status === 'unsupported' ? { reason: 'synthetic unsupported', failureStage: 'runtime' as const } : {}) }],
  }
  await writeFile(path.join(native, 'main.lynx.bundle'), bundle)
  await writeFile(path.join(native, 'run-context.json'), JSON.stringify(identity))
  const saveGeometry = async () => {
    const crops = path.join(native, 'crops', context.runId)
    await mkdir(crops, { recursive: true })
    const sidecar = { ...identity, source: 'lynx-native-host-geometry-v1', id, platform: raw.platform, geometry: raw.results[0]!.geometry }
    const files: Array<[string, Uint8Array]> = [[`${id}-geometry.json`, Buffer.from(JSON.stringify(sidecar))]]
    for (const frame of ['probe', 'control'] as const) {
      const rect = sidecar.geometry![`${frame}Container`]
      const image = new PNG({ width: rect.width, height: rect.height })
      image.data.fill(255)
      files.push([`${id}-geometry-${frame}.png`, PNG.sync.write(image)])
    }
    for (const [name, bytes] of files) {
      await writeFile(path.join(crops, name), bytes)
      raw.evidence!.artifacts = raw.evidence!.artifacts.filter(item => item.name !== name)
      raw.evidence!.artifacts.push({ name, runId: context.runId, sha256: digest(bytes), byteLength: bytes.byteLength })
    }
  }
  const save = () => writeFile(path.join(native, 'report.json'), JSON.stringify(raw))
  if (hostGeometry && geometryValidators.has(id)) {
    await saveGeometry()
  }
  await save()
  return { context, raw, native, save, saveGeometry }
}

it('固定的支持与阶段不从本轮 checkpoint 或失败推导', () => {
  const ios = lynxCaseContracts('lynx-ios')
  const android = lynxCaseContracts('lynx-android')
  expect(ios.find(item => item.id === 'layout-columns')!.expectation).toMatchObject({ support: 'unsupported', stage: 'encoding' })
  expect(ios.find(item => item.id === 'directive-import')!.expectation).toEqual({ support: 'supported', stage: 'generation' })
  expect(ios.find(item => item.id === 'sizing-min-max')!.expectation.support).toBe('unsupported')
  expect(android.find(item => item.id === 'sizing-min-max')!.expectation.support).toBe('supported')
  expect(ios.find(item => item.id === 'background-linear-gradient')!.expectation.stage).toBe('visual')
  expect(ios.find(item => item.id === 'sizing-size')!.features).toContain('size')
})

it('媒体必要条件的拒绝不能传播为 hover 输入或原子状态已经执行', async () => {
  const { context, raw, save } = await fixture('variant-state', 'unsupported', false)
  context.caseFilter = /^(?:variant-state|capability\/state)$/
  raw.results[0]!.checkpoints = [{ name: 'media:necessary-guard-v1', passed: true }]
  await save()
  const { report, contracts } = await buildLynxCapabilityReport(context, 'lynx-ios', raw)
  expect(contracts.find(item => item.id === 'variant-state')!.features).toEqual(['authoring/variant-state'])
  expect(report.results.find(item => item.id === 'variant-state')).toMatchObject({ status: 'blocked', assertions: [] })
  expect(report.results.find(item => item.id === 'capability/state')).toMatchObject({ status: 'not-run', assertions: [] })
})

it('从完整尺寸重算语义，保存原始报告和bundle回执并写JSON/Markdown', async () => {
  const { context, raw } = await fixture()
  const { report, contracts } = await buildLynxCapabilityReport(context, 'lynx-ios', raw)
  expect(report.results[0]).toMatchObject({ status: 'passed', support: 'supported', assertions: [{ actual: 'supported', expected: 'supported', stage: 'runtime' }] })
  expect(report.observedAt).toBe(context.startedAt)
  expect(report.artifacts.some(item => item.kind === 'bundle')).toBe(true)
  expect(() => validateCapabilityReport(report, contracts, report.identity, context.runId, 'lynx-ios')).not.toThrow()
  await expect(verifyReportArtifacts(report, context.directory)).resolves.toBeUndefined()
  expect(JSON.parse(await readFile(path.join(context.directory, 'report.json'), 'utf8'))).toEqual(report)
  expect(await readFile(path.join(context.directory, 'report.md'), 'utf8')).toContain('通过 1')
})

it('伪造的通过checkpoint不能遮住不符合44px的实际测量', async () => {
  const { context, raw, save, saveGeometry } = await fixture()
  raw.results[0]!.geometry!.probe = rect(6, 6, 90, 60)
  await saveGeometry()
  await save()
  const { report } = await buildLynxCapabilityReport(context, 'lynx-ios', raw)
  expect(report.results[0]).toMatchObject({ status: 'failed', support: 'supported', assertions: [{ actual: 'unsupported', expected: 'supported' }] })
})

it.each(['layout-display', 'sizing-fixed', 'directive-import'])('%s 没有完整语义判定器时保守阻断', async (id) => {
  const { context, raw } = await fixture(id)
  const { report } = await buildLynxCapabilityReport(context, 'lynx-ios', raw)
  expect(report.results[0]).toMatchObject({ status: 'blocked', assertions: [] })
  expect(report.results[0]!.reason).toContain('尚无完整')
})

it('预期encoder限制不能仅凭generated/bundled布尔形成通过', async () => {
  const { context, raw, save } = await fixture('layout-columns', 'unsupported')
  raw.results[0]!.checkpoints = [{ name: 'generated', passed: true }, { name: 'bundled', passed: false }]
  await save()
  const { report, contracts } = await buildLynxCapabilityReport(context, 'lynx-ios', raw)
  expect(contracts[0]!.expectation.stage).toBe('encoding')
  expect(report.results[0]).toMatchObject({ support: 'unsupported', status: 'blocked' })
})

it('已审查支持的 supports 必须从控制夹具重算，原始 unsupported 不能更换预期', async () => {
  const { context, raw, save, saveGeometry } = await fixture('variant-supports', 'unsupported')
  raw.results[0]!.geometry = {
    probe: rect(6, 6, 100, 44),
    control: rect(206, 6, 100, 44),
    probeContainer: rect(0, 0, 160, 140),
    controlContainer: rect(200, 0, 160, 140),
    probeChild: rect(6, 22, 20, 12),
    controlChild: rect(206, 22, 20, 12),
  }
  await saveGeometry()
  await save()
  const { report, contracts } = await buildLynxCapabilityReport(context, 'lynx-ios', raw)
  expect(contracts[0]!.expectation).toMatchObject({ support: 'supported', stage: 'runtime' })
  expect(report.results[0]).toMatchObject({ support: 'supported', status: 'failed', assertions: [], reason: expect.stringContaining('偏离独立审查') })
  raw.results[0]!.status = 'supported'
  delete raw.results[0]!.reason
  delete raw.results[0]!.failureStage
  await save()
  const ineffective = await buildLynxCapabilityReport(context, 'lynx-ios', raw)
  expect(ineffective.report.results[0]).toMatchObject({ support: 'supported', status: 'failed', assertions: [{ actual: 'unsupported', expected: 'supported', stage: 'runtime' }] })
  raw.results[0]!.geometry!.probeChild = rect(50, 6, 20, 12)
  await saveGeometry()
  await save()
  const recomputed = await buildLynxCapabilityReport(context, 'lynx-ios', raw)
  expect(recomputed.report.results[0]).toMatchObject({ support: 'supported', status: 'passed', assertions: [{ actual: 'supported', expected: 'supported', stage: 'runtime' }] })
})

it('encoder已拒绝的案例不能由完整几何和runtime负向结果覆盖失败阶段', async () => {
  const { context, raw, save, saveGeometry } = await fixture('grid-auto', 'unsupported')
  raw.results[0]!.geometry = {
    probe: rect(6, 6, 140, 68),
    control: rect(206, 6, 140, 68),
    probeContainer: rect(0, 0, 160, 140),
    controlContainer: rect(200, 0, 160, 140),
    probeChild: rect(6, 42, 40, 24),
    controlChild: rect(206, 42, 40, 24),
  }
  await saveGeometry()
  await save()
  const { report, contracts } = await buildLynxCapabilityReport(context, 'lynx-ios', raw)
  expect(contracts[0]!.expectation).toMatchObject({ support: 'unsupported', stage: 'encoding' })
  expect(raw.results[0]).toMatchObject({ status: 'unsupported', failureStage: 'runtime' })
  expect(report.results[0]).toMatchObject({ support: 'unsupported', status: 'blocked', assertions: [], reason: expect.stringContaining('encoding') })
})

it('归档证据仍可验证时，支持回归明确失败而不自动降级为平台限制', async () => {
  const { context, raw, save } = await fixture('sizing-size', 'unsupported')
  await save()
  const { report } = await buildLynxCapabilityReport(context, 'lynx-ios', raw)
  expect(report.results[0]).toMatchObject({ support: 'supported', status: 'failed' })
})

it('验证异常或没有raw也落下完整失败/阻塞报告', async () => {
  const { context } = await fixture()
  const failed = await buildLynxCapabilityReport(context, 'lynx-ios', undefined, new Error('generation regression'))
  expect(failed.report.results[0]).toMatchObject({ status: 'failed', reason: expect.stringContaining('generation regression') })
  const blocked = await buildLynxCapabilityReport(context, 'lynx-ios', undefined)
  expect(blocked.report.results[0]).toMatchObject({ status: 'blocked', support: 'supported' })
  expect(await readFile(path.join(context.directory, 'report.md'), 'utf8')).toContain('阻塞 1')
})

it('没有raw且没有过滤条件时保留全部案例，而不是生成空的成功报告', async () => {
  const { context } = await fixture()
  const { report, contracts } = await buildLynxCapabilityReport({ ...context, caseFilter: undefined }, 'lynx-ios', undefined)
  expect(report.results).toHaveLength(lynxCaseContracts('lynx-ios').length)
  expect(report.results.filter(item => !/^(?:capability|inventory)\//.test(item.id)).every(item => item.status === 'blocked')).toBe(true)
  expect(report.results.filter(item => /^(?:capability|inventory)\//.test(item.id)).every(item => item.status === 'not-run')).toBe(true)
  expect(() => validateCapabilityReport(report, contracts, report.identity, context.runId, 'lynx-ios')).not.toThrow()
})

it('开始时间必须来自调用者，不能采用报告自报时间放行已有产物', async () => {
  const { context, raw } = await fixture()
  const { report } = await buildLynxCapabilityReport({ ...context, startedAt: undefined }, 'lynx-ios', raw)
  expect(report.results[0]).toMatchObject({ status: 'blocked', reason: expect.stringContaining('本轮开始时间') })
})

it.each(['runId', 'platform', 'stored', 'mtime'])('%s 身份、归档不一致或过期时不能通过', async (kind) => {
  const { context, raw, native, save } = await fixture()
  if (kind === 'runId') {
    raw.evidence!.runId = 'different-run'
    await save()
  }
  else if (kind === 'platform') {
    raw.platform = 'android'
    await save()
  }
  else if (kind === 'stored') {
    raw.results[0]!.checkpoints = []
  }
  else {
    await utimes(path.join(native, 'main.lynx.bundle'), new Date(0), new Date(0))
  }
  const { report } = await buildLynxCapabilityReport(context, 'lynx-ios', raw)
  expect(report.results[0]).toMatchObject({ status: 'blocked' })
})

it('专用效果必须核对原始PNG回执并从像素重算，伪造hash不可通过', async () => {
  const { context, raw, save, native } = await fixture('transform-skew')
  const crops = path.join(native, 'crops', context.runId)
  await mkdir(crops, { recursive: true })
  for (const frame of ['probe', 'control']) {
    const name = `transform-skew-${frame}.png`
    const bytes = PNG.sync.write(skewImage(1, frame === 'control' ? 'identity' : 'skew'))
    await writeFile(path.join(crops, name), bytes)
    raw.evidence!.artifacts.push({ name, runId: context.runId, sha256: digest(bytes), byteLength: bytes.byteLength })
  }
  await save()
  const positive = await buildLynxCapabilityReport(context, 'lynx-ios', raw)
  expect(positive.report.results[0]!.status).toBe('passed')
  expect(positive.report.artifacts.filter(item => item.kind === 'screenshot')).toHaveLength(2)
  raw.evidence!.artifacts[0]!.sha256 = '0'.repeat(64)
  await save()
  const altered = await buildLynxCapabilityReport(context, 'lynx-ios', raw)
  expect(altered.report.results[0]).toMatchObject({ status: 'blocked', reason: expect.stringContaining('截图字节') })
})

it('几何数字和运行身份不构成宿主几何侧车及截图证据', async () => {
  const { context, raw } = await fixture('sizing-size', 'supported', false)
  const { report } = await buildLynxCapabilityReport(context, 'lynx-ios', raw)
  expect(report.results[0]!.status).toBe('blocked')
  expect(report.results[0]!.reason).toMatch(/几何.*(侧车|宿主|回执)/)
  expect(report.artifacts.some(item => item.kind === 'measurements')).toBe(false)
})

it('混合案例不能把整体支持或拒绝扩散成每个原子能力', () => {
  const contracts = lynxCaseContracts('lynx-ios')
  expect(contracts.find(item => item.id === 'sizing-min-max')!.features).toEqual(['authoring/sizing-min-max'])
  expect(contracts.find(item => item.id === 'grid-auto')!.features).toEqual(['authoring/grid-auto'])
  for (const id of ['min-width', 'max-width', 'min-height', 'max-height', 'grid-auto-flow', 'grid-auto-columns', 'grid-auto-rows']) {
    expect(contracts.find(item => item.id === `capability/${id}`)!.fixture).toBe('missing-lynx-atomic-runtime-fixture')
  }
})

it.each(['missing-sidecar', 'missing-frame', 'unreceipted-frame', 'wrong-id', 'wrong-bundle', 'report-mismatch', 'transparent-frame'])('几何侧车 %s 不能由已通过数字或其它 JSON 放行', async (kind) => {
  const { context, raw, native, save } = await fixture()
  const crops = path.join(native, 'crops', context.runId)
  const sidecarName = 'sizing-size-geometry.json'
  if (kind === 'missing-sidecar') {
    await rm(path.join(crops, sidecarName))
  }
  else if (kind === 'missing-frame') {
    await rm(path.join(crops, 'sizing-size-geometry-control.png'))
  }
  else if (kind === 'unreceipted-frame') {
    raw.evidence!.artifacts = raw.evidence!.artifacts.filter(item => item.name !== 'sizing-size-geometry-probe.png')
  }
  else if (kind === 'report-mismatch') {
    raw.results[0]!.geometry!.probe.left += 1
  }
  else {
    const name = kind === 'transparent-frame' ? 'sizing-size-geometry-probe.png' : sidecarName
    const value = JSON.parse(await readFile(path.join(crops, sidecarName), 'utf8'))
    if (kind === 'wrong-id') {
      value.id = 'layout-aspect'
    }
    else if (kind === 'wrong-bundle') {
      value.bundleSha256 = 'f'.repeat(64)
    }
    const bytes = kind === 'transparent-frame' ? PNG.sync.write(new PNG({ width: 160, height: 140 })) : Buffer.from(JSON.stringify(value))
    await writeFile(path.join(crops, name), bytes)
    Object.assign(raw.evidence!.artifacts.find(item => item.name === name)!, { sha256: digest(bytes), byteLength: bytes.byteLength })
  }
  await save()
  const { report } = await buildLynxCapabilityReport(context, 'lynx-ios', raw)
  expect(report.results[0]!.status).toBe('blocked')
})
