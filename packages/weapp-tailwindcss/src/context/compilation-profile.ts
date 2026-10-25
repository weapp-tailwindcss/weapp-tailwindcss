import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { ResolvedCompilationProfile } from '@/compiler/compilation-profile'
import type { InternalUserDefinedOptions } from '@/types'
import { resolveCachedCompilationProfile } from '@/compiler/compilation-profile-cache'
import { shouldUseUniAppWebRpxCompatibility } from '@/framework-policies/environment'
import { resolveFrameworkEnvironment } from '@/framework-policies/environment-snapshot'
import { normalizeFrameworkStylePlatform } from '@/framework/platform'
import { resolveGeneratorConfiguration } from '@/generator/options'
import { createCompilerConfigurationFingerprint } from './compiler-context-cache'
import { snapshotConfiguration } from './configuration-snapshot'
import { resolveStyleOptionsFromContext } from './style-options'

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
  const styleContext = context as Partial<IStyleHandlerOptions>
  const configuration = {
    generator: context.generator,
    style: baseStyle,
    appType: context.appType,
    platform: context.cssOptions?.platform ?? context.platform,
    tailwindcssMajorVersion: context.tailwindRuntime?.majorVersion,
    uniAppX: context.uniAppX,
    uniAppXCssTarget: styleContext.uniAppXCssTarget,
    uniAppXUnsupported: styleContext.uniAppXUnsupported,
    cssPreflight: context.cssPreflight,
    cssEntries: context.cssEntries,
    escapeMap: context.escapeMap,
    arbitraryValues: context.arbitraryValues,
    sourceOptions: context.tailwindRuntime?.options,
    logLevel: context.logLevel,
    environment,
  }
  const signature = createCompilerConfigurationFingerprint(configuration, { preserveOpaqueIdentity: true })
  const request = { ...overrides, platform: overrides.platform ?? configuration.platform }
  return resolveCachedCompilationProfile(owner, signature, request, (revision) => {
    const resolved = resolveGeneratorConfiguration(configuration.generator, {
      appType: configuration.appType,
      platform: request.platform,
      tailwindcssMajorVersion: configuration.tailwindcssMajorVersion,
      uniAppX: configuration.uniAppX,
      nativeStyle: request.nativeStyle,
      styleTarget: request.styleTarget,
    }, environment)
    const { appType: _appType, ...styleOptions } = baseStyle
    const resolvedPlatform = normalizeFrameworkStylePlatform(request.platform
      ?? (environment.uniPlatform || environment.uniUtsPlatform.normalized || environment.mpxPlatform
        || environment.values.TARO_ENV), configuration.appType)
    return snapshotConfiguration<ResolvedCompilationProfile>({
      revision,
      generator: { ...resolved.options, bareArbitraryValues: configuration.arbitraryValues?.bareArbitraryValues },
      policy: resolved.frameworkPolicy,
      styleOptions: {
        ...styleOptions,
        webRpxCompatibility: shouldUseUniAppWebRpxCompatibility(configuration.appType, environment.webTarget),
        uniAppXCssTarget: configuration.uniAppXCssTarget,
        uniAppXUnsupported: configuration.uniAppXUnsupported ?? styleOptions.uniAppXUnsupported,
      },
      cssPreflight: baseStyle.cssPreflight ?? configuration.cssPreflight,
      cssEntries: configuration.cssEntries,
      escapeMap: configuration.escapeMap,
      compilerMode: environment.compilerMode,
      sourceConcurrency: environment.sourceConcurrency,
      stylesEmbeddedInScript: resolved.frameworkPolicy.stylesEmbeddedInScript,
      checkRpxThemeRisk: resolved.options.target === 'weapp'
        && configuration.logLevel !== 'silent' && configuration.logLevel !== 'error'
        && ['mp-weixin', 'weapp', 'wx', 'weixin'].includes(resolvedPlatform ?? ''),
    })
  })
}

/** 兼容层统一解释显式平台配置与实例环境事实。 */
export function resolveContextStylePlatform(context: InternalUserDefinedOptions, platformOverride?: string) {
  const environment = resolveFrameworkEnvironment(context)
  const platform = platformOverride ?? context.cssOptions?.platform ?? context.platform
    ?? (environment.uniPlatform || environment.uniUtsPlatform.normalized || environment.mpxPlatform || environment.values.TARO_ENV)
  return normalizeFrameworkStylePlatform(platform, context.appType)
}

/** 能力查询只解析策略，不创建编译快照或推进配置 revision。 */
export function resolveContextStylesEmbeddedInScript(context: InternalUserDefinedOptions, platformOverride?: string) {
  return resolveGeneratorConfiguration(context.generator, {
    appType: context.appType,
    platform: platformOverride ?? context.cssOptions?.platform ?? context.platform,
    tailwindcssMajorVersion: context.tailwindRuntime?.majorVersion,
    uniAppX: context.uniAppX,
  }, resolveFrameworkEnvironment(context)).frameworkPolicy.stylesEmbeddedInScript
}
