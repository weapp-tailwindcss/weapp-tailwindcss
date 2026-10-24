import type { InternalUserDefinedOptions } from '@/types'
import process from 'node:process'
import { getRpxThemeRiskVariables, hasReportedRpxThemeRisk, warnRpxThemeRisk } from '@/compiler/rpx-theme-diagnostics'
import { normalizeFrameworkStylePlatform } from '@/framework/platform'

export { collectRpxThemeRiskSources, recordRpxThemeRisk, warnRpxThemeRisk } from '@/compiler/rpx-theme-diagnostics'

type WarningOptions = Pick<InternalUserDefinedOptions, 'logLevel' | 'platform' | 'cssOptions' | 'appType'>

export function shouldCheckRpxThemeRisk(
  session: object,
  target: string,
  opts: WarningOptions,
  platform?: string,
) {
  if (target !== 'weapp' || hasReportedRpxThemeRisk(session) || opts.logLevel === 'silent' || opts.logLevel === 'error') {
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

/** 由构建器在最终样式计算和单位转换后调用；安全轮次不消耗提示额度。 */
export function warnFinalRpxThemeRisk(session: object, styles: Iterable<string>, opts: WarningOptions, platform?: string) {
  if (!shouldCheckRpxThemeRisk(session, 'weapp', opts, platform)) {
    return
  }
  const variables = getRpxThemeRiskVariables(session)
  if (variables.length === 0) {
    return
  }
  for (const css of styles) {
    warnRpxThemeRisk(session, variables, css)
    if (hasReportedRpxThemeRisk(session)) {
      break
    }
  }
}
