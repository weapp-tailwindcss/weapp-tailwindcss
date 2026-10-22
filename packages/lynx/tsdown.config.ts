import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    decoder: 'src/decoder.ts',
  },
  format: ['esm', 'cjs'],
  copy: [{ from: 'src/decoder-data', to: 'dist', flatten: true }],
  dts: true,
  shims: true,
  clean: true,
  deps: {
    resolveDepSubpath: true,
    neverBundle: ['@weapp-tailwindcss/lynx/decoder'],
  },
  target: 'es2022',
  outExtensions({ format }) {
    return { js: format === 'es' ? '.js' : '.cjs', dts: '.d.ts' }
  },
})
