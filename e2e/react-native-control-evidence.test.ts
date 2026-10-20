import type { NativePairEvidence } from '../examples/react-native-expo/src/compatibility/protocol'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { assessNativePair } from './react-native/pair-evidence'

function fixture() {
  const image = new PNG({ width: 100, height: 100 })
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data.set([226, 232, 240, 255], offset)
  }
  for (const [left, top] of [[0, 0], [50, 0], [0, 50]]) {
    for (let y = top! + 10; y < top! + 30; y++) {
      for (let x = left! + 10; x < left! + 30; x++) {
        image.data.set([192, 38, 211, 255], (y * image.width + x) * 4)
      }
    }
  }
  const pair: NativePairEvidence = {
    runId: 'control-run',
    revision: 'revision',
    platform: 'web',
    id: 'effect-shadow',
    phase: 'default',
    probe: { x: 0, y: 0, width: 40, height: 40 },
    reference: { x: 50, y: 0, width: 40, height: 40 },
    control: { x: 0, y: 50, width: 40, height: 40 },
    target: { x: 10, y: 10, width: 20, height: 20 },
    referenceTarget: { x: 60, y: 10, width: 20, height: 20 },
    controlTarget: { x: 10, y: 60, width: 20, height: 20 },
    viewport: { width: 100, height: 100, pixelRatio: 1 },
  }
  return { image, pair }
}

describe('原生宿主效果必须区别于无效果 control', () => {
  it('两侧同时忽略阴影时，即使非空截图相等也不能通过', () => {
    const { image, pair } = fixture()
    expect(assessNativePair(image, pair).find(item => item.name === 'runtime:default:control')?.passed).toBe(false)
  })

  it('参考侧确有可测像素变化时才证明宿主效果', () => {
    const { image, pair } = fixture()
    for (const left of [0, 50]) {
      for (let x = left + 10; x < left + 30; x++) {
        image.data.set([80, 80, 80, 255], (31 * image.width + x) * 4)
      }
    }
    expect(assessNativePair(image, pair).every(item => item.passed)).toBe(true)
  })

  it('缺少 control 不能退回只比较两个同屏节点', () => {
    const { image, pair } = fixture()
    delete (pair as Partial<NativePairEvidence>).control
    expect(() => assessNativePair(image, pair)).toThrow(/control/)
  })

  it('无条件未命中的阶段要求与 control 一致，不能反向要求制造效果', () => {
    const { image, pair } = fixture()
    pair.id = 'variant-dark'
    pair.phase = 'light'
    expect(assessNativePair(image, pair).every(item => item.passed)).toBe(true)
  })
})
