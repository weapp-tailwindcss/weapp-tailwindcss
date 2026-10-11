import type { HmrContext, Plugin, ResolvedConfig } from 'vite'
import type { ViteFrameworkName } from '../../framework-selector'
import type { createViteRuntimeClassSet } from '../runtime-class-set'
import type { ViteHmrCssModuleVersionTracker } from './framework-hmr-module-version'
import type { ViteFrameworkCssPipelineStrategy, ViteFrameworkExtraPluginPlatform, ViteFrameworkRuntimeFeatureContext } from './framework-strategy'
import type { getCompilerContext } from '@/context'
import type { toCustomAttributesEntities } from '@/context/custom-attributes'
import type { ViteStyleInjectorDelegateFactory } from '@/style-injector/internal'
import type { InternalUserDefinedOptions, UserDefinedOptions } from '@/types'
import {
  createViteSourceOutputRelationOwner,
  withViteSourceOutputRelationOwner,
} from '../source-output-relations'
import { createViteFrameworkPlugins as createRuntimeViteFrameworkPlugins } from './create-framework-plugins-runtime'

export interface WeappTailwindcssVitePlugin {
  name: string
  [hook: string]: any
}

export interface ViteFrameworkBranchContext {
  frameworkName: ViteFrameworkName
  adaptWatchCssBeforeFrameworkCache?: boolean
  createExtraPlugins?: (context: ViteFrameworkExtraPluginContext) => Plugin[]
  cssPipelineStrategy?: ViteFrameworkCssPipelineStrategy
  getExtraPluginPlatform?: () => ViteFrameworkExtraPluginPlatform
  styleInjectorDelegate: ViteStyleInjectorDelegateFactory
  isRuntimeClassSetFeatureEnabled?: (context: ViteFrameworkRuntimeFeatureContext) => boolean
  sourceCandidatesBeforeExtraPlugin?: (plugin: Plugin) => boolean
}

export interface ViteFrameworkExtraPluginContext {
  cssPreflight: InternalUserDefinedOptions['cssPreflight']
  cssPreflightRange: InternalUserDefinedOptions['cssPreflightRange']
  customAttributesEntities: ReturnType<typeof toCustomAttributesEntities>
  disabledDefaultTemplateHandler: boolean | undefined
  ensureRuntimeClassSet: (...args: any[]) => Promise<Set<string>>
  generateCss: (...args: any[]) => Promise<string | undefined>
  getResolvedConfig: () => ResolvedConfig | undefined
  hmrCssModuleVersions: ViteHmrCssModuleVersionTracker
  isEnabled: () => boolean
  isIosPlatform: boolean
  isNativeAppStyleTarget: () => boolean
  isWebGeneratorTarget: () => boolean
  jsHandler: ReturnType<typeof getCompilerContext>['jsHandler']
  mainCssChunkMatcher: ReturnType<typeof getCompilerContext>['mainCssChunkMatcher']
  registerModuleGraphCandidates: (id: string, source: string) => Promise<Set<string>>
  runtimeState: ReturnType<typeof createViteRuntimeClassSet>['runtimeState']
  styleHandler: ReturnType<typeof getCompilerContext>['styleHandler']
  syncSourceCandidatesForHotUpdate: (ctx: HmrContext) => Promise<void>
  tailwindRootCssModuleIds: Set<string>
  uniAppX: ReturnType<typeof getCompilerContext>['uniAppX']
  viteProcessedCssSourceFiles: Iterable<string>
  webCssEntryDiagnostics: {
    dispose: () => void
    flush: () => void
    observeSourceImports: (source: string, sourceId: string) => void
    requestCheck: () => void
  }
}

function wrapPluginHook(
  hook: unknown,
  before: (...args: any[]) => void,
) {
  if (typeof hook === 'function') {
    return function wrappedHook(this: unknown, ...args: any[]) {
      before(...args)
      return hook.apply(this, args)
    }
  }
  if (hook && typeof hook === 'object' && 'handler' in hook && typeof hook.handler === 'function') {
    const handler = hook.handler
    return {
      ...hook,
      handler(this: unknown, ...args: any[]) {
        before(...args)
        return handler.apply(this, args)
      },
    }
  }
  return hook
}

function wrapPluginCloseBundle(hook: unknown, dispose: () => void) {
  if (typeof hook === 'function') {
    return async function wrappedCloseBundle(this: unknown, ...args: any[]) {
      try {
        return await hook.apply(this, args)
      }
      finally {
        dispose.call(this)
      }
    }
  }
  if (hook && typeof hook === 'object' && 'handler' in hook && typeof hook.handler === 'function') {
    const handler = hook.handler
    return {
      ...hook,
      async handler(this: unknown, ...args: any[]) {
        try {
          return await handler.apply(this, args)
        }
        finally {
          dispose.call(this)
        }
      },
    }
  }
  return dispose
}

export function createViteFrameworkPlugins(
  options: UserDefinedOptions | InternalUserDefinedOptions = {},
  frameworkBranch: ViteFrameworkBranchContext,
): WeappTailwindcssVitePlugin[] | undefined {
  const relationOwner = createViteSourceOutputRelationOwner()
  const plugins = withViteSourceOutputRelationOwner(
    relationOwner,
    () => createRuntimeViteFrameworkPlugins(options, frameworkBranch),
  )
  if (!plugins) {
    relationOwner.dispose()
    return undefined
  }
  const wrappedPlugins = plugins.map((plugin: WeappTailwindcssVitePlugin) => ({
    ...plugin,
    watchChange: wrapPluginHook(plugin['watchChange'], (id: string, change: { event?: string } | undefined) => {
      if (change?.event === 'delete') {
        relationOwner.removeSource(id)
      }
      else {
        relationOwner.observeSource(id)
      }
    }),
    handleHotUpdate: wrapPluginHook(plugin['handleHotUpdate'], (context: { file?: string } | undefined) => {
      if (context?.file) {
        relationOwner.observeSource(context.file)
      }
    }),
  }))
  const cleanupPlugin = wrappedPlugins.at(-1)
  if (cleanupPlugin) {
    cleanupPlugin.closeBundle = wrapPluginCloseBundle(cleanupPlugin.closeBundle, function (this: { meta?: { watchMode?: boolean } }) {
      if (!this.meta?.watchMode) {
        relationOwner.dispose()
      }
    })
    cleanupPlugin.closeWatcher = wrapPluginCloseBundle(cleanupPlugin.closeWatcher, relationOwner.dispose)
  }
  return wrappedPlugins
}
