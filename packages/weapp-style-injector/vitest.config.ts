import path from 'node:path'
import { defineProject } from 'vitest/config'
import { workspaceMaxWorkers } from '../../scripts/testing/vitest-workers.mjs'

export default defineProject({
  test: {
    maxWorkers: workspaceMaxWorkers,
    setupFiles: ['./test/setup/esbuild-cleanup.ts'],
    alias: [
      {
        find: '@',
        replacement: path.resolve(__dirname, './src'),
      },
      {
        find: /^@weapp-tailwindcss\/shared$/,
        replacement: path.resolve(__dirname, '../shared/src/index.ts'),
      },
    ],
    globals: true,
    testTimeout: 60_000,
    coverage: {
      include: [
        'src/core.ts',
      ],
      exclude: [
        '**/dist/**',
        '**/test/**',
        '**/tests/**',
        '**/*.bench.*',
      ],
      thresholds: {
        lines: 95,
        statements: 95,
        functions: 95,
        branches: 95,
      },
    },
  },
})
