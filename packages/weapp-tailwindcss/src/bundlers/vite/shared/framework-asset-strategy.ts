import type { FrameworkAssetAccess, FrameworkAssets } from './framework-assets'
import type { CreateJsHandlerOptions, InternalUserDefinedOptions, IStyleHandlerOptions, JsHandlerResult } from '@/types'

/** 仅提供当前 JS 资产的转换服务；缓存提交与任务调度由构建器持有。 */
export interface ViteFrameworkJsAssetContext {
  assets: FrameworkAssets
  file: string
  shouldTransform: boolean
  shouldSkipTransform: (extra?: CreateJsHandlerOptions) => boolean
  transformJs: (source: string, extra?: CreateJsHandlerOptions) => Promise<JsHandlerResult>
  runCachedTransform: (options: {
    hashSalt: string
    transform: (source: string) => Promise<JsHandlerResult>
  }) => Promise<void>
}

/** 框架只接收当前阶段产物和生成操作，不持有生成器或共享缓存状态。 */
export interface ViteFrameworkStyleAssetContext {
  assets: FrameworkAssetAccess
  debug: (format: string, ...args: unknown[]) => void
  generateCss: (source: string, outputFile: string) => Promise<string | undefined>
  getCssHandlerOptions: (file: string) => IStyleHandlerOptions
  getProcessedCssSources: () => string[]
  isHarmonyAppStyleTarget: boolean
  isNativeAppStyleTarget: boolean
  onUpdate: InternalUserDefinedOptions['onUpdate']
}

export interface ViteFrameworkAssetPipelineStrategy {
  createJsAssetTask?: (context: ViteFrameworkJsAssetContext) => (() => Promise<void>) | undefined
  /** 产物转换完成后执行；返回的操作只在本轮 CSS 同步后执行。 */
  afterTransform?: (context: ViteFrameworkStyleAssetContext) => Promise<(() => void) | undefined>
  finalizeStyles?: (context: ViteFrameworkStyleAssetContext) => Promise<void>
}
