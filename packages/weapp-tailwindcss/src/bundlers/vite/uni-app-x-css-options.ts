import type { InternalUserDefinedOptions, IStyleHandlerOptions } from '@/types'
import { resolveContextGeneratorConfiguration } from '@/generator/context-options'
import { shouldUseNativeAppCssBranch } from '@/runtime-branch'
import { isUniAppXEnabled, resolveUniAppXOptions } from '@/uni-app-x/options'

export function resolveUniAppXNativeCssHandlerOptions(
  opts: Pick<InternalUserDefinedOptions, 'appType' | 'generator' | 'platform' | 'cssOptions' | 'uniAppX'>,
): Partial<IStyleHandlerOptions> {
  const runtimeBranch = resolveContextGeneratorConfiguration(opts, {
    uniAppX: resolveUniAppXOptions(opts.uniAppX),
  }).options.branch
  if (
    !shouldUseNativeAppCssBranch(runtimeBranch)
    || !isUniAppXEnabled(opts.uniAppX)
  ) {
    return {}
  }

  return {
    uniAppX: true,
    uniAppXCssTarget: 'uvue',
    uniAppXUnsupported: resolveUniAppXOptions(opts.uniAppX).uvueUnsupported,
  }
}
