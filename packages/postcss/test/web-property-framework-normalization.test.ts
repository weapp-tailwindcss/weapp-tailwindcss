import { describe, expect, it } from 'vitest'
import postcss from 'postcss'
import { transformWebCssCompat } from '../src/compat/web-css'
import { finalizeWebCssPropertyFallbacks } from '../src/compat/web-css-property-fallbacks'

const ringRegistration = (value: string) => `@property --tw-ring-offset-width { syntax: '<length>'; inherits: false; initial-value: ${value}; }`
const reverseRegistration = '@property --tw-space-y-reverse { syntax: "*"; inherits: false; initial-value: 0; }'

describe('框架后处理与最终注册默认值', () => {
  it.each([false, true])('保留资产已有的独立 backdrop 前缀，layer=%s', (layer) => {
    const css = `${reverseRegistration}\n@supports (display: grid) { ::-webkit-backdrop { color: red; } ::-ms-backdrop { color: red; } }`
    const options = { features: { layer } }
    const result = finalizeWebCssPropertyFallbacks([css], options)[0]!
    const root = postcss.parse(result)
    for (const selector of ['::-webkit-backdrop', '::-ms-backdrop']) {
      const rules: postcss.Rule[] = []
      root.walkRules(selector, rule => { rules.push(rule) })
      const defaults = rules.filter(rule => rule.nodes.some(node => node.type === 'decl' && node.prop === '--tw-space-y-reverse'))
      expect(defaults).toHaveLength(1)
      expect(defaults[0]!.parent?.type).toBe(layer ? 'root' : 'atrule')
      expect(defaults[0]!.selectors).toEqual([selector])
    }
    expect(result).toContain(css)
    expect(finalizeWebCssPropertyFallbacks([result], options)).toEqual([result])
  })

  it('没有实际选择器证据时不猜测前缀，也不接受跨资产冲突', () => {
    const css = `${reverseRegistration}\n.probe { content: '::-webkit-backdrop'; }`
    const result = finalizeWebCssPropertyFallbacks([css], true)[0]!
    expect(result).not.toMatch(/::-webkit-backdrop\s*\{/)
    const prefixed = `${reverseRegistration}\n::-webkit-backdrop { color: red; }`
    const conflict = reverseRegistration.replace('initial-value: 0', 'initial-value: 2')
    expect(finalizeWebCssPropertyFallbacks([prefixed, conflict], true)).toEqual([prefixed, conflict])
  })

  it.each(['0px', '0rem', '0', '+0.0REM', '-0em', '0e3rem'])('框架零长度 %s 仍可提供规范零值，原 descriptor 保留', (value) => {
    const css = `${ringRegistration(value)}\n.ring { box-shadow: 0 0 0 calc(2px + var(--tw-ring-offset-width)); }`
    const result = finalizeWebCssPropertyFallbacks([css], true)[0]!
    expect(result).toContain('--tw-ring-offset-width: 0px')
    expect(result).toContain(css)
    expect(finalizeWebCssPropertyFallbacks([result], true)).toEqual([result])
  })

  it('已有首部等价零长度默认块保持原字节与位置', () => {
    const css = `*, ::before, ::after, ::backdrop { --tw-ring-offset-width: 0rem; }\n${ringRegistration('0')}`
    expect(finalizeWebCssPropertyFallbacks([css], true)).toEqual([css])
  })

  it.each(['1rem', '1e-999rem', '0%', '0s', '0rpx', 'calc(0rem)', 'var(--zero)'])('未知或不等价初值 %s 不获得默认值资格', (value) => {
    const css = ringRegistration(value)
    expect(finalizeWebCssPropertyFallbacks([css], true)).toEqual([css])
  })

  it('零长度等价不能越过语法、继承、位置或其它资产冲突', () => {
    for (const other of [
      ringRegistration('0rem').replace("'<length>'", "'*'"),
      ringRegistration('0rem').replace('inherits: false', 'inherits: true'),
      `@media all { ${ringRegistration('0rem')} }`,
      ringRegistration('1rem'),
    ]) {
      const sources = [ringRegistration('0rem'), other]
      expect(finalizeWebCssPropertyFallbacks(sources, true)).toEqual(sources)
    }
    const untyped = reverseRegistration.replace('initial-value: 0', 'initial-value: 0px')
    expect(finalizeWebCssPropertyFallbacks([untyped], true)).toEqual([untyped])
  })

  it('未知注册与 utility 共用祖先时仍转换普通兄弟样式', () => {
    const scope = '@layer utilities { @property --author { syntax: "*"; inherits: true; } :where(.reverse) { --tw-space-y-reverse: 1; } .parent { & .child { color: red; } } }'
    const result = transformWebCssCompat(`${reverseRegistration}\n${scope}`, true)
    const root = postcss.parse(result)
    const reverse: postcss.Rule[] = []
    root.walkRules(':where(.reverse)', rule => { reverse.push(rule) })
    expect(reverse[0]!.parent?.type).toBe('root')
    expect(result).toContain('.parent .child')
    expect(result).toContain('@layer utilities')
    expect(result.indexOf('--tw-space-y-reverse: 0')).toBeLessThan(result.indexOf('--tw-space-y-reverse: 1'))
    expect(result).not.toContain('registration scope')
  })

  it.each(['', '.scope { '])('注册内部的嵌套语句不会被剥离或提升：%s', (prefix) => {
    const nested = '@property --inner { syntax: "*"; inherits: false; initial-value: 0; }'
    const outer = `@property --tw-space-y-reverse { syntax: "*"; inherits: false; initial-value: 2; ${nested} }`
    const source = `@charset "UTF-8"; @import "author.css"; ${prefix}${outer}${prefix ? ' }' : ''}`
    const result = transformWebCssCompat(source, true)
    const root = postcss.parse(result)
    const registrations: postcss.AtRule[] = []
    root.walkAtRules('property', rule => { registrations.push(rule) })
    expect(registrations).toHaveLength(2)
    expect(registrations[1]!.parent).toBe(registrations[0])
    expect(registrations[0]!.parent?.type).toBe(prefix ? 'rule' : 'root')
    expect(result).toContain(outer)
    expect(result).not.toContain('*, ::before')
    expect(result.startsWith('@charset "UTF-8"; @import "author.css";')).toBe(true)
  })
})
