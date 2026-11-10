import type { createFrameworkCssAssets } from '@/bundlers/vite/shared/framework-css-assets'
import { vi } from 'vitest'
import { createFrameworkCssGenerator } from '@/bundlers/vite/shared/framework-css-generator'

export function createWatchCssGenerator(
  assets: ReturnType<typeof createFrameworkCssAssets>,
  overrides: { target?: string, isWeb?: boolean, runtimeRevision?: number, uniAppX?: boolean, generatorEnabled?: boolean } = {},
) {
  const generatorOptions = { enabled: overrides.generatorEnabled ?? true, target: overrides.target ?? 'web', importFallback: false }
  const branch = { isWeb: overrides.isWeb ?? true }
  const debug = vi.fn()
  return createFrameworkCssGenerator({
    ...assets,
    opts: { htmlMatcher: () => false, cssMatcher: (file: string) => file.endsWith('.css'), cssSourceTrace: false },
    runtimeState: { readyPromise: Promise.resolve(), revision: overrides.runtimeRevision ?? 0 },
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
    debug,
    normalizeViteProcessedCssFile: (file: string) => file,
    transformCssHandlerOptions: { getCssHandlerOptions: () => ({ uniAppX: overrides.uniAppX ?? false }), getCssUserHandlerOptions: () => ({}) },
    transientAutoCssSources: new Map(),
    hmrTimingRecorder: { measure: (_name: string, task: () => unknown) => task() },
    resolveGeneratorPlatform: () => branch.isWeb ? 'h5' : 'app-android',
    styleHandler: async (css: string) => ({ css }),
    shouldAdaptFrameworkWatchCss: () => false,
    finalizeViteMiniProgramCss: (css: string) => css,
    mainCssChunkMatcher: () => false,
  } as any)
  return Object.assign(generate, { debug })
}
