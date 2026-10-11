import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts', './src/cli.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  deps: {
    resolveDepSubpath: true,
  },
  target: 'node18',
})
