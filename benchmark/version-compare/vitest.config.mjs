import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { workspaceMaxWorkers } from '../../scripts/testing/vitest-workers.mjs'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    maxWorkers: workspaceMaxWorkers,
    include: ['test/**/*.test.mjs'],
    environment: 'node',
  },
})
