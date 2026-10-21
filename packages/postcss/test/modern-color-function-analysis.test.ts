import valueParser from 'postcss-value-parser'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeModernColorValue } from '../src/compat/color-mix'
import { hasUnsupportedModernColorFunction } from '../src/compat/color-mix/modern'

vi.mock('postcss-value-parser', async (importOriginal) => {
  const original = await importOriginal<typeof import('postcss-value-parser')>()
  return { ...original, default: Object.assign(vi.fn(original.default), original.default) }
})
afterEach(() => vi.clearAllMocks())

describe('现代颜色分析复用当前语法树', () => {
  it.each(['oklch(.6 .2 240)', 'color-mix(in oklab, red 50%, transparent)'])('转换器输出中的动态alpha fallback %s仍须经过现代颜色检测', (fallback) => {
    const result = normalizeModernColorValue(`rgb(1 2 3 / var(--alpha, ${fallback}))`)
    expect(result.value).toContain(fallback)
    expect(result.hasUnsupported).toBe(true)
  })

  it('普通声明不分配与颜色无关的value AST', () => {
    for (const value of ['0', 'none', '#123456', 'red', 'var(--brand)', 'calc(2 * (1px + 3px))', 'blur(4px)', 'linear-gradient(red, blue)', 'url(image.png)']) {
      expect(normalizeModernColorValue(value)).toEqual({ value, changed: false, hasUnsupported: false })
    }
    expect(valueParser).not.toHaveBeenCalled()
  })

  it.each([
    ['drop-shadow(0 0 2px rgb(1, 2, 3))', false],
    ['var(--brand, rgba(1 2 3 / .5))', true],
    ['linear-gradient(OKLCH(.6 .2 240), red)', true],
    ['color-mix(in oklab, red 50%, transparent)', true],
    ['color(display-p3 1 0 0)', true],
    ['"rgb(1 2 3)"', false],
    ['url("image-rgb(1 2 3).png")', false],
    ['/* rgb(1 2 3) */ none', false],
  ])('检测%s只解析完整value一次，函数分类复用已有节点', (value, expected) => {
    expect(hasUnsupportedModernColorFunction(value)).toBe(expected)
    expect(valueParser).toHaveBeenCalledTimes(1)
  })

  it('转义潜在拼写继续完整解析，不由字符串预筛作有效性结论', () => {
    hasUnsupportedModernColorFunction(String.raw`var(--brand, r\67 b(1 2 3))`)
    expect(valueParser).toHaveBeenCalled()
  })

  it.each([
    ['drop-shadow(0 0 2px rgb(1, 2, 3))', 'drop-shadow(0 0 2px rgb(1, 2, 3))', false, false],
    ['var(--brand, rgb(1 2 3 / .5))', 'var(--brand, rgba(1, 2, 3, 0.5))', true, false],
    ['color-mix(in oklab, rgb(1 2 3) var(--alpha), transparent)', 'color-mix(in oklab, rgb(1 2 3) var(--alpha), transparent)', false, true],
    ['linear-gradient(rgb(1 2 3), color-mix(in oklab, currentColor 50%, transparent))', 'linear-gradient(rgb(1, 2, 3), color-mix(in oklab, currentColor 50%, transparent))', true, true],
    ['url("image-rgb(1 2 3).png")', 'url("image-rgb(1 2 3).png")', false, false],
  ])('规范化%s仅解析一次完整输入且保留嵌套边界', (value, expected, changed, hasUnsupported) => {
    expect(normalizeModernColorValue(value)).toEqual({ value: expected, changed, hasUnsupported })
    expect(vi.mocked(valueParser).mock.calls.filter(([input]) => input === value)).toHaveLength(1)
  })
})
