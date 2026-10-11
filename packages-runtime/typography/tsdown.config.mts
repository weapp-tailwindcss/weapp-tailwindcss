import { defineConfig } from 'tsdown'

interface WatchAwareOptions {
  watch?: boolean | string | Array<boolean | string>
}

export const htmlparser2EsmOnlyDependencies = [
  'htmlparser2',
  'domhandler',
  'domutils',
  'domelementtype',
  'entities',
]

export const typographyCjsBundledDependencies = [
  ...htmlparser2EsmOnlyDependencies,
  'magic-string',
]

export const typographyExternalDependencies = [
  'lodash.castarray',
  'lodash.isplainobject',
  'lodash.merge',
  'postcss-selector-parser',
  /^tailwindcss(\/|$)/,
]

const sharedOptions = {
  // 禁用 Node.js shim，保持 ESM 产物适合浏览器侧 bundler 直接使用。
  shims: false,
  target: 'es6',
  outExtensions({ format }) {
    return {
      js: format === 'es' ? '.js' : '.cjs',
      dts: '.d.ts',
    }
  },
} satisfies Parameters<typeof defineConfig>[0]

export function createTypographyTsdownConfigs(options: WatchAwareOptions = {}) {
  const esmOptions = {
    deps: {
      resolveDepSubpath: true,
      neverBundle: [
        ...htmlparser2EsmOnlyDependencies,
        'magic-string',
        ...typographyExternalDependencies,
      ],
      onlyBundle: false,
    },
  }
  const cjsOptions = {
    deps: {
      resolveDepSubpath: true,
      alwaysBundle: typographyCjsBundledDependencies,
      neverBundle: typographyExternalDependencies,
      onlyBundle: false,
    },
  }

  return [
    {
      ...sharedOptions,
      ...esmOptions,
      entry: ['src/index.cjs'],
      format: ['esm'],
      clean: !options.watch,
      dts: false,
    },
    {
      ...sharedOptions,
      ...cjsOptions,
      entry: ['src/index.cjs'],
      format: ['cjs'],
      clean: false,
      dts: false,
    },
    {
      ...sharedOptions,
      ...esmOptions,
      entry: ['src/transform.ts'],
      format: ['esm'],
      clean: false,
      dts: true,
    },
    {
      ...sharedOptions,
      ...cjsOptions,
      entry: ['src/transform.ts'],
      format: ['cjs'],
      clean: false,
      dts: false,
    },
  ]
}

export default defineConfig((options = {}) => createTypographyTsdownConfigs(options))
