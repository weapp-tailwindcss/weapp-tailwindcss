import type { IStyleHandlerOptions, WebCssCompatUserOptions } from '@weapp-tailwindcss/postcss/types'
import type { WeappTailwindcssGeneratorTarget } from './types'
import type { ResolvedGeneratorOptions } from '@/compiler/compilation-profile'
import type { FrameworkPolicy } from '@/compiler/framework-policy'
import type { FrameworkEnvironment } from '@/framework-policies/environment-snapshot'
import type { RuntimeBranchContext } from '@/runtime-branch'
import type { IArbitraryValues } from '@/types/shared'
import { captureFrameworkEnvironment } from '@/framework-policies/environment-snapshot'
import { resolveFrameworkPolicy } from '@/framework-policies/resolve'
import { resolveRuntimeBranch } from '@/runtime-branch'

export interface WeappTailwindcssGeneratorOptions {
  /**
   * 生成目标。小程序构建默认使用 `weapp`，H5/Web 与普通 uni-app App WebView 默认使用 `web`。
   *
   * @remarks
   * `target` 表示 CSS 输出形态，不是平台枚举。uni-app x Android/iOS 这类原生 App 目标继续使用 `weapp` 输出族，
   * 并通过 `uniAppX`、`platform` 与单位转换配置处理 App 差异。
   */
  target?: WeappTailwindcssGeneratorTarget | undefined
  /**
   * Tailwind 配置文件路径，兼容原 Tailwind PostCSS 插件的 `config` 选项。
   */
  config?: string | undefined
  /**
   * 传给小程序 CSS 兼容转换器的额外配置。
   */
  styleOptions?: Partial<IStyleHandlerOptions> | undefined
  /**
   * Web 端 Tailwind CSS v4 产物兼容降级配置。
   *
   * @remarks
   * Web 目标在自动推断 `generator.target: 'web'` 时默认开启，经典 uni-app 的 `app` / `app-plus`
   * WebView 构建也会自动启用；显式配置 `target` 时保持用户配置。uni-app H5、Taro H5 等 preset
   * 也会在 Web 环境中显式开启。传入 `true` 等价于
   * `{ preset: 'legacy-web' }`，其兼容基线为 Chrome/91.0.4472.114 与 AppleWebKit/537.36。
   * 该预设会移除或降级 `@theme`、`@layer`、`@property`、嵌套规则、`oklch()`、
   * 现代颜色函数与相关 `@supports` 包裹，并补充 `-webkit-background-clip: text`，同时保留
   * Tailwind CSS v4 的运行时间距变量语义。
   * 如果需要保持 Tailwind CSS 官方 Web 输出，可传入 `false` 或 `{ preset: 'off' }`。
   */
  webCompat?: WebCssCompatUserOptions | undefined
  /**
   * 开发态 HMR 生成策略。
   */
  hmr?: {
    /**
     * 源码 HMR 删除 class 时是否暂时保留旧 CSS。
     *
     * @default true
     *
     * @remarks
     * 默认保留旧 CSS 可让 Vite dev HMR 只追加新增 candidates，避免每次源码变更全量重建 CSS。
     * 该行为仅影响开发态 HMR；正式 build 仍按当前源码精确输出。
     * 如果需要开发态也立即移除已删除 class 的 CSS，可设置为 `false`。
     */
    preserveDeletedCss?: boolean | undefined
  } | undefined
  /**
   * 将 `@import "weapp-tailwindcss"` 作为 Tailwind CSS v4 生成入口的兜底别名。
   *
   * 适用于旧项目仍使用 `@import "weapp-tailwindcss"` 作为入口的兼容场景，默认关闭。
   */
  importFallback?: boolean | undefined
  /**
   * 是否启用 UnoCSS 风格裸任意值。通常由顶层 `unocss` / `arbitraryValues` 配置注入。
   *
   * @internal
   */
  bareArbitraryValues?: IArbitraryValues['bareArbitraryValues'] | undefined
}

export type WeappTailwindcssGeneratorUserOptions = WeappTailwindcssGeneratorOptions | false

export interface NormalizedWeappTailwindcssGeneratorOptions extends ResolvedGeneratorOptions {}

export function resolveGeneratorConfiguration(
  options: WeappTailwindcssGeneratorUserOptions | undefined,
  context: Omit<RuntimeBranchContext, 'generatorTarget'> & { nativeStyle?: boolean | undefined, styleTarget?: string | undefined } = {},
  environment: FrameworkEnvironment = captureFrameworkEnvironment(),
): { options: NormalizedWeappTailwindcssGeneratorOptions, frameworkPolicy: FrameworkPolicy } {
  const enabled = options !== false
  const objectOptions = enabled ? options : undefined
  const frameworkPolicy = resolveFrameworkPolicy(context, environment)
  const target = objectOptions?.target ?? frameworkPolicy.defaultGeneratorTarget
  const branch = resolveRuntimeBranch({
    ...context,
    uniUtsPlatform: context.uniUtsPlatform ?? environment.uniUtsPlatform,
    generatorTarget: target,
  }, frameworkPolicy)
  const hasExplicitTarget = objectOptions !== undefined && Object.hasOwn(objectOptions, 'target')
  const webCompat = objectOptions?.webCompat ?? (!hasExplicitTarget && branch.isWeb ? true : undefined)

  if (objectOptions == null) {
    return {
      frameworkPolicy,
      options: {
        enabled,
        target,
        branch,
        webCompat,
        hmr: {
          preserveDeletedCss: true,
        },
        importFallback: false,
        bareArbitraryValues: undefined,
      },
    }
  }

  return {
    frameworkPolicy,
    options: {
      enabled,
      target,
      branch,
      config: objectOptions.config,
      styleOptions: objectOptions.styleOptions,
      webCompat,
      hmr: {
        preserveDeletedCss: objectOptions.hmr?.preserveDeletedCss ?? true,
      },
      importFallback: objectOptions.importFallback ?? false,
      bareArbitraryValues: objectOptions.bareArbitraryValues,
    },
  }
}

export function normalizeWeappTailwindcssGeneratorOptions(
  options: WeappTailwindcssGeneratorUserOptions | undefined,
  context: Omit<RuntimeBranchContext, 'generatorTarget'> = {},
): NormalizedWeappTailwindcssGeneratorOptions {
  return resolveGeneratorConfiguration(options, context).options
}
