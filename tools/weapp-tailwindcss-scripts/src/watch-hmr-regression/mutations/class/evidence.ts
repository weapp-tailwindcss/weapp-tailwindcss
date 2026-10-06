import type { CssRuleRemovalExpectation } from '../../types'
import type { OutputTokenGroup } from './class-value'
import { createCssClassSignatureReader } from '../../../../../../packages/postcss/src/selectorParser/class-signatures'
import { assertCssConditionsRemoved } from '../../../../../../packages/postcss/src/selectorParser/rule-removal-evidence'
import { collectOutputTokenGroups, isSafeClass } from './output-tokens'

type OutputTarget = 'wxml' | 'js'

export interface ClassOutputSnapshot {
  wxml: string
  js: string
  globalStyle: string
}

export interface ClassOutputEvidence {
  utility: string
  escapedClass: string
  actualClass: string
  target: OutputTarget
  ruleSignatures: string[]
  cssExpectation?: 'removed'
  /** 同一消费位置的实际别名集合，仅验证最终回滚，不推断其所属 utility。 */
  consumerAliases?: string[]
}

function collectOutputTokens(output: string, target: OutputTarget) {
  return new Set(collectOutputTokenGroups(output, target).flatMap(group => [...group.tokens]))
}

/** 检查模板 class 或 JS 字符串候选的完整 token，以及 safe class 与 utility 的完整规则。 */
export function assertClassTokensInOutput(
  outputs: ClassOutputSnapshot,
  classTokens: string[],
  escapedClasses: string[],
  targets: OutputTarget[],
  label: string,
  requireAll = true,
  requireCss = true,
  expectedRemovedCssUtilities: readonly CssRuleRemovalExpectation[] = [],
): ClassOutputEvidence[] {
  return assertClassTokensInConsumers(outputs, classTokens, escapedClasses, targets.map(target => ({
    target,
    groups: collectOutputTokenGroups(outputs[target], target, outputs.wxml),
  })), label, requireAll, requireCss, expectedRemovedCssUtilities)
}

/** 消费者已解析时复用原始分支与有向 scope，禁止投影成字符串后重新猜测上下文。 */
export function assertClassTokensInConsumers(
  outputs: ClassOutputSnapshot,
  classTokens: string[],
  escapedClasses: string[],
  consumers: Array<{ target: OutputTarget, groups: OutputTokenGroup[] }>,
  label: string,
  requireAll = true,
  requireCss = true,
  expectedRemovedCssUtilities: readonly CssRuleRemovalExpectation[] = [],
): ClassOutputEvidence[] {
  if (consumers.length === 0) {
    return []
  }
  assertCssConditionsRemoved(outputs.globalStyle, expectedRemovedCssUtilities
    .filter(item => classTokens.includes(item.utility))
    .map(item => item.condition))
  const readSignatures = createCssClassSignatureReader(outputs.globalStyle)
  const evidence: ClassOutputEvidence[] = []
  for (const { target, groups } of consumers) {
    const tokens = new Set(groups.flatMap(group => [...group.tokens]))
    const safeClasses = [...tokens].filter(isSafeClass)
    let matched = 0
    for (const [index, utility] of classTokens.entries()) {
      const escapedClass = escapedClasses[index] ?? utility
      const escapedReference = readSignatures(escapedClass)
      const reference = escapedReference.length > 0 ? escapedReference : readSignatures(utility)
      const original = [escapedClass, utility].find(token => tokens.has(token))
      if (expectedRemovedCssUtilities.some(item => item.utility === utility)) {
        if (!original) {
          throw new Error(`${label} ${target}: missing original class token for removed CSS utility ${utility}; a safe alias alone cannot prove its identity`)
        }
        if (reference.length > 0) {
          throw new Error(`${label} ${target}: expected platform to remove CSS rules for ${utility}`)
        }
        matched += 1
        const consumerAliases = [...new Set(groups.filter(group => group.tokens.has(original))
          .flatMap(group => [...group.tokens].filter(token => safeClasses.includes(token))))]
        evidence.push({ utility, escapedClass, actualClass: original, target, ruleSignatures: [], cssExpectation: 'removed', consumerAliases })
        continue
      }
      const actualClasses = safeClasses.filter((safeClass) => {
        return groups.filter(group => group.tokens.has(safeClass)).some((group) => {
          const scopes = group.scopesByToken.get(safeClass) ?? new Set<string>()
          const actual = readSignatures(safeClass, scopes)
          return reference.length > 0 && JSON.stringify(actual) === JSON.stringify(reference)
        })
      })
      if (original && (!requireCss || reference.length > 0)) {
        actualClasses.unshift(original)
      }
      if (actualClasses.length === 0) {
        if (requireAll) {
          throw new Error(`${label} ${target}: missing class/CSS evidence for ${utility} (${escapedClass}); consumed safe classes=${safeClasses.join(', ') || 'none'}`)
        }
        continue
      }
      matched += 1
      evidence.push(...actualClasses.map(actualClass => ({ utility, escapedClass, actualClass, target, ruleSignatures: reference })))
    }
    if (!requireAll && matched === 0) {
      throw new Error(`${label} ${target}: expected at least one class/CSS evidence for ${classTokens.join(', ')}`)
    }
  }
  return evidence
}

/** 回滚使用上一阶段已确认的实际类名；不能依赖回滚后可能已删除的 CSS 反推。 */
export function assertPreviousClassEvidenceRemoved(
  outputs: ClassOutputSnapshot,
  previous: ClassOutputEvidence[],
  retainedUtilities: string[],
  label: string,
  baseline?: ClassOutputSnapshot,
) {
  for (const entry of previous) {
    if (retainedUtilities.includes(entry.utility)) {
      continue
    }
    const tokens = collectOutputTokens(outputs[entry.target], entry.target)
    const baselineTokens = baseline ? collectOutputTokens(baseline[entry.target], entry.target) : new Set<string>()
    // 替换阶段保留的 utility 可能仍消费这些别名；最终回滚才检查整组新增消费 token。
    const consumerAliases = retainedUtilities.length === 0 ? entry.consumerAliases ?? [] : []
    for (const token of new Set([entry.actualClass, entry.escapedClass, entry.utility, ...consumerAliases])) {
      if (tokens.has(token) && !baselineTokens.has(token)) {
        throw new Error(`${label} ${entry.target}: stale class ${token} for ${entry.utility}`)
      }
    }
  }
}
