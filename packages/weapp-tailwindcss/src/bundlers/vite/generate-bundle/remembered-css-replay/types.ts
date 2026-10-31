import type { OutputAsset, OutputChunk } from 'rollup'
import type { ViteFrameworkCssPipelineContext, ViteFrameworkCssPipelineStrategy } from '../../shared/framework-strategy'
import type { BundleMetrics } from '../metrics'
import type { GenerateBundleContext, PendingRememberedCssReplayUpdate, RememberedCssSource } from '../types'

export interface ProcessRememberedCssReplayOptions {
  addWatchFile: (id: string) => void
  bundle: Record<string, OutputAsset | OutputChunk>
  bundleFiles: string[]
  cache: GenerateBundleContext['opts']['cache']
  changedCssFiles: Set<string>
  createScopedGeneratorRuntime: (
    outputFile: string,
    cssHandlerOptions: { isMainChunk?: boolean | undefined },
    runtime: Set<string>,
    rawSource?: string | undefined,
    sourceFile?: string | undefined,
    scopeToSource?: boolean | undefined,
  ) => Promise<Set<string>>
  createScopedSourceCandidateGetter: (
    outputFile: string,
    cssHandlerOptions: { isMainChunk?: boolean | undefined },
    sourceFile?: string | undefined,
  ) => GenerateBundleContext['getSourceCandidatesForEntries']
  createScopedSourceCandidateSourceGetter: (
    outputFile: string,
    cssHandlerOptions: { isMainChunk?: boolean | undefined },
    sourceFile?: string | undefined,
  ) => GenerateBundleContext['getSourceCandidateSourcesForEntries']
  cssTaskFactories: Array<() => Promise<void>>
  cssPipelineContext: ViteFrameworkCssPipelineContext
  cssPipelineStrategy?: ViteFrameworkCssPipelineStrategy | undefined
  debug: GenerateBundleContext['debug']
  defaultStyleOutputExtension: string
  emitOrReplayCssAsset: (fileName: string, source: string) => OutputAsset | undefined
  generatorRuntime: Set<string>
  generatorPlatform?: string | undefined
  getCssHandlerOptions: (file: string) => ReturnType<ReturnType<typeof import('../../css-handler-options').createCssHandlerOptionsCache>['getCssHandlerOptions']>
  getCssUserHandlerOptions: (file: string) => ReturnType<ReturnType<typeof import('../../css-handler-options').createCssHandlerOptionsCache>['getCssUserHandlerOptions']>
  getRememberedCssSignature?: ((file: string) => string | undefined) | undefined
  getRememberedCssSources?: (() => Iterable<[string, RememberedCssSource]>) | undefined
  captureCssSource?: GenerateBundleContext['captureCssSource']
  frameworkRootImportShellTargetByFile?: ReadonlyMap<string, string> | undefined
  isNativeAppStyleTarget: boolean
  isWebGeneratorTarget: boolean
  lastCssRawSourceHashByFile: Map<string, string>
  lastCssResultByFile: Map<string, string>
  lastCssSourceHashByFile: Map<string, string>
  markCssAssetProcessed: GenerateBundleContext['markCssAssetProcessed']
  metrics: BundleMetrics
  normalizeViteCssCacheKey: (file: string) => string
  onUpdate: GenerateBundleContext['opts']['onUpdate']
  opts: GenerateBundleContext['opts']
  pendingRememberedCssReplayUpdates: PendingRememberedCssReplayUpdate[]
  recordCssAssetResult: GenerateBundleContext['recordCssAssetResult']
  recordViteProcessedCssAssetResult: GenerateBundleContext['recordViteProcessedCssAssetResult']
  rootDir: string
  runtimeSignature: string
  runtimeState: GenerateBundleContext['runtimeState']
  setRememberedCssSignature?: ((file: string, cssRuntimeSignature: string) => void) | undefined
  shouldInjectCssIntoMainFromOutput: (
    outputFile: string,
    sourceFile: string,
    cssHandlerOptions: { isMainChunk?: boolean | undefined },
  ) => boolean
  shouldPreserveAppCssExtension: boolean
  sourceRoot: string | undefined
  styleHandler: GenerateBundleContext['opts']['styleHandler']
  timeTask: (name: string, task: () => Promise<void>) => Promise<void>
  useIncrementalMode: boolean
  activeViteCssCacheFiles: Set<string>
}
