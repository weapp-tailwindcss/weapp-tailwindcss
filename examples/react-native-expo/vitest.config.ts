import path from 'node:path'
import { defineConfig } from 'vitest/config'
import { workspaceMaxWorkers } from '../../scripts/testing/vitest-workers.mjs'

export default defineConfig({
  test: {
    maxWorkers: workspaceMaxWorkers,
    globals: true,
    include: ['test/**/*.test.ts'],
    alias: [
      { find: '@weapp-tailwindcss/react-native/compiler', replacement: path.resolve(__dirname, '../../packages/react-native/src/compiler.ts') },
    ],
  },
})
