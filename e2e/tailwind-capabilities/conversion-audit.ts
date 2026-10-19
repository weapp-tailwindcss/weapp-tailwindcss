import type { CapabilityResult, CaseContract } from './types'

export const conversionTargets = ['weapp', 'react-native', 'lynx'] as const
export type ConversionTarget = typeof conversionTargets[number]

export interface ConversionStatement {
  selector: string
  conditions: readonly string[]
  property: string
  value: unknown
  important: boolean
}

export interface ConversionSnapshot {
  statements: readonly ConversionStatement[]
  diagnostics: readonly string[]
}

export type ConversionObservation = {
  execution: 'completed'
  snapshot: ConversionSnapshot
  diagnosticsScope: 'candidate' | 'batch'
} | {
  execution: 'failed' | 'not-run'
  reason: string
}

/** 预期必须在执行前独立登记，不能把本轮产物复制为 oracle。 */
export interface ReviewedConversionOracle {
  id: string
  target: ConversionTarget
  candidate: string
  support: 'supported' | 'unsupported'
  reason?: string
  expected: ConversionSnapshot
}

interface ConversionCase {
  id: string
  candidate: string
  features: string[]
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
    return JSON.stringify(value)
  }
  throw new Error('转换语义证据必须是有限 JSON 值')
}

function validateOracle(oracle: ReviewedConversionOracle) {
  if (!oracle.id.trim() || !oracle.candidate.trim()) {
    throw new Error('转换 oracle 必须声明固定身份与候选')
  }
  if (oracle.support === 'supported' && !oracle.expected.statements.length) {
    throw new Error('正向转换 oracle 不能使用空规则证明支持')
  }
  if (oracle.support === 'unsupported' && (!oracle.reason?.trim() || !oracle.expected.diagnostics.length)) {
    throw new Error('负向转换 oracle 必须预先声明限制原因与实际诊断')
  }
  if (oracle.expected.diagnostics.some(diagnostic => !diagnostic.trim())) {
    throw new Error('转换 oracle 诊断不能是空字符串')
  }
  for (const statement of oracle.expected.statements) {
    if (!statement.selector.trim() || !statement.property.trim()) {
      throw new Error('转换 oracle 声明缺少选择器或属性')
    }
  }
  canonical(oracle.expected)
}

export function conversionCaseContract(item: ConversionCase, target: ConversionTarget, oracle?: ReviewedConversionOracle): CaseContract {
  if (oracle) {
    validateOracle(oracle)
    if (oracle.target !== target || oracle.candidate !== item.candidate) {
      throw new Error('转换 oracle 的目标或候选身份不匹配')
    }
  }
  return {
    ...item,
    id: `conversion/${target}/${item.id}`,
    features: [...item.features, `conversion/${target}`],
    fixture: oracle ? JSON.stringify(oracle) : `尚无独立 ${target} 转换 oracle`,
    // 未登记 oracle 时保留待证明的正向预期，结果固定为 not-run，不声明实际支持。
    expectation: { support: oracle?.support ?? 'supported', stage: 'encoding', ...(oracle?.reason ? { reason: oracle.reason } : {}) },
    requiredAssertions: ['conversion-executed', 'semantic-oracle', 'reviewed-oracle'],
    expectedValues: { 'conversion-executed': true, 'semantic-oracle': true, 'reviewed-oracle': oracle ? canonical(oracle) : 'unreviewed' },
  }
}

/** 执行成功和语义通过分别记录；空产物、部分产物及未知支持状态不能冒充通过。 */
export function conversionCaseResult(item: ConversionCase, target: ConversionTarget, observation: ConversionObservation, artifacts: string[], oracle?: ReviewedConversionOracle): CapabilityResult {
  const contract = conversionCaseContract(item, target, oracle)
  const executed = observation.execution === 'completed'
  const base = {
    id: contract.id,
    support: contract.expectation.support,
    assertions: [{ name: 'conversion-executed', stage: 'encoding' as const, actual: executed, expected: true }],
    warnings: [] as string[],
    artifacts,
  }
  if (!executed) {
    return { ...base, status: observation.execution === 'failed' ? 'failed' : 'not-run', reason: observation.reason }
  }
  if (!oracle) {
    return { ...base, status: 'not-run', reason: `${target} 转换已执行；未登记独立语义 oracle，产物存在或为空均不能证明平台支持。` }
  }
  if (oracle.support === 'unsupported' && observation.diagnosticsScope !== 'candidate') {
    return { ...base, status: 'not-run', reason: '仅有批次诊断，不能证明本候选满足已审查的负向转换合同。' }
  }
  const passed = canonical(observation.snapshot) === canonical(oracle.expected)
  return {
    ...base,
    status: passed ? 'passed' : 'failed',
    assertions: [...base.assertions, { name: 'semantic-oracle', stage: 'encoding', actual: passed, expected: true }, { name: 'reviewed-oracle', stage: 'encoding', actual: canonical(oracle), expected: contract.expectedValues['reviewed-oracle']! }],
    ...(passed ? oracle.reason ? { reason: oracle.reason } : {} : { reason: `${target} 转换结果与预先登记的完整语义 oracle 不一致。` }),
  }
}

/** 保留生成结论，另外生成三个目标的独立转换结果，供 CLI 严格汇总。 */
export function staticCandidateResults(item: ConversionCase, generation: CapabilityResult, observations: Record<ConversionTarget, ConversionObservation>, artifacts: string[], oracles: readonly ReviewedConversionOracle[] = []): CapabilityResult[] {
  return [generation, ...conversionTargets.map(target => conversionCaseResult(item, target, observations[target], artifacts, oracles.find(oracle => oracle.target === target && oracle.candidate === item.candidate)))]
}
