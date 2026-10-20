import type { CaseContract, SemanticAssertion } from '../types'
import type { ContextStep, ContextValues, ContextWebProbe } from './fixtures'

export function contextWebContract(probe: ContextWebProbe): CaseContract {
  if (!probe.steps.length || new Set(probe.steps.map(step => step.name)).size !== probe.steps.length || probe.steps.some(step => !Object.keys(step.expected).length)) {
    throw new Error(`${probe.id} 缺少独立、完整且唯一的上下文状态预期`)
  }
  const values = probe.steps.flatMap(step => Object.entries(step.expected).map(([key, value]) => [`${step.name}/${key}`, value] as const))
  return {
    id: `runtime/${probe.id}`,
    candidate: probe.candidate,
    features: probe.features,
    fixture: JSON.stringify({ html: probe.html, steps: probe.steps }),
    expectation: { support: 'supported', stage: 'runtime' },
    requiredAssertions: ['generated', ...values.map(([name]) => name)],
    expectedValues: { generated: true, ...Object.fromEntries(values) },
    assertionStages: { generated: 'generation' },
  }
}

/** 环境、原生生命周期与样式必须共同满足预先登记的合同。 */
export function contextWebAssertions(step: ContextStep, observed: ContextValues): SemanticAssertion[] {
  return Object.entries(step.expected).map(([key, value]) => ({ name: `${step.name}/${key}`, stage: 'runtime', actual: observed[key] ?? null, expected: value }))
}
