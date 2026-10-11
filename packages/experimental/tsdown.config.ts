import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/lightningcss/index.ts'],
  format: ['cjs', 'esm'],
  clean: true,
  dts: true,
  shims: true,
  deps: {
    resolveDepSubpath: true,
  },
  outExtensions({ format }) {
    return {
      js: format === 'es' ? '.mjs' : '.cjs',
      dts: '.d.ts',
    }
  },
})
