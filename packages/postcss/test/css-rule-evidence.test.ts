import { collectCssRuleEvidence, cssSelectorDiagnosticMatches } from '../src/syntax/rule-evidence'

it('命名空间不同的标签不能成为相同编码证据', () => {
  expect(cssSelectorDiagnosticMatches('svg|a', 'html|a')).toBe(false)
  expect(cssSelectorDiagnosticMatches('svg|a', 'a')).toBe(false)
})

it('selector list 保留独立分支、转义身份、属性和条件', () => {
  const records = collectCssRuleEvidence(String.raw`@media (width > 10px) { .br\61nd, [data-label="a,b"] { width: 1px; color: red !important; } }`)
  expect(records).toHaveLength(2)
  expect(records[0]?.identity).toBe(collectCssRuleEvidence('.brand { width: 1px; }')[0]?.identity)
  expect(records[0]?.conditions).toEqual(['@media (width > 10px)'])
  expect(records[1]?.declarations).toContainEqual({ property: 'color', value: 'red', important: true })
  expect(cssSelectorDiagnosticMatches('.card-long', '.card')).toBe(false)
  expect(cssSelectorDiagnosticMatches(String.raw`.br\61nd, .other`, '.brand')).toBe(true)
  expect(cssSelectorDiagnosticMatches('.card, .other', '.card, .future')).toBe(false)
})
