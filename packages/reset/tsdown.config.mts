import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  shims: true,
  format: ['cjs', 'esm'],
  clean: true,
  dts: true,
  deps: {
    resolveDepSubpath: true,
    neverBundle: ['tailwindcss/plugin'],
  },
  target: ['es2020'],
  outExtensions({ format }) {
    return {
      js: format === 'es' ? '.js' : '.cjs',
      dts: '.d.ts',
    }
  },
})
