import type { NativeCaseResult } from '../../examples/react-lynx/src/compatibility/types'
import type { PngPixels } from './png'
import { requiresPixelEffect } from '../../examples/react-lynx/src/compatibility/evidence'
import { evaluateSkewGeometry } from './pixel-geometry'

type Color = readonly [number, number, number]
const canvas: Color = [247, 250, 251]
const blue: Color = [14, 165, 233]

function close(actual: readonly number[], expected: Color, tolerance = 10) {
  return expected.every((channel, index) => Math.abs(channel - actual[index]!) <= tolerance)
}

// 与固定的 160px capture、12px padding 配套；取空白区域的均值以避开文字和装饰节点。
function sample(image: PngPixels, x: number, y: number): Color {
  const scale = image.width / 160
  const sums = [0, 0, 0]
  let count = 0
  for (let row = Math.floor((y - 1) * scale); row < Math.ceil((y + 1) * scale); row++) {
    for (let column = Math.floor((x - 1) * scale); column < Math.ceil((x + 1) * scale); column++) {
      if (row < 0 || column < 0 || row >= image.height || column >= image.width) {
        throw new Error('预期效果采样区域超出画布')
      }
      const offset = (row * image.width + column) * 4
      if (image.data[offset + 3] !== 255) {
        throw new Error('预期效果缺少不透明合成画布')
      }
      for (let channel = 0; channel < 3; channel++) {
        sums[channel]! += image.data[offset + channel]!
      }
      count++
    }
  }
  return sums.map(value => value / count) as unknown as Color
}

function interpolate(first: Color, second: Color, ratio: number): Color {
  return first.map((channel, index) => channel + (second[index]! - channel) * ratio) as unknown as Color
}

function gradient(probe: PngPixels, control: PngPixels) {
  const observations: Color[] = []
  const matches: boolean[] = []
  for (const [frame, image] of [['probe', probe], ['control', control]] as const) {
    // 背景 utility 不应删除装饰节点；空白截图属于取证失败，不能判为不支持。
    if (!close(sample(image, 24, 44), [250, 204, 21], 2)
      || !close(sample(image, 24, 60), [239, 68, 68], 2)
      || !close(sample(image, 120, 128), canvas, 2)) {
      throw new Error(`预期效果的渐变 ${frame} 主体或外部画布夹具无效`)
    }
  }
  for (const y of [15, 17]) {
    for (const ratio of [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]) {
      const x = 12 + 136 * ratio
      if (!close(sample(control, x, y), interpolate([15, 23, 42], [248, 250, 252], ratio))) {
        throw new Error('预期效果的灰色渐变 control 夹具无效')
      }
      const actual = sample(probe, x, y)
      observations.push(actual)
      // 当前产物为 sRGB 的 0/50/100% 停靠点，内缩位置必须比较插值值。
      const expected = ratio <= 0.5
        ? interpolate([2, 132, 199], [34, 197, 94], ratio * 2)
        : interpolate([34, 197, 94], [250, 204, 21], ratio * 2 - 1)
      matches.push(close(actual, expected))
    }
  }
  return { passed: matches.every(Boolean), actual: JSON.stringify(observations.map(color => color.map(Math.round))), expected: '两条空白横线均呈现蓝→绿→黄的连续 sRGB 插值' }
}

function bottomOfBlue(image: PngPixels) {
  const scale = image.width / 160
  const column = Math.round(120 * scale)
  let last = -1
  for (let row = Math.ceil(12 * scale); row < Math.floor(120 * scale); row++) {
    const offset = (row * image.width + column) * 4
    if (close([...image.data.subarray(offset, offset + 3)], blue, 1)) {
      last = row
    }
  }
  if (last < 20 * scale) {
    throw new Error('预期效果的阴影主体夹具缺失')
  }
  return (last + 1) / scale
}

function shadow(probe: PngPixels, control: PngPixels) {
  const bottom = bottomOfBlue(probe)
  const controlBottom = bottomOfBlue(control)
  if (Math.abs(bottom - controlBottom) > 1
    || !close(sample(control, 8, 30), [239, 68, 68], 2)
    || !close(sample(probe, 120, 16), blue, 2)
    || !close(sample(probe, 120, 128), canvas, 2)
    || !close(sample(control, 120, 128), canvas, 2)) {
    throw new Error('预期效果的阴影主体、外部画布或红色默认阴影夹具无效')
  }
  const observations: number[] = []
  let passed = true
  for (const x of [96, 124]) {
    let previousDarkening = Number.POSITIVE_INFINITY
    for (const offset of [8, 12, 18, 30]) {
      if (!close(sample(control, x, controlBottom + offset), canvas, 2)) {
        throw new Error('预期效果的阴影外部 control 背景无效')
      }
      const color = sample(probe, x, bottom + offset)
      const differences = canvas.map((channel, index) => channel - color[index]!)
      const darkening = differences.reduce((sum, value) => sum + value, 0) / 3
      observations.push(Math.round(darkening * 10) / 10)
      // 黑色半透明阴影应近处同向变暗、远处回到背景；红环或删除红环都不能通过。
      passed &&= Math.max(...differences) - Math.min(...differences) <= 3
      if (offset === 30) {
        passed &&= Math.abs(darkening) <= 2 && darkening <= previousDarkening
      }
      else {
        passed &&= darkening >= (offset === 18 ? 0 : 2) && darkening <= 55
        // 多个中间距离必须有可观测衰减，避免有限高度的硬灰矩形冒充 blur。
        passed &&= darkening <= previousDarkening - 0.75
      }
      previousDarkening = darkening
    }
  }
  return { passed, actual: JSON.stringify(observations), expected: '主体下方两列均有中性黑色半透明阴影，向远处衰减至背景' }
}

/** 以真实效果决定支持状态；不从截图指纹、差异面积或已提交基线推断。 */
export function evaluatePixelEffect(id: string, probe: PngPixels, control: PngPixels): NativeCaseResult | undefined {
  if (!requiresPixelEffect(id) || id === 'variant-structural' || id === 'type-flow') {
    return undefined
  }
  if (probe.width !== probe.height || probe.width < 160 || probe.width !== control.width || probe.height !== control.height) {
    throw new Error('预期效果缺少等尺寸的完整固定画布')
  }
  const effect = id === 'transform-skew' ? evaluateSkewGeometry(probe, control) : id === 'effect-shadow' ? shadow(probe, control) : gradient(probe, control)
  return {
    id,
    status: effect.passed ? 'supported' : 'unsupported',
    ...(effect.passed ? {} : { reason: `原生截图未呈现预期效果：${effect.expected}`, failureStage: 'runtime' as const }),
    checkpoints: [{ name: id === 'transform-skew' ? 'geometry:expected-effect-v1' : 'pixel:expected-effect-v1', ...effect }],
  }
}
