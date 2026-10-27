import type { Plugin } from 'vite'
import type { ViteFrameworkAssetPipelineStrategy } from './framework-asset-strategy'
import type { ViteFrameworkRuntimeStrategy } from './framework-runtime-strategy'
import type { ViteFrameworkExtraPluginContext } from './framework-services'
import type { ViteFrameworkCssPipelineStrategy } from './framework-strategy'
import type { ViteStyleInjectorDelegateFactory } from '@/style-injector/types'
import type { InternalUserDefinedOptions, UserDefinedOptions } from '@/types'
import {
  createViteSourceOutputRelationOwner,
  withViteSourceOutputRelationOwner,
} from '../source-output-relations'
import { createViteFrameworkPlugins as createRuntimeViteFrameworkPlugins } from './create-framework-plugins-runtime'

export type { ViteFrameworkExtraPluginContext } from './framework-services'

export interface WeappTailwindcssVitePlugin {
  name: string
  [hook: string]: any
}

export interface ViteFrameworkBranchContext {
  /** 仅用于诊断；受支持的框架身份由公开入口注册表约束。 */
  readonly frameworkName: string
  createAssetPipeline?: () => ViteFrameworkAssetPipelineStrategy
  runtimeStrategy?: ViteFrameworkRuntimeStrategy
  adaptWatchCssBeforeFrameworkCache?: boolean
  createExtraPlugins?: (context: ViteFrameworkExtraPluginContext) => Plugin[]
  cssPipelineStrategy?: ViteFrameworkCssPipelineStrategy
  styleInjectorDelegate: ViteStyleInjectorDelegateFactory
  isRuntimeClassSetFeatureEnabled?: () => boolean
  sourceCandidatesBeforeExtraPlugin?: (plugin: Plugin) => boolean
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

export function createViteFrameworkPlugins(
  options: UserDefinedOptions | InternalUserDefinedOptions = {},
  frameworkBranch: ViteFrameworkBranchContext,
): WeappTailwindcssVitePlugin[] | undefined {
  const relationOwner = createViteSourceOutputRelationOwner()
  const plugins = withViteSourceOutputRelationOwner(
    relationOwner,
    () => createRuntimeViteFrameworkPlugins(options, frameworkBranch, relationOwner.dispose),
  )
  if (!plugins) {
    relationOwner.dispose()
    return undefined
  }
  // 本轮新建的插件保持身份，保留内部清理桥和非枚举的 api getter。
  const wrappedPlugins = plugins.map((plugin: WeappTailwindcssVitePlugin) => Object.assign(plugin, {
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
  return wrappedPlugins
}
