import type { AcceptedPlugin, Plugin } from 'postcss'
import postcss from 'postcss'

/** 完成作者插件的全部 visitor 后再进入平台适配，避免 calc 读取中间态。 */
export function createUserPluginStage(plugins: AcceptedPlugin[]): Plugin {
  const processor = postcss(plugins)
  return {
    postcssPlugin: 'weapp-tailwindcss-author-stage',
    async Once(root, { result }) {
      const processed = await processor.process(root, { ...result.opts, map: false }).async()
      result.messages.push(...processed.messages)
      // 内层遍历的完成标记不能跨处理器复用，外层仍需处理根及全部子节点。
      root.markDirty()
      root.walk(node => node.markDirty())
    },
  }
}
