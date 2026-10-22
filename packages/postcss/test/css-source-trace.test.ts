import { describe, expect, it } from 'vitest'
import { annotateCssTokenSources, collectCssTokenSourcePaths, collectCssTokenSourceTraceEdits } from '../src/utils/css-source-trace'

describe('CSS 源码追踪注释', () => {
  it('嵌套、转义候选及重复选择器保留来源，重复执行结果稳定', () => {
    const sources = new Map([
      ['hover:w-1/2', { token: 'hover:w-1/2', sources: ['components/card.vue'] }],
    ])
    const input = '@media (width > 1px) { .hover\\:w-1\\/2, .hover\\:w-1\\/2:hover { width: 50%; } }'
    const result = annotateCssTokenSources(input, sources)
    expect(result).toContain('/*! tokens: hover:w-1/2 <= components/card.vue */')
    expect(result.match(/tokens:/g)).toHaveLength(1)
    expect(annotateCssTokenSources(result, sources)).toBe(result)
    expect(result).toContain('width: 50%')
  })

  it.each(['/* tokens: container <= old.vue */', '/*! tokens: container <= old.vue */', '/*!tokens:container <= old.vue*/'])('新来源替换旧注释 %s，保留用户注释及非生成 container', (comment) => {
    const sources = new Map([
      ['container', { token: 'container', sources: ['pages/layout.vue'] }],
    ])
    const result = annotateCssTokenSources(`/*! keep */ ${comment} .container { width: 100%; }`, sources)
    expect(result).toContain('/*! keep */')
    expect(result).toContain('tokens: container <= pages/layout.vue')
    expect(result).toContain('.container')
    expect(result).not.toContain('old.vue')
  })

  it('只移除明确标记为生成的单选择器 container', () => {
    const sources = new Map([['container', { token: 'container', sources: [] }]])
    const result = annotateCssTokenSources('.container { width: 100%; } .container, .user { width: 50%; }', sources)
    expect(result).not.toContain('width: 100%')
    expect(result).toContain('.container, .user')
  })

  it('空映射和非法 CSS 原样返回', () => {
    expect(annotateCssTokenSources(' .a{} ', new Map())).toBe(' .a{} ')
    const invalid = '.a { color: red;'
    expect(annotateCssTokenSources(invalid, new Map([['a', { token: 'a', sources: [] }]]))).toBe(invalid)
    expect(collectCssTokenSourceTraceEdits(invalid, new Map([['a', { token: 'a', sources: [] }]]))).toEqual([])
  })

  it('逐条读取同一行的历史及压缩追踪，保留多个 token 和来源，忽略用户注释与字符串', () => {
    const css = String.raw`/*! keep <= ignored.vue */ /* tokens: a <= pages/a.vue, C:\repo\a.vue | b <= /repo/b.tsx */.a{content:"/*!tokens:c <= fake.vue*/"}/*!tokens:c <= ../shared/c.vue*/.c{}/*tokens:d <= <tailwind generated>*/.d{}`
    expect([...collectCssTokenSourcePaths(css)]).toEqual(['pages/a.vue', String.raw`C:\repo\a.vue`, '/repo/b.tsx', '../shared/c.vue'])
    expect([...collectCssTokenSourcePaths('.a{color:red')]).toEqual([])
  })
})
