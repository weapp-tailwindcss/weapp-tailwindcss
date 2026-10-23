import type { IStyleHandlerOptions, StyleHandler } from '@weapp-tailwindcss/postcss/types'
import type { HmrContext } from 'vite'
import type { ViteHmrCssModuleVersionTracker } from './framework-hmr-module-version'
import type { ICustomAttributesEntities, JsHandler } from '@/types'

/** 扩展只读取已解析的构建事实，不取得构建器配置对象。 */
export interface FrameworkBuildFacts {
  readonly root: string
  readonly command: 'build' | 'serve'
  readonly build: Readonly<{ outDir: string }>
}

export interface FrameworkGenerationRequest {
  addWatchFile?: ((id: string) => void) | undefined
  disableSourceScan?: boolean | undefined
  sourceCandidates?: Iterable<string> | undefined
  transient?: boolean | undefined
}

/** 绑定到当前会话的操作不暴露处理器属性或资源释放权。 */
export interface ViteFrameworkExtraPluginContext {
  readonly cssPreflight: IStyleHandlerOptions['cssPreflight']
  readonly cssPreflightRange: IStyleHandlerOptions['cssPreflightRange']
  readonly customAttributesEntities: ICustomAttributesEntities
  readonly disabledDefaultTemplateHandler: boolean | undefined
  ensureRuntimeClassSet: (force?: boolean) => Promise<ReadonlySet<string>>
  generateCss: (id: string, code: string, request?: FrameworkGenerationRequest) => Promise<string | undefined>
  getResolvedConfig: () => FrameworkBuildFacts | undefined
  readonly hmrCssModuleVersions: Omit<ViteHmrCssModuleVersionTracker, 'clear'>
  beginSfcStyleUpdate: () => void
  isEnabled: () => boolean
  isNativeAppStyleTarget: () => boolean
  isWebGeneratorTarget: () => boolean
  transformJs: JsHandler
  matchesMainCss: (file: string) => boolean
  registerModuleGraphCandidates: (id: string, source: string) => Promise<ReadonlySet<string>>
  waitForRuntimeReady: () => Promise<unknown>
  transformStyle: (css: string, options?: Partial<IStyleHandlerOptions>) => ReturnType<StyleHandler>
  syncSourceCandidatesForHotUpdate: (ctx: HmrContext) => Promise<void>
  readonly tailwindRootCssModuleIds: Iterable<string>
  readonly viteProcessedCssSourceFiles: Iterable<string>
  readonly webCssEntryDiagnostics: {
    flush: () => void
    observeSourceImports: (source: string, sourceId: string) => void
    requestCheck: () => void
  }
}
