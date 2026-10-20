import type { ExpectedDeclaration } from '../../examples/react-lynx/src/compatibility/types'
import type { RuleEvidence } from './static-evidence'
import { importantPriorityContract as contract } from '../../examples/react-lynx/src/compatibility/important-priority-contract'
import { walkClasses } from '../../packages/postcss/src/compat/native/selectors'
import { matchEncodedDeclaration } from './encoded-declarations'

/** 竞争者、普通 utility 与 important 标志都必须来自本轮生成及实际 bundle，缺失时禁止取证。 */
export function assertImportantPriorityRules(rules: RuleEvidence[], stage: 'generation' | 'encoding') {
  const background = (value: string, important = false): ExpectedDeclaration => ({ property: 'background-color', value, important })
  const required: Array<({ candidate: string } | { selector: string }) & { declarations: ExpectedDeclaration[] }> = [
    { candidate: contract.candidate, declarations: [background(contract.expected, true)] },
    { candidate: contract.normalCandidate, declarations: [background(contract.expected)] },
    { selector: '.probe-important-body', declarations: [{ property: 'width', value: `${contract.target.width}px` }, { property: 'height', value: `${contract.target.height}px` }] },
    { selector: contract.referenceSelector, declarations: [background(contract.expected)] },
    ...contract.competitorSelectors.map(selector => ({ selector, declarations: [background(contract.competitor)] })),
  ]
  for (const expected of required) {
    const retained = rules.some(rule => !rule.mediaConditions?.length
      && ('candidate' in expected ? walkClasses(rule.selector).includes(expected.candidate) : rule.selector === expected.selector)
      && expected.declarations.every((declaration) => {
        const actual = matchEncodedDeclaration(rule.declarations, declaration)?.[0]
        return actual && Boolean(actual.important) === Boolean(declaration.important)
      }))
    if (!retained) {
      throw new Error(`important 优先级 ${stage} 缺少独立夹具声明或优先级：${'candidate' in expected ? expected.candidate : expected.selector}`)
    }
  }
}
