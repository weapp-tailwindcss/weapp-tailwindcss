import type { ClientModule, HtmlTagObject, LoadContext, Plugin } from '@docusaurus/types'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { loadSiteConfig } from '@docusaurus/core/lib/server/config'
import { build } from 'esbuild'

export type AnalyticsFixtureWindow = Window & typeof globalThis & {
  analyticsFixtureModules: ClientModule[]
  analyticsFixtureCalls: unknown[][]
  analyticsFixtureBusinessReady: boolean
  dataLayer: IArguments[]
}

const websiteRoot = path.resolve(__dirname, '../..')
const websiteRequire = createRequire(path.join(websiteRoot, 'package.json'))
const presetRequire = createRequire(websiteRequire.resolve('@docusaurus/preset-classic/package.json'))

function renderTag({ tagName, attributes = {}, innerHTML = '' }: HtmlTagObject) {
  const attrs = Object.entries(attributes).map(([key, value]) => value === true
    ? key
    : `${key}="${String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`).join(' ')
  return `<${tagName} ${attrs}>${innerHTML}${tagName === 'link' || tagName === 'meta' ? '' : `</${tagName}>`}`
}

/** 使用实际站点配置与客户端入口；旧 preset 的标签也经官方实现生成，避免遗漏旁路。 */
export async function createAnalyticsFixture(canonicalUrl?: string, mode = 'production') {
  const previousMode = process.env.NODE_ENV
  process.env.NODE_ENV = mode
  try {
    const { siteConfig: config } = await loadSiteConfig({ siteDir: websiteRoot })
    const headTags = [...(config.headTags ?? [])]
    for (const preset of config.presets ?? []) {
      if (!Array.isArray(preset) || preset[0] !== 'classic') {
        continue
      }
      const options = preset[1] as { gtag?: { trackingID: string | string[], anonymizeIP?: boolean } }
      if (options.gtag) {
        const factory = presetRequire('@docusaurus/plugin-google-gtag').default as (context: LoadContext, options: object) => Plugin
        const gtag = factory({} as LoadContext, {
          ...options.gtag,
          trackingID: [options.gtag.trackingID].flat(),
        })
        const injected = gtag.injectHtmlTags?.({ content: undefined })?.headTags
        if (Array.isArray(injected)) {
          headTags.push(...injected.filter((tag): tag is HtmlTagObject => typeof tag !== 'string'))
        }
      }
    }
    for (const script of config.scripts ?? []) {
      headTags.push({ tagName: 'script', attributes: typeof script === 'string' ? { src: script } : script })
    }
    const source = `
      ${(config.clientModules ?? []).map((entry, index) => `import * as client${index} from ${JSON.stringify(path.resolve(websiteRoot, entry))};`).join('\n')}
      if (typeof window !== 'undefined') {
        window.analyticsFixtureModules = [${(config.clientModules ?? []).map((_, index) => `client${index}`).join(',')}];
      }
    `
    const url = canonicalUrl ?? config.url
    const result = await build({
      stdin: { contents: source, resolveDir: websiteRoot, loader: 'ts' },
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      target: 'es2022',
      define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
      plugins: [{
        name: 'analytics-fixture-site-config',
        setup(builder) {
          builder.onResolve({ filter: /^@generated\/docusaurus\.config$/ }, () => ({ path: 'site-config', namespace: 'analytics-fixture' }))
          builder.onLoad({ filter: /.*/, namespace: 'analytics-fixture' }, () => ({ contents: `export default ${JSON.stringify({ url })}` }))
        },
      }],
    })
    const runtime = result.outputFiles[0].text
    return {
      url,
      runtime,
      html: `<!doctype html><html><head><meta charset="utf-8"><title>初始页面</title>${headTags.map(renderTag).join('')}</head><body>
        <script src="https://business.example.test/runtime.js"></script><script>${runtime}</script>
        <button id="route">切换页面</button></body></html>`,
    }
  }
  finally {
    if (previousMode === undefined) {
      delete process.env.NODE_ENV
    }
    else {
      process.env.NODE_ENV = previousMode
    }
  }
}

export const googleFixtureScript = `
  window.analyticsFixtureCalls = [];
  let pagePath = location.pathname + location.search + location.hash;
  function record(args) {
    const values = Array.from(args);
    window.analyticsFixtureCalls.push(values);
    if (values[0] === 'set' && values[1] === 'page_path') pagePath = values[2];
    if (values[0] === 'config' || (values[0] === 'event' && values[1] === 'page_view')) {
      fetch('https://www.google-analytics.com/g/collect?path=' + encodeURIComponent(pagePath) + '&title=' + encodeURIComponent(document.title), {mode: 'no-cors'});
    }
  }
  window.dataLayer.forEach(record);
  window.dataLayer.push = function(...items) {
    items.forEach(record);
    return Array.prototype.push.apply(this, items);
  };
`
