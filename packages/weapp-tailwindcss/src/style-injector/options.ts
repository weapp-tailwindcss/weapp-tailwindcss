import type {
  MpxSubPackageConfig,
  ResolvedSubpackageStyleScope,
  SubpackageStyleGenerateContext,
  SubpackageStyleGenerator,
  SubpackageStyleRules,
  TaroSubPackageConfig,
  UniAppManualStyleConfig,
  UniAppStyleScopeInput,
  UniAppSubPackageConfig,
  WeappStyleInjectorOptions,
} from 'weapp-style-injector/types'

import { omitUndefined } from '@/utils/object'

export type DefinedStyleInjectorOptions = {
  [K in keyof WeappTailwindcssStyleInjectorOptions]: Exclude<WeappTailwindcssStyleInjectorOptions[K], undefined>
}

export type WeappTailwindcssStyleInjectorUserOptions = boolean | WeappTailwindcssStyleInjectorOptions

export interface WeappTailwindcssStyleInjectorOptions extends WeappStyleInjectorOptions {
  /**
   * uni-app 的 `pages.json` 路径。未传入时，uni-app 预设会按当前工作目录探测 `src/pages.json` 与 `pages.json`。
   */
  pagesJsonPath?: string | string[] | undefined
  /**
   * Taro 的 `app.config` 路径。未传入时，Taro 预设会按当前工作目录探测常见配置文件。
   */
  appConfigPath?: string | string[] | undefined
  /**
   * Mpx 的 app 配置路径。未传入时，Mpx 预设会按当前工作目录探测 `src/app.mpx`、`app.mpx` 等入口。
   */
  appPath?: string | string[] | undefined
  /**
   * Mpx 源码根目录。
   */
  sourceRoot?: string | undefined
  /**
   * 框架分包样式配置。
   */
  subPackages?: UniAppSubPackageConfig | UniAppSubPackageConfig[] | TaroSubPackageConfig | TaroSubPackageConfig[] | MpxSubPackageConfig | MpxSubPackageConfig[] | undefined
  /**
   * uni-app 通用分包配置。
   */
  uniAppSubPackages?: UniAppSubPackageConfig | UniAppSubPackageConfig[] | undefined
  /**
   * uni-app 手动样式作用域配置。
   */
  uniAppStyleScopes?: UniAppManualStyleConfig | UniAppManualStyleConfig[] | undefined
  /**
   * 已解析的分包样式作用域。通常只在需要完全接管预设解析时使用。
   */
  subpackageStyleScopes?: ResolvedSubpackageStyleScope[] | undefined
  /**
   * 生成分包样式入口内容。
   */
  generateSubpackageStyle?: SubpackageStyleGenerator | ((context: SubpackageStyleGenerateContext) => string | Uint8Array | null | undefined | Promise<string | Uint8Array | null | undefined>) | undefined
  /**
   * 加载由源码模块推导出的目标样式内容。Webpack 场景必须同步返回。
   */
  loadSubpackageTargetStyle?: ((fileName: string, sourceAbsolutePath: string) => string | Uint8Array | null | undefined | Promise<string | Uint8Array | null | undefined>) | undefined
  /**
   * 分包样式源文件名。
   */
  sourceFileName?: string | string[] | undefined
  /**
   * 分包样式输出名。
   */
  outputName?: string | undefined
  /**
   * 限定需要注入分包入口的目标文件。
   */
  files?: string | string[] | undefined
  /**
   * 分包目标文件 include 规则。
   */
  include?: WeappStyleInjectorOptions['include']
  /**
   * 分包目标文件 exclude 规则。
   */
  exclude?: WeappStyleInjectorOptions['exclude']
  /**
   * uni-app 旧版分包入口文件名配置。
   *
   * @deprecated 请使用 `sourceFileName`。
   */
  indexFileName?: string | string[] | undefined
  /**
   * Taro 旧版分包入口文件名配置。
   *
   * @deprecated 请使用 `sourceFileName`。
   */
  indexFileNames?: string | string[] | undefined
  /**
   * uni-app 样式作用域配置。
   */
  styleScopes?: UniAppStyleScopeInput | UniAppStyleScopeInput[] | undefined
  /**
   * 框架预设的分包样式注入规则，用样式入口到目标产物的映射描述注入关系。
   *
   * @example
   * ```ts
   * rules: {
   *   'tailwind.css': ['pages/index.wxss'],
   *   'components.css': ['components/card.wxss'],
   * }
   * ```
   */
  rules?: SubpackageStyleRules | undefined
  /**
   * 生成分包入口前是否走框架预处理。
   */
  preprocess?: boolean | undefined
}

export function normalizeStyleInjectorOptions(
  options: WeappTailwindcssStyleInjectorUserOptions | undefined,
): DefinedStyleInjectorOptions | undefined {
  if (options === true) {
    return {}
  }
  if (!options) {
    return undefined
  }
  return omitUndefined<DefinedStyleInjectorOptions>(options)
}

/** 在框架入口校验分包配置，避免把另一框架的配置静默交给预设。 */
export function resolveStyleInjectorSubPackages<K extends 'appConfigPath' | 'pagesJsonPath' | 'appPath'>(
  subPackages: DefinedStyleInjectorOptions['subPackages'],
  key: K,
): Extract<UniAppSubPackageConfig | TaroSubPackageConfig | MpxSubPackageConfig, Record<K, string>>[] | undefined {
  if (subPackages === undefined) {
    return undefined
  }
  const entries = Array.isArray(subPackages) ? subPackages : [subPackages]
  return entries.map((entry) => {
    if (hasSubPackagePath(entry, key)) {
      return entry
    }
    throw new TypeError(`[weapp-style-injector] subPackages must provide ${key} for the selected framework.`)
  })
}

function hasSubPackagePath<K extends 'appConfigPath' | 'pagesJsonPath' | 'appPath'>(
  entry: UniAppSubPackageConfig | TaroSubPackageConfig | MpxSubPackageConfig,
  key: K,
): entry is Extract<UniAppSubPackageConfig | TaroSubPackageConfig | MpxSubPackageConfig, Record<K, string>> {
  return key in entry && typeof Reflect.get(entry, key) === 'string'
}
