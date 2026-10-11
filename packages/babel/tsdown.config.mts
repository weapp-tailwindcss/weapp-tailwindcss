import { defineConfig } from 'tsdown'

interface WatchAwareOptions {
  watch?: boolean | string | Array<boolean | string>
}

export const babelEsmOnlyDependencies = [/^@babel\//, 'obug']

export function babelOutExtensions({ format }: { format: string }) {
  return {
    js: format === 'es' ? '.js' : '.cjs',
    dts: '.d.ts',
  }
}

export function createBabelTsdownConfigs(options: WatchAwareOptions = {}) {
  const shouldClean = !options.watch

  return [
    {
      entry: ['src/index.ts'],
      shims: true,
      format: ['esm'],
      clean: shouldClean,
      dts: true,
      deps: {
        resolveDepSubpath: true,
        neverBundle: babelEsmOnlyDependencies,
        onlyBundle: false,
      },
      outExtensions: babelOutExtensions,
    },
    {
      entry: ['src/index.ts'],
      shims: true,
      format: ['cjs'],
      clean: false,
      dts: false,
      deps: {
        resolveDepSubpath: true,
        alwaysBundle: babelEsmOnlyDependencies,
        onlyBundle: false,
      },
      outExtensions: babelOutExtensions,
    },
  ]
}

export default defineConfig((options = {}) => createBabelTsdownConfigs(options))
