import { describe, expect, it } from 'vitest'
import { postcss } from '../src/postcss-runtime'
import { filterExistingCssRules, mergeCoveredCssRuleDeclarations } from '../src/vite-css-rules'
import { removeEmptyAtRules } from '../src/vite-css-rules/coverage'

describe('去重后的空 at-rule 祖先清理', () => {
  const nested = '@layer base{@supports (display:grid){@media (width > 0px){.card{display:grid}}}}'

  it('规则过滤一次就清理全部空祖先', () => {
    expect(filterExistingCssRules(nested, nested)).toBe('')
  })

  it('声明合并一次就清理全部空祖先', () => {
    const result = mergeCoveredCssRuleDeclarations(nested, nested)
    expect(result).toEqual({ baseCss: nested, css: '', changed: true })
  })

  it('保留 layer 顺序声明、有内容的分支和声明型 at-rule', () => {
    const root = postcss.parse('@layer base,utilities;@layer base{@supports (display:grid){/* empty */}@media print{.keep{color:red}}}@font-face{font-family:demo;src:url(demo.woff2)}')
    removeEmptyAtRules(root)
    const expected = '@layer base,utilities;@layer base{@media print{.keep{color:red}}}@font-face{font-family:demo;src:url(demo.woff2)}'
    expect(root.toString()).toBe(expected)
    removeEmptyAtRules(root)
    expect(root.toString()).toBe(expected)
  })
})
