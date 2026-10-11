import type { Plugin, ResolvedConfig } from 'vite'
import type { ViteCapabilityProfile } from './capability-profile'
import type { WeappTailwindcssVitePlugin } from './shared/create-framework-plugins'
import type { UserDefinedOptions } from '@/types'
import path from 'node:path'
import process from 'node:process'
import { logger } from '@weapp-tailwindcss/logger'
import { getCompilerContext } from '@/context'
import { logRuntimeTailwindcssVersion } from '@/tailwindcss/runtime-logs'
import { logTailwindcssTarget } from '@/tailwindcss/targets'
import { resolveViteFrameworkProfile } from '../framework-selector'
import { createGenericWebViteCapabilityProfile, frameworkViteCapabilityProfile } from './capability-profile'
import { createGenericVitePlugins } from './frameworks/generic'
import { createGenericWebVitePlugins } from './frameworks/generic/web'
import { createTaroVitePlugins } from './frameworks/taro'
import { createUniAppVitePlugins } from './frameworks/uni-app'
import { createUniAppXVitePlugins } from './frameworks/uni-app-x'
import { createWeappVitePlugins } from './frameworks/weapp-vite'
import { resolveImplicitAppTypeFromViteRoot } from './resolve-app-type'
import { createConfigScopedPlugins } from './shared/config-scoped-plugins'

export type { WeappTailwindcssVitePlugin } from './shared/create-framework-plugins'

type HookName = 'config' | 'configResolved' | 'buildStart' | 'buildEnd' | 'resolveId' | 'load' | 'transform'
  | 'configureServer' | 'handleHotUpdate' | 'watchChange' | 'generateBundle' | 'writeBundle' | 'closeBundle' | 'closeWatcher' | 'moduleParsed' | 'shouldTransformCachedModule'

const hookNames: HookName[] = [
  'config',
  'configResolved',
  'buildStart',
  'buildEnd',
  'resolveId',
  'load',
  'transform',
  'configureServer',
  'handleHotUpdate',
  'watchChange',
  'generateBundle',
  'writeBundle',
  'closeBundle',
  'closeWatcher',
  'moduleParsed',
  'shouldTransformCachedModule',
]

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

function invokeHook(plugin: Plugin | undefined, hookName: HookName, thisArg: unknown, args: unknown[]) {
  const hook = plugin?.[hookName]
  if (typeof hook === 'function') {
    return Reflect.apply(hook, thisArg, args)
  }
  if (hook && typeof hook === 'object' && 'handler' in hook && typeof hook.handler === 'function') {
    return Reflect.apply(hook.handler, thisArg, args)
  }
  return undefined
}

function emitDeferredRuntimeLogs(
  opts: ReturnType<typeof getCompilerContext>,
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

function createDispatcher(options: UserDefinedOptions): WeappTailwindcssVitePlugin[] | undefined {
  const opts = getCompilerContext({ ...options, __internalDeferMissingCssEntriesWarning: true, __internalViteDeferRuntimeLogs: true } as UserDefinedOptions)
  ;(opts as any).__internalViteRawOptions = options
  ;(opts as any).__internalViteRawExplicitAppType = typeof options.appType === 'string' && options.appType.trim().length > 0
  ;(opts as any).__internalViteRawExplicitTailwindcssBasedir = typeof options.tailwindcssBasedir === 'string' && options.tailwindcssBasedir.trim().length > 0
  ;(opts as any).__internalViteRawExplicitGeneratorTarget = Boolean(options.generator && typeof options.generator === 'object' && Object.hasOwn(options.generator, 'target'))

  // 显式 basedir 是可信的项目边界，可在工厂阶段避免重复构造 runtime；其余情况等待真实 Vite root。
  const forceGenericWeb = (options as UserDefinedOptions & { __internalViteForceGenericWeb?: boolean }).__internalViteForceGenericWeb === true
  const initialProfile = resolveViteFrameworkProfile({
    appType: forceGenericWeb ? undefined : opts.appType,
    detectEnv: true,
    env: process.env,
    root: typeof options.tailwindcssBasedir === 'string' && options.tailwindcssBasedir.trim().length > 0
      ? path.resolve(options.tailwindcssBasedir)
      : undefined,
    searchUp: false,
    uniAppX: opts.uniAppX,
  })
  const initialFramework = forceGenericWeb ? 'generic' : initialProfile.frameworkName
  ;(opts as any).__internalViteCapabilityProfile = forceGenericWeb
    ? createGenericWebViteCapabilityProfile(options)
    : { ...frameworkViteCapabilityProfile }
  const initialFactory = {
    'generic': createGenericVitePlugins,
    'taro': createTaroVitePlugins,
    'uni-app': createUniAppVitePlugins,
    'uni-app-x': createUniAppXVitePlugins,
    'weapp-vite': createWeappVitePlugins,
  }[initialFramework]
  const initialPlugins = initialFactory(opts)
  if (!initialPlugins) {
    return undefined
  }
  if ((opts as any).__internalViteRawExplicitTailwindcssBasedir && initialFramework !== 'generic') {
    // 显式 basedir 已给出可信项目边界，保留原 framework 链路的 hook 身份与调用开销。
    emitDeferredRuntimeLogs(opts, { isGenericWeb: false }, options)
    return initialPlugins
  }
  const knownFrameworkPlugins: Plugin[] = [
    {
      name: 'weapp-tailwindcss:taro-alipay-browserslist-asset',
      enforce: 'pre',
      generateBundle() {},
    },
    {
      name: 'weapp-tailwindcss:uni-app-x:css:pre',
      enforce: 'pre',
      transform() {},
    },
    {
      name: 'weapp-tailwindcss:uni-app-x:css',
      transform() {},
    },
    {
      name: 'weapp-tailwindcss:uni-app-x:nvue',
      enforce: 'pre',
      buildStart() {},
      transform: { order: 'pre', handler() {} },
      handleHotUpdate: { order: 'post', handler() {} },
      watchChange() {},
    },
    {
      name: 'weapp-tailwindcss:uni-app-x:style-placeholder',
      enforce: 'post',
      generateBundle: { order: 'post', handler() {} },
    },
  ]
  const initialNames = new Set(initialPlugins.map(plugin => plugin.name))
  const genericWebPlugins = initialFramework === 'generic' && !forceGenericWeb && !opts.appType
    ? (createGenericWebVitePlugins(opts) ?? [])
    : []
  const pluginTemplates = [
    ...initialPlugins,
    ...genericWebPlugins,
    ...(initialFramework === 'generic' && !forceGenericWeb && !opts.appType && initialPlugins.length > 1
      ? knownFrameworkPlugins.filter(plugin => !initialNames.has(plugin.name))
      : []),
  ].filter((plugin, index, plugins) => plugins.findIndex(candidate => candidate.name === plugin.name) === index)
  let activePlugins = initialPlugins as Plugin[]
  let resolved = false

  const ensureBranch = (config: ResolvedConfig, context: unknown) => {
    if (resolved) {
      return
    }
    resolved = true
    const environmentName = resolveEnvironmentName(context)
    const effectiveGenerator = options.generator ?? opts.generator
    const effectiveAppType = options.appType
      ?? (effectiveGenerator && typeof effectiveGenerator === 'object' && effectiveGenerator.target === 'web' ? undefined : opts.appType)
    const profile = resolveViteProfile({ ...options, appType: effectiveAppType, generator: effectiveGenerator, platform: options.platform ?? opts.platform, cssOptions: options.cssOptions ?? opts.cssOptions, uniAppX: options.uniAppX ?? opts.uniAppX }, config, environmentName)
    emitDeferredRuntimeLogs(opts, profile, options)
    if (profile.appType
      && profile.appType !== initialProfile.appType
      && !options.appType
      && effectiveAppType === undefined) {
      opts.appType = profile.appType
      logger.debug('根据 Vite 项目根目录自动推断 appType -> %s', profile.appType)
    }
    if (profile.isGenericWeb
      && (opts.generator === undefined || (typeof opts.generator === 'object' && !Object.hasOwn(opts.generator, 'target')))
      && !options.platform
      && !options.cssOptions?.platform
      && !process.env['UNI_PLATFORM']
      && !process.env['UNI_UTS_PLATFORM']) {
      opts.generator = { target: 'web' }
    }
    const capability = (opts as any).__internalViteCapabilityProfile as ViteCapabilityProfile | undefined
    if (capability) {
      Object.assign(capability, profile.capability)
    }
    else {
      ;(opts as any).__internalViteCapabilityProfile = profile.capability
    }
    const factory = profile.capability.cssOnly
      ? createGenericWebVitePlugins
      : {
          'generic': createGenericVitePlugins,
          'taro': createTaroVitePlugins,
          'uni-app': createUniAppVitePlugins,
          'uni-app-x': createUniAppXVitePlugins,
          'weapp-vite': createWeappVitePlugins,
        }[profile.frameworkName]
    if (profile.frameworkName !== initialFramework || profile.capability.cssOnly) {
      activePlugins = (factory(opts) ?? []) as Plugin[]
    }
  }

  const byName = (name: string | undefined) => activePlugins.find(plugin => plugin.name === name)
  return pluginTemplates.map((template) => {
    const proxy: any = { ...template }
    for (const hookName of hookNames) {
      if (!(hookName in template)) {
        continue
      }
      const originalHook = template[hookName]
      const handler = function (this: unknown, ...args: unknown[]) {
        if (hookName === 'configResolved') {
          ensureBranch(args[0] as ResolvedConfig, this)
        }
        return invokeHook(byName(template.name), hookName, this, args)
      }
      proxy[hookName] = originalHook && typeof originalHook === 'object'
        ? { ...originalHook, handler }
        : handler
    }
    return proxy
  })
}

/** Vite 单一入口。框架分支在 Vite 完成配置解析后选择，保持原有导入和注册方式。 */
export function WeappTailwindcss(options: UserDefinedOptions = {}): WeappTailwindcssVitePlugin[] | undefined {
  return createConfigScopedPlugins(() => createDispatcher(options))
}
