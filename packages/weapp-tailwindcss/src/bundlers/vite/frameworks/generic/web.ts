import type { Plugin } from 'vite'
import type { InternalUserDefinedOptions, UserDefinedOptions } from '@/types'
import { createBuiltinViteWebStyleInjectorPlugins } from '@/style-injector/vite-web'
import { createGenericWebViteCapabilityProfile } from '../../capability-profile'
import { createCssOnlyVitePlugins } from '../../shared/create-css-only-plugins-runtime'
import { createViteSourceOutputRelationOwner, withViteSourceOutputRelationOwner } from '../../source-output-relations'

/** Generic Web CSS-only profile，供 `vite/web` 入口直接使用。 */
export function createGenericWebVitePlugins(options: UserDefinedOptions | InternalUserDefinedOptions = {}) {
  const capability = createGenericWebViteCapabilityProfile(options as UserDefinedOptions)
  const owner = createViteSourceOutputRelationOwner()
  const runtimeOptions = {
    ...options,
    __internalViteCapabilityProfile: capability,
    __internalViteWebStyleInjectorFactory: createBuiltinViteWebStyleInjectorPlugins,
  }
  const plugins = withViteSourceOutputRelationOwner(owner, () => createCssOnlyVitePlugins(runtimeOptions))
  if (!plugins) {
    owner.dispose()
    return undefined
  }
  return plugins.map((plugin) => {
    const wrapped: Plugin = { ...plugin }
    if (plugin.watchChange) {
      const hook = plugin.watchChange
      wrapped.watchChange = async function (id, change) {
        if (change?.event === 'delete') {
          owner.removeSource(id)
        }
        else if (typeof id === 'string') {
          owner.observeSource(id)
        }
        return typeof hook === 'function' ? hook.call(this, id, change) : hook.handler.call(this, id, change)
      }
    }
    if (plugin.handleHotUpdate) {
      const hook = plugin.handleHotUpdate
      wrapped.handleHotUpdate = async function (context) {
        const file = context.file
        if (typeof file === 'string') {
          owner.observeSource(file)
        }
        return typeof hook === 'function' ? hook.call(this, context) : hook.handler.call(this, context)
      }
    }
    if (plugin.closeBundle) {
      const hook = plugin.closeBundle
      wrapped.closeBundle = async function () {
        try {
          return typeof hook === 'function' ? await hook.call(this) : await hook.handler.call(this)
        }
        finally {
          owner.dispose()
        }
      }
    }
    return wrapped
  })
}
