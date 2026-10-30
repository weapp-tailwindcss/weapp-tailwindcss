import type { InternalUserDefinedOptions } from '@/types'
import { assertSkylineTypographyCss, resolveSkylineTypographyCompatibility } from '@weapp-tailwindcss/postcss/transform'
import { resolveStyleOptionsFromContext } from './style-options'

/** 资产收尾使用与样式处理相同的目标和配置，不能仅凭开关重新启用。 */
export function isSkylineTypographyEnabledForContext(ctx: InternalUserDefinedOptions, majorVersion = ctx.tailwindRuntime?.majorVersion, platformFallback?: string) {
  const options = resolveStyleOptionsFromContext(ctx, majorVersion, platformFallback)
  return resolveSkylineTypographyCompatibility(options, majorVersion === 4 && !options.uniAppX)
}

/** 校验所有 CSS 资产，包括没有字体消费者的独立资产。 */
export function assertSkylineTypographyAsset(css: string, ctx: InternalUserDefinedOptions, majorVersion = ctx.tailwindRuntime?.majorVersion, platformFallback?: string) {
  if (isSkylineTypographyEnabledForContext(ctx, majorVersion, platformFallback)) {
    assertSkylineTypographyCss(css)
  }
}
