import path from 'node:path'
import { defineConfig } from 'vitest/config'
import { createNativeNodeConditionsPlugin } from '../../scripts/testing/native-node-conditions.mjs'
import { workspaceMaxWorkers } from '../../scripts/testing/vitest-workers.mjs'

export default defineConfig({
  plugins: [createNativeNodeConditionsPlugin()],
  test: {
    maxWorkers: workspaceMaxWorkers,
    setupFiles: ['./test/setup/esbuild-cleanup.ts'],
    alias: [
      { find: /^@weapp-tailwindcss\/env$/, replacement: path.resolve(__dirname, '../env/src/index.ts') },
      { find: '@weapp-tailwindcss/postcss/transform', replacement: path.resolve(__dirname, '../postcss/src/transform.ts') },
      { find: '@weapp-tailwindcss/postcss/syntax', replacement: path.resolve(__dirname, '../postcss/src/syntax.ts') },
      { find: '@weapp-tailwindcss/postcss/plugin', replacement: path.resolve(__dirname, '../postcss/src/plugin.ts') },
      {
        find: '@',
        replacement: path.resolve(__dirname, './src'),
      },
      {
        find: '#test',
        replacement: path.resolve(__dirname, './test'),
      },
      {
        find: '@weapp-tailwindcss/reset',
        replacement: path.resolve(__dirname, '../reset/src/index.ts'),
      },
      {
        find: /^@weapp-tailwindcss\/postcss$/,
        replacement: path.resolve(__dirname, '../postcss/src/index.ts'),
      },
      {
        find: /^@weapp-tailwindcss\/postcss\/css-macro\/postcss$/,
        replacement: path.resolve(__dirname, '../postcss/src/css-macro/postcss.ts'),
      },
      {
        find: /^tailwindcss-config$/,
        replacement: path.resolve(__dirname, '../tailwindcss-config/src/index.ts'),
      },
      {
        find: /^@weapp-tailwindcss\/shared$/,
        replacement: path.resolve(__dirname, '../shared/src/index.ts'),
      },
      {
        find: /^@weapp-tailwindcss\/shared\/extractors$/,
        replacement: path.resolve(__dirname, '../shared/src/extractors/index.ts'),
      },
      {
        find: /^@weapp-tailwindcss\/shared\/node$/,
        replacement: path.resolve(__dirname, '../shared/src/node.ts'),
      },
      {
        find: /^@weapp-tailwindcss\/logger$/,
        replacement: path.resolve(__dirname, '../logger/src/index.ts'),
      },
      {
        find: /^@weapp-tailwindcss\/postcss-calc$/,
        replacement: path.resolve(__dirname, '../postcss-calc/src/index.ts'),
      },
    ],
    include: ['test/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    benchmark: {
      include: ['test/**/*.bench.ts'],
    },
    coverage: {
      enabled: false,
      exclude: [
        // 测试辅助代码由测试自身覆盖，不计入生产代码覆盖率门禁。
        'test/**',
        'packages/weapp-tailwindcss/test/**',
        // 开发态 watch 回归脚本不属于对外运行时代码，避免拉低 project coverage 门禁。
        '../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/**',
        'tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/**',
      ],
      // reportsDirectory: 'coverage/vitest'
    },
    testTimeout: 60_000,
    globals: true,
    forceRerunTriggers: ['**\/{vitest,vite}.config.*\/**'],
    // ...
  },
  server: {
    watch: {
      ignored: ['**\/package.json/**'],
    },
  },
})
