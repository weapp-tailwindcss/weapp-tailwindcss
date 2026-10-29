import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { workspaceMaxWorkers } from '../scripts/testing/vitest-workers.mjs'

const demoRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  test: {
    maxWorkers: workspaceMaxWorkers,
    root: demoRoot,
    include: [
      '__tests__/**/*.test.ts',
    ],
    environment: 'node',
  },
})
