import { describe, expect, it } from 'vitest'
import { addNativeVariantRules, compileNativeStylesheet, finalizeNativeManifest } from '../src/compiler'

describe('合成原生变体保留完整条件', () => {
  it.each(['ios:hover:probe', 'dark:focus:probe', 'android:sm:probe'])('%s 不能丢弃浏览器条件复制基础规则', (candidate) => {
    const result = compileNativeStylesheet('.probe { width: 13px; }')
    addNativeVariantRules(result, [candidate, candidate])
    expect(result.rules[candidate]).toBeUndefined()
    const unsupported = candidate.split(':')[1]
    expect(result.warnings).toEqual([{ className: candidate, property: 'variant', message: `不支持将 ${unsupported}: 变体编译为 React Native 条件样式` }])
  })

  it('允许的复合原生变体仍保留 important 和平台条件', () => {
    const result = compileNativeStylesheet('.probe { width: 13px !important; }')
    addNativeVariantRules(result, ['dark:ios:probe'])
    expect(result.rules['dark:ios:probe']).toEqual([expect.objectContaining({ style: { width: 13 }, important: true, colorScheme: 'dark', platform: 'ios' })])
  })

  it('合成变体拥有独立 StyleSheet ID，不覆盖基础规则的运行时条件', () => {
    const result = compileNativeStylesheet('.probe { width: 13px; }')
    const baseId = result.staticLookup!.probe![0]!
    addNativeVariantRules(result, ['dark:ios:probe'])
    finalizeNativeManifest(result)
    const variantId = result.staticLookup!['dark:ios:probe']![0]!
    expect(variantId).not.toBe(baseId)
    expect(result.styleEntries![baseId]).not.toHaveProperty('platform')
    expect(result.styleEntries![baseId]).not.toHaveProperty('colorScheme')
    expect(result.styleEntries![variantId]).toMatchObject({ platform: 'ios', colorScheme: 'dark' })
  })
})
