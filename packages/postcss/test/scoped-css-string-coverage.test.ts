import { describe, expect, it } from 'vitest'
import { removeCssCoveredByRootStyleSources } from '../src/compat/scoped-css/cleanup'
import { removeCssRulesCoveredBySources } from '../src/compat/scoped-css/covered-rules'

const cleaners = [
  { name: 'root coverage', clean: (css: string, root: string) => removeCssCoveredByRootStyleSources(css, [root]) },
  { name: 'import coverage', clean: (css: string, root: string) => removeCssRulesCoveredBySources(css, [root]) },
  { name: 'exact coverage', clean: (css: string, root: string) => removeCssRulesCoveredBySources(css, [root], { exactOnly: true }) },
]

describe.each(cleaners)('$name 的 CSS 字符串语义边界', ({ clean }) => {
  it.each([
    ['"现在，让我们开始"', String.raw`'\73b0\5728\ff0c\8ba9\6211\4eec\5f00\59cb'`],
    ['"AB"', String.raw`"\41 B"`],
    ['"a b"', String.raw`'a\20 b'`],
    ['"a\\\\b"', "'a\\\\b'"],
    ['"a\\\"b"', "'a\"b'"],
  ])('删除解码后相同的字符串：%s / %s', (rootValue, scopedValue) => {
    const root = `.utility{--tw-content:${rootValue};content:var(--tw-content)}`
    const scoped = `.utility.data-v-a{--tw-content:${scopedValue};content:var(--tw-content)}`
    expect(clean(scoped, root)).toBe('')
  })

  it.each([
    ['"a b"', '"a  b"'],
    ['"A B"', String.raw`"\41 B"`],
    ['".data-v-a"', '".data-v-b"'],
    ['"[data-v-a]"', '"[data-v-b]"'],
    ['"a > b"', '"a>b"'],
    [String.raw`"a\\b"`, String.raw`"a\b"`],
    ['"\\41"', '"\\42"'],
  ])('保留真正不同的字符串：%s / %s', (rootValue, scopedValue) => {
    const root = `.utility{content:${rootValue}}`
    const scoped = `.utility.data-v-a{content:${scopedValue}}`
    expect(clean(scoped, root)).toBe(scoped)
  })

  it.each([
    ['.utility{content:"same"}', '.other.data-v-a{content:"same"}'],
    ['.utility{content:"same"}', '.utility.data-v-a{content:"same"!important}'],
    ['.utility{color:red;color:blue}', '.utility.data-v-a{color:blue;color:red}'],
    ['.utility{color:red}.utility{color:blue}', '.utility.data-v-a{color:blue;color:red}'],
    ['.utility{--tokens:ab}', '.utility.data-v-a{--tokens:a/**/b}'],
    ['@media print{.utility{content:"same"}}', '.utility.data-v-a{content:"same"}'],
    ['@media print{.utility{content:"same"}}', '@media screen{.utility.data-v-a{content:"same"}}'],
    ['.parent{.utility{content:"same"}}', '.utility.data-v-a{content:"same"}'],
  ])('不能跨选择器、优先级或冲突声明顺序删除：%s', (root, scoped) => {
    expect(clean(scoped, root)).toBe(scoped)
  })
})
