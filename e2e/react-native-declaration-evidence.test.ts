import { describe, expect, it } from 'vitest'
import { generatedCandidatePresent, generatedRules, matchGeneratedDeclaration, styleContains } from './react-native/declarations'
import { reactNativeWebBrowser } from './react-native/web-browser'

describe('React Native declaration evidence', () => {
  it('只接受数学等价的 fraction 和黑色透明混合，保留单位与 alpha 差异', () => {
    const rules = generatedRules('.half{flex-basis:calc(1 / 2 * 100%);color:color-mix(in oklab, #000 35%, transparent)}')
    expect(matchGeneratedDeclaration(rules, { property: 'flex-basis', value: '50%' })).toBeDefined()
    expect(matchGeneratedDeclaration(rules, { property: 'flex-basis', value: '50px' })).toBeUndefined()
    expect(matchGeneratedDeclaration(rules, { property: 'color', value: 'rgba(0,0,0,0.35)' })).toBeDefined()
    expect(matchGeneratedDeclaration(rules, { property: 'color', value: 'rgba(0,0,0,0.5)' })).toBeUndefined()
    expect(matchGeneratedDeclaration(generatedRules('.bad{color:color-mix(in oklab,#f00 35%,transparent)}'), { property: 'color', value: 'rgba(0,0,0,0.35)' })).toBeUndefined()
  })

  it('指令作者选择器有精确声明证据才算生成，普通未登记类不能借用此边界', () => {
    const rules = generatedRules('.lynx-applied{display:flex}.unknown{width:1px}.lynx-reference-extra{padding:16px}')
    expect(generatedCandidatePresent('lynx-applied', [], rules)).toBe(true)
    expect(generatedCandidatePresent('lynx-reference', [], rules)).toBe(false)
    expect(generatedCandidatePresent('unknown', [], rules)).toBe(false)
    expect(generatedCandidatePresent('unknown', ['unknown'], rules)).toBe(true)
  })

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
