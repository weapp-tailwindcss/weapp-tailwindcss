import type { InternalUserDefinedOptions } from '@/types'
import process from 'node:process'
import { logger } from '@weapp-tailwindcss/logger'
import { collectRpxThemeVariables, inspectRpxCalcUsage } from '@weapp-tailwindcss/postcss/transform'
import { normalizeFrameworkStylePlatform } from '@/framework/platform'

const warnedSessions = new WeakSet<object>()
const riskSources = new WeakMap<object, Map<string, readonly string[]>>()
type WarningOptions = Pick<InternalUserDefinedOptions, 'logLevel' | 'platform' | 'cssOptions' | 'appType'>

export function shouldCheckRpxThemeRisk(
  session: object,
  target: string,
  opts: WarningOptions,
  platform?: string,
) {
  if (target !== 'weapp' || warnedSessions.has(session) || opts.logLevel === 'silent' || opts.logLevel === 'error') {
    return false
  }
  const resolved = normalizeFrameworkStylePlatform(
    platform ?? opts.cssOptions?.platform ?? opts.platform
    ?? process.env['UNI_UTS_PLATFORM'] ?? process.env['UNI_PLATFORM']
    ?? process.env['TARO_ENV'] ?? process.env['MPX_CURRENT_TARGET_MODE'] ?? process.env['MPX_CLI_MODE'],
    opts.appType,
  )
  // weapp 是通用输出目标，只有明确的微信平台才启用微信运行时诊断。
  return resolved === 'mp-weixin' || resolved === 'weapp' || resolved === 'wx' || resolved === 'weixin'
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

/** 由构建器在最终样式计算和单位转换后调用；安全轮次不消耗提示额度。 */
export function warnFinalRpxThemeRisk(session: object, styles: Iterable<string>, opts: WarningOptions, platform?: string) {
  if (!shouldCheckRpxThemeRisk(session, 'weapp', opts, platform)) {
    return
  }
  const variables = [...new Set([...(riskSources.get(session)?.values() ?? [])].flat())]
  if (variables.length === 0) {
    return
  }
  for (const css of styles) {
    warnRpxThemeRisk(session, variables, css)
    if (warnedSessions.has(session)) {
      break
    }
  }
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
