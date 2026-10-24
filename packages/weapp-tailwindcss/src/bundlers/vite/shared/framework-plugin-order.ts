import type { Plugin } from 'vite'

export function orderFrameworkSourceCandidatePlugins(
  extraPlugins: Plugin[],
  rewritePlugins: Plugin[],
  sourceCandidatesPlugin: Plugin,
  beforeExtraPlugin?: (plugin: Plugin) => boolean,
) {
  const anchor = beforeExtraPlugin ? extraPlugins.findIndex(beforeExtraPlugin) : -1
  if (anchor < 0) {
    return [...extraPlugins, ...rewritePlugins, sourceCandidatesPlugin]
  }
  return [
    ...extraPlugins.slice(0, anchor),
    ...rewritePlugins,
    sourceCandidatesPlugin,
    ...extraPlugins.slice(anchor),
  ]
}

/** 先提交框架专属资产，再执行具有 post 元数据的生成与收尾阶段。 */
export function insertFrameworkAssetPlugins(plugins: Plugin[], assetPlugins: Plugin[]) {
  const outputIndex = plugins.findIndex(plugin => typeof plugin.generateBundle === 'object' && plugin.generateBundle.order === 'post')
  plugins.splice(outputIndex < 0 ? plugins.length : outputIndex, 0, ...assetPlugins)
}
