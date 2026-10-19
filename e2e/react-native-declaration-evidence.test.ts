import { describe, expect, it } from 'vitest'
import { generatedRules, matchGeneratedDeclaration, styleContains } from './react-native/declarations'
import { reactNativeWebBrowser } from './react-native/web-browser'

describe('React Native declaration evidence', () => {
  it('匹配精确 class，分开保留原始值和独立预期', () => {
    const rules = generatedRules(':root { --spacing: .25rem } .negative { margin-top: calc(var(--spacing) * -2) } .negative-extra { color: red }')
    const matched = rules.filter(rule => rule.classes.includes('negative'))
    expect(matchGeneratedDeclaration(matched, { property: 'margin-top', value: '-0.5rem' })).toEqual({ property: 'margin-top', value: 'calc(var(--spacing) * -2)' })
    expect(matchGeneratedDeclaration(matched, { property: 'color' })).toBeUndefined()
  })

  it('重要标记与百分比语义不能通过去单位文本伪装', () => {
    const rules = generatedRules('.half { opacity: 50%; background-color: #fff !important }')
    expect(matchGeneratedDeclaration(rules, { property: 'opacity', value: '0.5' })).toBeDefined()
    expect(matchGeneratedDeclaration(rules, { property: 'opacity', value: '50' })).toBeUndefined()
    expect(matchGeneratedDeclaration(rules, { property: 'background-color', value: '#ffffff', important: true })).toBeDefined()
    expect(matchGeneratedDeclaration(rules, { property: 'opacity', value: '0.5', important: true })).toBeUndefined()
  })

  it('部分编码不能满足独立的完整原生样式预期', () => {
    expect(styleContains({ overflow: 'hidden' }, { overflow: 'hidden', width: 44 })).toBe(false)
    expect(styleContains({ width: 44, shadowOffset: { width: 0, height: 2 } }, { width: 44, shadowOffset: { width: 0, height: 2 } })).toBe(true)
  })

  it.each(['chromium', 'firefox', 'webkit'])('Expo Web %s 使用指定的引擎身份', (name) => {
    expect(reactNativeWebBrowser(name).type.name()).toBe(name)
  })

  it('不接受未知引擎并静默降级为 Chromium', () => {
    expect(() => reactNativeWebBrowser('unknown')).toThrow(/RN_WEB_BROWSER/)
  })
})
