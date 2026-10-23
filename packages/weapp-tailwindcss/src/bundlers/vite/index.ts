import type { Plugin, ResolvedConfig } from 'vite'
import type { ViteFrameworkName } from '../framework-selector'
import type { ViteCapabilityProfile } from './capability-profile'
import type { WeappTailwindcssVitePlugin } from './shared/create-framework-plugins'
import type { VitePluginSlot } from './shared/plugin-slots'
import type { UserDefinedOptions } from '@/types'
import path from 'node:path'
import process from 'node:process'
import { createCompilerContext } from '@/context'
import { createDebug } from '@/debug'
import { logRuntimeTailwindcssVersion } from '@/tailwindcss/runtime-logs'
import { logTailwindcssTarget } from '@/tailwindcss/targets'
import { resolvePluginDisabledState } from '@/utils/disabled'
import { resolvePackageDir } from '@/utils/resolve-package'
import { resolveViteFrameworkProfile } from '../framework-selector'
import { createGenericWebViteCapabilityProfile, frameworkViteCapabilityProfile } from './capability-profile'
import { createGenericVitePlugins } from './frameworks/generic'
import { pluginSlots as genericPluginSlots } from './frameworks/generic/plugin-descriptors'
import { createGenericWebVitePlugins } from './frameworks/generic/web'
import { webPluginSlots } from './frameworks/generic/web-plugin-descriptors'
import { createTaroVitePlugins } from './frameworks/taro'
import { pluginSlots as taroPluginSlots } from './frameworks/taro/plugin-descriptors'
import { createUniAppVitePlugins } from './frameworks/uni-app'
import { createUniAppXVitePlugins } from './frameworks/uni-app-x'
import { pluginSlots as uniXPluginSlots } from './frameworks/uni-app-x/plugin-descriptors'
import { pluginSlots as uniPluginSlots } from './frameworks/uni-app/plugin-descriptors'
import { createWeappVitePlugins } from './frameworks/weapp-vite'
import { pluginSlots as weappPluginSlots } from './frameworks/weapp-vite/plugin-descriptors'
import { resolveImplicitAppTypeFromViteRoot } from './resolve-app-type'
import { createRewriteCssImportsPlugins } from './rewrite-css-imports'
import { createGenerationConfigHook } from './shared/generation-config-hook'
import { rewriteCssImportsSlot } from './shared/plugin-descriptors'
import { createDeferredVitePlugins, mergeVitePluginSlots } from './shared/plugin-slots'
import { slash } from './utils'

export type { WeappTailwindcssVitePlugin } from './shared/create-framework-plugins'

function platformFamily(platform: string | undefined): ViteCapabilityProfile['platformFamily'] {
  const value = platform?.trim().toLowerCase()
  if (!value) {
    return 'unknown'
  }
  if (value === 'h5' || value === 'web' || value.startsWith('web-')) {
    return 'web'
  }
  if (value === 'app' || value === 'app-plus' || value.startsWith('app-')) {
    return 'native-app'
  }
  if (value.startsWith('mp-') || ['weapp', 'wechat', 'wx', 'alipay', 'tt', 'baidu', 'qq', 'jd', 'swan'].includes(value)) {
    return 'mini-program'
  }
  return 'unknown'
}

function resolveEnvironmentName(context: unknown): string {
  const name = (context as { environment?: { name?: unknown } } | undefined)?.environment?.name
  return typeof name === 'string' && name.length > 0 ? name : 'default'
}

function resolveViteProfile(options: UserDefinedOptions, config: ResolvedConfig, environmentName: string) {
  const forceGenericWeb = (options as UserDefinedOptions & { __internalViteForceGenericWeb?: boolean }).__internalViteForceGenericWeb === true
  const rawTarget = options.generator && typeof options.generator === 'object' ? options.generator.target : undefined
  const explicitPlatform = options.cssOptions?.platform ?? options.platform
  const envPlatform = process.env['UNI_PLATFORM'] ?? process.env['UNI_UTS_PLATFORM']
  const selectedPlatform = explicitPlatform ?? envPlatform
  const explicitAppType = options.appType
  const root = config.root ? path.resolve(config.root) : process.cwd()

  let frameworkName = 'generic' as ReturnType<typeof resolveViteFrameworkProfile>['frameworkName']
  let appType = explicitAppType
  if (forceGenericWeb) {
    frameworkName = 'generic'
    appType = undefined
  }
  else if (explicitAppType) {
    frameworkName = resolveViteFrameworkProfile({ appType: explicitAppType, uniAppX: options.uniAppX }).frameworkName
  }
  else {
    const detected = resolveViteFrameworkProfile({ detectEnv: true, env: process.env, root, searchUp: false, uniAppX: options.uniAppX })
    frameworkName = detected.frameworkName
    appType = detected.appType
    if (frameworkName === 'generic' && platformFamily(selectedPlatform) !== 'web') {
      appType = resolveImplicitAppTypeFromViteRoot(root, { searchUp: false })
      frameworkName = resolveViteFrameworkProfile({ appType, uniAppX: options.uniAppX }).frameworkName
    }
  }

  const family = platformFamily(selectedPlatform ?? (config.build?.outDir ? path.basename(path.normalize(config.build.outDir)) : undefined))
  const shouldKeepFrameworkAppType = rawTarget !== 'web' && family !== 'web'
  if (!explicitAppType && !shouldKeepFrameworkAppType) {
    appType = undefined
  }
  const isGenericWeb = frameworkName === 'generic'
    && (forceGenericWeb || !explicitAppType)
    && rawTarget !== 'weapp'
    && family !== 'mini-program'
  const cssOnlyGenericWeb = isGenericWeb
    && (forceGenericWeb || (rawTarget === undefined && explicitAppType === undefined && selectedPlatform === undefined))
  const capability = isGenericWeb
    ? {
        ...createGenericWebViteCapabilityProfile(options),
        cssOnly: cssOnlyGenericWeb,
        sourceCandidates: options.generator && typeof options.generator === 'object' && options.generator.target === 'web'
          ? true
          : createGenericWebViteCapabilityProfile(options).sourceCandidates,
      }
    : {
        ...frameworkViteCapabilityProfile,
        frameworkName,
        generatorTarget: rawTarget,
        platformFamily: family,
      }
  capability.command = config.command
  capability.watch = config.build?.watch != null
  capability.ssr = Boolean(config.build?.ssr)
  capability.environmentName = environmentName
  return { frameworkName, appType, capability, isGenericWeb }
}

function emitDeferredRuntimeLogs(
  opts: ReturnType<typeof createCompilerContext>,
  profile: { isGenericWeb: boolean },
  rawOptions: UserDefinedOptions,
) {
  const hasExplicitLogLevel = Object.hasOwn(rawOptions, 'logLevel')
  if (!opts.tailwindRuntime || !Object.hasOwn(opts.tailwindRuntime, 'packageInfo')) {
    return
  }
  if (profile.isGenericWeb && !hasExplicitLogLevel) {
    // 成功的 Generic Web 构建默认不输出运行时 info。
    return
  }
  logTailwindcssTarget(opts.tailwindRuntime, opts.tailwindcssBasedir)
  logRuntimeTailwindcssVersion(
    opts.tailwindcssBasedir,
    opts.tailwindRuntime?.packageInfo?.rootPath,
    opts.tailwindRuntime?.packageInfo?.version,
  )
}

interface ViteFrameworkRegistration {
  readonly slots: readonly VitePluginSlot[]
  readonly create: typeof createGenericVitePlugins
}

const frameworkRegistry = {
  'generic': { slots: genericPluginSlots, create: createGenericVitePlugins },
  'taro': { slots: taroPluginSlots, create: createTaroVitePlugins },
  'uni-app': { slots: uniPluginSlots, create: createUniAppVitePlugins },
  'uni-app-x': { slots: uniXPluginSlots, create: createUniAppXVitePlugins },
  'weapp-vite': { slots: weappPluginSlots, create: createWeappVitePlugins },
} satisfies Record<ViteFrameworkName, ViteFrameworkRegistration>

/** Vite 完成配置解析后才创建选定框架的独立编译实例。 */
export function WeappTailwindcss(options: UserDefinedOptions = {}): WeappTailwindcssVitePlugin[] | undefined {
  if (resolvePluginDisabledState(options.disabled).plugin) {
    if (options.rewriteCssImports !== true) {
      return
    }
    return createDeferredVitePlugins([rewriteCssImportsSlot], (config, context) => createRewriteCssImportsPlugins({
      appType: resolveViteProfile(options, config, resolveEnvironmentName(context)).appType,
      shouldRewrite: true,
      weappTailwindcssDirPosix: slash(resolvePackageDir('weapp-tailwindcss')),
    }))
  }
  const forceGenericWeb = (options as UserDefinedOptions & { __internalViteForceGenericWeb?: boolean }).__internalViteForceGenericWeb === true
  const explicitFramework = resolveViteFrameworkProfile(options).frameworkName
  const selected = options.appType || explicitFramework !== 'generic'
    ? frameworkRegistry[explicitFramework].slots
    : undefined
  const candidates = forceGenericWeb
    ? webPluginSlots
    : selected ?? mergeVitePluginSlots([...Object.values(frameworkRegistry).map(entry => entry.slots), webPluginSlots])
  const slots = options.styleInjector ? candidates : candidates.filter(slot => !slot.name.includes('style-injector'))
  const plugins = createDeferredVitePlugins(slots, (config, context) => {
    const profile = resolveViteProfile(options, config, resolveEnvironmentName(context))
    const generator = profile.isGenericWeb && options.generator !== false
      ? { ...(typeof options.generator === 'object' ? options.generator : {}), target: profile.capability.generatorTarget ?? 'web' }
      : options.generator
    const opts = createCompilerContext({
      ...options,
      appType: profile.appType,
      tailwindcssBasedir: options.tailwindcssBasedir ?? config.root,
      generator,
      __internalDeferMissingCssEntriesWarning: true,
      __internalViteDeferRuntimeLogs: true,
    } as UserDefinedOptions)
    Object.assign(opts, {
      __internalViteRawOptions: options,
      __internalViteRawExplicitAppType: typeof options.appType === 'string' && options.appType.trim().length > 0,
      __internalViteRawExplicitTailwindcssBasedir: typeof options.tailwindcssBasedir === 'string' && options.tailwindcssBasedir.trim().length > 0,
      __internalViteRawExplicitGeneratorTarget: Boolean(options.generator && typeof options.generator === 'object' && Object.hasOwn(options.generator, 'target')),
      __internalViteCapabilityProfile: profile.capability,
    })
    emitDeferredRuntimeLogs(opts, profile, options)
    const factory = profile.capability.cssOnly ? createGenericWebVitePlugins : frameworkRegistry[profile.frameworkName].create
    return (factory(opts) ?? []) as Plugin[]
  })
  const post = plugins.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post')
  if (post) {
    post.config = createGenerationConfigHook({
      shouldOwnTailwindGeneration: options.generator !== false && options.disabled !== true && !(typeof options.disabled === 'object' && options.disabled.plugin === true),
      generatorPlaceholderCssFile: path.join(resolvePackageDir('weapp-tailwindcss'), 'generator-placeholder.css'),
      debug: createDebug(),
    })
  }
  return plugins
}
