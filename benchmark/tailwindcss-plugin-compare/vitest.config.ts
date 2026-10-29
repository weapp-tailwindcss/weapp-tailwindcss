import { defineConfig } from 'vitest/config'
import { workspaceMaxWorkers } from '../../scripts/testing/vitest-workers.mjs'

export default defineConfig({
  test: {
    maxWorkers: workspaceMaxWorkers,
    include: ['test/**/*.test.ts'],
    environment: 'node',
    globals: true,
  },
})
