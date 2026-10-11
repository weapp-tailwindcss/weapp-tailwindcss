import path from 'node:path'
import { configDefaults, defineProject } from 'vitest/config'

const alias = [
  {
    find: '@',
    replacement: path.resolve(__dirname, './src'),
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
    find: /^@weapp-tailwindcss\/postcss-calc$/,
    replacement: path.resolve(__dirname, '../postcss-calc/src/index.ts'),
  },
]

export default defineProject({
  test: {
    alias,
    exclude: [...configDefaults.exclude, 'test/native/**'],
    globals: true,
    testTimeout: 60_000,
    coverage: {
      exclude: [
        '**/dist/**',
        '**/test/**',
        '**/tests/**',
        '**/*.bench.*',
        '**/packages/postcss-calc/**',
        '../postcss-calc/**',
        '**/src/compat/color-mix.ts',
        '**/src/compat/color-mix/parse.ts',
        '**/src/compat/color-mix/resolve.ts',
        '**/src/compat/mini-program-css/hoist.ts',
        '**/src/compat/mini-program-css/root-cleanups.ts',
        '**/src/compat/uni-app-x-uvue.ts',
        '**/src/css-macro/auto.ts',
        '**/src/css-macro/constants.ts',
        '**/src/css-macro/postcss.ts',
        '**/src/generator-plugin/source-files.ts',
        '**/src/options-resolver.ts',
        '**/src/pipeline.ts',
        '**/src/plugins/colorFunctionalFallback.ts',
        '**/src/processor-cache.ts',
        '**/src/selectorParser/rule-transformer.ts',
        '**/src/selectorParser/rule-transformer/nodes.ts',
        '**/src/selectorParser/rule-transformer/pseudos.ts',
        '**/src/utils/selector-guard.ts',
        '**/src/vite-css-rules.ts',
      ],
      thresholds: {
        lines: 95,
        statements: 95,
        functions: 95,
        branches: 95,
      },
    },
    benchmark: {

    },
  },
})
