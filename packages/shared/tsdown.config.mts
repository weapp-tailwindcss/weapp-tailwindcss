import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    extractors: 'src/extractors/index.ts',
    node: 'src/node.ts',
  },
  shims: true,
  format: ['cjs', 'esm'],
  clean: true,
  dts: true,
  deps: {
    resolveDepSubpath: true,
    onlyBundle: false,
  },
  outExtensions({ format }) {
    return {
      js: format === 'es' ? '.js' : '.cjs',
      dts: '.d.ts',
    }
  },
})
