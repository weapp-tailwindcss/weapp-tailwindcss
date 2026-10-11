import path from 'node:path'
import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    alias: [
      {
        find: '@',
        replacement: path.resolve(__dirname, './src'),
      },
    ],
    globalSetup: ['./test/global-setup.ts'],
    globals: true,
    testTimeout: 60_000,
  },
})
