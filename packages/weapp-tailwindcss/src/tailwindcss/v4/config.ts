import type { InternalUserDefinedOptions, TailwindcssRuntimeLike } from '@/types'
import { logger } from '@weapp-tailwindcss/logger'
import { normalizeStringListOption } from '@/utils/options'
import { isTailwindV4CssEntry } from './css-entries'
import { hasConfiguredTailwindV4CssRoots } from './css-sources'

// 默认不限定变量名称，由用户通过 cssCalc 数组或 includeCustomProperties 指定。
export const DEFAULT_CSS_CALC_CUSTOM_PROPERTIES: (string | RegExp)[] = []

function includesToken(list: (string | RegExp)[], token: string | RegExp) {
  return list.some((candidate) => {
    if (typeof token === 'string') {
      if (typeof candidate === 'string') {
        return candidate === token
      }
      candidate.lastIndex = 0
      return candidate.test(token)
    }

    if (typeof candidate === 'string') {
      token.lastIndex = 0
      return token.test(candidate)
    }

    return candidate.source === token.source && candidate.flags === token.flags
  })
}

function ensureDefaultsIncluded(
  value: InternalUserDefinedOptions['cssCalc'],
): InternalUserDefinedOptions['cssCalc'] {
  if (value === true) {
    // true 表示选择所有可证明固定的变量，不能降为一个空白名单。
    return true
  }

  if (Array.isArray(value)) {
    if (!DEFAULT_CSS_CALC_CUSTOM_PROPERTIES.length) {
      return value
    }

    const missing = DEFAULT_CSS_CALC_CUSTOM_PROPERTIES.filter(token => !includesToken(value, token))
    return missing.length > 0
      ? [...value, ...missing]
      : value
  }

  if (value && typeof value === 'object') {
    const include = value.includeCustomProperties
    if (!Array.isArray(include)) {
      return {
        ...value,
        includeCustomProperties: [...DEFAULT_CSS_CALC_CUSTOM_PROPERTIES],
      }
    }

    if (!DEFAULT_CSS_CALC_CUSTOM_PROPERTIES.length) {
      return value
    }

    const missing = DEFAULT_CSS_CALC_CUSTOM_PROPERTIES.filter(token => !includesToken(include, token))

    return missing.length > 0
      ? {
          ...value,
          includeCustomProperties: [...include, ...missing],
        }
      : value
  }

  return value
}

export function normalizeCssEntriesConfig(entries: unknown) {
  const normalized = normalizeStringListOption(entries)?.filter(isTailwindV4CssEntry)
  return normalized && normalized.length > 0 ? normalized : undefined
}

function hasConfiguredCssEntries(ctx: InternalUserDefinedOptions) {
  if (normalizeCssEntriesConfig(ctx.cssEntries)) {
    return true
  }

  if (normalizeCssEntriesConfig(ctx.tailwindcss?.v4?.cssEntries)) {
    return true
  }

  const runtimeOptions = ctx.tailwindcssRuntimeOptions as any
  if (runtimeOptions) {
    if (normalizeCssEntriesConfig(runtimeOptions.tailwindcss?.v4?.cssEntries)) {
      return true
    }
  }

  return false
}

let hasWarnedMissingCssEntries = false

export function warnMissingCssEntries(
  ctx: InternalUserDefinedOptions,
  tailwindRuntime: TailwindcssRuntimeLike | undefined,
) {
  if (hasWarnedMissingCssEntries) {
    return
  }

  if (!tailwindRuntime) {
    return
  }

  if (hasConfiguredCssEntries(ctx) || hasConfiguredTailwindV4CssRoots(ctx)) {
    return
  }

  hasWarnedMissingCssEntries = true
  logger.warn(
    '[tailwindcss@4] 未检测到 cssEntries 配置。请传入包含 tailwindcss 引用的 CSS 绝对路径，例如 cssEntries: ["/absolute/path/to/src/app.css"]，否则 tailwindcss 生成的类名不会参与转译。',
  )
}

export function applyV4CssCalcDefaults(
  cssCalc: InternalUserDefinedOptions['cssCalc'],
  tailwindRuntime: TailwindcssRuntimeLike | undefined,
): InternalUserDefinedOptions['cssCalc'] {
  // 未指定的策略留到平台解析完成后决定，不能与显式关闭合并。
  const cssCalcOptions = cssCalc

  if (tailwindRuntime && cssCalcOptions) {
    return ensureDefaultsIncluded(cssCalcOptions)
  }

  return cssCalcOptions
}
