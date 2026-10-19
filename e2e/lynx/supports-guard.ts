import type { RuleEvidence } from './static-evidence'
import { walkClasses } from '../../packages/postcss/src/compat/native/selectors'

const contracts = [
  { className: 'supports-[display:grid]:grid', condition: '(display:grid)' },
  { className: 'supports-[display:weapp-invalid]:grid', condition: '(display:weapp-invalid)' },
] as const

/** 真/假对照均必须保留准确的唯一条件，任何无条件或错误条件的替代分支都会失效。 */
export function supportsGuardsMatch(rules: RuleEvidence[]) {
  return contracts.every(({ className, condition }) => {
    const matched = rules.filter(rule => walkClasses(rule.selector).includes(className))
    return matched.length > 0 && matched.every(rule => (
      rule.supportsConditions?.length === 1
      && rule.supportsConditions[0] === condition
      && !rule.mediaConditions?.length
      && rule.declarations.some(declaration => declaration.property === 'display' && declaration.value === 'grid')
    ))
  })
}

/** 从生成 CSS 与实际 decoder CSS 提取规则后共同验证，serializer 输入不能作为替代。 */
export function assertSupportsGuards(generated: RuleEvidence[], bundled: RuleEvidence[]) {
  if (!supportsGuardsMatch(generated) || !supportsGuardsMatch(bundled)) {
    throw new Error('variant-supports 真/假条件的必要 @supports guard 缺失或被篡改')
  }
}
