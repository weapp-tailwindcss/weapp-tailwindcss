import type { NativePairEvidence } from '../examples/react-native-expo/src/compatibility/protocol'
import type { ReactNativeReport } from './react-native/catalog'
import { PNG } from 'pngjs'
import { describe, expect, it, vi } from 'vitest'
import { assessNativePair } from './react-native/pair-evidence'
import { readHistoricalReactNativeReport, validateReactNativeReport } from './react-native/reports'

vi.mock('./react-native/catalog', () => ({
  compatibilityCases: [
    { id: 'background-color', declarations: [{ property: 'background-color', value: '#123456' }] },
    { id: 'filter-blur', declarations: [{ property: 'filter' }] },
  ],
  RN_CATALOG_HASH: 'catalog',
  RN_FIXTURE_HASH: 'fixture',
  reactNativeVersions: () => ({ tailwindcss: '4.test', compiler: 'test' }),
}))

function report(): ReactNativeReport {
  return {
    schemaVersion: 2,
    stage: 'runtime',
    revision: 'baseline',
    platform: 'android',
    catalogHash: 'catalog',
    fixtureHash: 'fixture',
    runId: 'current-run',
    verifiedAt: new Date().toISOString(),
    versions: { tailwindcss: '4.test', compiler: 'test' },
    environment: { deviceName: 'test-device', osName: 'android', osVersion: 'test', runtimeIdentifier: 'test', abi: 'test', viewport: { width: 400, height: 800, pixelRatio: 2 } },
    results: [
      {
        id: 'background-color',
        status: 'supported',
        generated: true,
        encoded: true,
        warnings: [],
        generatedDeclarations: [{ property: 'background-color', value: '#123456' }],
        encodedStyle: { backgroundColor: '#123456' },
        checkpoints: [
          { name: 'generation:candidates', passed: true },
          { name: 'generation:declaration:0:background-color', passed: true },
          { name: 'encoder:complete', passed: true },
          { name: 'runtime:default:geometry', passed: true },
          { name: 'runtime:default:pixel', passed: true },
          { name: 'runtime:default:control', passed: true },
          { name: 'runtime:default:style', passed: true },
        ],
      },
      {
        id: 'filter-blur',
        status: 'unsupported',
        generated: true,
        encoded: false,
        warnings: ['不支持 filter'],
        reason: '原生编码明确拒绝 filter',
        generatedDeclarations: [{ property: 'filter', value: 'blur(2px)' }],
        encodedStyle: {},
        checkpoints: [
          { name: 'generation:candidates', passed: true },
          { name: 'generation:declaration:0:filter', passed: true },
          { name: 'encoder:complete', passed: false },
          { name: 'encoder:expected-rejection', passed: true },
        ],
      },
    ],
    receipts: [{
      runId: 'current-run',
      id: 'background-color',
      phase: 'default',
      checkpoints: [{ name: 'runtime:default:geometry', passed: true }, { name: 'runtime:default:pixel', passed: true }, { name: 'runtime:default:control', passed: true }],
      artifact: { name: 'case-baseline-background-color-default.png', sha256: 'a'.repeat(64), byteLength: 1_024 },
    }],
  }
}

describe('React Native fresh semantic evidence', () => {
  it('接受逐项语义与原生像素回执，同时保留明确的负向编码结论', () => {
    const value = report()
    expect(validateReactNativeReport(value, 'android', { runId: 'current-run', revision: 'baseline' })).toBe(value)
  })

  it('历史报告只能展示，不能充当当前运行证据', () => {
    const old = { schemaVersion: 1, platform: 'android', verifiedAt: '2026-08-19', results: [{ id: 'background-color', status: 'supported' }] }
    expect(readHistoricalReactNativeReport(old).historical).toBe(true)
    expect(() => validateReactNativeReport(old as unknown as ReactNativeReport)).toThrow(/historical/)
  })

  it.each(['run', 'revision', 'fixture', 'versions', 'receipt'] as const)('拒绝过期 %s 身份', (kind) => {
    const value = report()
    if (kind === 'run') {
      value.runId = 'old-run'
    }
    if (kind === 'revision') {
      value.revision = 'old-revision'
    }
    if (kind === 'fixture') {
      value.fixtureHash = 'old-fixture'
    }
    if (kind === 'versions') {
      value.versions.compiler = 'old'
    }
    if (kind === 'receipt') {
      value.receipts[0]!.runId = 'old-run'
    }
    expect(() => validateReactNativeReport(value, 'android', { runId: 'current-run', revision: 'baseline' })).toThrow()
  })

  it('运行时用例不能靠 build checkpoint 放行', () => {
    const value = report()
    value.results[0]!.checkpoints = value.results[0]!.checkpoints.filter(checkpoint => !checkpoint.name.startsWith('runtime:'))
    expect(() => validateReactNativeReport(value)).toThrow(/runtime/)
  })

  it.each(['unsupported', 'unverified', 'failed'] as const)('预期支持退化为 %s 不会自动变绿', (status) => {
    const value = report()
    Object.assign(value.results[0]!, { status, reason: 'observed failure', warnings: ['observed warning'] })
    expect(() => validateReactNativeReport(value)).toThrow(/partial|expected support/)
  })

  it('部分声明丢失、空回执和缺失生成声明都会失败', () => {
    const partial = report()
    partial.results[0]!.encoded = false
    expect(() => validateReactNativeReport(partial)).toThrow(/partial/)
    const noReceipt = report()
    noReceipt.receipts = []
    expect(() => validateReactNativeReport(noReceipt)).toThrow(/receipt/)
    const noDeclaration = report()
    noDeclaration.results[0]!.checkpoints = noDeclaration.results[0]!.checkpoints.filter(checkpoint => !checkpoint.name.startsWith('generation:declaration:'))
    expect(() => validateReactNativeReport(noDeclaration)).toThrow(/declaration/)
  })

  it('两个任意 true 不能伪装成正确阶段的几何与像素回执', () => {
    const value = report()
    value.receipts[0]!.checkpoints = [{ name: 'build:bundled', passed: true }, { name: 'runtime:old:pixel', passed: true }]
    expect(() => validateReactNativeReport(value)).toThrow(/receipt/)
    const extra = report()
    extra.receipts.push({ ...extra.receipts[0]!, id: 'unknown' })
    expect(() => validateReactNativeReport(extra)).toThrow(/extraneous/)
  })

  it('缺失生成产物不能伪装为预期的原生不支持', () => {
    const value = report()
    value.results[1]!.generated = false
    expect(() => validateReactNativeReport(value)).toThrow(/generation failed/)
  })

  it('静默丢失原生规则不能伪装为有证据的编码拒绝', () => {
    const value = report()
    value.results[1]!.warnings = []
    expect(() => validateReactNativeReport(value)).toThrow(/reviewed native rejection/)
  })

  it('静态证据显式保持 unverified，默认运行时门禁拒绝它', () => {
    const value = report()
    value.stage = 'static'
    value.results[0]!.status = 'unverified'
    value.results[0]!.checkpoints = value.results[0]!.checkpoints.filter(checkpoint => !checkpoint.name.startsWith('runtime:'))
    value.receipts = []
    expect(validateReactNativeReport(value, 'android', { stage: 'static' })).toBe(value)
    expect(() => validateReactNativeReport(value)).toThrow(/stage/)
  })
})

function pairFixture() {
  const image = new PNG({ width: 100, height: 100 })
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data.set([226, 232, 240, 255], offset)
  }
  for (const left of [5, 55]) {
    for (let y = 10; y < 30; y++) {
      for (let x = left + 5; x < left + 25; x++) {
        image.data.set([18, 52, 86, 255], (y * image.width + x) * 4)
      }
    }
  }
  const pair: NativePairEvidence = {
    runId: 'run',
    platform: 'web',
    revision: 'baseline',
    id: 'background-color',
    phase: 'default',
    probe: { x: 5, y: 5, width: 40, height: 40 },
    reference: { x: 55, y: 5, width: 40, height: 40 },
    control: { x: 5, y: 55, width: 40, height: 40 },
    target: { x: 10, y: 10, width: 20, height: 20 },
    referenceTarget: { x: 60, y: 10, width: 20, height: 20 },
    controlTarget: { x: 10, y: 60, width: 20, height: 20 },
    viewport: { width: 100, height: 100, pixelRatio: 1 },
  }
  return { image, pair }
}

describe('React Native per-case rendering oracle', () => {
  it('需要与独立参考相同的原生几何和前景像素', () => {
    const { image, pair } = pairFixture()
    expect(assessNativePair(image, pair).every(checkpoint => checkpoint.passed)).toBe(true)
    pair.target.width = 2
    expect(assessNativePair(image, pair)[0]!.passed).toBe(false)
  })

  it('宽高仍大于零但背景错误也必须失败', () => {
    const { image, pair } = pairFixture()
    for (let y = 10; y < 30; y++) {
      for (let x = 10; x < 30; x++) {
        image.data.set([255, 0, 0, 255], (y * image.width + x) * 4)
      }
    }
    expect(assessNativePair(image, pair)[1]!.passed).toBe(false)
  })

  it('空白同图、裁剪与无效坐标均不能提供像素证明', () => {
    const { image, pair } = pairFixture()
    for (let offset = 0; offset < image.data.length; offset += 4) {
      image.data.set([226, 232, 240, 255], offset)
    }
    expect(assessNativePair(image, pair)[1]!.passed).toBe(false)
    pair.reference.x = 99
    expect(() => assessNativePair(image, pair)).toThrow(/clipped/)
    pair.target.x = Number.NaN
    expect(() => assessNativePair(image, pair)).toThrow(/invalid/)
  })
})
