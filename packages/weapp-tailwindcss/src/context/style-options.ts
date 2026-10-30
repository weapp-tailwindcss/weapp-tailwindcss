import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { InternalUserDefinedOptions } from '@/types'
import { isWechatAutoCssCalc } from '@weapp-tailwindcss/postcss/transform'
import { resolveFrameworkEnvironment } from '@/framework-policies/environment-snapshot'
import { normalizeFrameworkStylePlatform } from '@/framework/platform'
import { resolveContextGeneratorConfiguration } from '@/generator/context-options'
import { resolveGeneratorRuntimeBranch } from '@/runtime-branch'

export type ResolvedStyleOptions = Partial<IStyleHandlerOptions> & {
  appType?: InternalUserDefinedOptions['appType'] | undefined
}

export function normalizeStyleHandlerMajorVersion(majorVersion: number | undefined): 4 | undefined {
  return majorVersion === 4 ? 4 : undefined
}

export function resolveStyleOptionsFromContext(
  ctx: InternalUserDefinedOptions,
  tailwindcssMajorVersion: number | undefined = ctx.tailwindRuntime?.majorVersion,
  platformFallback?: string,
): ResolvedStyleOptions {
  // Vite 适配可能通过 getter 提供配置，同次解析只读取一次，避免重复解析及混用不同快照。
  const inputCssOptions = ctx.cssOptions
  const environment = resolveFrameworkEnvironment(ctx)
  const configuredPlatform = normalizeFrameworkStylePlatform(inputCssOptions?.platform ?? ctx.platform ?? platformFallback
    ?? (environment.uniPlatform || environment.uniUtsPlatform.normalized || environment.mpxPlatform || environment.values.TARO_ENV), ctx.appType)
  const { options: generatorOptions, frameworkPolicy } = resolveContextGeneratorConfiguration(ctx, {
    appType: ctx.appType,
    platform: configuredPlatform,
    tailwindcssMajorVersion,
    uniAppX: ctx.uniAppX,
  })
  const branch = resolveGeneratorRuntimeBranch(generatorOptions, {
    appType: ctx.appType,
    platform: configuredPlatform,
    tailwindcssMajorVersion,
    uniAppX: ctx.uniAppX,
  })
  const hasCssOptions = inputCssOptions !== undefined
  const configuredRem2rpx = inputCssOptions?.rem2rpx ?? ctx.rem2rpx
  const rem2rpx = branch.isWeb && frameworkPolicy.disableWebRemToRpx
    ? false
    : configuredRem2rpx
  const platform = branch.platform ?? configuredPlatform
  const majorVersion = normalizeStyleHandlerMajorVersion(tailwindcssMajorVersion)
  const configuredCalc = inputCssOptions?.cssCalc ?? ctx.cssCalc
  const autoCalc = !branch.isWeb && isWechatAutoCssCalc({ platform, majorVersion, uniAppX: branch.isNativeApp })
  const cssCalc = configuredCalc === 'auto' || configuredCalc === undefined
    ? autoCalc ? 'auto' : undefined
    : configuredCalc
  const cssOptions = {
    skyline: branch.isWeb || branch.isNativeApp ? false : inputCssOptions?.skyline,
    cssPreflight: inputCssOptions?.cssPreflight ?? ctx.cssPreflight,
    cssPreflightRange: inputCssOptions?.cssPreflightRange ?? ctx.cssPreflightRange,
    cssChildCombinatorReplaceValue: inputCssOptions?.cssChildCombinatorReplaceValue ?? ctx.cssChildCombinatorReplaceValue,
    cssSelectorReplacement: inputCssOptions?.cssSelectorReplacement ?? ctx.cssSelectorReplacement,
    rem2rpx,
    cssRemoveProperty: inputCssOptions?.cssRemoveProperty ?? ctx.cssRemoveProperty,
    cssRemoveActivePseudoClass: inputCssOptions?.cssRemoveActivePseudoClass ?? ctx.cssRemoveActivePseudoClass,
    cssRemoveHoverPseudoClass: inputCssOptions?.cssRemoveHoverPseudoClass ?? ctx.cssRemoveHoverPseudoClass,
    cssRemoveFocusPseudoClass: inputCssOptions?.cssRemoveFocusPseudoClass ?? ctx.cssRemoveFocusPseudoClass,
    tailwindcssV4GradientFallback: inputCssOptions?.tailwindcssV4GradientFallback ?? ctx.tailwindcssV4GradientFallback,
    cssPresetEnv: inputCssOptions?.cssPresetEnv ?? ctx.cssPresetEnv,
    atRules: inputCssOptions?.atRules ?? ctx.atRules,
    autoprefixer: inputCssOptions?.autoprefixer ?? ctx.autoprefixer,
    cssCalc,
    platform,
    px2rpx: inputCssOptions?.px2rpx ?? ctx.px2rpx,
    unitsToPx: inputCssOptions?.unitsToPx ?? ctx.unitsToPx,
    unitConversion: inputCssOptions?.unitConversion ?? ctx.unitConversion,
    injectAdditionalCssVarScope: inputCssOptions?.injectAdditionalCssVarScope ?? ctx.injectAdditionalCssVarScope,
    preserveWebkitProperties: inputCssOptions?.preserveWebkitProperties,
  } satisfies NonNullable<IStyleHandlerOptions['cssOptions']>

  return {
    majorVersion,
    appType: ctx.appType,
    postcssOptions: ctx.postcssOptions,
    cssPreflight: cssOptions.cssPreflight,
    cssPreflightRange: cssOptions.cssPreflightRange,
    cssChildCombinatorReplaceValue: cssOptions.cssChildCombinatorReplaceValue,
    cssSelectorReplacement: cssOptions.cssSelectorReplacement,
    rem2rpx: cssOptions.rem2rpx,
    ...(hasCssOptions ? { cssOptions } : {}),
    cssRemoveProperty: cssOptions.cssRemoveProperty,
    cssRemoveActivePseudoClass: cssOptions.cssRemoveActivePseudoClass,
    cssRemoveHoverPseudoClass: cssOptions.cssRemoveHoverPseudoClass,
    cssRemoveFocusPseudoClass: cssOptions.cssRemoveFocusPseudoClass,
    tailwindcssV4GradientFallback: cssOptions.tailwindcssV4GradientFallback,
    cssPresetEnv: cssOptions.cssPresetEnv,
    atRules: cssOptions.atRules,
    autoprefixer: cssOptions.autoprefixer,
    cssCalc: cssOptions.cssCalc,
    uniAppX: branch.isNativeApp,
    uniAppXUnsupported: frameworkPolicy.unsupportedNativeCss,
    platform: cssOptions.platform,
    px2rpx: cssOptions.px2rpx,
    unitsToPx: cssOptions.unitsToPx,
    unitConversion: cssOptions.unitConversion,
  }
}
