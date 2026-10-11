import type { Plugin } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'

const CSS_EXT_RE = /\.css$/

const rootDir = fileURLToPath(new URL('.', import.meta.url))
const srcDir = path.resolve(rootDir, 'src')
function wxssMirror(): Plugin {
  return {
    name: 'wxss-mirror',
    enforce: 'post',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        for (const [fileName, output] of Object.entries(bundle)) {
          if (fileName.endsWith('.css') && output.type === 'asset' && typeof output.source === 'string') {
            this.emitFile({
              type: 'asset',
              fileName: fileName.replace(CSS_EXT_RE, '.wxss'),
              source: output.source,
            })
          }
        }
      },
    },
  }
}

function removeEmptyJsChunks(): Plugin {
  return {
    name: 'remove-empty-js-chunks',
    generateBundle(_options, bundle) {
      for (const key of Object.keys(bundle)) {
        const chunk = bundle[key]
        if (chunk.type === 'chunk' && chunk.isEntry && chunk.code.trim() === '') {
          delete bundle[key]
        }
      }
    },
  }
}

export default defineConfig({
  root: rootDir,
  publicDir: false,
  plugins: [
    ...(WeappTailwindcss({
      tailwindcssBasedir: rootDir,
      cssEntries: [path.resolve(srcDir, 'index.css')],
      rem2rpx: false,
      generator: { target: 'web', webCompat: false },
    }) ?? []),
    wxssMirror(),
    removeEmptyJsChunks(),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: '.',
    rollupOptions: {
      input: {
        index: path.resolve(srcDir, 'index.css'),
      },
      output: {
        assetFileNames: '[name][extname]',
      },
    },
  },
})
