import type {
  AppType,
  CreateJsHandlerOptions,
  CssPreflightOptions,
  IArbitraryValues,
  ICustomAttributes,
  ICustomAttributesEntities,
  IStyleHandlerOptions,
  ITemplateHandlerOptions,
  JsModuleGraphOptions,
  TailwindCssOptions,
  UserDefinedOptions,
  WeappTailwindcssStyleInjectorOptions,
} from 'weapp-tailwindcss/types'
import { expectAssignable, expectError, expectNotAssignable, expectType } from 'tsd'

expectAssignable<AppType>('taro')
expectAssignable<AppType>('weapp-vite')
expectNotAssignable<AppType>('unknown')

const disabledOptions: UserDefinedOptions['disabled'] = {
  plugin: true,
}
expectAssignable<UserDefinedOptions['disabled']>(disabledOptions)

const styleInjectorOptions: WeappTailwindcssStyleInjectorOptions = {
  imports: ['shared.wxss'],
  perFileImports: file => file.endsWith('.wxss') ? ['page.wxss'] : undefined,
  include: ['**/*.wxss'],
  exclude: ['**/ignored.wxss'],
  dedupe: true,
  pagesJsonPath: ['src/pages.json'],
  appConfigPath: 'src/app.config.ts',
  appPath: 'src/app.mpx',
  sourceRoot: 'src',
  subPackages: [{
    pagesJsonPath: 'src/pages.json',
    sourceFileName: 'index.scss',
    rules: [
      ['index.css', { sourceInclude: ['**/*.vue'] }],
    ],
  }],
  uniAppSubPackages: {
    pagesJsonPath: 'src/pages.json',
  },
  uniAppStyleScopes: {
    style: 'src/sub/index.css',
    scope: 'sub',
  },
  sourceFileName: ['index.css'],
  outputName: 'index',
  files: ['pages/index'],
  indexFileName: 'index.css',
  indexFileNames: 'index.scss',
  styleScopes: {
    style: 'src/sub/index.css',
    scope: ['sub'],
    type: 'manual',
  },
  rules: [
    [{ file: 'index.css', as: 'tailwind' }, {
      include: ['pages/**/*.wxss'],
      sourceInclude: ['pages/**/*.vue'],
    }],
    [{ file: 'component.css', as: 'component' }, ['components/**/*.wxss']],
  ],
  generateSubpackageStyle: context => `/* ${context.framework}:${context.bundler} */`,
  loadSubpackageTargetStyle: fileName => fileName,
}
expectAssignable<WeappTailwindcssStyleInjectorOptions>(styleInjectorOptions)
expectAssignable<UserDefinedOptions['styleInjector']>(true)
expectAssignable<UserDefinedOptions['styleInjector']>(styleInjectorOptions)

const customAttributesRecord: ICustomAttributes = {
  '*': ['class', /[Cc]lass/],
  'van-image': ['custom-class'],
}
expectAssignable<ICustomAttributes>(customAttributesRecord)

const customAttributesMap: ICustomAttributes = new Map<RegExp, string[]>([[/[Cc]lass/, ['custom-class']]])
expectAssignable<ICustomAttributes>(customAttributesMap)
expectError<ICustomAttributes>({ '*': [123] })

const customAttributesEntities: ICustomAttributesEntities = [
  ['*', ['class']],
  [/[Cc]lass/, [/test-/]],
]
expectAssignable<ICustomAttributesEntities>(customAttributesEntities)

const arbitraryValues: IArbitraryValues = { allowDoubleQuotes: true, bareArbitraryValues: true }
expectAssignable<IArbitraryValues>(arbitraryValues)

const moduleGraphOptions: JsModuleGraphOptions = {
  resolve: (specifier, importer) => (specifier.startsWith('.') ? `${importer}/${specifier}` : undefined),
  load: id => (id.endsWith('.ts') ? '' : undefined),
  filter: (id, specifier) => id.includes(specifier),
  maxDepth: 2,
}
expectAssignable<JsModuleGraphOptions>(moduleGraphOptions)

const jsHandlerOptions: CreateJsHandlerOptions = {
  filename: 'src/app.ts',
  moduleGraph: moduleGraphOptions,
}
expectAssignable<CreateJsHandlerOptions>(jsHandlerOptions)

const styleHandlerOptions: Partial<IStyleHandlerOptions> = { isMainChunk: true }
expectAssignable<Partial<IStyleHandlerOptions>>(styleHandlerOptions)

const templateHandlerOptions: Partial<ITemplateHandlerOptions> = { quote: '"', inlineWxs: true }
expectAssignable<Partial<ITemplateHandlerOptions>>(templateHandlerOptions)

const matchers: UserDefinedOptions = {
  cssMatcher: (name) => {
    expectType<string>(name)
    return name.endsWith('.wxss')
  },
  htmlMatcher: name => name.endsWith('.wxml'),
  jsMatcher: name => name.endsWith('.js'),
  wxsMatcher: name => name.endsWith('.wxs'),
  mainCssChunkMatcher: (name, appType) => {
    expectType<string>(name)
    expectType<AppType | undefined>(appType)
    return name.endsWith('.acss')
  },
}
expectAssignable<UserDefinedOptions>(matchers)

const lifecycleOptions: UserDefinedOptions = {
  onLoad: () => {},
  onStart: () => {},
  onUpdate: (filename, oldVal, newVal) => {
    expectType<string>(filename)
    expectType<string>(oldVal)
    expectType<string>(newVal)
  },
  onEnd: () => {},
}
expectAssignable<UserDefinedOptions>(lifecycleOptions)

const advancedOptions: UserDefinedOptions = {
  appType: 'taro',
  disabled: disabledOptions,
  customAttributes: customAttributesRecord,
  customReplaceDictionary: { foo: 'bar' },
  ignoreTaggedTemplateExpressionIdentifiers: ['weappTwIgnore', /ignore/],
  ignoreCallExpressionIdentifiers: ['twMerge'],
  replaceRuntimePackages: { 'tailwind-merge': '@weapp-tailwindcss/merge' },
  styleInjector: styleInjectorOptions,
  jsPreserveClass: keyword => keyword.startsWith('*'),
  cache: true,
  babelParserOptions: { sourceType: 'module' },
  cssOptions: {
    cssPreflight: { 'box-sizing': 'border-box' } as CssPreflightOptions,
    cssPreflightRange: 'all',
    cssCalc: ['--spacing', /--color/],
    injectAdditionalCssVarScope: true,
    cssSelectorReplacement: { root: ['page'], universal: false },
    rem2rpx: true,
    px2rpx: true,
    cssChildCombinatorReplaceValue: ['view + view', 'text + text'],
    cssRemoveHoverPseudoClass: true,
    cssRemoveProperty: false,
    tailwindcssV4GradientFallback: true,
  },
  logLevel: 'warn',
  arbitraryValues,
  inlineWxs: false,
}
expectAssignable<UserDefinedOptions>(advancedOptions)

const tailwindOptions: TailwindCssOptions = {
  packageName: 'tailwindcss',
  v4: {
    cssEntries: ['/abs/app.css'],
  },
}
expectAssignable<TailwindCssOptions>(tailwindOptions)

expectAssignable<UserDefinedOptions>({
  tailwindcss: tailwindOptions,
  tailwindcssRuntimeOptions: {
    projectRoot: process.cwd(),
    tailwindcss: tailwindOptions,
    extract: {
      write: true,
      file: 'class-list.json',
    },
  },
})

expectError<UserDefinedOptions>({ logLevel: 'verbose' })
expectError<UserDefinedOptions>({ cssPreflightRange: 'alll' })
expectError<UserDefinedOptions>({ cssSelectorReplacement: { root: 1 } })

expectAssignable<UserDefinedOptions>({ cssOptions: { skyline: true } })
expectAssignable<IStyleHandlerOptions>({ cssOptions: { skyline: false } })
expectNotAssignable<UserDefinedOptions>({ cssOptions: { skyline: 'true' } })
