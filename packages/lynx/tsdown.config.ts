import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  shims: true,
  clean: true,
  deps: {
    resolveDepSubpath: true,
  },
  target: 'es2022',
  outExtensions({ format }) {
    return { js: format === 'es' ? '.js' : '.cjs', dts: '.d.ts' }
  },
})
