import type { IStyleHandlerOptions } from '../types'
import { resolvePostcssStyleTarget } from '../frameworks'
import { normalizeCssOptions } from '../options-resolver'
import { resolveMiniProgramColorMixOptions } from './color-mix/options'

/** 输出族为 weapp 时仍须检查实际平台，避免作者 CSS 提前绕过平台隔离。 */
export function resolveColorMixOptions(options: Partial<IStyleHandlerOptions> = {}) {
  const normalized = normalizeCssOptions(options)
  const target = resolvePostcssStyleTarget(normalized)
  return target === 'generic' || target === 'mini-program'
    ? resolveMiniProgramColorMixOptions(normalized.cssOptions)
    : { colorMixDynamicAlpha: 'strict' as const }
}
