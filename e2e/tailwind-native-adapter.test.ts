import type { NativePairEvidence, ReactNativeReport } from '../examples/react-native-expo/src/compatibility/protocol'
import type { RunContext } from './tailwind-capabilities/context'
import type { CapabilityReport } from './tailwind-capabilities/types'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PNG } from 'pngjs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { expectedFixtureStyle, nativeBuildCases, nativeBuildFixtures, nativeFixtures, rejectedNativeCases } from '../examples/react-native-expo/src/compatibility/protocol'
import { compatibilityCases, reactNativeVersions, RN_CATALOG_HASH, RN_FIXTURE_HASH } from './react-native/catalog'
import { writeEncodingFixture } from './react-native/encoding-fixture'
import { assessNativePair } from './react-native/pair-evidence'
import { buildNativeCapabilityReport } from './tailwind-capabilities/native-adapter'

vi.mock('./tailwind-capabilities/context', async importOriginal => ({
  ...await importOriginal<typeof import('./tailwind-capabilities/context')>(),
  newReport: vi.fn(async (context: RunContext, target: CapabilityReport['target'], _contracts: unknown, _fixture: unknown, environment: CapabilityReport['environment']): Promise<CapabilityReport> => ({
    schemaVersion: 2,
    runId: context.runId,
    observedAt: context.startedAt!,
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
  const context: RunContext = { root: directory, directory, runId: 'adapter-current-run', startedAt: new Date().toISOString() }
  const artifacts = path.join(directory, 'native')
  await mkdir(artifacts)
  const image = new PNG({ width: 64, height: 64 })
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const offset = (y * image.width + x) * 4
      image.data[offset] = (x % 32) * 7
      image.data[offset + 1] = y * 9
      image.data[offset + 2] = (x % 32 + y) * 3
      image.data[offset + 3] = 255
    }
  }
  const raw: ReactNativeReport = {
    schemaVersion: 2,
    stage: 'runtime',
    revision: 'rn-hmr-updated-f59e0b',
    platform,
    catalogHash: RN_CATALOG_HASH,
    fixtureHash: RN_FIXTURE_HASH,
    runId: context.runId,
    verifiedAt: context.startedAt!,
    versions: reactNativeVersions(),
    environment: { deviceName: 'synthetic-unit-fixture', osName: platform, osVersion: '1', runtimeIdentifier: 'unit', abi: 'unit', viewport: { width: 64, height: 64, pixelRatio: 1 }, ...(platform === 'web' ? { browser: { name: 'chromium', version: '1' } as const } : {}) },
    results: [],
    receipts: [],
  }
  for (const item of compatibilityCases) {
    const rejected = rejectedNativeCases.has(item.id)
    const result: ReactNativeReport['results'][number] = {
      id: item.id,
      status: rejected ? 'unsupported' : 'supported',
      ...(rejected ? { reason: '独立编码边界' } : {}),
      generated: true,
      encoded: !rejected,
      warnings: rejected ? ['此单测的独立候选编码拒绝诊断'] : [],
      generatedDeclarations: [],
      encodedStyle: nativeBuildFixtures[item.id]?.style ?? {},
      checkpoints: [
        { name: 'generation:candidates', passed: true },
        ...item.declarations.map((declaration, index) => ({ name: `generation:declaration:${index}:${declaration.property}`, passed: true })),
        { name: 'encoder:complete', passed: !rejected },
        ...(rejected ? [{ name: 'encoder:expected-rejection', passed: true }] : []),
      ],
    }
    for (const phase of nativeFixtures[item.id]?.phases ?? (nativeFixtures[item.id] ? ['default'] : [])) {
      const pair: NativePairEvidence = {
        runId: raw.runId,
        platform,
        revision: raw.revision,
        id: item.id,
        phase,
        probe: { x: 0, y: 0, width: 24, height: 24 },
        reference: { x: 32, y: 0, width: 24, height: 24 },
        control: { x: 0, y: 32, width: 24, height: 24 },
        target: { x: 2, y: 2, width: 8, height: 8 },
        referenceTarget: { x: 34, y: 2, width: 8, height: 8 },
        controlTarget: { x: 2, y: 34, width: 8, height: 8 },
        viewport: raw.environment.viewport,
      }
      const expectsEffect = Object.keys(expectedFixtureStyle(item.id, phase, platform)!).length > 0
      for (let y = 0; y < 24; y++) {
        for (let x = 0; x < 24; x++) {
          const source = (y * image.width + x) * 4
          const destination = ((y + 32) * image.width + x) * 4
          image.data.set(expectsEffect ? [226, 232, 240, 255] : image.data.subarray(source, source + 4), destination)
        }
      }
      if (item.id === 'syntax-important') {
        const rgba = phase.endsWith('-normal') ? [220, 38, 38, 255] : [115, 115, 115, 255]
        for (const side of ['probe', 'reference', 'control'] as const) {
          const rect = pair[side]
          for (let y = rect.y; y < rect.y + rect.height; y++) {
            for (let x = rect.x; x < rect.x + rect.width; x++) {
              image.data.set(side === 'control' ? [192, 38, 211, 255] : rgba, (y * image.width + x) * 4)
            }
          }
        }
      }
      const png = PNG.sync.write(image)
      const checkpoints = assessNativePair(image, pair)
      const name = `case-${raw.revision}-${item.id}-${phase}.png`
      const receipt = { id: item.id, phase, runId: raw.runId, checkpoints, artifact: { name, sha256: createHash('sha256').update(png).digest('hex'), byteLength: png.length } }
      raw.receipts.push(receipt)
      result.checkpoints.push({ name: `runtime:${phase}:style`, passed: true, actual: JSON.stringify(expectedFixtureStyle(item.id, phase, platform)) }, ...checkpoints)
      await writeFile(path.join(artifacts, name), png)
      await writeFile(path.join(artifacts, `${name}.json`), JSON.stringify({ pair, receipt }))
    }
    raw.results.push(result)
  }
  const save = () => writeFile(path.join(artifacts, 'report.json'), JSON.stringify(raw))
  await save()
  await writeEncodingFixture(artifacts, raw)
  return { context, raw, artifacts, save }
}

describe('原生统一能力报告', () => {
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
    const screenshot = report.artifacts.find(item => item.kind === 'screenshot')!
    expect(screenshot.sha256).toBe(raw.receipts[0]!.artifact.sha256)
    expect(screenshot.path).toBe(path.join('native', raw.receipts[0]!.artifact.name))
    const phases = Object.values(nativeFixtures).reduce((count, item) => count + (item.phases?.length ?? 1), 0)
    expect(report.artifacts.filter(item => item.kind === 'measurements')).toHaveLength(phases)
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
