import type { Plugin } from 'vite'
import type { InternalUserDefinedOptions, UserDefinedOptions } from '@/types'
import { createBuiltinViteWebStyleInjectorPlugins } from '@/style-injector/vite-web'
import { createGenericWebViteCapabilityProfile } from '../../capability-profile'
import { createCssOnlyVitePlugins } from '../../shared/create-css-only-plugins-runtime'
import { createViteSourceOutputRelationOwner, withViteSourceOutputRelationOwner } from '../../source-output-relations'
import { genericViteRuntimeStrategy } from './runtime-strategy'

/** Generic Web CSS-only profile，供 `vite/web` 入口直接使用。 */
export function createGenericWebVitePlugins(options: UserDefinedOptions | InternalUserDefinedOptions = {}) {
  const capability = createGenericWebViteCapabilityProfile(options as UserDefinedOptions)
  const owner = createViteSourceOutputRelationOwner()
  const runtimeOptions = {
    ...options,
    __internalViteCapabilityProfile: capability,
    __internalViteWebStyleInjectorFactory: createBuiltinViteWebStyleInjectorPlugins,
  }
  const plugins = withViteSourceOutputRelationOwner(owner, () => createCssOnlyVitePlugins(runtimeOptions, genericViteRuntimeStrategy, owner.dispose))
  if (!plugins) {
    owner.dispose()
    return undefined
  }
  return plugins.map((plugin) => {
    // 插件由本轮工厂创建，包装钩子时保留清理桥与属性描述符。
    const wrapped: Plugin = plugin
    if (plugin.watchChange) {
      const hook = plugin.watchChange
      const handler: Extract<Plugin['watchChange'], (...args: any[]) => any> = function (id, change) {
        if (change?.event === 'delete') {
          owner.removeSource(id)
        }
        else if (typeof id === 'string') {
          owner.observeSource(id)
        }
        return typeof hook === 'function' ? hook.call(this, id, change) : hook.handler.call(this, id, change)
      }
      wrapped.watchChange = typeof hook === 'function' ? handler : { ...hook, handler }
    }
    if (plugin.handleHotUpdate) {
      const hook = plugin.handleHotUpdate
      const handler: Extract<Plugin['handleHotUpdate'], (...args: any[]) => any> = function (context) {
        const file = context.file
        if (typeof file === 'string') {
          owner.observeSource(file)
        }
        return typeof hook === 'function' ? hook.call(this, context) : hook.handler.call(this, context)
      }
      wrapped.handleHotUpdate = typeof hook === 'function' ? handler : { ...hook, handler }
    }
    return wrapped
  })
}
