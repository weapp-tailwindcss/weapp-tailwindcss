import type { ExpectedDeclaration } from '../../examples/react-lynx/src/compatibility/types'
import type { RuleEvidence } from './static-evidence'
import { isDeepStrictEqual } from 'node:util'
import { overflowContract as contract } from '../../examples/react-lynx/src/compatibility/overflow-contract'
import { walkClasses, walkIds } from '../../packages/postcss/src/compat/native/selectors'
import { matchEncodedDeclaration } from './encoded-declarations'

function declarations(values: Record<string, string>): ExpectedDeclaration[] {
  return Object.entries(values).map(([property, value]) => ({ property, value }))
}

/** 固定夹具不能自身裁剪或被通用 min-width 污染；所有声明来自本轮 CSS 及真实 decoder。 */
export function assertOverflowRules(rules: RuleEvidence[], stage: 'generation' | 'encoding') {
  const required: Array<{ selector: string, values: Record<string, string> }> = [
    { selector: '.overflow-hidden', values: { overflow: 'hidden' } },
    { selector: contract.selectors.canvas, values: { 'position': 'relative', 'box-sizing': 'border-box', 'flex-shrink': '0', 'width': '160px', 'height': '160px', 'padding': '0', 'overflow': 'visible', 'background-color': contract.colors.canvas } },
    { selector: contract.selectors.parent, values: { 'position': 'absolute', 'box-sizing': 'border-box', 'left': '12px', 'top': '12px', 'width': '96px', 'height': '64px', 'min-width': '0', 'min-height': '0', 'padding': '0', 'background-color': contract.colors.parent } },
    { selector: contract.selectors.control, values: { overflow: 'visible' } },
    { selector: contract.selectors.child, values: { 'position': 'absolute', 'box-sizing': 'border-box', 'left': '72px', 'top': '40px', 'width': '48px', 'height': '40px', 'min-width': '0', 'min-height': '0', 'padding': '0', 'background-color': contract.colors.child } },
  ]
  for (const expected of required) {
    const matches = rules.filter(rule => walkClasses(rule.selector).includes(expected.selector.slice(1)))
    if (!matches.length || matches.some((rule) => {
      const matched = declarations(expected.values).flatMap(value => matchEncodedDeclaration(rule.declarations, value) ?? [])
      return rule.selector !== expected.selector || rule.mediaConditions?.length || rule.supportsConditions?.length
        || !isDeepStrictEqual(rule.declarations, matches[0]!.declarations)
        || declarations(expected.values).some(value => !matchEncodedDeclaration(rule.declarations, value))
        || rule.declarations.some(value => value.important || !matched.includes(value))
    })) {
      throw new Error(`overflow ${stage} 缺少完整且无条件的独立裁剪夹具：${expected.selector}`)
    }
  }
  const fixtureIds = new Set(['probe', 'control'].flatMap(frame => [`${frame}-${contract.id}`, `${frame}-container-${contract.id}`, `probe-child-${frame === 'control' ? 'control-' : ''}${contract.id}-a`]))
  for (const rule of rules) {
    if (walkIds(rule.selector).some(id => fixtureIds.has(id)) || walkClasses(rule.selector).includes(`probe-fixture-${contract.id}`)) {
      throw new Error(`overflow ${stage} 禁止独立夹具之外的 ID 或外层覆盖：${rule.selector}`)
    }
  }
}
