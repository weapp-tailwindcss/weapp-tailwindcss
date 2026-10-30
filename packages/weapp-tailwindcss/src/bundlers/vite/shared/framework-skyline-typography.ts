import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { InternalUserDefinedOptions } from '@/types'
import { resolvePlatformIdentity } from '@weapp-tailwindcss/env'
import { createSkylineTypographyResetCss, resolveSkylineTypographyCompatibility } from '@weapp-tailwindcss/postcss/transform'
import { resolveFrameworkEnvironment } from '@/framework-policies/environment-snapshot'

export type ViteSkylineTypographyOptions = Pick<IStyleHandlerOptions, 'cssOptions' | 'cssRemoveProperty' | 'platform' | 'atRules' | 'cssSelectorReplacement'> & {
  tailwindRuntime?: InternalUserDefinedOptions['tailwindRuntime'] | undefined
}

/** 运行时初始化只面向已确认的微信目标，显式 CSS 平台不能覆盖框架环境事实。 */
export function resolveViteSkylineTypographyResetCss(
  options: ViteSkylineTypographyOptions,
  stylePlatform: string | undefined,
  isWebGeneratorTarget: boolean,
  majorVersion = options.tailwindRuntime?.majorVersion,
) {
  const platform = resolvePlatformIdentity(resolveFrameworkEnvironment(options).uniPlatform || stylePlatform).canonical
  if (isWebGeneratorTarget || platform !== 'mp-weixin') {
    return undefined
  }
  if (!resolveSkylineTypographyCompatibility({ ...options, platform }, majorVersion === 4)) {
    return undefined
  }
  const selector = options.cssOptions?.cssSelectorReplacement?.universal ?? options.cssSelectorReplacement?.universal
  return createSkylineTypographyResetCss(selector === false ? '*' : selector)
}
