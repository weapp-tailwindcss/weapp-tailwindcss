import type { NativePairEvidence } from '../examples/react-native-expo/src/compatibility/protocol'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { syntheticRuntimeInstallation } from './react-native/installation-fixture'
import { assessNativePair } from './react-native/pair-assessment'

/** 合成几何和像素只验证判定器；不会登记为真实 ScrollView 证据。 */
function fixture(phase: 'scroll-initial' | 'scroll-offset' | 'scroll-restored' = 'scroll-initial') {
  const stepIndex = ['scroll-initial', 'scroll-offset', 'scroll-restored'].indexOf(phase)
  const offset = stepIndex === 1 ? 48 : 0
  const sides = ['probe', 'reference', 'control'] as const
  const targets = sides.map((side, index) => ({ x: 16, y: 16 + index * 136, width: side === 'control' ? 80 : 44, height: side === 'control' ? 40 : 44 }))
  const pair = {
    runtimeInstallation: syntheticRuntimeInstallation(),
    runId: 'run',
    platform: 'web',
    revision: 'baseline',
    id: 'sizing-size',
    phase,
    probe: { x: 0, y: 0, width: 160, height: 128 },
    reference: { x: 0, y: 136, width: 160, height: 128 },
    control: { x: 0, y: 272, width: 160, height: 128 },
    target: targets[0]!,
    referenceTarget: targets[1]!,
    controlTarget: targets[2]!,
    viewport: { width: 160, height: 400, pixelRatio: 1 },
    scroll: {
      version: 1,
      revision: 'baseline',
      id: 'sizing-size',
      phase,
      stepIndex,
      sides: sides.map((side, index) => ({
        side,
        mountId: `mount-${side}`,
        layout: { width: targets[index]!.width, height: targets[index]!.height },
        contentSize: { width: targets[index]!.width, height: 144 },
        firstStripe: { ...targets[index]!, y: targets[index]!.y - offset, height: 48 },
        history: Array.from({ length: stepIndex }, (_, step) => ({ command: { sequence: step + 1, x: 0, y: step === 0 ? 48 : 0, animated: false, afterEventSequence: step }, event: { sequence: step + 1, contentOffset: { x: 0, y: step === 0 ? 48 : 0 }, contentSize: { width: targets[index]!.width, height: 144 }, layoutMeasurement: { width: targets[index]!.width, height: targets[index]!.height } } })),
        ...(stepIndex ? { command: { sequence: stepIndex, x: 0, y: offset, animated: false, afterEventSequence: stepIndex - 1 }, event: { sequence: stepIndex, contentOffset: { x: 0, y: offset }, contentSize: { width: targets[index]!.width, height: 144 }, layoutMeasurement: { width: targets[index]!.width, height: targets[index]!.height } } } : {}),
      })),
    },
  }
  const image = new PNG({ width: 160, height: 400 })
  for (let i = 0; i < image.data.length; i += 4) {
    image.data.set([226, 232, 240, 255], i)
  }
  for (const target of targets) {
    for (let y = target.y; y < target.y + target.height; y++) {
      for (let x = target.x; x < target.x + target.width; x++) {
        image.data.set(offset ? [37, 99, 235, 255] : [220, 38, 38, 255], (y * image.width + x) * 4)
      }
    }
  }
  return { pair, image }
}

const passes = (input: ReturnType<typeof fixture>) => assessNativePair(input.image, input.pair as NativePairEvidence).every(checkpoint => checkpoint.passed)

describe('ScrollView 真实 viewport、内容和程序化滚动证据', () => {
  it.each(['scroll-initial', 'scroll-offset', 'scroll-restored'] as const)('%s 同时核绝对尺寸、内容位置和条纹像素', (phase) => {
    expect(passes(fixture(phase))).toBe(true)
  })

  it.each(['missing', 'duplicate', 'revision', 'phase', 'command', 'event', 'stale-event', 'offset', 'content', 'layout', 'mount'] as const)('拒绝 %s 事件或身份，不能以节点可见放行', (mutation) => {
    const input = fixture('scroll-offset')
    const scroll = input.pair.scroll
    const side = scroll.sides[0]!
    if (mutation === 'missing') {
      Reflect.deleteProperty(input.pair, 'scroll')
    }
    if (mutation === 'duplicate') {
      scroll.sides[2] = { ...scroll.sides[0]! }
    }
    if (mutation === 'revision') {
      scroll.revision = 'old'
    }
    if (mutation === 'phase') {
      scroll.phase = 'scroll-restored'
    }
    if (mutation === 'command') {
      Reflect.deleteProperty(side, 'command')
    }
    if (mutation === 'event') {
      Reflect.deleteProperty(side, 'event')
    }
    if (mutation === 'stale-event') {
      side.event!.sequence = side.command!.afterEventSequence
    }
    if (mutation === 'offset') {
      side.event!.contentOffset.y = 0
    }
    if (mutation === 'content') {
      side.contentSize.height = 44
    }
    if (mutation === 'layout') {
      side.event!.layoutMeasurement.width = 80
    }
    if (mutation === 'mount') {
      side.mountId = scroll.sides[1]!.mountId
    }
    expect(() => assessNativePair(input.image, input.pair as NativePairEvidence)).toThrow(/ScrollView/)
  })

  it.each([0, -1, 1.5, 'old', null])('初始已有事件序号 %s 不能绕过跨阶段比较', (sequence) => {
    const input = fixture()
    const side = input.pair.scroll.sides[0]!
    Object.assign(side, { event: { sequence, contentOffset: { x: 0, y: 0 }, contentSize: side.contentSize, layoutMeasurement: side.layout } })
    expect(() => assessNativePair(input.image, input.pair as NativePairEvidence)).toThrow(/ScrollView/)
  })

  it('探针与参考都忽略尺寸 utility 时仍拒绝', () => {
    const input = fixture()
    input.pair.target.width = input.pair.referenceTarget.width = 80
    expect(passes(input)).toBe(false)
  })

  it('事件称已滚动但首条内容未移动，不能只靠颜色相同通过', () => {
    const input = fixture('scroll-offset')
    for (let index = 0; index < 3; index++) {
      input.pair.scroll.sides[index]!.firstStripe.y += 48
    }
    expect(passes(input)).toBe(false)
  })

  it.each(['probe', 'reference', 'control'] as const)('%s 内容错误或溢出 viewport 边界均拒绝', (side) => {
    const input = fixture('scroll-offset')
    const target = input.pair[side === 'probe' ? 'target' : side === 'reference' ? 'referenceTarget' : 'controlTarget']
    const center = (Math.round(target.y + target.height / 2) * input.image.width + Math.round(target.x + target.width / 2)) * 4
    input.image.data.set([220, 38, 38, 255], center)
    expect(passes(input)).toBe(false)
    const clipped = fixture('scroll-offset')
    clipped.image.data.set([37, 99, 235, 255], (Math.round(target.y + target.height + 2) * clipped.image.width + Math.round(target.x + target.width / 2)) * 4)
    expect(passes(clipped)).toBe(false)
  })
})
