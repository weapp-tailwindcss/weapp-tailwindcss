import type { ResolvedConfig } from 'vite'
import type { ViteFrameworkRuntimeFacts } from './framework-runtime-strategy'

/** 配置钩子可继续修改 mode 与插件列表；读取时核对事实，未变化时复用快照。 */
export function createViteFrameworkRuntimeFacts(getResolvedConfig: () => ResolvedConfig | undefined) {
  let snapshot: ViteFrameworkRuntimeFacts | undefined
  return (): ViteFrameworkRuntimeFacts | undefined => {
    const config = getResolvedConfig()
    if (!config) {
      snapshot = undefined
      return undefined
    }
    const mode = config.mode
    const plugins = config.plugins
    if (snapshot !== undefined && snapshot.mode === mode
      && snapshot.pluginNames.length === (plugins?.length ?? 0)
      && (plugins?.every((plugin, index) => plugin.name === snapshot!.pluginNames[index]) ?? true)) {
      return snapshot
    }
    snapshot = Object.freeze({
      mode,
      pluginNames: Object.freeze(plugins?.map(plugin => plugin.name) ?? []),
    })
    return snapshot
  }
}
