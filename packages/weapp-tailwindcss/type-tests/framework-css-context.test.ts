import type { FrameworkAssets } from '../src/bundlers/vite/shared/framework-assets'
import type { ViteFrameworkCssPipelineContext, ViteFrameworkCssPipelineStrategy } from '../src/bundlers/vite/shared/framework-strategy'
import { extendFrameworkCssContext } from '../src/bundlers/vite/shared/framework-css-context'

declare function expectType<T>(value: T): void
declare const context: ViteFrameworkCssPipelineContext
declare const assets: FrameworkAssets
declare const strategy: ViteFrameworkCssPipelineStrategy

// 扩展类型来自实参；完整目标类型只校验结果，不能要求扩展重复提供基础字段。
strategy.generation?.transformGeneratedCss?.('', extendFrameworkCssContext(context, {
  defaultWebCssCompat(css: string) {
    expectType<string>(css)
    // @ts-expect-error 回调参数不能退化为 any。
    expectType<number>(css)
    return css
  },
  removeScopedPreflight(css: string, options?: { preserveRuntimeProperties?: boolean }) {
    expectType<string>(css)
    expectType<boolean | undefined>(options?.preserveRuntimeProperties)
    // @ts-expect-error 可选选项不能退化为 any。
    expectType<string>(options)
    return css
  },
  shouldApplyWebCssCompat: true,
}))

// 目标类型不能反向推断扩展回调，否则 TypeScript 6 会把整个目标误认作扩展实参。
strategy.generation?.transformGeneratedCss?.('', extendFrameworkCssContext(context, {
  // @ts-expect-error 扩展回调需自带参数类型，不能依赖完整目标上下文反向推断。
  defaultWebCssCompat: css => css,
  removeScopedPreflight: (css: string) => css,
  shouldApplyWebCssCompat: true,
}))

// 可选基础字段由本次扩展收紧为必填，getter 的返回类型需要保留。
const assetContext = extendFrameworkCssContext(context, {
  get assets() { return assets },
})
expectType<FrameworkAssets>(assetContext.assets)
strategy.styles?.resolveConfiguredCssEntryRootInjectionTarget?.(extendFrameworkCssContext(assetContext, {
  isConfiguredCssEntryFile(file: string | undefined) {
    expectType<string | undefined>(file)
    // @ts-expect-error 来源文件只能是字符串或 undefined。
    expectType<number>(file)
    return file !== undefined
  },
  isMiniProgramStyleOutputFile: (file: string) => file.endsWith('.css'),
  isRootStyleOutputFile: (file: string) => !file.includes('/'),
  outputFile: 'theme.css',
  sourceFile: undefined,
}))

// 后续扩展采用属性替换语义，不能将不兼容的新旧字段交叉成 never。
const fileContext = extendFrameworkCssContext(assetContext, { file: 'theme.css' })
const replacedContext = extendFrameworkCssContext(fileContext, { file: 42 })
expectType<number>(replacedContext.file)
// @ts-expect-error 替换后的字段不能保留 string 或变成 never/any。
expectType<string>(replacedContext.file)
expectType<FrameworkAssets>(replacedContext.assets)
expectType<ViteFrameworkCssPipelineContext['currentGeneratorOptions']>(replacedContext.currentGeneratorOptions)

// 未覆盖的可选字段和扩展自身的可选字段仍允许省略，不会被映射为必填。
declare const optionalExtension: { file?: string }
const optionalContext = extendFrameworkCssContext(context, optionalExtension)
expectType<FrameworkAssets | undefined>(optionalContext.assets)
expectType<string | undefined>(optionalContext.file)
expectType<Pick<typeof optionalContext, 'assets' | 'file'>>({})
// @ts-expect-error 未覆盖的 assets 仍可能不存在。
expectType<FrameworkAssets>(optionalContext.assets)
// @ts-expect-error 扩展的可选字段仍可能不存在。
expectType<string>(optionalContext.file)
// @ts-expect-error exactOptionalPropertyTypes 不允许显式 undefined 冒充省略字段。
const invalidOptional: ViteFrameworkCssPipelineContext & { readonly file?: string } = extendFrameworkCssContext(context, { file: undefined })
void invalidOptional

// 返回值在类型层面也保持只读，但不改变调用方传入对象的类型。
const extension = { file: 'theme.css' }
const readonlyContext = extendFrameworkCssContext(context, extension)
extension.file = 'other.css'
// @ts-expect-error 扩展属性必须只读。
readonlyContext.file = 'other.css'
// @ts-expect-error 基础上下文属性必须只读。
readonlyContext.root = 'other'
// @ts-expect-error 只读资产 getter 不能被替换。
assetContext.assets = assets
// @ts-expect-error 未声明的字段不能通过扩展取得。
expectType<unknown>(readonlyContext.unknownField)
// @ts-expect-error 扩展不能让基础上下文丢失必需字段。
extendFrameworkCssContext({}, { file: 'theme.css' })

// 静态期望不能掩盖扩展数据实际类型不匹配的问题。
// @ts-expect-error file 实际为数字，不能赋值给字符串请求。
const invalidRequest: ViteFrameworkCssPipelineContext & { readonly file: string } = extendFrameworkCssContext(context, { file: 42 })
void invalidRequest
