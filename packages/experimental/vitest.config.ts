import path from 'node:path'
import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    setupFiles: ['./test/setup/esbuild-cleanup.ts'],
    alias: [
      {
        find: '@weapp-tailwindcss/postcss/experimental/lightningcss',
        replacement: path.resolve(__dirname, '../postcss/src/experimental/lightningcss/index.ts'),
      },
      {
        find: '@',
        replacement: path.resolve(__dirname, './src'),
      },
    ],
    globals: true,
    testTimeout: 60_000,
  },
})
