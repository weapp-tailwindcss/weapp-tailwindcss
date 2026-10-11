import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    globals: true,
    setupFiles: ['./test/setup.ts'],
    testTimeout: 30_000,
  },
})
