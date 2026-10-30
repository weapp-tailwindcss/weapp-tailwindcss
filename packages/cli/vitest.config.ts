import path from 'node:path'
import { defineProject } from 'vitest/config'
import { workspaceMaxWorkers } from '../../scripts/testing/vitest-workers.mjs'

export default defineProject({
  test: {
    maxWorkers: workspaceMaxWorkers,
    alias: [
      {
        find: '@',
        replacement: path.resolve(__dirname, './src'),
      },
    ],
    globalSetup: ['./test/global-setup.ts'],
    globals: true,
    testTimeout: 60_000,
  },
})
