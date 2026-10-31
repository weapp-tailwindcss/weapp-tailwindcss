import type { FinalizeGenerateBundleOptions } from '@/bundlers/vite/generate-bundle/finalize/root-import-shell'
import type { ViteFrameworkCssPipelineContext } from '@/bundlers/vite/shared/framework-strategy'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import { buildBundleSnapshotForBuild, createBundleBuildState } from '@/bundlers/vite/bundle-state'
import { finalizeGenerateBundle } from '@/bundlers/vite/generate-bundle/finalize/bundle'
import { createEmptyMetrics } from '@/bundlers/vite/generate-bundle/metrics'
import { createReplayCssAsset } from '@/bundlers/vite/generate-bundle/rollup-assets'
import { createContext } from './vite-plugin.testkit'

it('最终资产去重保留组件 Skyline reset，同时移除普通重复声明', async () => {
  const reset = 'view,text{--tw-leading:var(--weapp-tw-invalid-reset);--tw-font-weight:var(--weapp-tw-invalid-reset)}'
  const shared = '.shared{color:red}'
  const local = '.local{display:block}'
  const bundle = {
    'theme.wxss': createReplayCssAsset('theme.wxss', `${reset}${shared}`),
    'components/widget.wxss': createReplayCssAsset('components/widget.wxss', `${reset}${shared}${local}`),
  }
  const opts = createContext({
    platform: 'mp-weixin',
    cssOptions: { skyline: true },
    cssMatcher: (file: string) => file.endsWith('.wxss'),
    mainCssChunkMatcher: () => false,
  }) as FinalizeGenerateBundleOptions['opts']
  const rootDir = process.cwd()
  const outDir = path.resolve(rootDir, 'dist')
  const lastCssResultByFile = new Map<string, string>()
  const activeViteCssCacheFiles = new Set(Object.keys(bundle))

  // 直接进入收尾阶段，避免前序 CSS transform 已经去重而掩盖选项传递回归。
  await finalizeGenerateBundle({
    activeProcessCacheKeys: new Set(),
    activeProcessHashKeys: new Set(),
    activeViteCssCacheFiles,
    bundle,
    bundleFiles: Object.keys(bundle),
    cache: opts.cache,
    cssTaskFactories: [],
    createCssPipelineContext: () => ({
      getSkylineTypographyResetCss: () => reset,
    }) as ViteFrameworkCssPipelineContext,
    debug: vi.fn(),
    defaultStyleOutputExtension: '.wxss',
    formatIteration: 1,
    generatorCandidateSignature: '',
    generatorRuntime: new Set(),
    getCssHandlerOptions: () => ({}),
    getSourceCandidateSourcesForEntries: undefined,
    getSourceCandidatesForEntries: undefined,
    getViteCssCacheStats: undefined,
    getViteProcessedCssAssetResults: undefined,
    hmrTimingRecorder: undefined,
    hmrTimingStartedAt: 0,
    isHarmonyAppStyleTarget: false,
    isNativeAppStyleTarget: false,
    isViteProcessedCssAsset: () => false,
    isWebGeneratorTarget: false,
    jsAfterCss: false,
    jsTaskFactories: [],
    lastCssResultByFile,
    lastCssSourceHashByFile: new Map(),
    linkedByEntry: undefined,
    markCssAssetProcessed: undefined,
    metrics: createEmptyMetrics(),
    onEnd: vi.fn(),
    onUpdate: vi.fn(),
    opts,
    outDir,
    pendingLinkedUpdates: [],
    pendingRememberedCssReplayUpdates: [],
    pruneViteCssCaches: undefined,
    recordCssAssetResult: (file, css) => lastCssResultByFile.set(file, css),
    recordTimingDetail: vi.fn(),
    recordViteProcessedCssAssetResult: undefined,
    rootDir,
    runtime: new Set(),
    runtimeState: { tailwindRuntime: opts.tailwindRuntime },
    shouldPreserveAppCssExtension: false,
    snapshot: buildBundleSnapshotForBuild(bundle, opts, outDir),
    sourceCandidates: new Set(),
    sourceRoot: undefined,
    state: createBundleBuildState(),
    styleHandler: opts.styleHandler,
    tasks: [],
    timingDetails: {},
    transformRuntime: new Set(),
    useIncrementalMode: false,
  } as FinalizeGenerateBundleOptions)

  const componentCss = String(bundle['components/widget.wxss'].source)
  expect(String(bundle['theme.wxss'].source)).toBe(`${reset}${shared}`)
  expect(componentCss).toContain(reset)
  expect(componentCss).toContain(local)
  expect(componentCss).not.toContain('.shared')
})
