import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { createNativeNodeConditionsPlugin } from '../scripts/testing/native-node-conditions.mjs'

export default defineConfig({
  plugins: [createNativeNodeConditionsPlugin()],
  resolve: {
    alias: {
      '@site': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    include: ['scripts/**/*.test.{mjs,ts}', 'src/**/*.test.ts'],
    environment: 'node',
  },
})
