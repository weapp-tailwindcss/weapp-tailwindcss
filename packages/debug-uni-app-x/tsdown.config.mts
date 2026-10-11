import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  clean: true,
  dts: true,
  shims: true,
  deps: {
    resolveDepSubpath: true,
    neverBundle: ['vite'],
    onlyBundle: false,
  },
  outExtensions({ format }) {
    return {
      js: format === 'es' ? '.js' : '.cjs',
      dts: '.d.ts',
    }
  },
})
