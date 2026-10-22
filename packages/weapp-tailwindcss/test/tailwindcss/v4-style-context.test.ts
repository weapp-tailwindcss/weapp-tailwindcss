import { postcss } from '@weapp-tailwindcss/postcss'
import { collectStaticCustomPropertyValues } from '@weapp-tailwindcss/postcss/transform'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasChangedCustomPropertyCompatibilityContext, resolveGenerationStyleContext, resolveIncrementalStyleContext } from '@/tailwindcss/v4-engine/generator/style-context'

describe('generation style context', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each([
    '.dark{--weight:25%}',
    '@media print{:root{--weight:25%}}',
    '@property --weight{syntax:"<percentage>";inherits:false;initial-value:25%}',
    ':root{--weight:75%}',
  ])('兼容上下文的完整依赖资格变化必须失效：%s', (override) => {
    const css = ':root{--weight:50%;--alias:var(--weight)}'
    const previous = collectStaticCustomPropertyValues(css)
    const next = collectStaticCustomPropertyValues(css + override)
    expect(hasChangedCustomPropertyCompatibilityContext(previous, next)).toBe(true)
    expect(hasChangedCustomPropertyCompatibilityContext(next, previous)).toBe(true)
  })

  it('不相关规则和相同 root 声明不改变静态上下文', () => {
    const css = ':root{--weight:50%;--alias:var(--weight)}'
    expect(hasChangedCustomPropertyCompatibilityContext(collectStaticCustomPropertyValues(css), collectStaticCustomPropertyValues(`${css}.block{display:block}:root{--weight:50%}`))).toBe(false)
  })

  it.each([
    '.dark{--brand:blue}',
    '@media (min-width:1px){:root{--brand:blue}}',
    '@property --brand{syntax:"<color>";inherits:false;initial-value:blue}',
    ':root{--brand:var(--missing,red)}',
  ])('增量兼容上下文不能把动态变量当成颜色常量：%s', (dynamic) => {
    const generated = `:root{--brand:red;--stable:green}${dynamic}`
    const context = resolveIncrementalStyleContext('@theme{--stable:green}', generated)
    expect(context.customPropertyCompatibilityValues?.has('--brand')).toBe(false)
    expect(context.customPropertyCompatibilityValues?.get('--stable')).toBe('green')
  })

  it.each([undefined, {}, { cssCalc: false }, { cssCalc: [] }, { cssCalc: { precision: 2 } }])('does not parse full CSS without variable consumers: %j', (options) => {
    const parse = vi.spyOn(postcss, 'parse')
    expect(resolveGenerationStyleContext(':root { --scale: 1rem }', '.x { gap: calc(var(--scale) * 2) }', options)).toBe(options)
    expect(parse).not.toHaveBeenCalled()
  })

  it.each([true, ['--scale'], [/^--scale$/], { includeCustomProperties: ['--scale'] }])('retains selected variable context: %j', (cssCalc) => {
    const options = resolveGenerationStyleContext(':root { --scale: 1rem }', ':root { --scale: 2rem; --other: 4px }', { cssCalc })
    expect(options?.customPropertyContextCss).toContain(':root { --scale: 1rem }')
    expect(options?.customPropertyContextCss).toContain(':root { --scale: 2rem; --other: 4px }')
    expect(options?.customPropertyValues).toBeUndefined()
  })

  it('honors nested calc and preserves explicitly provided values', () => {
    const values = new Map([['--scale', '3rem']])
    const options = resolveGenerationStyleContext(':root { --scale: 1rem }', ':root { --scale: 2rem }', {
      cssCalc: false,
      cssOptions: { cssCalc: ['--scale'] },
      customPropertyValues: values,
    })
    expect(options?.customPropertyValues?.get('--scale')).toBe('3rem')
    expect(options?.customPropertyValues).toBe(values)
    expect(options?.customPropertyContextCss).toContain(':root { --scale: 2rem }')
    expect(values.size).toBe(1)
  })
})
