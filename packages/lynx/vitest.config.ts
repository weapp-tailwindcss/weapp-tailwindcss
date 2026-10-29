import path from 'node:path'
import { defineConfig } from 'vitest/config'
import { workspaceMaxWorkers } from '../../scripts/testing/vitest-workers.mjs'

export default defineConfig({
  test: {
    maxWorkers: workspaceMaxWorkers,
    globals: true,
    include: ['test/**/*.{test,spec}.ts'],
    alias: [
      { find: '@weapp-tailwindcss/lynx/decoder', replacement: path.resolve(__dirname, './src/decoder.ts') },
      { find: '@weapp-tailwindcss/postcss/syntax', replacement: path.resolve(__dirname, '../postcss/src/syntax.ts') },
      { find: 'weapp-tailwindcss/rspack', replacement: path.resolve(__dirname, './test/stubs/rspack.ts') },
    ],
  },
})
