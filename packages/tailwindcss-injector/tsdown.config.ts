import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    shims: true,
    format: ['cjs', 'esm'],
    clean: true,
    dts: true,
    deps: {
      resolveDepSubpath: true,
    },
    outExtensions({ format }) {
      return {
        js: format === 'es' ? '.js' : '.cjs',
        dts: '.d.ts',
      }
    },
  },
  {
    entry: ['src/postcss.ts'],
    shims: true,
    format: ['cjs', 'esm'],
    clean: false,
    dts: true,
    deps: {
      resolveDepSubpath: true,
    },
    outExtensions({ format }) {
      return {
        js: format === 'es' ? '.js' : '.cjs',
        dts: '.d.ts',
      }
    },
  },
])
