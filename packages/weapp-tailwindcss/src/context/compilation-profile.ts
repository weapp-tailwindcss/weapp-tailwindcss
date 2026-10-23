import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { ResolvedCompilationProfile } from '@/compiler/compilation-profile'
import type { InternalUserDefinedOptions } from '@/types'
import { shouldUseUniAppWebRpxCompatibility } from '@/framework-policies/environment'
import { resolveFrameworkEnvironment } from '@/framework-policies/environment-snapshot'
import { normalizeFrameworkStylePlatform } from '@/framework/platform'
import { resolveGeneratorConfiguration } from '@/generator/options'
import { createCompilerConfigurationFingerprint } from './compiler-context-cache'
import { snapshotConfiguration } from './configuration-snapshot'
import { resolveStyleOptionsFromContext } from './style-options'

interface ProfileState { signature: string, revision: number }
const profileStates = new WeakMap<object, ProfileState>()

export interface CompilationRequestOverrides {
  platform?: string | undefined
  nativeStyle?: boolean | undefined
  styleTarget?: string | undefined
}

/** 兼容入口将框架配置解析为本次请求的中立快照，阶段覆盖不改变配置 revision。 */
export function resolveCompilationProfile(
  context: InternalUserDefinedOptions,
  owner: object = context,
  overrides: CompilationRequestOverrides = {},
): { profile: ResolvedCompilationProfile, isCurrent: () => boolean } {
  const environment = resolveFrameworkEnvironment(context)
  const baseStyle = resolveStyleOptionsFromContext(context)
  const configuration = {
    generator: context.generator,
    style: baseStyle,
    cssEntries: context.cssEntries,
    escapeMap: context.escapeMap,
    arbitraryValues: context.arbitraryValues,
    sourceOptions: context.tailwindRuntime?.options,
    logLevel: context.logLevel,
    environment,
  }
  const signature = createCompilerConfigurationFingerprint(configuration)
  const previous = profileStates.get(owner)
  const revision = previous?.signature === signature ? previous.revision : (previous?.revision ?? 0) + 1
  const state = { signature, revision }
  profileStates.set(owner, state)
  const platform = overrides.platform ?? context.cssOptions?.platform ?? context.platform
  const resolved = resolveGeneratorConfiguration(context.generator, {
    appType: context.appType,
    platform,
    tailwindcssMajorVersion: context.tailwindRuntime?.majorVersion,
    uniAppX: context.uniAppX,
    nativeStyle: overrides.nativeStyle,
    styleTarget: overrides.styleTarget,
  }, environment)
  const { appType: _appType, ...styleOptions } = baseStyle
  const resolvedPlatform = normalizeFrameworkStylePlatform(platform
    ?? (environment.uniUtsPlatform.normalized || environment.uniPlatform || environment.mpxPlatform
      || environment.values.TARO_ENV), context.appType)
  const profile = snapshotConfiguration<ResolvedCompilationProfile>({
    revision,
    generator: { ...resolved.options, bareArbitraryValues: context.arbitraryValues?.bareArbitraryValues },
    policy: resolved.frameworkPolicy,
    styleOptions: {
      ...styleOptions,
      webRpxCompatibility: shouldUseUniAppWebRpxCompatibility(context.appType, environment.webTarget),
      uniAppXCssTarget: (context as Partial<IStyleHandlerOptions>).uniAppXCssTarget,
      uniAppXUnsupported: (context as Partial<IStyleHandlerOptions>).uniAppXUnsupported,
    },
    cssPreflight: context.cssPreflight,
    cssEntries: context.cssEntries,
    escapeMap: context.escapeMap,
    compilerMode: environment.compilerMode,
    sourceConcurrency: environment.sourceConcurrency,
    stylesEmbeddedInScript: resolved.options.branch.isNativeApp,
    checkRpxThemeRisk: resolved.options.target === 'weapp'
      && context.logLevel !== 'silent' && context.logLevel !== 'error'
      && ['mp-weixin', 'weapp', 'wx', 'weixin'].includes(resolvedPlatform ?? ''),
  })
  return { profile, isCurrent: () => profileStates.get(owner)?.revision === revision }
}

/** 兼容层统一解释显式平台配置与实例环境事实。 */
export function resolveContextStylePlatform(context: InternalUserDefinedOptions, platformOverride?: string) {
  const environment = resolveFrameworkEnvironment(context)
  const platform = platformOverride ?? context.cssOptions?.platform ?? context.platform
    ?? (environment.uniUtsPlatform.normalized || environment.uniPlatform || environment.mpxPlatform || environment.values.TARO_ENV)
  return normalizeFrameworkStylePlatform(platform, context.appType)
}

export function resolveContextStylesEmbeddedInScript(context: InternalUserDefinedOptions, platformOverride?: string) {
  return resolveCompilationProfile(context, context, { platform: platformOverride }).profile.stylesEmbeddedInScript
}
