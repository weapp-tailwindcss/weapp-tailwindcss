import type { Plugin } from 'postcss'

const purePreparations = new WeakMap<NonNullable<Plugin['prepare']>, string>()

/** 仅由包内无外部状态的插件登记；不根据第三方插件名称推断可缓存性。 */
export function registerPurePluginPreparation(name: string, prepare: NonNullable<Plugin['prepare']>) {
  purePreparations.set(prepare, name)
}

export function isKnownPurePostcssPlugin(value: unknown) {
  if (!value || typeof value !== 'object') {
    return false
  }
  const plugin = value as Plugin
  const prototype = Object.getPrototypeOf(value)
  return typeof plugin.prepare === 'function'
    && (prototype === Object.prototype || prototype === null)
    && purePreparations.get(plugin.prepare) === plugin.postcssPlugin
    && Reflect.ownKeys(plugin).every(key => key === 'postcssPlugin' || key === 'prepare')
}
