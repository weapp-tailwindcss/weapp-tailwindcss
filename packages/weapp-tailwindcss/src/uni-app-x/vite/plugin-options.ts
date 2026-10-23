import type { UniPlatformInfo } from '@weapp-tailwindcss/env'
import type { HmrContext } from 'vite'
import type { ViteHmrCssModuleVersionTracker } from '@/bundlers/vite/shared/framework-hmr-module-version'
import type { FrameworkBuildFacts, ViteFrameworkExtraPluginContext } from '@/bundlers/vite/shared/framework-services'
import type {
  AppType,
  ICustomAttributesEntities,
  InternalUserDefinedOptions,
  JsHandler,
} from '@/types'

export interface CreateUniAppXPluginsOptions {
  appType: AppType
  customAttributesEntities: ICustomAttributesEntities
  cssPreflight?: InternalUserDefinedOptions['cssPreflight'] | undefined
  cssPreflightRange?: InternalUserDefinedOptions['cssPreflightRange'] | undefined
  disabledDefaultTemplateHandler: boolean | undefined
  mainCssChunkMatcher: NonNullable<InternalUserDefinedOptions['mainCssChunkMatcher']>
  registerModuleGraphCandidates?: ((id: string, source: string) => Promise<ReadonlySet<string>>) | undefined
  runtimeState: { readyPromise: Promise<unknown> }
  styleHandler: ViteFrameworkExtraPluginContext['transformStyle']
  syncSourceCandidatesForHotUpdate?: ((ctx: HmrContext) => Promise<void>) | undefined
  tailwindRootCssModuleIds?: Iterable<string> | undefined
  generateCss?: ((id: string, code: string, hookContext?: {
    addWatchFile?: (id: string) => void
    disableSourceScan?: boolean
    sourceCandidates?: Iterable<string>
    transient?: boolean
  }) => Promise<string | undefined> | string | undefined) | undefined
  jsHandler: JsHandler
  ensureRuntimeClassSet: (force?: boolean) => Promise<ReadonlySet<string>>
  getResolvedConfig: () => FrameworkBuildFacts | undefined
  hmrCssModuleVersions?: Omit<ViteHmrCssModuleVersionTracker, 'clear'> | undefined
  beginSfcStyleUpdate?: (() => void) | undefined
  isIosPlatform?: boolean
  uniUtsPlatform?: Readonly<UniPlatformInfo>
  isNativeAppStyleTarget?: (() => boolean) | undefined
  isWebGeneratorTarget?: (() => boolean) | undefined
  isEnabled?: (() => boolean) | undefined
  uniAppX?: InternalUserDefinedOptions['uniAppX']
  viteProcessedCssSourceFiles?: Iterable<string> | undefined
  webCssEntryDiagnostics?: {
    flush: () => void
    observeSourceImports: (source: string, sourceId: string) => void
    requestCheck: () => void
  } | undefined
}
