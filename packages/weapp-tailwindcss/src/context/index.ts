import type { CssPreflightOptions, InternalUserDefinedOptions, RefreshTailwindcssRuntimeOptions, TailwindcssRuntimeLike, UserDefinedOptions } from '@/types'
import { rm } from 'node:fs/promises'
import { logger } from '@weapp-tailwindcss/logger'
import { initializeCache } from '@/cache'
import { getDefaultOptions, resolveDefaultCssPreflight } from '@/defaults'
import { resolveMpxPlatform } from '@/framework'
import { normalizeFrameworkStylePlatform } from '@/framework/platform'
import { invalidateRuntimeClassSet, refreshTailwindcssRuntimeSymbol } from '@/tailwindcss/runtime'
import { logRuntimeTailwindcssVersion } from '@/tailwindcss/runtime-logs'
import { logTailwindcssTarget } from '@/tailwindcss/targets'
import { applyV4CssCalcDefaults, warnMissingCssEntries } from '@/tailwindcss/v4'
import { resolveUniAppXOptions } from '@/uni-app-x/options'
import { resolveUnocssBareArbitraryValues } from '@/unocss'
import { defuOverrideArray } from '@/utils'
import { withCompilerContextCache } from './compiler-context-cache'
import { toCustomAttributesEntities } from './custom-attributes'
import { createHandlersFromContext } from './handlers'
import { applyLoggerLevel } from './logger'
import { createTailwindcssRuntimeFromContext } from './tailwindcss'

interface ClearTailwindcssRuntimeCacheOptions {
  removeDirectory?: boolean
}

function resolveContextCssPreflight(opts: UserDefinedOptions | undefined, ctx: InternalUserDefinedOptions, majorVersion: number | undefined): CssPreflightOptions {
  const userCssPreflight = opts?.cssOptions?.cssPreflight ?? opts?.cssPreflight
  const cssPreflight = resolveDefaultCssPreflight(userCssPreflight, majorVersion)
  const shouldUseUniAppXPreflight = ctx.appType === 'uni-app-x' || resolveUniAppXOptions(ctx.uniAppX).enabled
  if (cssPreflight === false || !shouldUseUniAppXPreflight) {
    return cssPreflight
  }
  const userCssPreflightObject = userCssPreflight && typeof userCssPreflight === 'object'
    ? userCssPreflight
    : undefined
  return {
    ...cssPreflight,
    'border-width': userCssPreflightObject && 'border-width' in userCssPreflightObject
      ? (cssPreflight['border-width'] ?? false)
      : '0',
    'border-style': userCssPreflightObject && 'border-style' in userCssPreflightObject
      ? (cssPreflight['border-style'] ?? false)
      : false,
    'border': userCssPreflightObject && 'border' in userCssPreflightObject
      ? (cssPreflight['border'] ?? false)
      : false,
  }
}

function syncCssOptionsToLegacyFields(ctx: InternalUserDefinedOptions) {
  if (!ctx.cssOptions) {
    return
  }
  const cssOptions = ctx.cssOptions
  ctx.cssPreflight = cssOptions.cssPreflight ?? ctx.cssPreflight
  ctx.cssPreflightRange = cssOptions.cssPreflightRange ?? ctx.cssPreflightRange
  ctx.cssChildCombinatorReplaceValue = cssOptions.cssChildCombinatorReplaceValue ?? ctx.cssChildCombinatorReplaceValue
  ctx.cssSelectorReplacement = cssOptions.cssSelectorReplacement ?? ctx.cssSelectorReplacement
  ctx.rem2rpx = cssOptions.rem2rpx ?? ctx.rem2rpx
  ctx.cssRemoveProperty = cssOptions.cssRemoveProperty ?? ctx.cssRemoveProperty
  ctx.cssRemoveActivePseudoClass = cssOptions.cssRemoveActivePseudoClass ?? ctx.cssRemoveActivePseudoClass
  ctx.cssRemoveHoverPseudoClass = cssOptions.cssRemoveHoverPseudoClass ?? ctx.cssRemoveHoverPseudoClass
  ctx.cssRemoveFocusPseudoClass = cssOptions.cssRemoveFocusPseudoClass ?? ctx.cssRemoveFocusPseudoClass
  ctx.tailwindcssV4GradientFallback = cssOptions.tailwindcssV4GradientFallback ?? ctx.tailwindcssV4GradientFallback
  ctx.cssPresetEnv = cssOptions.cssPresetEnv ?? ctx.cssPresetEnv
  ctx.atRules = cssOptions.atRules ?? ctx.atRules
  ctx.autoprefixer = cssOptions.autoprefixer ?? ctx.autoprefixer
  ctx.cssCalc = cssOptions.cssCalc ?? ctx.cssCalc
  ctx.platform = cssOptions.platform ?? ctx.platform
  ctx.px2rpx = cssOptions.px2rpx ?? ctx.px2rpx
  ctx.unitsToPx = cssOptions.unitsToPx ?? ctx.unitsToPx
  ctx.unitConversion = cssOptions.unitConversion ?? ctx.unitConversion
  ctx.injectAdditionalCssVarScope = cssOptions.injectAdditionalCssVarScope ?? ctx.injectAdditionalCssVarScope
}

function syncLegacyFieldsToCssOptions(ctx: InternalUserDefinedOptions) {
  if (!ctx.cssOptions) {
    return
  }
  ctx.cssOptions = {
    ...(ctx.cssOptions ?? {}),
    cssPreflight: ctx.cssPreflight,
    cssPreflightRange: ctx.cssPreflightRange,
    cssChildCombinatorReplaceValue: ctx.cssChildCombinatorReplaceValue,
    cssSelectorReplacement: ctx.cssSelectorReplacement,
    rem2rpx: ctx.rem2rpx,
    cssRemoveProperty: ctx.cssRemoveProperty,
    cssRemoveActivePseudoClass: ctx.cssRemoveActivePseudoClass,
    cssRemoveHoverPseudoClass: ctx.cssRemoveHoverPseudoClass,
    cssRemoveFocusPseudoClass: ctx.cssRemoveFocusPseudoClass,
    tailwindcssV4GradientFallback: ctx.tailwindcssV4GradientFallback,
    cssPresetEnv: ctx.cssPresetEnv,
    atRules: ctx.atRules,
    autoprefixer: ctx.autoprefixer,
    cssCalc: ctx.cssCalc,
    platform: ctx.platform,
    px2rpx: ctx.px2rpx,
    unitsToPx: ctx.unitsToPx,
    unitConversion: ctx.unitConversion,
    injectAdditionalCssVarScope: ctx.injectAdditionalCssVarScope,
  }
}

function applyFrameworkPlatformDefaults(ctx: InternalUserDefinedOptions) {
  if (ctx.cssOptions?.platform || ctx.platform) {
    ctx.platform = normalizeFrameworkStylePlatform(ctx.cssOptions?.platform ?? ctx.platform, ctx.appType) ?? ctx.platform
    return
  }
  if (ctx.appType === 'mpx') {
    ctx.platform = normalizeFrameworkStylePlatform(resolveMpxPlatform().normalized, ctx.appType) ?? ctx.platform
  }
}

export async function clearTailwindcssRuntimeCache(
  tailwindRuntime: TailwindcssRuntimeLike | undefined,
  options?: ClearTailwindcssRuntimeCacheOptions,
) {
  if (!tailwindRuntime) {
    return
  }
  const cacheOptions = tailwindRuntime.options?.cache
  if (
    cacheOptions == null
    || (typeof cacheOptions === 'object' && cacheOptions.enabled === false)
  ) {
    return
  }

  if (typeof (tailwindRuntime as any).clearCache === 'function') {
    try {
      await (tailwindRuntime as any).clearCache({ scope: 'all' })
    }
    catch (error) {
      logger.debug('failed to clear tailwindcss runtime cache via clearCache(): %O', error)
    }
  }

  if (!options?.removeDirectory) {
    return
  }

  const cachePaths = new Map<string, boolean>()
  const normalizedCacheOptions = typeof cacheOptions === 'object' ? cacheOptions : undefined
  // 以非侵入方式访问私有的缓存目录路径，避免依赖 Tailwind 运行时内部类型。
  const privateCachePath: string | undefined = (tailwindRuntime as any)?.cacheStore?.options?.path
  if (privateCachePath) {
    cachePaths.set(privateCachePath, false)
  }
  if (normalizedCacheOptions && 'path' in normalizedCacheOptions && typeof normalizedCacheOptions.path === 'string') {
    cachePaths.set(normalizedCacheOptions.path, false)
  }
  if (options?.removeDirectory && normalizedCacheOptions?.dir) {
    cachePaths.set(normalizedCacheOptions.dir, true)
  }
  if (!cachePaths.size) {
    return
  }
  for (const [cachePath, recursive] of cachePaths.entries()) {
    try {
      await rm(cachePath, { force: true, recursive })
    }
    catch (error) {
      const err = error as NodeJS.ErrnoException
      if (err?.code === 'ENOENT') {
        continue
      }
      logger.debug('failed to clear tailwindcss runtime cache: %s %O', cachePath, err)
    }
  }
}

function createInternalCompilerContext(opts?: UserDefinedOptions): InternalUserDefinedOptions {
  const ctx = defuOverrideArray<InternalUserDefinedOptions, Partial<InternalUserDefinedOptions>[]>(
    opts as InternalUserDefinedOptions,
    getDefaultOptions() as InternalUserDefinedOptions,
    {},
  )

  ctx.arbitraryValues = resolveUnocssBareArbitraryValues(ctx.arbitraryValues, ctx.unocss)
  ctx.escapeMap = ctx.customReplaceDictionary
  syncCssOptionsToLegacyFields(ctx)
  applyFrameworkPlatformDefaults(ctx)

  applyLoggerLevel(ctx.logLevel)

  const tailwindRuntime = createTailwindcssRuntimeFromContext(ctx) as TailwindcssRuntimeLike
  if ((opts as any)?.__internalViteDeferRuntimeLogs !== true) {
    logTailwindcssTarget(tailwindRuntime, ctx.tailwindcssBasedir)
    logRuntimeTailwindcssVersion(
      ctx.tailwindcssBasedir,
      tailwindRuntime.packageInfo?.rootPath,
      tailwindRuntime.packageInfo?.version,
    )
  }

  if ((opts as any)?.__internalDeferMissingCssEntriesWarning !== true) {
    warnMissingCssEntries(ctx, tailwindRuntime)
  }

  ctx.cssPreflight = resolveContextCssPreflight(opts, ctx, tailwindRuntime.majorVersion)

  const cssCalcOptions = applyV4CssCalcDefaults(ctx.cssCalc, tailwindRuntime)
  ctx.cssCalc = cssCalcOptions
  syncLegacyFieldsToCssOptions(ctx)

  const customAttributesEntities = toCustomAttributesEntities(ctx.customAttributes)
  ctx.customAttributesEntities = customAttributesEntities

  const { styleHandler, jsHandler, templateHandler } = createHandlersFromContext(
    ctx,
    customAttributesEntities,
    cssCalcOptions,
    tailwindRuntime.majorVersion,
  )

  ctx.styleHandler = styleHandler
  ctx.jsHandler = jsHandler
  ctx.templateHandler = templateHandler

  ctx.cache = initializeCache(ctx.cache)
  ctx.tailwindRuntime = tailwindRuntime
  const refreshTailwindcssRuntime = async (
    options?: RefreshTailwindcssRuntimeOptions,
  ): Promise<TailwindcssRuntimeLike> => {
    const previousRuntime = ctx.tailwindRuntime
    if (options?.clearCache !== false) {
      await clearTailwindcssRuntimeCache(previousRuntime)
    }
    invalidateRuntimeClassSet(previousRuntime)
    const nextRuntime = createTailwindcssRuntimeFromContext(ctx)
    Object.assign(previousRuntime, nextRuntime)
    ctx.tailwindRuntime = previousRuntime
    return previousRuntime
  }
  ctx.refreshTailwindcssRuntime = refreshTailwindcssRuntime
  Object.defineProperty(ctx.tailwindRuntime, refreshTailwindcssRuntimeSymbol, {
    value: refreshTailwindcssRuntime,
    configurable: true,
  })
  return ctx
}

/**
 * 获取用户定义选项的内部表示，并初始化相关的处理程序和 Tailwind 运行时。
 * @param opts - 用户定义的选项，可选。
 * @returns 返回一个包含内部用户定义选项的对象，包括样式、JS 和模板处理程序，以及 Tailwind CSS 运行时。
 */
export function getCompilerContext(opts?: UserDefinedOptions): InternalUserDefinedOptions {
  return withCompilerContextCache(opts, () => createInternalCompilerContext(opts))
}
