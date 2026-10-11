import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/index.ts',
  ],
  dts: true,
  clean: true,
  format: ['cjs', 'esm'],
  deps: {
    resolveDepSubpath: true,
  },
  outExtensions({ format }) {
    return {
      js: format === 'es' ? '.js' : '.cjs',
      dts: '.d.ts',
    }
  },
})
