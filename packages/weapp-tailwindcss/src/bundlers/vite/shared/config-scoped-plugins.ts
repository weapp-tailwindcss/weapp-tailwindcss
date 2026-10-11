import type { ResolvedConfig } from 'vite'

/** 同一插件配置可用于多次 build；每个 resolved config 必须拥有独立的可释放状态。 */
export function createConfigScopedPlugins<T extends { name: string, [key: string]: any }>(create: () => T[] | undefined): T[] | undefined {
  const initial = create()
  if (!initial) {
    return undefined
  }
  const byConfig = new WeakMap<ResolvedConfig, T[]>()
  let active = initial
  let initialized = false

  return initial.map((template) => {
    const proxy = { ...template }
    for (const [key, hook] of Object.entries(template)) {
      if (key === 'apply' || key === 'api') {
        continue
      }
      const callback = typeof hook === 'function' ? hook : hook?.handler
      if (typeof callback !== 'function') {
        continue
      }
      const handler = function (this: { environment?: { config?: ResolvedConfig } } | undefined, ...args: any[]) {
        if (key === 'configResolved') {
          const config = args[0] as ResolvedConfig
          let plugins = byConfig.get(config)
          if (!plugins) {
            plugins = initialized ? create() ?? [] : initial
            initialized = true
            byConfig.set(config, plugins)
          }
          active = plugins
        }
        const config = this?.environment?.config
        const plugins = config ? byConfig.get(config) ?? active : active
        const selected = plugins.find(plugin => plugin.name === template.name)?.[key]
        const run = typeof selected === 'function' ? selected : selected?.handler
        return run?.apply(this, args)
      }
      Object.assign(proxy, { [key]: typeof hook === 'function' ? handler : { ...hook, handler } })
    }
    return proxy
  })
}
