import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
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
