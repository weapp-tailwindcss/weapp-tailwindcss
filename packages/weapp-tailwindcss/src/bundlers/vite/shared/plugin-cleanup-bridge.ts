import type { Plugin, ResolvedConfig } from 'vite'

export type VitePluginClosingHook = 'closeBundle' | 'closeWatcher'
export type VitePluginOwnership = 'owner' | 'child' | 'standalone'
type ProxyCleanup = (config: ResolvedConfig, hook: VitePluginClosingHook) => Promise<unknown> | undefined

// 父级协调者可以清理未成功绑定的内层实例，不把内部释放入口放到公开 plugin.api。
const bridges = new WeakMap<Plugin, { cleanup: ProxyCleanup, claim: () => void }>()

export function registerVitePluginCleanup(plugins: readonly Plugin[], cleanup: ProxyCleanup, claim: () => void) {
  for (const plugin of plugins) {
    bridges.set(plugin, { cleanup, claim })
  }
}

export function claimVitePluginCleanup(plugin: Plugin) {
  bridges.get(plugin)?.claim()
}

export function getVitePluginCleanup(plugin: Plugin) {
  return bridges.get(plugin)?.cleanup
}
