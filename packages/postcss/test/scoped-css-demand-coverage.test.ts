import postcss from 'postcss'
import { afterEach, expect, it, vi } from 'vitest'
import { removeCssCoveredByRootStyleSources } from '../src/compat/scoped-css/cleanup'
import { collectRootScopedComparableCssCoverage, isRuleCoveredByRootCss } from '../src/compat/scoped-css/coverage'
import { removeCssRulesCoveredBySources } from '../src/compat/scoped-css/covered-rules'

afterEach(() => vi.restoreAllMocks())

it('整条规则比较不预建声明索引，首次部分覆盖需求才补齐且只补齐一次', () => {
  const sources = ['@media print{.a{content:"A B";color:red}}']
  const parse = vi.spyOn(postcss, 'parse')
  const coverage = collectRootScopedComparableCssCoverage(sources, { exactOnly: true })
  expect(parse).toHaveBeenCalledTimes(1)
  expect(removeCssRulesCoveredBySources('@media print{.a{content:"A B";color:red}}', sources, { exactOnly: true }, coverage)).toBe('@media print{}')
  expect(parse).toHaveBeenCalledTimes(2)
  expect(coverage.rules.size).toBe(1)
  expect(parse).toHaveBeenCalledTimes(3)
  expect(coverage.declarationsBySelector.size).toBe(1)
  expect(coverage.orderedDeclarationsBySelector.size).toBe(1)
  expect(coverage.propertiesBySelector.size).toBe(1)
  expect(coverage.atRules.size).toBe(1)
  expect(parse).toHaveBeenCalledTimes(3)
})

it('非 scoped 清理只读取整条规则索引，无规则的 exact 输入也不创建部分索引', () => {
  const sources = ['.a{color:red}']
  const parse = vi.spyOn(postcss, 'parse')
  const coverage = collectRootScopedComparableCssCoverage(sources, { exactOnly: true })
  expect(removeCssCoveredByRootStyleSources('.a{color:red}.b{color:blue}', sources, coverage)).toBe('.b{color:blue}')
  expect(parse).toHaveBeenCalledTimes(2)
  const empty = ['@property --x{syntax:"*";inherits:false}']
  const property = collectRootScopedComparableCssCoverage(empty, { exactOnly: true })
  expect(parse).toHaveBeenCalledTimes(3)
  expect(removeCssRulesCoveredBySources('.a{color:red}', empty, { exactOnly: true }, property)).toBe('.a{color:red}')
  expect(parse).toHaveBeenCalledTimes(3)
})

it('延后索引使用采集时的源码快照，外部数组变化不能改变覆盖证明', () => {
  const sources = ['.a{display:block;color:red}']
  const complete = collectRootScopedComparableCssCoverage(sources)
  const demand = collectRootScopedComparableCssCoverage(sources, { exactOnly: true })
  sources[0] = '.a{color:blue}'
  sources.push('.b{color:blue}')
  expect(demand.rules).toEqual(complete.rules)
  expect(demand.atRules).toEqual(complete.atRules)
  expect(demand.declarationsBySelector).toEqual(complete.declarationsBySelector)
  expect(demand.orderedDeclarationsBySelector).toEqual(complete.orderedDeclarationsBySelector)
  expect(demand.propertiesBySelector).toEqual(complete.propertiesBySelector)
  expect(demand.normalizedRuleCss).toEqual(complete.normalizedRuleCss)
  expect(isRuleCoveredByRootCss(postcss.parse('.a{color:red}').first as postcss.Rule, demand)).toBe(true)
  expect(isRuleCoveredByRootCss(postcss.parse('.a{color:blue}').first as postcss.Rule, demand)).toBe(false)
})

it.each([
  ['.a{display:block;color:red}', '.a{color:red}', true],
  ['.a{color:red;color:blue}', '.a{color:red}', false],
  ['.a{color:red!important}', '.a{color:red}', false],
  ['@media print{.a{color:red}}', '.a{color:red}', false],
  ['.a{content:"A B"}', String.raw`.a{content:'\41 \20 B'}`, true],
  ['.a{content:"A B"}', '.a{content:"AB"}', false],
] as const)('先比较整条规则再请求部分证明仍保留顺序、条件和字符串语义：%s', (source, target, covered) => {
  const sources = [source]
  const coverage = collectRootScopedComparableCssCoverage(sources, { exactOnly: true })
  const rule = postcss.parse(target).first as postcss.Rule
  expect(isRuleCoveredByRootCss(rule, coverage)).toBe(covered)
  expect(removeCssRulesCoveredBySources(target, sources, {}, coverage)).toBe(covered ? '' : target)
})

it('完整索引默认只解析一轮，复制延后索引后仍支持原有覆盖 API', () => {
  const sources = ['.a{display:block;color:red}']
  const parse = vi.spyOn(postcss, 'parse')
  const complete = collectRootScopedComparableCssCoverage(sources)
  expect(parse).toHaveBeenCalledTimes(1)
  expect(complete.rules.size).toBe(1)
  expect(complete.atRules.size).toBe(0)
  expect(parse).toHaveBeenCalledTimes(1)
  const demand = collectRootScopedComparableCssCoverage(sources, { exactOnly: true })
  const copied = { ...demand }
  expect(parse).toHaveBeenCalledTimes(3)
  expect(removeCssRulesCoveredBySources('.a{color:red}', sources, {}, copied)).toBe('')
})
