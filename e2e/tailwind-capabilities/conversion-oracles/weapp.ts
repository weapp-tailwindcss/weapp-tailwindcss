import type { ReviewedConversionOracle } from '../conversion-audit'
import type { RuleContext } from '../css'
import { cssDeclarations } from '../css'
import { reviewedLiteralValue } from './properties'
import { reviewedClassSelector, reviewedConditions } from './syntax'

export interface WeappOracleGap {
  code: 'empty-reference' | 'selector' | 'condition' | 'declaration'
  selector?: string
  property?: string
  value?: string
  reason: string
}

export interface ReviewedWeappOracleAttempt {
  target: 'weapp'
  candidate: string
  oracle?: ReviewedConversionOracle
  gaps: WeappOracleGap[]
}

/**
 * 预期仅来自官方参考 CSS 和预先审查的保留规则，不接收本轮目标转换产物。
 * 任意一条声明、选择器或条件未知时，整个候选保留缺口，不部分判通过。
 */
export function reviewedWeappOracle(candidate: string, reference: readonly RuleContext[]): ReviewedWeappOracleAttempt {
  const gaps: WeappOracleGap[] = []
  if (!reference.length) {
    gaps.push({ code: 'empty-reference', reason: '官方参考没有候选声明；不能使用空正向 oracle。' })
  }
  const statements = reference.map((context) => {
    const selector = reviewedClassSelector(context.selector, candidate)
    const { property, value = '', important = false } = context.declaration
    if (!selector) {
      gaps.push({ code: 'selector', selector: context.selector, reason: '选择器不属于已审查的完整单类编码合同。' })
    }
    if (!reviewedConditions(context.atRules)) {
      gaps.push({ code: 'condition', selector: context.selector, reason: `条件尚未审查：${context.atRules.join(' > ')}` })
    }
    if (!reviewedLiteralValue(property, value)) {
      gaps.push({ code: 'declaration', property, value, reason: '属性和值不属于已审查的字面量保留合同；变量依赖、现代颜色和复杂函数保留缺口。' })
    }
    return { selector: selector ?? context.selector, conditions: [...context.atRules], property, value, important }
  })
  return {
    target: 'weapp',
    candidate,
    gaps,
    ...(!gaps.length
      ? { oracle: { id: `weapp-literal-preservation-v1/${candidate}`, target: 'weapp' as const, candidate, support: 'supported' as const, expected: { statements, diagnostics: [] } } }
      : {}),
  }
}

/** 从同一独立官方参考批次构造候选合同；调用方仍须在转换前登记合同。 */
export function reviewedWeappOracles(candidates: readonly string[], officialReferenceCss: string): ReviewedWeappOracleAttempt[] {
  const { contextsByClass } = cssDeclarations(officialReferenceCss)
  return candidates.map(candidate => reviewedWeappOracle(candidate, contextsByClass.get(candidate) ?? []))
}

/** 覆盖数只表示已有独立编码合同，不表示执行通过或设备支持。 */
export function reviewedWeappOracleCoverage(attempts: readonly ReviewedWeappOracleAttempt[]) {
  const candidates = new Map(attempts.map(attempt => [attempt.candidate, attempt]))
  const covered = [...candidates.values()].filter(attempt => attempt.oracle)
  const unresolved = [...candidates.values()].filter(attempt => !attempt.oracle)
  const byReason = new Map<string, Set<string>>()
  for (const attempt of unresolved) {
    for (const gap of attempt.gaps) {
      const key = gap.code === 'declaration' ? `declaration/${gap.property}` : gap.code
      const values = byReason.get(key) ?? new Set<string>()
      values.add(attempt.candidate)
      byReason.set(key, values)
    }
  }
  return {
    target: 'weapp' as const,
    contract: 'weapp-literal-preservation-v1',
    candidates: candidates.size,
    reviewed: covered.length,
    unresolved: unresolved.length,
    gaps: [...byReason].sort(([left], [right]) => left.localeCompare(right)).map(([reason, values]) => ({ reason, candidates: values.size })),
  }
}
