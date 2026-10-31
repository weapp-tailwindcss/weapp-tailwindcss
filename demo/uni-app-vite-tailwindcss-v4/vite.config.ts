import { defineConfig, type Plugin } from "vite";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// dynamic require of is not supported
// const uni = require("@dcloudio/vite-plugin-uni");
import uni from "@dcloudio/vite-plugin-uni";
import parity from '../official-postcss-parity-plugin.cjs'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'
import { resolveUniPlatform } from 'weapp-tailwindcss/framework'

const require = createRequire(import.meta.url);
const projectRoot = dirname(fileURLToPath(import.meta.url));
const uniMpVueRuntimePath = require.resolve("@dcloudio/uni-mp-vue/dist/vue.runtime.esm.js");
const uniMpVueDir = dirname(uniMpVueRuntimePath);
const skylineFixture = process.env.WEAPP_TW_SKYLINE_FIXTURE === '1'
const officialPostcssParity = process.env.WEAPP_TW_OFFICIAL_POSTCSS_PARITY === '1'
const issue1005FinalCssFixtureEnabled = process.env.WEAPP_TW_ISSUE_1005_FINAL_CSS_FIXTURE === '1'
  || process.env.WEAPP_TW_WATCH_REGRESSION === '1'
const issue1005FinalCssFixture: Plugin = {
  name: 'issue-1005-final-css-fixture',
  enforce: 'post' as const,
  generateBundle(_options, bundle) {
    for (const output of Object.values(bundle)) {
      if (output.type !== 'asset' || !/\.(?:acss|css|jxss|qss|ttss|wxss)$/i.test(output.fileName)) {
        continue
      }
      output.source = `${String(output.source)}\n@media (prefers-color-scheme: light) {}`
    }
  },
}
const skylineFixtureHtmlEntry: Plugin = {
  name: 'skyline-typography-html-entry',
  transformIndexHtml: {
    order: 'pre',
    handler: html => html.replace('src="/src/main.ts"', 'src="/fixtures/skyline-typography/main.ts"'),
  },
}

// https://vitejs.dev/config/
export default defineConfig(async () => {
  const uniPlatform = resolveUniPlatform()
  const webCompat = uniPlatform.isWeb
    ? process.env.WEAPP_TW_WEB_COMPAT !== '0'
    : undefined
  return {
    ...(skylineFixture ? { define: {
      'import.meta.env.SKYLINE_PROBE_BUILD': JSON.stringify(process.env.SKYLINE_PROBE_BUILD ?? 'demo'),
    } } : {}),
    plugins: [
      // 改成 mts，则爆 uni is not a function
      uni(),
      ...(skylineFixture && uniPlatform.isWeb ? [skylineFixtureHtmlEntry] : []),
      ...(uniPlatform.isMp && issue1005FinalCssFixtureEnabled ? [issue1005FinalCssFixture] : []),
      WeappTailwindcss({
        appType: 'uni-app-vite',
        ...(skylineFixture ? { cssOptions: { skyline: uniPlatform.normalized === 'mp-weixin' } } : {}),
        tailwindcssBasedir: projectRoot,
        cssEntries: skylineFixture ? [resolve(projectRoot, 'fixtures/skyline-typography/main.css')] : [
          resolve(projectRoot, 'src/main.css'),
          resolve(projectRoot, 'src/sub-normal/pages/index.css'),
          resolve(projectRoot, 'src/sub-independent/pages/index.css'),
        ],
        cssSourceTrace: true,
        rem2rpx: true,
        styleInjector: false,
        customAttributes: {
          '*': [/^t-class(?:-.+)?$/],
        },
        postcssOptions: parity.createOfficialPostcssParityPostcssOptions(),
        generator: officialPostcssParity
          ? false
          : {
              webCompat,
            },
      }),
    ],
    css: {
      postcss: {
        plugins: [],
      },
    },
    // 小程序独立分包包含独立运行时，使用 CLI 支持的 esbuild 压缩降低重复压缩成本。
    build: uniPlatform.isMp && process.env.NODE_ENV === 'production'
      ? { minify: 'esbuild' as const }
      : {},
    resolve: {
      alias: {
        // Force uni-app runtime to use the v3 build that still exports findComponentPropsData
        "@dcloudio/uni-mp-vue/dist/vue.runtime.esm.js": uniMpVueRuntimePath,
        "@dcloudio/uni-mp-vue": uniMpVueDir,
      }
    },
  }
});
