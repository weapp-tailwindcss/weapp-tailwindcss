import type { UserConfig } from 'tsdown'
import { defineConfig } from 'tsdown'

interface WatchAwareOptions {
  watch?: boolean | string | Array<boolean | string>
}

export const postcssEsmOnlyDependencies = [
  'css-blank-pseudo',
  'css-has-pseudo',
  'css-prefers-color-scheme',
  'postcss-selector-parser',
  'postcss-preset-env',
]

// 颜色解析链使用 instanceof 判断 AST，必须共享同一份 parser 实例。
export const postcssColorDependencies = [
  '@csstools/css-color-parser',
  '@csstools/css-parser-algorithms',
  '@csstools/css-tokenizer',
  '@csstools/css-calc',
  '@csstools/color-helpers',
]

// 将已验证的单位换算依赖链随 ESM/CJS 产物交付，保持两种入口的转换行为一致。
export const postcssBundledDependencies = [
  ...postcssColorDependencies,
  'postcss-rule-unit-converter',
  'postcss-rem-to-responsive-pixel',
  'postcss-pxtrans',
  'postcss-plugin-shared',
]

const sharedOptions = {
  entry: ['src/index.ts', 'src/syntax.ts', 'src/transform.ts', 'src/plugin.ts', 'src/types.ts', 'src/html-transform.ts', 'src/css-macro/postcss.ts', 'src/native.ts', 'src/experimental/lightningcss/index.ts'],
  shims: true,
  dts: false,
  outputOptions: {
    minifyInternalExports: false,
  },
  outExtensions({ format }: { format: string }) {
    return {
      js: format === 'es' ? '.js' : '.cjs',
      dts: '.d.ts',
    }
  },
}

export function createPostcssTsdownConfigs(options: WatchAwareOptions = {}) {
  return [
    {
      ...sharedOptions,
      format: ['esm'],
      clean: !options.watch,
      deps: {
        resolveDepSubpath: true,
        neverBundle: postcssEsmOnlyDependencies,
        alwaysBundle: postcssBundledDependencies,
        onlyBundle: false,
      },
    },
    {
      ...sharedOptions,
      // 独立构建语法入口，避免 Rolldown 1.2 的 CJS 多入口分块 panic。
      entry: sharedOptions.entry.filter(entry => entry !== 'src/syntax.ts'),
      format: ['cjs'],
      clean: false,
      deps: {
        resolveDepSubpath: true,
        neverBundle: postcssEsmOnlyDependencies,
        alwaysBundle: postcssBundledDependencies,
        onlyBundle: false,
      },
    },
    {
      ...sharedOptions,
      entry: ['src/syntax.ts'],
      format: ['cjs'],
      clean: false,
      deps: {
        resolveDepSubpath: true,
        neverBundle: postcssEsmOnlyDependencies,
        alwaysBundle: postcssBundledDependencies,
        onlyBundle: false,
      },
    },
  ] satisfies UserConfig[]
}

export default defineConfig((options = {}) => createPostcssTsdownConfigs(options))
