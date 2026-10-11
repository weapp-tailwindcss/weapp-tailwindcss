import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/tailwindcss.ts'],
  shims: true,
  format: ['cjs', 'esm'],
  clean: true,
  dts: true,
  deps: {
    resolveDepSubpath: true,
    neverBundle: [/^tailwindcss(\/|$)/],
    onlyBundle: false,
  },
  outputOptions: {
    exports: 'named',
  },
  target: 'es6',
  // https://github.com/egoist/tsdown/pull/1056
  // https://github.com/egoist/tsdown/issues?q=cjsInterop
  // cjsInterop: true,
  // splitting: true,
})
