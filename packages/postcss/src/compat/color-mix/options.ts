import type { CssOptions } from '../../types'

/** 小程序默认保留动态透明度，通用颜色解析仍维持严格语义。 */
export function resolveMiniProgramColorMixOptions(options?: Pick<CssOptions, 'colorMixDynamicAlpha'>) {
  return { colorMixDynamicAlpha: options?.colorMixDynamicAlpha ?? 'rgba' } as const
}
