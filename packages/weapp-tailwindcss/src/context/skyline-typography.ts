import type { InternalUserDefinedOptions } from '@/types'
import { assertSkylineTypographyCss, resolveSkylineTypographyCompatibility } from '@weapp-tailwindcss/postcss/transform'
import { resolveStyleOptionsFromContext } from './style-options'

// 资产边界只复用已验证的完整文本，不保留 AST；上下文释放时一并回收。
const validatedAssets = new WeakMap<InternalUserDefinedOptions, Map<string, number>>()
const VALIDATED_ASSETS_MAX = 64
const VALIDATED_ASSETS_MAX_CHARS = 2_000_000

/** 资产收尾使用与样式处理相同的目标和配置，不能仅凭开关重新启用。 */
export function isSkylineTypographyEnabledForContext(ctx: InternalUserDefinedOptions, majorVersion = ctx.tailwindRuntime?.majorVersion, platformFallback?: string) {
  if (ctx.cssOptions?.skyline !== true || majorVersion !== 4) {
    return false
  }
  const options = resolveStyleOptionsFromContext(ctx, majorVersion, platformFallback)
  return resolveSkylineTypographyCompatibility(options, majorVersion === 4 && !options.uniAppX)
}

/** 校验所有 CSS 资产，包括没有字体消费者的独立资产。 */
export function assertSkylineTypographyAsset(css: string, ctx: InternalUserDefinedOptions, majorVersion = ctx.tailwindRuntime?.majorVersion, platformFallback?: string) {
  if (isSkylineTypographyEnabledForContext(ctx, majorVersion, platformFallback)) {
    let cache = validatedAssets.get(ctx)
    if (cache?.has(css)) {
      cache.delete(css)
      cache.set(css, css.length)
      return
    }
    assertSkylineTypographyCss(css)
    if (css.length > VALIDATED_ASSETS_MAX_CHARS) {
      return
    }
    if (!cache) {
      cache = new Map()
      validatedAssets.set(ctx, cache)
    }
    cache.set(css, css.length)
    let chars = [...cache.values()].reduce((total, size) => total + size, 0)
    while (cache.size > VALIDATED_ASSETS_MAX || chars > VALIDATED_ASSETS_MAX_CHARS) {
      const oldest = cache.keys().next().value!
      chars -= cache.get(oldest)!
      cache.delete(oldest)
    }
  }
}
