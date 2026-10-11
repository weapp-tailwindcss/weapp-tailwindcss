import type { ParserOptions } from '@babel/parser'
import type { CssOptions, LoadedPostcssOptions } from '@weapp-tailwindcss/postcss/types'
import type { ICreateCacheReturnType } from '../../cache'
import type { WeappTailwindcssGeneratorUserOptions } from '../../generator'
import type { WeappTailwindcssStyleInjectorUserOptions } from '../../style-injector/options'
import type { AppType, IArbitraryValues, IUnocssCompatibilityOptions } from '../shared'
import type { LengthUnitsRuntimeOptions, TailwindCssRuntimeOptions } from '@/tailwindcss/runtime-types'

export interface CssSourceTraceOptions {
  root?: string | undefined
}

export type CssSourceTraceUserOptions = boolean | CssSourceTraceOptions

export interface UserDefinedOptionsGeneralPart {
  /**
   * 控制 Tailwind 自定义长度单位支持。
   *
   * @group 0.重要配置
   * @see https://github.com/sonofmagic/weapp-tailwindcss/issues/110
   * @remarks
   * Tailwind CSS v4 会对任意值执行类型推断，未声明的 `rpx` 可能被识别为颜色。本选项默认开启，并由构建运行时自动接管。
   */
  supportCustomLengthUnits?: LengthUnitsRuntimeOptions | boolean | undefined

  /**
   * 声明所使用的框架类型。
   *
   * @group 0.重要配置
   * @remarks
   * 用于区分框架运行环境。Vite 产物样式关系会优先从构建图和真实 bundle 文件中推导，不应依赖固定的主样式文件名。
   */
  appType?: AppType | undefined

  /**
   * TailwindCSS 任意值的相关配置。
   *
   * @group 0.重要配置
   */
  arbitraryValues?: IArbitraryValues | undefined

  /**
   * 启用部分 UnoCSS class 写法兼容。
   *
   * @group 0.重要配置
   * @remarks
   * 默认关闭。传入 `true` 后会启用 Tailwind CSS v4 裸任意值生成。class 字符转义继续由
   * `customReplaceDictionary` 控制，JS 转译仍遵循 `classNameSet` 精确命中原则。
   *
   * @default false
   */
  unocss?: boolean | IUnocssCompatibilityOptions | undefined

  /**
   * 控制 JS 字面量是否需要保留。
   *
   * @group 0.重要配置
   * @since ^2.6.1
   * @remarks
   * 当 Tailwind 与 JS 字面量冲突时，可通过回调返回 `true` 保留当前值，返回 `false` 或 `undefined` 则继续转义。默认保留所有带 `*` 的字符串字面量。
   */
  jsPreserveClass?: ((keyword: string) => boolean | undefined) | undefined

  /**
   * @deprecated 为兼容旧配置保留。JS 转译不再允许绕过 classNameSet。
   *
   * @group 0.重要配置
   * @remarks
   * 该选项不再启用任意值兜底。所有 JS 类名都必须精确命中 Tailwind 生成确认的 classNameSet。
   */
  jsArbitraryValueFallback?: boolean | 'auto' | undefined

  /**
   * 是否替换运行时依赖包名。
   *
   * @group 0.重要配置
   * @remarks
   * 适用于运行时包名需要重定向的场景，例如：
   * - 小程序侧无法直接安装 `tailwind-merge`/`class-variance-authority`/`tailwind-variants`，需要替换为内置的 weapp 版本。
   * - 企业内私有镜像/多包发布导致运行时包名不同，希望在转换后统一到目标包名。
   * 传入 `true` 使用内置替换表，或传入对象自定义映射。
   * @example
   * ```ts
   * replaceRuntimePackages: {
   *   'tailwind-merge': '@weapp-tailwindcss/merge',
   *   'class-variance-authority': '@weapp-tailwindcss/cva',
   * }
   * ```
   */
  replaceRuntimePackages?: boolean | Record<string, string> | undefined

  /**
   * 是否把 CSS 中的 Tailwind 包入口改写到 `weapp-tailwindcss` 内部样式入口。
   *
   * @group 0.重要配置
   * @remarks
   * 默认关闭。Tailwind CSS v4 项目应保留 `@import "tailwindcss"` 原始入口，由
   * `weapp-tailwindcss` 基于 CSS AST/source 结果生成目标端 CSS。仅在需要兼容旧项目
   * 或特定框架无法正常解析 Tailwind 包入口时显式开启。
   * @default false
   */
  rewriteCssImports?: boolean | undefined

  /**
   * 控制 Tailwind CSS 直接生成目标端 CSS 的策略。
   *
   * @group 0.重要配置
   * @remarks
   * 默认值会按构建环境推断：小程序构建使用 `weapp`，H5/Web 与普通 uni-app App WebView 使用 `web`。
   * uni-app x 原生 App 目标继续通过 `uniAppX` 配置处理 uvue/App 约束，不需要配置 `target: 'app'`。
   */
  generator?: WeappTailwindcssGeneratorUserOptions | undefined

  /**
   * 开启构建产物样式入口注入。
   *
   * @group 0.重要配置
   * @remarks
   * 默认关闭。传入 `true` 等价于启用空配置；传入对象时会透传给内置
   * `weapp-style-injector` 实现，可配置 `imports`、`perFileImports`、分包样式入口等能力。
   *
   * Vite 会按当前 `appType` 自动选择 uni-app、Taro 或通用预设；Webpack 会按当前
   * `appType` 自动选择 uni-app、Taro、Mpx、Weapp-vite 或通用预设。未显式配置 `appType` 时，会复用
   * `weapp-tailwindcss` 在当前构建器中的推断结果。
   *
   * 当 `disabled: true` 或 `disabled: { plugin: true }` 时，该能力会跟随主插件一起关闭。
   *
   * @default false
   */
  styleInjector?: WeappTailwindcssStyleInjectorUserOptions | undefined

  /**
   * 在输出 CSS 中为工具类规则标注 token 来源文件。
   *
   * @group 3.一般配置
   * @remarks
   * 默认关闭。开启后会在生成的 CSS 规则前插入 `tokens: token <= source-file` 注释，
   * 用于排查某条工具类来自哪个源码文件。可传入 `{ root }` 控制注释里的相对路径基准。
   * 该能力面向调试与 demo 验收，生产构建通常保持关闭以减少产物体积。
   * @default false
   */
  cssSourceTrace?: CssSourceTraceUserOptions | undefined

  /**
   * 禁用默认的 `wxml` 模板替换器。
   *
   * @group 0.重要配置
   * @since ^2.6.2
   * @remarks
   * 启用后模板匹配完全交由 [`customAttributes`](/docs/api/options/important#customattributes) 管理，需要自行覆盖默认的 `class` / `hover-class` 等匹配规则。
   * @default false
   */
  disabledDefaultTemplateHandler?: boolean | undefined

  /**
   * 内部使用的运行时加载器路径。
   *
   * @ignore
   * @internal
   */
  runtimeLoaderPath?: string | undefined

  /**
   * 指定用于获取 Tailwind 上下文的路径。
   *
   * @group 0.重要配置
   * @since ^2.9.3
   * @remarks
   * 在 linked 或 monorepo 场景下可手动指向目标项目的 `package.json` 所在目录。
   */
  tailwindcssBasedir?: string | undefined

  /**
   * 控制缓存策略。
   *
   * @group 0.重要配置
   * @since ^3.0.11
   */
  cache?: boolean | ICreateCacheReturnType | undefined

  /**
   * `@babel/parser` 的配置选项。
   *
   * @since ^3.2.0
   * @group 3.一般配置
   */
  babelParserOptions?: (ParserOptions & {
    cache?: boolean | undefined
    cacheKey?: string | undefined
    cacheMaxEntries?: number | undefined
    cacheMaxSourceLength?: number | undefined
  }) | undefined

  /**
   * 实验性 JS 转译快路径。
   *
   * @group 3.一般配置
   * @experimental
   * @remarks
   * bundler watch/serve 链路默认在关闭 source map，且没有模块图、模块替换或 ignore 调用语义时尝试 OXC；普通 build 默认使用 Babel，避免同时加载双解析器。配置了标签模板 ignore 且源码含标签模板时回退 Babel。可显式传入 `true` 或 `'oxc'` 强制尝试，传入 `false` 可关闭。
   * Babel 8 链路要求 Node `^22.18.0 || >=24.11.0`。OXC 加载失败时仍会自动回退到 Babel。
   */
  experimentalJsFastPath?: boolean | 'oxc' | undefined

  /**
   * 自定义 Tailwind 子组合器的替换值。
   *
   * @group 3.一般配置
   * @remarks
   * 为兼容小程序缺乏 `:not([hidden])~` 支持的限制，默认会将 `.space-x-4` 等选择器替换为 `view + view`。可传入字符串或字符串数组以扩展适用标签。
   * ```css
   * // 数组示例
   * .space-y-4>view + view,text + text{}
   *
   * // 字符串示例
   * .space-y-4>view,text,button,input ~ view,text,button,input{}
   * ```
   * @default 'view + view'
   * @deprecated 请使用 `cssOptions.cssChildCombinatorReplaceValue`。
   */
  cssChildCombinatorReplaceValue?: string | string[] | undefined

  /**
   * `postcss` 的配置选项。
   *
   * @since ^3.2.0
   * @group 3.一般配置
   */
  postcssOptions?: LoadedPostcssOptions | undefined

  /**
   * CSS 生成与兼容后处理的微调配置。
   *
   * @since ^4.3.4
   * @group 0.重要配置
   * @remarks
   * 后续用于控制生成 CSS 的兼容兜底、变量保留、规则修剪等细粒度行为。
   * `cssPreflight`、`cssPreflightRange`、`cssChildCombinatorReplaceValue`、`cssPresetEnv`、`autoprefixer`、
   * `atRules`、`injectAdditionalCssVarScope`、`cssSelectorReplacement`、`rem2rpx`、`px2rpx`、`unitsToPx`、
   * `unitConversion`、`platform`、`cssRemoveActivePseudoClass`、`cssRemoveHoverPseudoClass`、`cssRemoveFocusPseudoClass`、`cssRemoveProperty`、`cssCalc`
   * 与 `tailwindcssV4GradientFallback` 都推荐放在这里。
   */
  cssOptions?: CssOptions | undefined

  /**
   * 是否移除 CSS 中的 `:active` 选择器。
   *
   * @since ^5.2.12
   * @group 3.一般配置
   * @remarks
   * 小程序中的 `:active` 不生效，因此默认删除相关节点。H5 与 App 的 Web 构建不受此选项影响。
   * @default `true`
   * @deprecated 请使用 `cssOptions.cssRemoveActivePseudoClass`。
   */
  cssRemoveActivePseudoClass?: boolean | undefined
  /**
   * 是否移除 CSS 中的 `:hover` 选择器。
   *
   * @since ^3.2.1
   * @group 3.一般配置
   * @see https://github.com/sonofmagic/weapp-tailwindcss/issues/293
   * @remarks
   * 小程序不支持 `:hover`，需要使用组件的 `hover-class`，因此默认删除相关节点。
   * @default `true`
   * @deprecated 请使用 `cssOptions.cssRemoveHoverPseudoClass`。
   */
  cssRemoveHoverPseudoClass?: boolean | undefined
  /**
   * 是否移除 CSS 中的 `:focus` 选择器。小程序默认移除，H5 保持原样。
   * @default `true`
   * @deprecated 请使用 `cssOptions.cssRemoveFocusPseudoClass`。
   */
  cssRemoveFocusPseudoClass?: boolean | undefined
  /**
   * 是否移除 `@property` 节点。
   *
   * @since ^4.1.2
   * @group 3.一般配置
   * @remarks
   * 微信小程序可识别 `@property`，但支付宝暂不支持，默认移除以避免构建失败。
   * @default `true`
   * @deprecated 请使用 `cssOptions.cssRemoveProperty`。
   */
  cssRemoveProperty?: boolean | undefined

  /**
   * 是否为 Tailwind CSS v4 渐变工具类生成小程序字面量兜底。
   *
   * @since ^4.3.4
   * @group 3.一般配置
   * @remarks
   * Tailwind CSS v4 默认通过 `--tw-gradient-*` 变量组合 `linear-gradient(...)` / `radial-gradient(...)` / `conic-gradient(...)`。
   * 默认保留 CSS 变量实现，以完整支持 `from-*`、`via-*`、`to-*`、位置、任意值与自定义属性组合。
   * 如果目标平台需要旧版字面量组合兜底，可显式设置为 `true`。
   * @default false
   * @deprecated 请使用 `cssOptions.tailwindcssV4GradientFallback`。
   */
  tailwindcssV4GradientFallback?: boolean | undefined

  /**
   * 自定义 Tailwind CSS 运行时参数。
   *
   * @group 3.一般配置
   */
  tailwindcssRuntimeOptions?: TailwindCssRuntimeOptions | undefined
  /**
   * 控制命令行日志输出级别。
   *
   * @group 3.一般配置
   * @remarks
   * 默认 `info`，可设置为 `silent` 屏蔽全部输出。
   */
  logLevel?: 'info' | 'warn' | 'error' | 'silent' | undefined
}
