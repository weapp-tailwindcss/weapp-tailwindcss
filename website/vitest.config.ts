import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { createNativeNodeConditionsPlugin } from '../scripts/testing/native-node-conditions.mjs'
import { workspaceMaxWorkers } from '../scripts/testing/vitest-workers.mjs'

export default defineConfig({
  plugins: [createNativeNodeConditionsPlugin()],
  resolve: {
    alias: {
      '@site': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    maxWorkers: workspaceMaxWorkers,
    include: ['scripts/**/*.test.{mjs,ts}', 'src/**/*.test.ts'],
    environment: 'node',
  },
})
