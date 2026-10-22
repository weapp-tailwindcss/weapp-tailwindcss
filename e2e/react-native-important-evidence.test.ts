import type { NativePairEvidence } from '../examples/react-native-expo/src/compatibility/protocol'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { expectedFixtureStyle, fixtureClassValue, fixtureInlineStyle, nativeFixtures, styleContains } from '../examples/react-native-expo/src/compatibility/protocol'
import { compileNativeStylesheet } from '../packages/react-native/src/compiler'
import { createNativeStyleRuntime } from '../packages/react-native/src/runtime'
import { flattenInlineStyle } from '../packages/react-native/src/runtime/line-height'
import { syntheticRuntimeInstallation } from './react-native/installation-fixture'
import { assessNativePair } from './react-native/pair-evidence'

const css = String.raw`
.\!bg-\[\#737373\] { background-color: #737373 !important }
.bg-\[\#737373\] { background-color: #737373 }
.bg-\[\#dc2626\] { background-color: #dc2626 }
`

function resolve(source: string, phase: string) {
  const runtime = createNativeStyleRuntime(compileNativeStylesheet(source))
  const value = fixtureClassValue('!bg-[#737373]', 'syntax-important', phase)
  const inline = fixtureInlineStyle('syntax-important', phase)
  return flattenInlineStyle(runtime.composeStyle(runtime.tw(value), inline))
}

function fixture(phase = nativeFixtures['syntax-important']!.phases?.[0] ?? 'default') {
  const image = new PNG({ width: 100, height: 100 })
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data.set([226, 232, 240, 255], offset)
  }
  const pair: NativePairEvidence = {
    runtimeInstallation: syntheticRuntimeInstallation(),
    runId: 'important-run',
    revision: 'revision',
    platform: 'web',
    id: 'syntax-important',
    phase,
    probe: { x: 0, y: 0, width: 40, height: 40 },
    reference: { x: 50, y: 0, width: 40, height: 40 },
    control: { x: 0, y: 50, width: 40, height: 40 },
    target: { x: 10, y: 10, width: 20, height: 20 },
    referenceTarget: { x: 60, y: 10, width: 20, height: 20 },
    controlTarget: { x: 10, y: 60, width: 20, height: 20 },
    viewport: { width: 100, height: 100, pixelRatio: 1 },
  }
  const paint = (side: 'target' | 'referenceTarget' | 'controlTarget', rgb: number[]) => {
    const rect = pair[side]
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      for (let x = rect.x; x < rect.x + rect.width; x++) {
        image.data.set([...rgb, 255], (y * image.width + x) * 4)
      }
    }
  }
  const expected = phase.endsWith('-normal') ? [220, 38, 38] : [115, 115, 115]
  paint('target', expected)
  paint('referenceTarget', expected)
  paint('controlTarget', [192, 38, 211])
  return { image, pair, paint }
}

describe('RN important 的独立像素 oracle', () => {
  it('probe 与 reference 同时变成竞争色也不能冒充 important 成功', () => {
    const { image, pair, paint } = fixture()
    paint('target', [220, 38, 38])
    paint('referenceTarget', [220, 38, 38])
    expect(assessNativePair(image, pair).every(item => item.passed)).toBe(false)
  })

  it.each(['inline-important', 'inline-normal', 'class-important', 'class-normal'])('%s 接受正确颜色并拒绝错误的 probe、reference 与无效果 control', (phase) => {
    const correct = fixture(phase)
    expect(assessNativePair(correct.image, correct.pair).every(item => item.passed)).toBe(true)
    for (const side of ['target', 'referenceTarget', 'controlTarget'] as const) {
      const { image, pair, paint } = fixture(phase)
      paint(side, [12, 34, 56])
      expect(assessNativePair(image, pair).every(item => item.passed)).toBe(false)
    }
  })

  it.each(['inline-normal', 'class-normal'])('%s 必须呈竞争色，同值普通 utility 未受竞争不能通过', (phase) => {
    const { image, pair, paint } = fixture(phase)
    paint('target', [115, 115, 115])
    paint('referenceTarget', [115, 115, 115])
    expect(assessNativePair(image, pair).every(item => item.passed)).toBe(false)
  })

  it.each(['inline-important', 'inline-normal', 'class-important', 'class-normal'])('%s 由真实 compiler/runtime 组合样式，与独立颜色预期相符', (phase) => {
    const expected = { backgroundColor: phase.endsWith('-normal') ? '#dc2626' : '#737373' }
    expect(resolve(css, phase)).toEqual(expected)
  })

  it.each(['inline-important', 'class-important'])('%s 删除 important 后必须被原有 oracle 拒绝', (phase) => {
    const actual = resolve(css.replace('!important', ''), phase)
    expect(actual).toEqual({ backgroundColor: '#dc2626' })
    expect(styleContains(actual, expectedFixtureStyle('syntax-important', phase)!)).toBe(false)
  })
})
