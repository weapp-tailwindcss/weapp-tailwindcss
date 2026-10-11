import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import { defineConfig } from 'weapp-vite/config'

const projectRoot = dirname(fileURLToPath(import.meta.url))
const officialPostcssParity = process.env.WEAPP_TW_OFFICIAL_POSTCSS_PARITY === '1'
const e2eWatchHmrRuntime = process.env.WEAPP_VITE_E2E_WATCH_HMR_RUNTIME

function dedupeWxssRules() {
  return {
    name: 'demo:dedupe-wxss-rules',
    apply: 'build' as const,
    enforce: 'post' as const,
    generateBundle: {
      order: 'post' as const,
      handler(_options: unknown, bundle: Record<string, { type: string, fileName: string, source?: string | Uint8Array }>) {
        for (const asset of Object.values(bundle)) {
          if (asset.type !== 'asset' || !asset.fileName.endsWith('.wxss') || asset.source === undefined) {
            continue
          }
          const source = typeof asset.source === 'string' ? asset.source : new TextDecoder().decode(asset.source)
          const root = postcss.parse(source)
          const seen = new Set<string>()
          root.walk((node) => {
            if (node.type !== 'rule' && node.type !== 'atrule') {
              return
            }
            const key = node.toString().replace(/\s+/g, '')
            if (seen.has(key)) {
              node.remove()
              return
            }
            seen.add(key)
          })
          asset.source = root.toString()
        }
      },
    },
  }
}

export default defineConfig({
  // root: './packageA',
  // build: {
  //   outDir: 'dist/packageA',
  // },
  // weapp: {
  //   srcRoot: 'packageA',
  //   subPackage: {

  //   },
  //   // srcRoot: 'src',
  // },
  plugins: [dedupeWxssRules()],
  weapp: {
    forwardConsole: false,
    tailwindcss: {
      tailwindcssBasedir: projectRoot,
      cssEntries: [
        resolve(projectRoot, 'app.css'),
        resolve(projectRoot, 'sub-normal/pages/index.css'),
        resolve(projectRoot, 'sub-independent/pages/index.css'),
      ],
      cssSourceTrace: true,
      rem2rpx: true,
      customAttributes: {
        '*': [/^t-class(?:-.+)?$/],
      },
      generator: officialPostcssParity ? false : undefined,
    },
    ...(e2eWatchHmrRuntime === 'classic' || e2eWatchHmrRuntime === 'stateful-experimental'
      ? { hmr: { runtime: e2eWatchHmrRuntime } }
      : {}),
  },
  css: {
    preprocessorOptions: {
      scss: {
        silenceDeprecations: ['legacy-js-api', 'import'],
      },
    },
  },
  // build: {
  //   rollupOptions: {
  //     external: ['lodash'],
  //   },
  // },
})
