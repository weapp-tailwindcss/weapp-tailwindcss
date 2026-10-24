import type { createFrameworkCssAssets } from '@/bundlers/vite/shared/framework-css-assets'
import { vi } from 'vitest'
import { createFrameworkCssGenerator } from '@/bundlers/vite/shared/framework-css-generator'

export function createWatchCssGenerator(assets: ReturnType<typeof createFrameworkCssAssets>) {
  const generatorOptions = { target: 'web', importFallback: false }
  const branch = { isWeb: true }
  return createFrameworkCssGenerator({
    ...assets,
    opts: { htmlMatcher: () => false, cssSourceTrace: false },
    runtimeState: { readyPromise: Promise.resolve() },
    shouldOwnTailwindGeneration: true,
    sourceScanSession: { waitForPendingSyncs: async () => {} },
    getResolvedConfig: () => ({ root: '/repo', command: 'build' }),
    resolveCurrentGeneratorOptions: () => generatorOptions,
    resolveCurrentGeneratorBranch: () => branch,
    createCssPipelineContext: () => ({ currentGeneratorBranch: branch, currentGeneratorOptions: generatorOptions, matchesCss: () => true }),
    normalizeGeneratedCssCacheFile: (file: string) => file,
    getSourceCandidates: () => new Set(),
    getRecordedGeneratorCandidates: () => undefined,
    ensureRuntimeClassSet: async () => new Set(),
    hmrCandidateState: {
      resolve: () => undefined,
      shouldForceFullRegeneration: () => false,
      snapshotDebugState: () => ({}),
      hasPendingChange: () => false,
      clear: vi.fn(),
    },
    getSourceCandidatesForEntries: () => new Set(),
    getSourceCandidateSourcesForEntries: () => new Map(),
    markViteProcessedCssSource: assets.processedCssRegistry.markSource,
    rememberTailwindRootCssModule: vi.fn(),
    recordGeneratorCandidates: vi.fn(),
    debug: vi.fn(),
    normalizeViteProcessedCssFile: (file: string) => file,
    transformCssHandlerOptions: { getCssHandlerOptions: () => ({}), getCssUserHandlerOptions: () => ({}) },
    transientAutoCssSources: new Map(),
    hmrTimingRecorder: { measure: (_name: string, task: () => unknown) => task() },
    resolveGeneratorPlatform: () => 'h5',
    styleHandler: async (css: string) => ({ css }),
    shouldAdaptFrameworkWatchCss: () => false,
    finalizeViteMiniProgramCss: (css: string) => css,
    mainCssChunkMatcher: () => false,
  } as any)
}
