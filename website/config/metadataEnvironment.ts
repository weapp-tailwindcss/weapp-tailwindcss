import type { LoadContext, Plugin } from '@docusaurus/types'

/** 在构建图中固化 canonical 来源，使 SSR 与浏览器 hydration 使用同一个值。 */
export default function metadataEnvironment({ siteConfig }: LoadContext) {
  return {
    name: 'website-metadata-environment',
    configureWebpack(_config, _isServer, { currentBundler }) {
      return {
        plugins: [new currentBundler.instance.DefinePlugin({ 'globalThis.process.env.SITE_URL': JSON.stringify(siteConfig.url) })],
      }
    },
  } satisfies Plugin
}
