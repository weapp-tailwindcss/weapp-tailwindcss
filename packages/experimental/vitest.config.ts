import path from 'node:path'
import { defineProject } from 'vitest/config'
import { workspaceMaxWorkers } from '../../scripts/testing/vitest-workers.mjs'

export default defineProject({
  test: {
    maxWorkers: workspaceMaxWorkers,
    setupFiles: ['./test/setup/esbuild-cleanup.ts'],
    alias: [
      {
        find: '@weapp-tailwindcss/postcss/experimental/lightningcss',
        replacement: path.resolve(__dirname, '../postcss/src/experimental/lightningcss/index.ts'),
      },
      {
        find: '@',
        replacement: path.resolve(__dirname, './src'),
      },
    ],
    globals: true,
    testTimeout: 60_000,
  },
})
