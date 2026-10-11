import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { 'index': 'src/index.ts', 'v4/index': 'src/v4/index.ts' },
  shims: true,
  format: ['cjs', 'esm'],
  target: 'node22',
  clean: true,
  dts: true,
  fixedExtension: false,
  deps: {
    onlyBundle: false,
    alwaysBundle: ['htmlparser2'],
    neverBundle: ['tailwindcss', '@tailwindcss/node', '@tailwindcss/oxide', 'postcss'],
  },
})
