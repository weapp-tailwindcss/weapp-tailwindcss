import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/layers.ts', 'src/diagnostics.ts', 'src/legacy.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  fixedExtension: true,
  clean: true,
  deps: { onlyBundle: false, alwaysBundle: ['@csstools/selector-specificity', '@csstools/css-tokenizer', 'postcss-selector-parser'] },
})
