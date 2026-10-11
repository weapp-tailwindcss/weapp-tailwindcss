import { createMonorepoStylelintConfig } from 'repoctl/tooling'

export default createMonorepoStylelintConfig({
  ignoreFiles: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/lib/**',
    '**/coverage/**',
    '**/fixtures/**',
    '**/test/**',
    '**/test-*/**',
    'benchmark/**',
    'demo/**',
    'e2e/__snapshots__/**',
    'reports/**',
    'templates/**',
    'website/**',
    'packages/*/test/**',
    'packages-runtime/*/test/**',
    'packages/reset/**',
    'packages/weapp-tailwindcss/css/**',
    'packages/weapp-tailwindcss/*.css',
    'packages/postcss/**/*.wxss',
  ],
  overrides: [
    {
      files: ['**/*.scss'],
      rules: {
        'at-rule-no-unknown': null,
        'scss/at-rule-no-unknown': true,
      },
    },
  ],
})
