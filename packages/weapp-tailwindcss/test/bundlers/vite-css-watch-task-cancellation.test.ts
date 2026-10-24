import { describe, expect, it, vi } from 'vitest'
import { discardedViteCssSource } from '@/bundlers/vite/css-memory/source-lifecycle'
import { applyViteCssCacheResult, processViteCssCacheTask } from '@/bundlers/vite/generate-bundle/css-cache-task'
import { applyViteCssTransformTaskResult } from '@/bundlers/vite/generate-bundle/css-transform-result'
import { scheduleViteCssTransform } from '@/bundlers/vite/generate-bundle/transform-scheduling'
import { createFrameworkCssAssets } from '@/bundlers/vite/shared/framework-css-assets'
import { createFrameworkSourceCandidatesPlugin } from '@/bundlers/vite/shared/framework-source-candidates-plugin'
import { createFrameworkTailwindRootCss } from '@/bundlers/vite/shared/framework-tailwind-root-css'
import { createCache } from '@/cache'

describe('Vite watch CSS transform cancellation', () => {
  it('regenerates an independent shared-cache consumer after the original owner is revoked', async () => {
    let cancel!: (reason: unknown) => void
    const previous = new Promise<string>((_resolve, reject) => {
      cancel = reject
    })
    const sharedResultCache = new Map([['shared', previous]])
    const cache = createCache()
    const applyResult = vi.fn()
    const transform = vi.fn(async () => '.surviving{}')
    const task = processViteCssCacheTask({
      cache,
      cacheKey: 'surviving',
      hashKey: 'surviving',
      taskHash: 'surviving',
      sharedCacheKey: 'shared',
      sharedResultCache,
      applyResult,
      transform,
      onCacheHit: vi.fn(),
      onSharedCacheHit: vi.fn(),
      onSharedResult: vi.fn(),
      onTransformResult: vi.fn(),
    })
    cancel(discardedViteCssSource)
    await task
    expect(transform).toHaveBeenCalledOnce()
    expect(applyResult).toHaveBeenCalledWith('.surviving{}', { cacheHit: false })
    expect(cache.get('surviving')).toBe('.surviving{}')
  })

  it('removes root module aliases and prevents a pending root refresh from restoring deleted source state', async () => {
    const assets = createFrameworkCssAssets({ debug: vi.fn(), getSourceCandidateSource: () => undefined })
    let finish!: () => void
    let started!: () => void
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve
    })
    const registerAutoCssSource = vi.fn(async () => {})
      .mockImplementationOnce(() => {
        started()
        return new Promise<void>((resolve) => {
          finish = resolve
        })
      })
    const refreshRuntimeState = vi.fn(async () => {})
    const sourceScanSession = { invalidate: vi.fn(), sync: vi.fn(async () => {}) }
    const roots = createFrameworkTailwindRootCss({
      captureCssSource: assets.cssMemory.captureSource,
      getImportFallback: () => true,
      refreshRuntimeState,
      registerAutoCssSource,
      shouldOwnTailwindGeneration: true,
      sourceScanSession,
    })
    const plugin = createFrameworkSourceCandidatesPlugin({
      cssMemory: assets.cssMemory,
      removeViteProcessedCssSource(file: string) {
        assets.removeViteProcessedCssSource(file)
        roots.removeSource(file)
      },
      shouldSkipSourceCandidateState: () => true,
    })
    const watch = plugin.watchChange!
    const handler = typeof watch === 'function' ? watch : watch.handler
    const pending = roots.refreshSource('/repo/removed.css?inline', '@tailwind utilities; .retired{}')
    await startedPromise
    await handler.call({} as any, '/repo/removed.css', { event: 'delete' })
    expect(roots.moduleIds.size).toBe(0)
    await roots.refreshSource('/repo/removed.css?inline', '@tailwind utilities; .stale-after-delete{}')
    await handler.call({} as any, '/repo/removed.css', { event: 'create' })
    await roots.register('/repo/removed.css?inline', '.replacement{}')
    expect(registerAutoCssSource).toHaveBeenLastCalledWith('/repo/removed.css?inline', '.replacement{}')
    finish()
    await pending
    expect(refreshRuntimeState).not.toHaveBeenCalled()
    expect(sourceScanSession.invalidate).not.toHaveBeenCalled()
    expect(assets.cssMemory.getStats().pendingCssSourceOwners).toBe(0)
  })

  it.each([false, true])('discards deleted task before cache, record and output commit (shared: %s)', async (shared) => {
    const assets = createFrameworkCssAssets({ debug: vi.fn(), getSourceCandidateSource: () => undefined })
    const plugin = createFrameworkSourceCandidatesPlugin({
      cssMemory: assets.cssMemory,
      removeViteProcessedCssSource: assets.removeViteProcessedCssSource,
      shouldSkipSourceCandidateState: () => true,
    })
    const sourceFile = '/repo/removed.css'
    const cssTaskFactories: Array<() => Promise<void>> = []
    const cache = createCache()
    const lastCssResultByFile = new Map<string, string>()
    const lastCssSourceHashByFile = new Map<string, string>()
    const sharedCssResultCache = new Map<string, Promise<string>>()
    const applyCssResult = vi.fn()
    const recordCssAssetResult = vi.fn(assets.recordCssAssetResult)
    const onUpdate = vi.fn()
    let finish!: (result: unknown) => void
    let started!: () => void
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve
    })
    scheduleViteCssTransform({
      isSourceCurrent: assets.cssMemory.captureSource(sourceFile),
      applyCssResult,
      applyViteCssCacheResult,
      applyViteCssTransformTaskResult,
      cache,
      cssCacheKey: 'css:removed',
      cssHashKey: 'hash:removed',
      cssRuntimeAffectingHash: 'runtime:removed',
      cssSharedCacheKey: shared ? 'shared:removed' : undefined,
      cssTaskFactories,
      cssTaskHash: 'task:removed',
      debug: vi.fn(),
      envFlags: {},
      executeViteCssTransformTask: () => {
        started()
        return new Promise((resolve) => {
          finish = resolve
        })
      },
      file: 'removed.acss',
      generatorRawSource: '.retired{}',
      generatorSourceFile: sourceFile,
      lastCssResultByFile,
      lastCssSourceHashByFile,
      metrics: { css: { elapsed: 0, transformed: 0, cacheHits: 0 } },
      measureElapsed: () => 0,
      onUpdate,
      outputCssHandlerOptions: {},
      outputFile: 'removed.acss',
      processViteCssCacheTask,
      rawSource: '.retired{}',
      recordCssAssetResult,
      rememberedCssSources: [],
      runtimeState: { tailwindRuntime: { majorVersion: 4 } },
      sharedCssResultCache,
      timeTask: (_name: string, task: () => Promise<void>) => task(),
      transformRuntime: new Set(),
      useIncrementalMode: false,
    })
    const task = cssTaskFactories[0]!()
    await startedPromise
    const watch = plugin.watchChange!
    const handler = typeof watch === 'function' ? watch : watch.handler
    await handler.call({} as any, sourceFile, { event: 'delete' })
    await handler.call({} as any, sourceFile, { event: 'create' })
    assets.cssMemory.rememberCssSource({ sourceFile, outputFile: 'removed.acss', rawSource: '.fresh{}' })
    finish({ kind: 'tailwind', css: '.retired{}', dependencies: [], shouldRecordCssAsset: true })
    await task
    expect(cache.get('css:removed')).toBeUndefined()
    expect(lastCssResultByFile.size).toBe(0)
    expect(lastCssSourceHashByFile.size).toBe(0)
    expect(sharedCssResultCache.size).toBe(0)
    expect(recordCssAssetResult).not.toHaveBeenCalled()
    expect(applyCssResult).not.toHaveBeenCalled()
    expect(onUpdate).not.toHaveBeenCalled()
    expect(assets.cssMemory.getRememberedCssSourceEntry('removed.acss')?.rawSource).toBe('.fresh{}')
    expect(assets.cssMemory.getStats().pendingCssSourceOwners).toBe(0)
  })
})
