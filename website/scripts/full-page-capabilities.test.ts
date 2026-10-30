import { describe, expect, it } from 'vitest'
import { supportsNativeFullPageCapture } from '../tests/helpers/full-page/capabilities'

describe.each([
  { label: 'Chromium', browserName: 'chromium', oversizedNative: true },
  { label: 'Firefox', browserName: 'firefox', oversizedNative: false },
  { label: 'WebKit', browserName: 'webkit', oversizedNative: false },
  { label: '未知浏览器', browserName: undefined, oversizedNative: false },
])('$label 的整页截图能力', ({ browserName, oversizedNative }) => {
  it.each([
    { width: 320, height: 240 },
    { width: 430, height: 911 },
    { width: 32_767, height: 240 },
    { width: 320, height: 32_767 },
    { width: 32_767, height: 32_767 },
  ])('共同尺寸边界内的 $width × $height 保留原生截图', (geometry) => {
    expect(supportsNativeFullPageCapture(browserName, geometry)).toBe(true)
  })

  it.each([
    { width: 32_768, height: 240 },
    { width: 320, height: 32_768 },
    { width: 32_768, height: 32_768 },
    { width: 33_001, height: 240 },
    { width: 320, height: 33_001 },
  ])('超出共同边界的 $width × $height 只允许已验证的原生能力', (geometry) => {
    expect(supportsNativeFullPageCapture(browserName, geometry)).toBe(oversizedNative)
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])('不把未知或无效尺寸 %s 视为原生能力证据', (size) => {
    expect(supportsNativeFullPageCapture(browserName, { width: size, height: 240 })).toBe(false)
    expect(supportsNativeFullPageCapture(browserName, { width: 320, height: size })).toBe(false)
  })
})

it('无法识别的新浏览器名称也不继承 Chromium 的超界能力', () => {
  expect(supportsNativeFullPageCapture('future-browser', { width: 320, height: 33_001 })).toBe(false)
})
