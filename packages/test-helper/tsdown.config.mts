import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  shims: true,
  format: ['cjs', 'esm'],
  clean: true,
  dts: true,
  outExtensions({ format }) {
    return {
      js: format === 'es' ? '.mjs' : '.cjs',
      dts: format === 'es' ? '.d.mts' : '.d.cts',
    }
  },
  deps: {
    resolveDepSubpath: true,
    neverBundle: ['postcss', 'tailwindcss', '@tailwindcss/postcss', 'tailwindcss-patch'],
  },
})
