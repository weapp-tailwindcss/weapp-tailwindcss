import type { PNG } from 'pngjs'
import type { CaseContract, SemanticAssertion } from '../types'

/** 屏幕 ICC 到 sRGB 的量化最多允许 RGB 一级误差；独立参考必须逐像素一致，alpha 精确匹配。 */
export function weappPixelContract(expected: readonly number[]) {
  if (expected.length !== 4 || expected.some(value => !Number.isInteger(value) || value < 0 || value > 255)) {
    throw new Error('微信像素预期必须是有效 RGBA')
  }
  const names = ['pixel', 'reference-pixel', 'pixel-match'].flatMap(prefix => expected.map((value, channel) => ({ name: `${prefix}-${channel}`, value: prefix === 'pixel-match' ? 0 : value, tolerance: channel < 3 && prefix !== 'pixel-match' ? 1 : undefined })))
  return {
    requiredAssertions: names.map(item => item.name),
    expectedValues: Object.fromEntries(names.map(item => [item.name, item.value])),
    tolerances: Object.fromEntries(names.filter(item => item.tolerance !== undefined).map(item => [item.name, item.tolerance!])),
    assertionStages: Object.fromEntries(names.map(item => [item.name, 'visual' as const])),
  } satisfies Pick<CaseContract, 'requiredAssertions' | 'expectedValues' | 'tolerances' | 'assertionStages'>
}

export function weappPixelAssertions(actual: readonly number[], reference: readonly number[], expected: readonly number[]): SemanticAssertion[] {
  const contract = weappPixelContract(expected)
  if (actual.length !== 4 || reference.length !== 4) {
    throw new Error('微信截图缺少 RGBA 采样')
  }
  return contract.requiredAssertions.map((name) => {
    const channel = Number(name.at(-1))
    const value = name.startsWith('reference-') ? reference[channel]! : name.startsWith('pixel-match-') ? actual[channel]! - reference[channel]! : actual[channel]!
    const tolerance = contract.tolerances[name]
    return { name, stage: 'visual', actual: value, expected: contract.expectedValues[name]!, ...(tolerance !== undefined ? { tolerance } : {}) }
  })
}

/** 视口裁剪图按实际宽度换算采样，不把设备 pixelRatio 当成宿主截图比例。 */
export function sampleWeappPixel(image: PNG, viewportWidth: number, rect: { left: number, top: number, width: number, height: number }) {
  const scale = image.width / viewportWidth
  const x = Math.floor((rect.left + rect.width * 0.85) * scale)
  const y = Math.floor((rect.top + rect.height * 0.85) * scale)
  if (!Number.isFinite(scale) || scale <= 0 || rect.width <= 0 || rect.height <= 0 || x < 0 || y < 0 || x >= image.width || y >= image.height) {
    throw new Error('微信像素采样超出实际视口截图')
  }
  const offset = (y * image.width + x) * 4
  return [image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!, image.data[offset + 3]!]
}
