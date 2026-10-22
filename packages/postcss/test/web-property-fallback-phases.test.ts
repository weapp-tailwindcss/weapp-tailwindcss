import { describe, expect, it } from 'vitest'
import postcss from 'postcss'
import { transformWebCssCompat } from '../src/compat/web-css'
import { finalizeWebCssPropertyFallbacks } from '../src/compat/web-css-property-fallbacks'

const registration = '@property --tw-space-y-reverse { syntax: "*"; inherits: false; initial-value: 0; }'
const reverse = ':where(.space-y-reverse > :not(:last-child)) { --tw-space-y-reverse: 1; }'
const fragmentOptions = { deferPropertyFallback: true }

describe('注册默认值的片段与完整资产边界', () => {
  it('片段保留注册，完整合并后才在 utility 之前合成默认值', () => {
    const first = transformWebCssCompat(`${registration}\n${reverse}`, true, fragmentOptions)
    const second = transformWebCssCompat(`${registration}\n.probe { color: red; }`, true, fragmentOptions)
    expect(first).not.toContain('*, ::before')
    expect(second).not.toContain('*, ::before')
    expect(first).toContain(registration)
    const complete = transformWebCssCompat(`${first}\n${second}`, true)
    expect(complete.match(/\*, ::before, ::after, ::backdrop/g)).toHaveLength(1)
    expect(complete.indexOf('--tw-space-y-reverse: 0')).toBeLessThan(complete.indexOf(reverse))
    expect(transformWebCssCompat(complete, true)).toBe(complete)
  })

  it('完整资产中的作者同签名 reset 保持原位置', () => {
    const author = '*, ::before, ::after, ::backdrop { --tw-space-y-reverse: 0; }'
    const first = transformWebCssCompat(`${registration}\n${reverse}`, true, fragmentOptions)
    const second = transformWebCssCompat(`.author { color: blue; }\n${author}`, true, fragmentOptions)
    const complete = transformWebCssCompat(`${first}\n${second}`, true)
    expect(complete.lastIndexOf(author)).toBeGreaterThan(complete.indexOf(reverse))
    expect(complete.match(/\*, ::before, ::after, ::backdrop/g)).toHaveLength(2)
  })

  it.each([
    '@property --tw-space-y-reverse { syntax: "*"; inherits: false; initial-value: 2; }',
    `@media (min-width: 1px) { ${registration} }`,
  ])('跨片段的冲突或条件注册否决默认值合成：%s', (other) => {
    const first = transformWebCssCompat(`${registration}\n${reverse}`, true, fragmentOptions)
    const second = transformWebCssCompat(other, true, fragmentOptions)
    const complete = transformWebCssCompat(`${first}\n${second}`, true)
    expect(complete).not.toContain('*, ::before')
    expect(complete).toContain('--tw-space-y-reverse: 1')
    expect(complete).toContain(other)
  })

  it.each(['@layer app', '@theme', '@media all', '@supports (display:block)', '.nested'])('跨阶段不会提升原本嵌套的注册资格：%s', (scope) => {
    const input = `${scope} { ${registration} }`
    const fragment = transformWebCssCompat(input, true, fragmentOptions)
    const result = finalizeWebCssPropertyFallbacks([fragment], true)[0]!
    expect(result).not.toContain('*, ::before')
    expect(result).toContain(scope)
    expect(transformWebCssCompat(result, true)).not.toContain('*, ::before')
  })

  it.each([
    registration.replace('initial-value: 0', 'initial-value: 2'),
    `@media all { ${registration} }`,
  ])('其它资产的冲突或条件注册否决本资产默认值：%s', (other) => {
    const result = finalizeWebCssPropertyFallbacks([registration + reverse, other], true)
    expect(result).toEqual([registration + reverse, other])
  })

  it('保留原始换行、注释与业务布局，并且重复收尾稳定', () => {
    const css = `/* 中文 😀 */\r\n${registration}\r\n${reverse}`
    const result = finalizeWebCssPropertyFallbacks([css], true)
    expect(result[0]).toContain(css.slice(css.indexOf(registration)))
    expect(result[0]!.indexOf('--tw-space-y-reverse: 0')).toBeLessThan(result[0]!.indexOf(reverse))
    expect(finalizeWebCssPropertyFallbacks(result, true)).toEqual(result)
  })

  it('条件作者注册不阻断其它独立 theme、layer 和 nesting 兼容', () => {
    const scope = '@layer unknown { @property --author { syntax: "*"; inherits: true; } }'
    const result = transformWebCssCompat(`${scope}\n@theme { --brand: red; }\n@layer utilities { .parent { & .child { color: red; } } }`, true, fragmentOptions)
    expect(result).toContain(scope)
    expect(result).not.toContain('@theme')
    expect(result).not.toContain('@layer utilities')
    expect(result).toContain('.parent .child')
    expect(result).not.toContain('registration scope')
  })

  it.each(['\uFEFF', '\uFFFE'])('BOM、charset、import 与 CRLF 后按原始字符位置插入：%j', (bom) => {
    const prefix = `${bom}@charset "UTF-8";\r\n@import "shared.css";\r\n/* 中文 😀 */\r\n`
    const result = finalizeWebCssPropertyFallbacks([prefix + registration + reverse], true)[0]!
    expect(result.startsWith(prefix)).toBe(true)
    const root = postcss.parse(result)
    expect(root.nodes.filter(node => node.type !== 'comment').slice(0, 3).map(node => node.type)).toEqual(['atrule', 'atrule', 'rule'])
    expect(result).toContain(registration + reverse)
  })
})
