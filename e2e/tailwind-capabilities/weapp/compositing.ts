import type { Buffer } from 'node:buffer'
import type { SemanticAssertion } from '../types'
import type { Rgba } from './types'
import { inflateSync } from 'node:zlib'
import { assertWeappRgbProfile } from './color-profile'

export interface WeappComposite {
  foreground: Rgba
  background: Rgba
  actualAlpha: number
  referenceAlpha: number
  equal: boolean
}

export interface CompositeSamples {
  actual: readonly number[]
  reference: readonly number[]
  foreground: readonly number[]
  background: readonly number[]
  normalizedForeground: readonly number[]
  normalizedBackground: readonly number[]
  normalizedGray: readonly number[]
}

export const compositeGray = [128, 128, 128, 255] as const
export const compositeColor = (value: Rgba) => `rgb(${value[0]},${value[1]},${value[2]})`
export const compositeMix = (foreground: readonly number[], background: readonly number[], alpha: number) => foreground.map((value, channel) => channel === 3 ? 255 : value * alpha + background[channel]! * (1 - alpha))

/** 只接受普通八位 RGB 截图；不猜测 HDR、灰度、索引色或未知 ICC 的合成语义。 */
export function assertWeappCompositeEncoding(image: Buffer) {
  if (image.toString('hex', 0, 8) !== '89504e470d0a1a0a' || image[24] !== 8 || ![2, 6].includes(image[25]!)) {
    throw new Error('微信合成证据需要八位 RGB PNG')
  }
  let profileSeen = false
  for (let offset = 8; offset + 12 <= image.length;) {
    const length = image.readUInt32BE(offset)
    if (offset + length + 12 > image.length) {
      throw new Error('微信 PNG 色彩配置不完整')
    }
    const name = image.toString('ascii', offset + 4, offset + 8)
    if (['iCCP', 'sRGB'].includes(name)) {
      if (profileSeen) {
        throw new Error('微信截图含重复或冲突色彩配置')
      }
      profileSeen = true
    }
    if (name === 'sRGB' && (length !== 1 || image[offset + 8]! > 3)) {
      throw new Error('微信 PNG sRGB 配置无效')
    }
    if (['gAMA', 'cHRM'].includes(name)) {
      throw new Error('微信合成证据尚未登记独立 gamma/原色配置')
    }
    if (['cICP', 'cLLI', 'mDCv'].includes(name)) {
      throw new Error('微信合成证据不支持 HDR/视频色彩配置')
    }
    if (name === 'iCCP') {
      const data = image.subarray(offset + 8, offset + 8 + length)
      const end = data.indexOf(0)
      if (end < 1 || data[end + 1] !== 0) {
        throw new Error('微信 ICC 编码无效')
      }
      const profile = inflateSync(data.subarray(end + 2), { maxOutputLength: 4 * 1024 * 1024 })
      assertWeappRgbProfile(profile)
    }
    offset += length + 12
  }
}

/** 端点和中灰先按 sRGB 绝对验真，再在同图原始编码空间检查预声明权重，不用主体拟合 alpha。 */
export function weappCompositeAssertions(phase: string, samples: CompositeSamples, expected: WeappComposite): SemanticAssertion[] {
  if (![expected.actualAlpha, expected.referenceAlpha].every(value => Number.isFinite(value) && value >= 0 && value <= 1)
    || Object.values(samples).some((value: readonly number[]) => value.length !== 4 || value.some(channel => !Number.isInteger(channel) || channel < 0 || channel > 255) || value[3] !== 255)
    || !samples.normalizedGray || expected.foreground[3] !== 255 || expected.background[3] !== 255) {
    throw new Error('微信合成缺少有效不透明端点、原始采样或预声明 alpha')
  }
  const assertions: SemanticAssertion[] = []
  for (const [name, actual, color] of [
    ['foreground', samples.normalizedForeground, expected.foreground],
    ['background', samples.normalizedBackground, expected.background],
    ['gray', samples.normalizedGray, compositeGray],
  ] as const) {
    assertions.push(...color.map((value, channel) => ({ name: `${phase}/composite-${name}-${channel}`, stage: 'visual' as const, actual: actual[channel]!, expected: value, ...(channel < 3 ? { tolerance: 1 } : {}) })))
  }
  for (const [name, actual, alpha] of [['pixel', samples.actual, expected.actualAlpha], ['reference-pixel', samples.reference, expected.referenceAlpha]] as const) {
    const mixed = compositeMix(samples.foreground, samples.background, alpha)
    assertions.push(...mixed.map((value, channel) => ({ name: `${phase}/${name}-${channel}`, stage: 'visual' as const, actual: actual[channel]! - value, expected: 0, ...(channel < 3 ? { tolerance: 1 } : {}) })))
  }
  assertions.push({ name: `${phase}/pixel-equal`, stage: 'visual', actual: samples.actual.every((value, channel) => value === samples.reference[channel]), expected: expected.equal })
  return assertions
}

export function nominalCompositeSamples(expected: WeappComposite): CompositeSamples {
  return {
    actual: compositeMix(expected.foreground, expected.background, expected.actualAlpha).map(Math.round),
    reference: compositeMix(expected.foreground, expected.background, expected.referenceAlpha).map(Math.round),
    foreground: expected.foreground,
    background: expected.background,
    normalizedForeground: expected.foreground,
    normalizedBackground: expected.background,
    normalizedGray: compositeGray,
  }
}
