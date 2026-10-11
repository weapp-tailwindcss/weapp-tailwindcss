import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/types.ts',
    'src/vite.ts',
    'src/vite/uni-app.ts',
    'src/vite/taro.ts',
    'src/webpack.ts',
    'src/webpack/uni-app.ts',
    'src/webpack/taro.ts',
    'src/webpack/mpx.ts',
  ],
  shims: true,
  format: ['cjs', 'esm'],
  clean: true,
  dts: false,
  deps: {
    resolveDepSubpath: true,
    neverBundle: ['vite'],
  },
  outExtensions({ format }) {
    return {
      js: format === 'es' ? '.js' : '.cjs',
      dts: '.d.ts',
    }
  },
})
