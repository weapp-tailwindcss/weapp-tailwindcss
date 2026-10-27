import { logger } from '@weapp-tailwindcss/logger'
import { collectRpxThemeVariables, inspectRpxCalcUsage } from '@weapp-tailwindcss/postcss/transform'

const warnedSessions = new WeakSet<object>()
const riskSources = new WeakMap<object, Map<string, readonly string[]>>()

export function hasReportedRpxThemeRisk(owner: object) {
  return warnedSessions.has(owner)
}

export function getRpxThemeRiskVariables(owner: object) {
  return [...new Set([...(riskSources.get(owner)?.values() ?? [])].flat())]
}

export function collectRpxThemeRiskSources(sources: Iterable<string>) {
  const variables = new Set<string>()
  for (const css of new Set(sources)) {
    for (const name of collectRpxThemeVariables(css)) {
      variables.add(name)
    }
  }
  return [...variables]
}

/** 生成阶段只登记主题来源，避免在构建器完成静态计算前误报。 */
export function recordRpxThemeRisk(session: object, source: string, variables: readonly string[]) {
  if (warnedSessions.has(session)) {
    return
  }
  const sources = riskSources.get(session) ?? new Map<string, readonly string[]>()
  if (variables.length > 0) {
    sources.set(source, variables)
  }
  else {
    sources.delete(source)
  }
  riskSources.set(session, sources)
}

export function warnRpxThemeRisk(session: object, variables: readonly string[], finalCss: string) {
  if (warnedSessions.has(session) || variables.length === 0) {
    return
  }
  const usage = inspectRpxCalcUsage(finalCss, new Set(variables))
  // 解析失败不能证明存在风险，也不能提前占用后续 watch 的提示额度。
  if (!usage || (usage.variables.length === 0 && !usage.inlineRpx)) {
    return
  }
  const expressions = [...usage.variables, ...(usage.inlineRpx ? ['内联 rpx'] : [])].join(', ')
  warnedSessions.add(session)
  riskSources.delete(session)
  logger.warn(
    `[tailwindcss@4][rpx-theme] 最终样式仍含 rpx 运行时 calc：${expressions}。微信可能在乘法前换算或量化 rpx 基数，导致尺寸偏差。请检查主题覆盖、cssCalc 配置和最终 WXSS；固定主题优先输出静态 rpx，动态主题需保留运行时语义并在目标设备验证：https://tw.weapp.dev/docs/issues/spacing-rpx`,
  )
}
