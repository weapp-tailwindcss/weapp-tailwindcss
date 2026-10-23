import type { InternalUserDefinedOptions } from '@/types'
import process from 'node:process'
import { resolveContextStylePlatform } from '@/context/compilation-profile'
import { normalizeCssEntries } from '@/tailwindcss/v4/css-entries'
import { sameStringList } from './framework-runtime-options'
import { inferPlatformFromOutDir } from './framework-runtime-utils'

/** 在配置基准确定后同步显式 CSS 入口，保留运行时与用户选项的一致性。 */
export function createFrameworkCssEntrySync(opts: InternalUserDefinedOptions, rawCssEntries: string[] | undefined) {
  return (anchor: string | undefined) => {
    const entries = normalizeCssEntries(rawCssEntries, anchor ?? process.cwd())
    if (!entries) {
      return false
    }
    const changed = !sameStringList(opts.cssEntries, entries)
    opts.cssEntries = entries
    opts.tailwindcss ??= {}
    opts.tailwindcss.v4 ??= {}
    opts.tailwindcss.v4.cssEntries = entries
    if (opts.tailwindcssRuntimeOptions?.tailwindcss?.v4) {
      opts.tailwindcssRuntimeOptions.tailwindcss.v4.cssEntries = entries
    }
    if (opts.tailwindRuntime?.options?.tailwindcss?.v4) {
      opts.tailwindRuntime.options.tailwindcss.v4.cssEntries = entries
    }
    return changed
  }
}

/** 按显式配置、框架环境与输出目录顺序解析当前样式平台。 */
export function resolveFrameworkStylePlatform(opts: InternalUserDefinedOptions, outDir: string | undefined) {
  return resolveContextStylePlatform(opts) ?? inferPlatformFromOutDir(outDir)
}
