import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { root: fileURLToPath(new URL('.', import.meta.url)), include: ['test/**/*.test.mjs'], update: 'none', testTimeout: 30_000 } })
