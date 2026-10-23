import type { Plugin, ResolvedConfig } from 'vite'
import type { WeappTailwindcssStyleInjectorUserOptions } from '../options'
import type { ViteStyleInjectorDelegateFactory } from '../types'
import { getViteHookHandler } from '@/bundlers/vite/plugin-hook'
import { normalizeStyleInjectorOptions } from '../options'

type ViteBuildStart = Extract<Plugin['buildStart'], (...args: never[]) => unknown>

export function createBuiltinViteStyleInjectorPlugins(
  options: WeappTailwindcssStyleInjectorUserOptions | undefined,
  getDelegateFactory: () => ViteStyleInjectorDelegateFactory,
): Plugin[] {
  const normalized = normalizeStyleInjectorOptions(options)
  if (!normalized) {
    return []
  }

  let configuration: { config: ResolvedConfig, context: ThisParameterType<Extract<Plugin['configResolved'], (...args: never[]) => unknown>> } | undefined
  let delegates: Plugin[] | undefined
  let delegatesConfigured = false
  let delegatesBuildStarted = false

  const resolveDelegates = () => {
    if (delegates) {
      return delegates
    }
    delegates = getDelegateFactory()(normalized)
    return delegates
  }

  const configureDelegates = async () => {
    if (delegatesConfigured || !configuration) {
      return
    }
    delegatesConfigured = true
    for (const plugin of resolveDelegates()) {
      await getViteHookHandler(plugin.configResolved)?.call(configuration.context, configuration.config)
    }
  }

  const startDelegates = async (context: ThisParameterType<ViteBuildStart>, buildOptions: Parameters<ViteBuildStart>[0]) => {
    if (delegatesBuildStarted) {
      return
    }
    await configureDelegates()
    delegatesBuildStarted = true
    for (const plugin of resolveDelegates()) {
      await getViteHookHandler(plugin.buildStart)?.call(context, buildOptions)
    }
  }

  return [
    {
      name: 'weapp-tailwindcss:style-injector-pre',
      apply: 'build',
      enforce: 'pre',
      configResolved(resolvedConfig) {
        configuration = { config: resolvedConfig, context: this }
      },
      async buildStart(buildOptions) {
        await startDelegates(this, buildOptions)
      },
      async load(id, options) {
        await configureDelegates()
        for (const plugin of resolveDelegates()) {
          const handler = getViteHookHandler(plugin.load)
          if (!handler) {
            continue
          }
          const result = await handler.call(this, id, options)
          if (result != null) {
            return result
          }
        }
      },
      async transform(code, id, options) {
        await configureDelegates()
        let currentCode = code
        let changed = false
        for (const plugin of resolveDelegates()) {
          const handler = getViteHookHandler(plugin.transform)
          if (!handler) {
            continue
          }
          const result = await handler.call(this, currentCode, id, options)
          if (!result) {
            continue
          }
          if (typeof result === 'string') {
            currentCode = result
            changed = true
          }
          else if (typeof result === 'object' && typeof result.code === 'string') {
            currentCode = result.code
            changed = true
          }
        }
        if (changed) {
          return {
            code: currentCode,
            map: null,
          }
        }
      },
    },
    {
      name: 'weapp-tailwindcss:style-injector',
      apply: 'build',
      enforce: 'post',
      configResolved(resolvedConfig) {
        configuration = { config: resolvedConfig, context: this }
      },
      async generateBundle(outputOptions, bundle, isWrite) {
        await configureDelegates()
        for (const plugin of resolveDelegates()) {
          const handler = getViteHookHandler(plugin.generateBundle)
          if (!handler) {
            continue
          }
          await handler.call(this, outputOptions, bundle, isWrite)
        }
      },
    },
  ]
}
