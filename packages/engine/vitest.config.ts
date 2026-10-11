import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    name: '@weapp-tailwindcss/engine',
    alias: { '@': path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'src') },
    globals: true,
    testTimeout: 60_000,
  },
})
