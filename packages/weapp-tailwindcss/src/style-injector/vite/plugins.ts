import type { Plugin } from 'vite'

export function toPluginArray(pluginOrPlugins: Plugin | Plugin[] | undefined): Plugin[] {
  return pluginOrPlugins ? (Array.isArray(pluginOrPlugins) ? pluginOrPlugins : [pluginOrPlugins]) : []
}
