import type { InternalUserDefinedOptions } from '@/types'
import process from 'node:process'
import { normalizeFrameworkStylePlatform } from '@/framework/platform'
import { normalizeCssEntries } from '@/tailwindcss/v4/css-entries'
import { sameStringList } from './framework-runtime-options'
import { inferPlatformFromOutDir } from './framework-runtime-utils'

const ENV_PLATFORM_KEYS = ['UNI_PLATFORM', 'UNI_UTS_PLATFORM', 'TARO_ENV', 'MPX_CURRENT_TARGET_MODE', 'MPX_CLI_MODE']

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
  const explicit = normalizeFrameworkStylePlatform(opts.cssOptions?.platform ?? opts.platform, opts.appType)
  if (explicit) {
    return explicit
  }
  for (const key of ENV_PLATFORM_KEYS) {
    const platform = normalizeFrameworkStylePlatform(process.env[key], opts.appType)
    if (platform) {
      return platform
    }
  }
  return inferPlatformFromOutDir(outDir)
}
