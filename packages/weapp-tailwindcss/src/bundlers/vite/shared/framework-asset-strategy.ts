import type { OutputAsset, OutputBundle } from 'rollup'
import type { CreateJsHandlerOptions, InternalUserDefinedOptions, IStyleHandlerOptions, LinkedJsModuleResult } from '@/types'

/** 仅提供当前 JS 资产的转换服务；缓存提交与任务调度由构建器持有。 */
export interface ViteFrameworkJsAssetContext {
  asset: OutputAsset
  bundle: OutputBundle
  file: string
  source: string
  outDir: string
  cache: InternalUserDefinedOptions['cache']
  hashKey: string
  hashSalt: string
  createHandlerOptions: (file: string, extra?: CreateJsHandlerOptions) => CreateJsHandlerOptions
  debug: (format: string, ...args: unknown[]) => void
  disableJsPrecheck: boolean
  jsHandler: InternalUserDefinedOptions['jsHandler']
  onUpdate: InternalUserDefinedOptions['onUpdate']
  runtimeSet: Set<string>
  shouldTransform: boolean
  applyLinkedResults: (linked?: Record<string, LinkedJsModuleResult>) => void
}

/** 框架只接收当前阶段产物和生成操作，不持有生成器或共享缓存状态。 */
export interface ViteFrameworkStyleAssetContext {
  bundle: OutputBundle
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
