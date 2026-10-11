type WatchFlag = boolean | string | Array<boolean | string>

export interface WatchAwareOptions {
  watch?: WatchFlag
}

export const runtimeEntries = {
  'index': 'src/index.ts',
  'webpack': 'src/webpack.ts',
  'rspack': 'src/rspack.ts',
  'gulp': 'src/gulp.ts',
  'generator': 'src/generator/index.ts',
  'vite': 'src/vite.ts',
  'vite/web': 'src/vite-web.ts',
  'postcss': 'src/postcss.ts',
  'defaults': 'src/defaults.ts',
  'framework': 'src/framework/index.ts',
  'css-macro': 'src/css-macro/index.ts',
  'css-macro/postcss': 'src/css-macro/postcss.ts',
  'core': 'src/core.ts',
  'presets': 'src/presets.ts',
  'types': 'src/types/index.ts',
  'reset': 'src/reset/index.ts',
  'postcss-html-transform': 'src/postcss-html-transform.ts',
} as const

export const escapeEntries = {
  escape: 'src/escape.ts',
} as const

export const webpackLoaderEntries = {
  'weapp-tw-runtime-classset-loader': 'src/bundlers/webpack/loaders/weapp-tw-runtime-classset-loader.ts',
  'weapp-tw-css-generation-loader': 'src/bundlers/webpack/loaders/weapp-tw-css-generation-loader.ts',
  'weapp-tw-css-import-rewrite-loader': 'src/bundlers/webpack/loaders/weapp-tw-css-import-rewrite-loader.ts',
} as const

export const runtimeCjsEntries = {
  ...runtimeEntries,
  ...webpackLoaderEntries,
} as const

function externalizeCommonRuntimeDeps(id: string) {
  return id === 'webpack'
    || id === 'tailwindcss/plugin'
    || id === 'postcss'
    || id === '@vue/compiler-dom'
    || id === '@vue/shared'
    || /[\\/]node_modules[\\/]\.pnpm[\\/]postcss@/.test(id)
    || /[\\/]node_modules[\\/]postcss[\\/]/.test(id)
}

function isBabelEsmOnlyDependency(id: string) {
  return id === 'obug' || /^@babel(?:\/|$)/.test(id)
}

function isHtmlparser2EsmOnlyDependency(id: string) {
  return id === 'htmlparser2'
    || id === 'domhandler'
    || id === 'domutils'
    || id === 'domelementtype'
    || id === 'entities'
}

export function bundleCjsRuntimeDeps(id: string) {
  return id === 'magic-string'
    || id === 'oxc-walker'
    || isBabelEsmOnlyDependency(id)
    || isHtmlparser2EsmOnlyDependency(id)
}

export function externalizeEsmRuntimeDeps(id: string) {
  return externalizeCommonRuntimeDeps(id) || bundleCjsRuntimeDeps(id)
}

export function moduleOutExtensions({ format }: { format: string }) {
  return {
    js: format === 'es' ? '.js' : '.cjs',
    dts: '.d.ts',
  }
}

export function createTsdownConfigs(options: WatchAwareOptions = {}) {
  const isWatching = Boolean(options.watch)
  const shouldClean = !isWatching

  return [
    {
      entry: runtimeEntries,
      dts: false,
      clean: shouldClean,
      shims: true,
      format: ['esm'],
      deps: {
        resolveDepSubpath: true,
        neverBundle: externalizeEsmRuntimeDeps,
        onlyBundle: false,
      },
      target: ['es2020'],
      outExtensions: moduleOutExtensions,
    },
    {
      // loaders 与 runtime 共用构建图，避免 Babel 8 等 ESM-only 依赖被重复内联。
      entry: runtimeCjsEntries,
      dts: false,
      clean: false,
      shims: true,
      format: ['cjs'],
      deps: {
        resolveDepSubpath: true,
        alwaysBundle: bundleCjsRuntimeDeps,
        neverBundle: externalizeCommonRuntimeDeps,
        onlyBundle: false,
      },
      target: ['es2020'],
      outExtensions: moduleOutExtensions,
    },
    {
      entry: escapeEntries,
      // escape 运行时不能注入 Node 专属 shim，方便浏览器侧 bundler 直接导入。
      dts: false,
      clean: false,
      shims: false,
      format: ['cjs', 'esm'],
      target: ['es2020'],
      outExtensions: moduleOutExtensions,
    },
  ]
}
