import { globalIgnores } from 'eslint/config'
import { createMonorepoEslintConfig } from 'repoctl/tooling'

const config = createMonorepoEslintConfig(
  {
    tailwindcss: false,
    markdown: false,
    ignores: [
      '**/fixtures/**',
      // 'apps',
      'demo',
      'demo-linked',
      'how-to-build-components-by-tailwindcss',
      'packages/tailwindcss-core-plugins-extractor/src',
      // tmp 添加
      'apps/weapp-library',
      'packages/tailwindcss-injector/*.md',
      'packages/weapp-tailwindcss/*.css',
      // 忽略构建分析生成的 HTML 报告
      'packages/weapp-tailwindcss/stats/**',
      'e2e/__snapshots__/**/*',
      'templates/**',
      'website/test-results/**',
      // 排除文档和quest文件
      '.qoder/**/*.md',
      'packages-runtime/ui/**/*.md',
      // 排除 markdown、单元测试、benchmark、skills 引用等非核心文件
      '**/*.md',
      '**/test/**',
      '**/test-*/**',
      'benchmark/**',
      '.claude/**',
      '.agents/**',
      '**/.agents/**',
      '.codex/**',
      'skills/**',
      // 忽略 workspace 中生成的 CSS 和类型声明
      'apps/**/result.css',
      'apps/**/result.json',
      'apps/**/transformed.css',
      'apps/**/env.d.ts',
      'demo/**/env.d.ts',
      '**/*.d.ts',
    ],
    pnpm: false,
  },
  {
    rules: {
      'ts/no-require-imports': 'off',
      'ts/no-use-before-define': 'off',
    },
  },
  {
    files: [
      'packages/debug-uni-app-x/**',
      'packages/weapp-tailwindcss/bin/**',
      'tools/weapp-tailwindcss-scripts/src/**',
    ],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // 迁入的基础包保留旧运行环境兼容性，不将 hasOwnProperty 改成较新的 Object.hasOwn。
    files: ['packages/escape/src/mapping.ts'],
    rules: {
      'e18e/prefer-object-has-own': 'off',
    },
  },
  {
    files: ['apps/**/*.{ts,js}', 'demo/**/*.{ts,js}'],
    languageOptions: {
      globals: {
        wx: true,
        App: true,
        Page: true,
        getApp: true,
        Component: true,
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['packages-runtime/merge/**/*.test.ts'],
    rules: {

    },
  },
  // {
  //   files: ['pnpm-workspace.yaml'],
  //   rules: {
  //     'pnpm/yaml-no-duplicate-catalog-item': ['error', { checkDuplicates: 'exact-version' }],
  //   },
  // },
)

export default config
  .prepend(
    globalIgnores([
      // 本地验收报告和参考源码不属于仓库维护的代码，避免扫描大型生成文件。
      'e2e/reports/local-full-run/**',
      'submodules/tailwindcss-mangle/**',
      '**/test-results/**',
      'website/test-results/',
      'website/test-results/**',
      'website/test-results/**/*',
    ]),
  )
  .append({
    rules: {
      'better-tailwindcss/enforce-canonical-classes': 'off',
      'better-tailwindcss/enforce-consistent-class-order': 'off',
      'better-tailwindcss/enforce-consistent-line-wrapping': 'off',
      'better-tailwindcss/no-conflicting-classes': 'off',
      'better-tailwindcss/no-deprecated-classes': 'off',
      'better-tailwindcss/no-duplicate-classes': 'off',
      'better-tailwindcss/no-unknown-classes': 'off',
      'better-tailwindcss/no-unnecessary-whitespace': 'off',
      'e18e/ban-dependencies': 'off',
      'ts/no-use-before-define': 'off',
    },
  })
