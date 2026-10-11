import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'compiler': 'src/compiler.ts',
    'tailwind': 'src/tailwind.ts',
    'babel': 'src/babel.ts',
    'metro': 'src/metro.ts',
    'runtime': 'src/runtime.ts',
    'env': 'src/env.ts',
    'metro-transformer': 'src/metro-transformer.ts',
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
