import type {
  CssCalcOptions,
  CssPreflightOptions,
  IStyleHandlerOptions,
  PresetEnvOptions,
  Px2rpxOptions,
  Rem2rpxOptions,
  UniAppXUnsupportedMode,
  UnitConversionOptions,
  UnitsToPxOptions,
  WeappAutoprefixerOptions,
} from '@weapp-tailwindcss/postcss/types'
import type { ICustomAttributes } from '../shared'
import type { TailwindCssRuntimeOptions } from '@/tailwindcss/runtime-types'

export interface UniAppXComponentLocalStylesOptions {
  /**
   * 判断模块是否按组件局部样式处理。
   *
   * @remarks
   * 回调接收已移除 query/hash 并统一为正斜杠的模块路径。配置后会覆盖默认的 `components` 目录匹配规则。
   */
  componentMatcher?: ((id: string) => boolean) | undefined
  /**
   * 是否开启组件级局部 Tailwind 样式注入。
   *
   * @default true
   */
  enabled?: boolean | undefined
  /**
   * 是否仅在 `manifest.json` 的 `styleIsolationVersion=2` 时启用。
   *
   * @default true
   */
  onlyWhenStyleIsolationVersion2?: boolean | undefined
  /**
   * 判断模块是否按页面局部样式处理。
   *
   * @remarks
   * 回调接收已移除 query/hash 并统一为正斜杠的模块路径。配置后会覆盖默认的 `pages` 目录匹配规则。
   */
  pageMatcher?: ((id: string) => boolean) | undefined
}

export interface UniAppXOptions {
  /**
   * 是否启用 uni-app x 适配链路。
   *
   * @default true
   */
  enabled?: boolean | undefined
  /**
   * 配置 issue 822 所需的组件级局部样式能力。
   */
  componentLocalStyles?: boolean | UniAppXComponentLocalStylesOptions | undefined
  /**
   * 配置 uvue 不兼容 utility 的处理策略。
   *
   * @default 'warn'
   * @remarks
   * 仅在 `uni-app x` 的 `uvue/nvue` 样式目标下生效。
   * - `error`：遇到不兼容 utility 直接报错。
   * - `warn`：跳过并打印警告。
   * - `silent`：跳过但不打印警告。
   */
  uvueUnsupported?: UniAppXUnsupportedMode | undefined
}

export interface UserDefinedOptionsImportantPart {

  /**
   * 是否禁用此插件。
   *
   * @group 0.重要配置
   * @remarks
   * `disabled` 只适合完全不希望插件参与的构建，例如 RN、Harmony、独立原生或自定义构建。
   *
   * uni-app / uni-app x / Taro / Mpx / Weapp-vite 的 H5/Web 与普通 App WebView 构建通常应继续保留插件；
   * 生成器会根据平台环境变量自动切换到 `web` 输出。自定义环境无法注入平台变量时，
   * 请优先显式设置 `generator.target: 'web'`，而不是禁用插件。
   * @example
   * ```ts
   * // Taro RN 或其他完全不希望插件参与的构建
   * import process from 'node:process'
   *
   * const disabled = process.env.TARO_ENV === 'rn'
   *
   * import { WeappTailwindcss } from 'weapp-tailwindcss/webpack'
   *
   * new WeappTailwindcss({
   *   disabled,
   * })
   * ```
   */
  disabled?: boolean | { plugin?: boolean | undefined } | undefined

  /**
   * 自定义 `wxml` 标签属性的转换规则。
   *
   * @group 0.重要配置
   * @remarks
   * 默认会转换所有标签上的 `class` 与 `hover-class`。此配置允许通过 `Map` 或对象为特定标签指定需要转换的属性字符串或正则表达式数组。
   * - 使用 `'*'` 作为键可为所有标签追加通用规则。
   * - 支持传入 `Map<string | RegExp, (string | RegExp)[]>` 以满足复杂匹配需求。
   * - 常见场景包括通过组件 `prop` 传递类名，或对三方组件的自定义属性做匹配，更多讨论见 [issue#129](https://github.com/sonofmagic/weapp-tailwindcss/issues/129#issuecomment-1340914688) 与 [issue#134](https://github.com/sonofmagic/weapp-tailwindcss/issues/134#issuecomment-1351288238)。
   * 如果自定义规则已经覆盖默认的 `class`/`hover-class`，可开启 [`disabledDefaultTemplateHandler`](/docs/api/options/important#disableddefaulttemplatehandler) 以关闭内置模板处理器。
   * @example
   * ```js
   * const customAttributes = {
   *   '*': [/[A-Za-z]?[A-Za-z-]*[Cc]lass/],
   *   'van-image': ['custom-class'],
   *   'ice-button': ['testClass'],
   * }
   * ```
   */
  customAttributes?: ICustomAttributes | undefined
  /**
   * 自定义 class 名称的替换字典。
   *
   * @group 0.重要配置
   * @remarks
   * 默认策略会将小程序不允许的字符映射为等长度的替代字符串，因此无法通过结果反推出原始类名。如需完全自定义，可传入 `Record<string, string>`，只需确保生成的类名不会与已有样式冲突。示例参考 [constants.ts](https://github.com/weapp-tailwindcss/weapp-tailwindcss/blob/main/packages/escape/src/constants.ts)。
   * @default MappingChars2String
   */
  customReplaceDictionary?: Record<string, string> | undefined

  /**
   * 忽略指定标签模板表达式中的标识符。
   *
   * @since ^4.0.0
   * @group 0.重要配置
   * @remarks
   * 当模板字符串被这些标识符包裹时，将跳过转义处理。
   * @default ['weappTwIgnore']
   */
  ignoreTaggedTemplateExpressionIdentifiers?: (string | RegExp)[] | undefined
  /**
   * 忽略指定调用表达式中的标识符。
   *
   * @since ^4.0.0
   * @group 0.重要配置
   * @remarks
   * 使用这些方法包裹的模板字符串或字符串字面量会跳过转义，常与 `@weapp-tailwindcss/merge` 配合（如 `['twMerge', 'twJoin', 'cva']`）。
   */
  ignoreCallExpressionIdentifiers?: (string | RegExp)[] | undefined

  // ------------------------------------------------------------------------------------------------------------------------
  // ------------------------------Postcss-----------------------------------------------------------------------------------
  // ------------------------------------------------------------------------------------------------------------------------
  /**
   * 控制在视图节点上注入的 CSS 预设。
   *
   * @group 0.重要配置
   * @see https://github.com/sonofmagic/weapp-tailwindcss/issues/7
   * @remarks
   * 默认会向所有 `view`/`text` 元素注入 Tailwind 风格的基础样式，可通过此配置禁用、调整或补充规则，受 `cssPreflightRange` 影响。
   * 默认值使用 Tailwind CSS v4 风格的 `margin` / `padding` / `border` reset。
   * @example
   * ```js
   * cssPreflight: {
   *   'box-sizing': 'border-box',
   *   margin: '0',
   *   padding: '0',
   *   border: '0 solid',
   * }
   *
   * cssPreflight: false
   *
   * cssPreflight: {
   *   'box-sizing': false,
   *   background: 'black',
   * }
   * ```
   * @deprecated 请使用 `cssOptions.cssPreflight`。
   */
  cssPreflight?: CssPreflightOptions | undefined
  /**
   * 控制 `cssPreflight` 注入的 DOM 选择器范围。
   *
   * @group 0.重要配置
   * @see https://github.com/sonofmagic/weapp-tailwindcss/pull/62
   * @remarks
   * 仅 `view`、`text` 及其伪元素会受影响。设置为 `'all'` 可以覆盖所有元素，此时需自行处理与宿主默认样式的冲突。
   * @deprecated 请使用 `cssOptions.cssPreflightRange`。
   */
  cssPreflightRange?: 'all' | undefined
  /**
   * 预计算构建期可确定的 `calc()` 表达式。
   *
   * @group 0.重要配置
   * @since ^4.3.0
   * @remarks
   * 可传入 'auto'、布尔值、选项对象或变量匹配列表（支持正则）。明确的微信 v4 默认采用 'auto'，只在完整样式作用域下静态化固定 rpx 主题及字面量计算；其他平台不默认计算。
   * 局部、条件或冲突覆盖及无法解析的变量保留运行时表达式。成功求值时默认替换原声明；显式设置 `preserve: true` 才同时保留原声明。
   * 普通 `var()` 不会因此全局展开。需要 JavaScript 或内联样式动态修改主题时，请显式设置 `cssOptions.cssCalc: false`，自动分析无法预测这些未来覆盖。
   * @example
   * ```css
   * // 原始输出
   * page,
   * :root {
   *   --spacing: 8rpx;
   * }
   * .h-2 {
   *   height: calc(var(--spacing) * 2);
   * }
   * ```
   *
   * ```css
   * // cssCalc: ['--spacing']，变量固定时默认替换为最终值
   * .h-2 {
   *   height: 16rpx;
   * }
   * ```
   *
   * ```js
   * cssCalc: ['--spacing']
   * cssCalc: { includeCustomProperties: ['--spacing'], preserve: true }
   * ```
   *
   * ```css
   * // preserve: true 时保留原声明；后声明仍参与运行时层叠
   * .h-2 {
   *   height: 16rpx;
   *   height: calc(var(--spacing) * 2);
   * }
   * ```
   * @deprecated 请使用 `cssOptions.cssCalc`。
   */
  cssCalc?: 'auto' | boolean | CssCalcOptions | (string | RegExp)[] | undefined

  /**
   * 是否额外注入 `tailwindcss css var scope`。
   *
   * @group 0.重要配置
   * @since ^2.6.0
   * @remarks
   * 当构建链路（例如 `@tarojs/plugin-html`）移除了包含 `*` 的选择器时，可启用该选项重新写入变量作用域，以避免渐变等功能失效。
   * @default false
   * @deprecated 请使用 `cssOptions.injectAdditionalCssVarScope`。
   */
  injectAdditionalCssVarScope?: boolean | undefined
  /**
   * 控制 CSS 选择器的替换规则。
   *
   * @group 0.重要配置
   * @deprecated 请使用 `cssOptions.cssSelectorReplacement`。
   */
  cssSelectorReplacement?: {
    /**
     * 将全局选择器 `:root` 替换为指定值。
     *
     * @default `['page','.tw-root','wx-root-portal-content']` <br/>
     * @remarks
     * 设置为 `false` 时不再替换，可根据宿主环境（例如 RootPortal）传入数组值。
     * @example
     * root: ['page', '.tw-root', 'wx-root-portal-content']
     */
    root?: string | string[] | false | undefined
    /**
     * 将全局选择器 `*` 替换为指定值。
     *
     * @see https://github.com/sonofmagic/weapp-tailwindcss/issues/81 <br/>
     * @default `['view','text']` <br/>
     * @remarks
     * 小程序环境不支持 `*`，因此默认转换为 `view`、`text`；设置为 `false` 会留下原始选择器。
     */
    universal?: string | string[] | false | undefined
  } | undefined
  /**
   * rem 到 rpx 的转换配置。
   *
   * @since ^3.0.0
   * @group 0.重要配置
   * @remarks
   * 传入 `true` 使用默认配置，或提供 [postcss-rem-to-responsive-pixel](https://www.npmjs.com/package/postcss-rem-to-responsive-pixel) 支持的完整选项。
   * ```ts
   * {
   *   rootValue: 32,
   *   propList: ['*'],
   *   transformUnit: 'rpx',
   * }
   * ```
   * @deprecated 请使用 `cssOptions.rem2rpx`。
   */
  rem2rpx?: boolean | Rem2rpxOptions | undefined
  /**
   * px 到 rpx 的转换配置。
   *
   * @group 0.重要配置
   * @since ^4.3.0
   * @remarks
   * 传入 `true` 启用默认映射（`1px = 1rpx`），或通过对象自定义更多行为。
   * @deprecated 请使用 `cssOptions.px2rpx`。
   */
  px2rpx?: boolean | Px2rpxOptions | undefined

  /**
   * 多单位转 px 的转换配置。
   *
   * @group 0.重要配置
   * @remarks
   * 传入 `true` 启用默认映射（postcss-units-to-px 默认单位表），或通过对象自定义行为。
   * 默认关闭。
   * @deprecated 请使用 `cssOptions.unitsToPx`。
   */
  unitsToPx?: boolean | UnitsToPxOptions | undefined

  /**
   * 当前样式处理平台。
   *
   * @group 0.重要配置
   * @remarks
   * 主要供 `unitConversion.platforms` 精确选择平台规则。未传入时会从常见构建环境变量推断。
   * @deprecated 请使用 `cssOptions.platform`。
   */
  platform?: IStyleHandlerOptions['platform'] | undefined

  /**
   * 任意样式单位转换配置。
   *
   * @group 0.重要配置
   * @remarks
   * 底层使用 `postcss-rule-unit-converter`，可直接传入其 `rules`、`propList`、`selectorBlackList` 等配置。
   * 需要按平台区分时，使用 `platforms` 配置；平台名称会兼容 `weapp`/`mp-weixin`、`h5`/`web`、`app-plus`/`app` 等常见别名。
   * 平台优先读取当前样式处理选项的 `platform`，未传入时会从 `WEAPP_TW_TARGET`、`WEAPP_TAILWINDCSS_TARGET`、`UNI_PLATFORM`、`UNI_UTS_PLATFORM`、`TARO_ENV`、`MPX_CLI_MODE` 与 `MPX_CURRENT_TARGET_MODE` 推断。
   * 默认关闭，且不会隐式注册 Tailwind CSS 官方 PostCSS 插件。
   * @example
   * ```ts
   * import { unitConversionComposeRules, unitConversionPresets } from 'weapp-tailwindcss'
   *
   * weappTailwindcss({
   *   unitConversion: {
   *     platforms: {
   *       'mp-weixin': {
   *         rules: unitConversionComposeRules(
   *           unitConversionPresets.pxToRpx({ ratio: 2 }),
   *           unitConversionPresets.remToRpx({ rootValue: 16 }),
   *         ),
   *       },
   *       h5: {
   *         rules: [
   *           unitConversionPresets.rpxToPx({ ratio: 0.5 }),
   *         ],
   *       },
   *     },
   *   },
   * })
   * ```
   * @deprecated 请使用 `cssOptions.unitConversion`。
   */
  unitConversion?: UnitConversionOptions | undefined

  /**
   * `postcss-preset-env` 的配置项。
   *
   * @since ^4.0.0
   * @group 0.重要配置
   * @see https://preset-env.cssdb.org/
   * @see https://github.com/csstools/postcss-plugins/tree/main/plugin-packs/postcss-preset-env#readme
   * @deprecated 请使用 `cssOptions.cssPresetEnv`。
   */
  cssPresetEnv?: PresetEnvOptions | undefined

  /**
   * 控制构建端保留或移除的 CSS at-rule。
   *
   * @internal
   * @deprecated 请使用 `cssOptions.atRules`。
   */
  atRules?: IStyleHandlerOptions['atRules'] | undefined

  /**
   * 控制内置 autoprefixer 后处理。
   *
   * @since ^4.11.3
   * @group 0.重要配置
   * @remarks
   * Tailwind CSS v4 下默认启用，用于为小程序 WebView 补齐 `-webkit-` 等兼容前缀，例如让 `bg-clip-text` 输出 `-webkit-background-clip: text`。
   * 传入 `false` 可显式关闭，传入 `true` 或对象可手动启用或自定义 autoprefixer 参数。
   * @default `true`
   * @example
   * ```ts
   * weappTailwindcss({
   *   autoprefixer: false,
   * })
   * ```
   * @deprecated 请使用 `cssOptions.autoprefixer`。
   */
  autoprefixer?: WeappAutoprefixerOptions | undefined

  /**
   * 配置 Tailwind CSS v4 的运行时行为。
   *
   * @since ^4.0.0
   * @group 0.重要配置
   */
  tailwindcss?: TailwindCssRuntimeOptions['tailwindcss'] | undefined

  /**
   * 指定 tailwindcss@4 的入口 CSS。
   *
   * @since ^4.2.6
   * @group 0.重要配置
   * @remarks
   * 等价于设置 `tailwindcss.v4.cssEntries`。Tailwind CSS 4 项目应显式配置入口 CSS 的绝对路径；多入口、分包、独立分包、Webpack/Gulp/自定义构建和多平台构建都应该写清楚这些入口。`cssEntries` 只负责入口识别，入口样式文件仍然要被项目实际 import 或纳入构建图。
   *
   * 虽然类型上是可选项，但业务项目不应依赖入口推断作为长期配置契约。显式配置可以避免某些平台产物名、CSS 合并策略或分包输出差异导致 Tailwind CSS 生成不完整。
   */
  cssEntries?: string[] | undefined
  /**
   * 配置 uni-app x 场景的行为。
   *
   * @since ^4.2.0
   * @group 0.重要配置
   * @ignore
   */
  uniAppX?: boolean | UniAppXOptions | undefined

  /**
   * uni-app x 样式目标。
   *
   * @internal
   */
  uniAppXCssTarget?: IStyleHandlerOptions['uniAppXCssTarget'] | undefined

  /**
   * uni-app x 不兼容 utility 的处理策略。
   *
   * @internal
   */
  uniAppXUnsupported?: IStyleHandlerOptions['uniAppXUnsupported'] | undefined
}
