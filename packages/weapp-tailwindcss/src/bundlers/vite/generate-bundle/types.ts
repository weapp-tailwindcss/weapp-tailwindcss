import type { OutputAsset } from 'rollup'
import type { ResolvedConfig } from 'vite'
import type { HmrTimingRecorder } from '../../shared/hmr-timing'
import type { BundleSnapshot } from '../bundle-state'
import type { ViteCssAssetIdentity } from '../css-asset-identity'
import type { ViteFrameworkCssPipelineStrategy } from '../shared/framework-strategy'
import type { SourceCandidateFilterOptions } from '../source-candidates'
import type { TailwindSourceEntry } from '@/tailwindcss/source-scan'
import type { InternalUserDefinedOptions } from '@/types'

export interface GenerateBundleContext {
  onSkipProcessBundle?: (() => void | Promise<void>) | undefined
  processMarkupAndScripts?: boolean | undefined
  processStyles?: boolean | undefined
  shouldProcessBundle?: (() => boolean) | undefined
  shouldProcessStyles?: (() => boolean) | undefined
  opts: InternalUserDefinedOptions
  runtimeState: {
    tailwindRuntime: InternalUserDefinedOptions['tailwindRuntime']
    readyPromise: Promise<void>
  }
  ensureRuntimeClassSet: (force?: boolean) => Promise<Set<string>>
  ensureBundleRuntimeClassSet: (
    snapshot: BundleSnapshot,
    forceRefresh?: boolean,
    options?: {
      allowBaselineOnlyInitialSync?: boolean | undefined
      baseClassSet?: Set<string> | undefined
      refreshBySource?: boolean | undefined
      transformOnly?: boolean | undefined
    },
  ) => Promise<Set<string>>
  debug: (format: string, ...args: unknown[]) => void
  getResolvedConfig: () => ResolvedConfig | undefined
  markCssAssetProcessed?: (asset: OutputAsset, file?: string) => void
  isCssAssetProcessed?: (asset: OutputAsset, file?: string) => boolean
  isViteProcessedCssAsset?: (asset: OutputAsset, file?: string) => boolean
  resolveCssAssetIdentity?: (asset: OutputAsset, file?: string) => ViteCssAssetIdentity
  recordCssAssetResult?: (file: string, css: string) => void
  recordViteProcessedCssAssetResult?: (file: string, css: string, options?: { injectIntoMain?: boolean | undefined, outputFile?: string | undefined }) => void
  getViteProcessedCssAssetResults?: () => Iterable<[string, string | { css: string, injectIntoMain?: boolean | undefined, outputFile?: string | undefined }]>
  getViteProcessedCssAssetResult?: (file: string) => { css: string, injectIntoMain?: boolean | undefined, outputFile?: string | undefined } | undefined
  getSourceCandidates?: () => Set<string>
  getSourceCandidateSource?: (file: string) => string | undefined
  getSourceCandidateSources?: () => Iterable<[string, string]>
  extractSourceCandidates?: (file: string, source: string) => Promise<Set<string>>
  getSourceCandidatesForEntries?: ((entries: TailwindSourceEntry[] | undefined, options?: SourceCandidateFilterOptions) => Set<string>) | undefined
  getSourceCandidateSourcesForEntries?: ((entries: TailwindSourceEntry[] | undefined, options?: SourceCandidateFilterOptions) => Map<string, Set<string>>) | undefined
  waitForSourceCandidateSyncs?: () => Promise<void>
  rememberCssSource?: ((entry: RememberedCssSource, cssRuntimeSignature?: string) => void) | undefined
  getRememberedCssSources?: () => Iterable<[string, RememberedCssSource]>
  getRememberedCssSignature?: (file: string) => string | undefined
  setRememberedCssSignature?: (file: string, cssRuntimeSignature: string) => void
  getKnownCssSource?: (file: string) => string | undefined
  getKnownSfcSource?: (file: string) => string | undefined
  getOriginalCssLayerSource?: (file: string) => string | undefined
  recordGeneratorCandidates?: (candidates: Set<string>) => void
  pruneViteCssCaches?: (options: {
    activeFiles: Set<string>
    activeKnownSfcFiles?: Set<string> | undefined
  }) => void
  getViteCssCacheStats?: () => Record<string, unknown>
  hmrTimingRecorder?: HmrTimingRecorder
  cssPipelineStrategy?: ViteFrameworkCssPipelineStrategy | undefined
  frameworkRootImportShellTargetByFile?: Map<string, string> | undefined
}

export interface RememberedCssSource {
  outputFile: string
  rawSource: string
  sourceFile: string
}

export interface PendingRememberedCssReplayUpdate {
  css: string
  file: string
  injectIntoMain?: boolean | undefined
  outputFile: string
}

export interface GenerateBundleThis {
  addWatchFile?: (id: string) => void
  emitFile?: (emittedFile: {
    type: 'asset'
    fileName: string
    source: string
  }) => string
  getModuleInfo?: (id: string) => { code: string | null } | null
}
