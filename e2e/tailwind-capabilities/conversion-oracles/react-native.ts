import type { ConversionStatement, ReviewedConversionOracle } from '../conversion-audit'
import type { RuleContext } from '../css'
import { cssDeclarations } from '../css'
import { reviewedNativeDeclaration } from './react-native/properties'
import { reviewedNativeCandidate, reviewedNativeConditions, reviewedNativeSelector, reviewedNativeSelectorOwnership } from './react-native/syntax'
import { reviewedNativeLiteral, reviewedNativeVariables } from './react-native/values'

interface NativeOracleGap {
  code: 'empty-reference' | 'selector' | 'condition' | 'declaration' | 'dependency'
  property?: string
  value?: string
  reason: string
}

export interface ReviewedReactNativeOracleAttempt {
  target: 'react-native'
  candidate: string
  oracle?: ReviewedConversionOracle
  gaps: NativeOracleGap[]
}

/** 原生 platform 是适配器语法，官方参考先独立编译其基础 utility。 */
export function reactNativeReferenceCandidates(candidates: readonly string[]) {
  return [...new Set(candidates.flatMap((candidate) => {
    const { base, variants } = reviewedNativeCandidate(candidate)
    return variants.some(variant => ['ios', 'android', 'native'].includes(variant)) ? [candidate, base] : [candidate]
  }))]
}

/** 在目标执行前固定完整 CSS→RN 合同；任何未知声明或条件都令整个候选保留缺口。 */
export function reviewedReactNativeOracle(candidate: string, reference: readonly RuleContext[], variables: ReadonlyMap<string, string> = new Map(), referenceCandidate = candidate): ReviewedReactNativeOracleAttempt {
  const gaps: NativeOracleGap[] = []
  if (!reference.length) {
    return { target: 'react-native', candidate, gaps: [{ code: 'empty-reference', reason: '官方参考没有完整候选声明。' }] }
  }
  const { variants } = reviewedNativeCandidate(candidate)
  const unsupported = variants.find(variant => !['dark', 'ios', 'android', 'native'].includes(variant))
  if (unsupported) {
    if (!reference.every(context => reviewedNativeSelectorOwnership(context.selector, referenceCandidate))) {
      return { target: 'react-native', candidate, gaps: [{ code: 'selector', reason: '负向参考不属于准确候选。' }] }
    }
    return {
      target: 'react-native',
      candidate,
      gaps,
      oracle: {
        id: `react-native-literal-mapping-v1/${candidate}`,
        target: 'react-native',
        candidate,
        support: 'unsupported',
        reason: '当前原生编码合同只接收 dark、ios、android、native 条件，浏览器状态和结构变体必须明确拒绝。',
        expected: { statements: [], diagnostics: [`variant:不支持将 ${unsupported}: 变体编译为 React Native 条件样式`] },
      },
    }
  }
  const groups = new Map<string, { conditions: string[], normal: Record<string, unknown>, important: Record<string, unknown> }>()
  const diagnostics = new Set<string>()
  const seen = new Set<string>()
  for (const context of reference) {
    const { property, value = '', important = false } = context.declaration
    const identity = JSON.stringify([context.selector, context.atRules, property])
    if (seen.has(identity)) {
      gaps.push({ code: 'declaration', property, value, reason: '重复声明无法通过当前参考上下文完整恢复规则边界。' })
    }
    seen.add(identity)
    if (!reviewedNativeSelector(context.selector, referenceCandidate)) {
      gaps.push({ code: 'selector', reason: `尚未审查完整选择器：${context.selector}` })
    }
    const conditions = reviewedNativeConditions(context, variants)
    if (!conditions) {
      gaps.push({ code: 'condition', reason: `条件无法完整表示为原生条件：${context.atRules.join(' > ')}` })
    }
    const literal = reviewedNativeLiteral(value, variables)
    const mapping = literal === undefined ? undefined : reviewedNativeDeclaration(property, literal)
    if (!mapping) {
      gaps.push({ code: property.startsWith('--') || literal === undefined ? 'dependency' : 'declaration', property, value, reason: '没有完整独立的 RN 字面量映射；禁止只接受部分属性。' })
      continue
    }
    if ('rejectedProperty' in mapping) {
      diagnostics.add(`${mapping.rejectedProperty}:不支持将 ${property}: ${value} 编译为 React Native style`)
      continue
    }
    const key = JSON.stringify([context.selector, context.atRules])
    const group = groups.get(key) ?? { conditions: conditions ?? [], normal: {}, important: {} }
    for (const [name, mapped] of mapping.entries) {
      group[important ? 'important' : 'normal'][name] = mapped
    }
    groups.set(key, group)
  }
  const statements: ConversionStatement[] = [...groups.values()].flatMap(group => [false, true].flatMap(important => Object.entries(group[important ? 'important' : 'normal']).map(([property, value]) => ({ selector: candidate, conditions: group.conditions, property, value, important }))))
  const rejected = diagnostics.size > 0
  if (!statements.length && !rejected && !gaps.length) {
    gaps.push({ code: 'declaration', reason: '空正向规则不能证明转换支持。' })
  }
  return {
    target: 'react-native',
    candidate,
    gaps,
    ...(!gaps.length
      ? {
          oracle: {
            id: `react-native-literal-mapping-v1/${candidate}`,
            target: 'react-native' as const,
            candidate,
            support: rejected ? 'unsupported' as const : 'supported' as const,
            ...(rejected ? { reason: '本合同预先声明当前 RN 编码器明确拒绝的 CSS 值或属性；限制不代表宿主永久不支持该效果。' } : {}),
            expected: { statements, diagnostics: [...diagnostics] },
          },
        }
      : {}),
  }
}

export function reviewedReactNativeOracles(candidates: readonly string[], officialReferenceCss: string): ReviewedReactNativeOracleAttempt[] {
  const { contextsByClass } = cssDeclarations(officialReferenceCss)
  const variables = reviewedNativeVariables(officialReferenceCss)
  return candidates.map((candidate) => {
    const { base, variants } = reviewedNativeCandidate(candidate)
    const referenceCandidate = !contextsByClass.has(candidate) && variants.some(variant => ['ios', 'android', 'native'].includes(variant)) ? base : candidate
    return reviewedReactNativeOracle(candidate, contextsByClass.get(referenceCandidate) ?? [], variables, referenceCandidate)
  })
}

/** 计数只描述独立合同覆盖，不读取本轮编码状态，也不宣称运行时或像素通过。 */
export function reviewedReactNativeOracleCoverage(attempts: readonly ReviewedReactNativeOracleAttempt[]) {
  const unique = [...new Map(attempts.map(attempt => [attempt.candidate, attempt])).values()]
  const reasons = new Map<string, Set<string>>()
  for (const attempt of unique.filter(attempt => !attempt.oracle)) {
    for (const gap of attempt.gaps) {
      const key = gap.property ? `${gap.code}/${gap.property}` : gap.code
      const candidates = reasons.get(key) ?? new Set<string>()
      candidates.add(attempt.candidate)
      reasons.set(key, candidates)
    }
  }
  return {
    target: 'react-native' as const,
    contract: 'react-native-literal-mapping-v1',
    candidates: unique.length,
    reviewed: unique.filter(attempt => attempt.oracle).length,
    supported: unique.filter(attempt => attempt.oracle?.support === 'supported').length,
    rejected: unique.filter(attempt => attempt.oracle?.support === 'unsupported').length,
    unresolved: unique.filter(attempt => !attempt.oracle).length,
    gaps: [...reasons].sort(([left], [right]) => left.localeCompare(right)).map(([reason, candidates]) => ({ reason, candidates: candidates.size })),
  }
}
