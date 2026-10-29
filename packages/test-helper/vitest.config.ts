import path from 'node:path'
import { defineProject } from 'vitest/config'
import { createNativeNodeConditionsPlugin } from '../../scripts/testing/native-node-conditions.mjs'
import { workspaceMaxWorkers } from '../../scripts/testing/vitest-workers.mjs'

export default defineProject({
  plugins: [createNativeNodeConditionsPlugin()],
  test: {
    maxWorkers: workspaceMaxWorkers,
    alias: [
      {
        find: '@',
        replacement: path.resolve(__dirname, './src'),
      },
    ],
    globals: true,
    testTimeout: 60_000,
  },
})
