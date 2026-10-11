import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['cjs', 'esm'],
  target: 'node22',
  clean: true,
  dts: true,
  fixedExtension: false,
})
