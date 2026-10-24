import type { RememberedCssSource } from '@/bundlers/vite/generate-bundle/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createViteCssSourceTaskScope } from '@/bundlers/vite/css-memory/source-task-scope'
import { processRememberedCssReplay } from '@/bundlers/vite/generate-bundle/remembered-css-replay'
import { createFrameworkCssAssets } from '@/bundlers/vite/shared/framework-css-assets'
import { createFrameworkSourceCandidatesPlugin } from '@/bundlers/vite/shared/framework-source-candidates-plugin'
import { createWatchCssGenerator } from './helpers/css-watch-generator'

const { generateTailwindV4Css } = vi.hoisted(() => ({ generateTailwindV4Css: vi.fn() }))
vi.mock('@/context/generation', async importOriginal => ({
  ...await importOriginal<typeof import('@/context/generation')>(),
  generateTailwindV4Css,
}))

function createWatchCase() {
  const assets = createFrameworkCssAssets({ debug: vi.fn(), getSourceCandidateSource: () => undefined })
  const { cssMemory } = assets
  const sourceTaskScope = createViteCssSourceTaskScope(cssMemory.captureSource)
  const plugin = createFrameworkSourceCandidatesPlugin({
    cssMemory,
    removeViteProcessedCssSource: assets.removeViteProcessedCssSource,
    shouldSkipSourceCandidateState: () => true,
  })
  const watch = async (file: string, event: 'create' | 'delete') => {
    const hook = plugin.watchChange!
    const handler = typeof hook === 'function' ? hook : hook.handler
    await handler.call({} as any, file, { event })
  }
  const remember = (sourceFile: string, outputFile: string, rawSource: string) => {
    const entry: RememberedCssSource = { outputFile, rawSource, sourceFile }
    cssMemory.refreshRememberedCssSourceBySourceFile(sourceFile, rawSource)
    cssMemory.rememberCssSource(entry)
    assets.recordViteProcessedCssAssetResult(sourceFile, rawSource, { outputFile })
    return entry
  }
  const options = {
    addWatchFile: vi.fn(),
    activeViteCssCacheFiles: new Set<string>(),
    bundle: {},
    bundleFiles: ['unrelated.js'],
    cache: { computeHash: (source: string) => `hash:${source}` },
    changedCssFiles: new Set<string>(),
    createScopedGeneratorRuntime: vi.fn(async () => new Set<string>()),
    createScopedSourceCandidateGetter: vi.fn(() => undefined),
    createScopedSourceCandidateSourceGetter: vi.fn(() => () => new Map()),
    cssTaskFactories: [] as Array<() => Promise<void>>,
    cssPipelineContext: {},
    debug: vi.fn(),
    defaultStyleOutputExtension: '.acss',
    emitOrReplayCssAsset: vi.fn((fileName: string, source: string) => ({ fileName, source })),
    generatorRuntime: new Set<string>(),
    getCssHandlerOptions: vi.fn(() => ({ isMainChunk: false })),
    getCssUserHandlerOptions: vi.fn(() => ({})),
    getRememberedCssSignature: cssMemory.getRememberedCssSignature,
    getRememberedCssSources: cssMemory.getRememberedCssSources,
    captureCssSource: sourceTaskScope.captureSource,
    isNativeAppStyleTarget: false,
    isWebGeneratorTarget: false,
    lastCssRawSourceHashByFile: new Map<string, string>(),
    lastCssResultByFile: new Map<string, string>(),
    lastCssSourceHashByFile: new Map<string, string>(),
    markCssAssetProcessed: assets.markCssAssetProcessed,
    metrics: { css: { total: 0, transformed: 0, cacheHits: 0, elapsed: 0 } },
    normalizeViteCssCacheKey: (file: string) => file,
    onUpdate: vi.fn(),
    opts: { cssSourceTrace: false, cssMatcher: (file: string) => file.endsWith('.acss'), htmlMatcher: () => false },
    pendingRememberedCssReplayUpdates: [],
    recordCssAssetResult: assets.recordCssAssetResult,
    recordViteProcessedCssAssetResult: assets.recordViteProcessedCssAssetResult,
    rootDir: '/repo',
    runtimeSignature: 'runtime:initial',
    runtimeState: { tailwindRuntime: { majorVersion: 4 }, readyPromise: Promise.resolve() },
    setRememberedCssSignature: cssMemory.setRememberedCssSignature,
    shouldInjectCssIntoMainFromOutput: vi.fn(() => false),
    shouldPreserveAppCssExtension: false,
    sourceRoot: undefined,
    styleHandler: vi.fn(async (css: string) => ({ css })),
    timeTask: async (_name: string, task: () => Promise<void>) => task(),
    useIncrementalMode: true,
  }
  const prepareReplay = async () => {
    options.bundle = {}
    options.activeViteCssCacheFiles.clear()
    options.cssTaskFactories = []
    options.emitOrReplayCssAsset.mockClear()
    await processRememberedCssReplay(options as any)
    return () => Promise.all(options.cssTaskFactories.map(task => task()))
  }
  const replay = () => sourceTaskScope.run(async () => (await prepareReplay())())
  return { assets, cssMemory, options, prepareReplay, remember, replay, sourceTaskScope, watch }
}

describe('Vite watch CSS source deletion', () => {
  beforeEach(() => {
    generateTailwindV4Css.mockReset().mockImplementation(async ({ rawSource }) => ({ css: rawSource, dependencies: [] }))
  })

  it('retires explicit deletion while preserving an omitted source and allowing same-name creation', async () => {
    const fixture = createWatchCase()
    fixture.remember('/repo/removed.css', 'removed.acss', '.retired-rule{}')
    fixture.remember('/repo/omitted.css', 'omitted.acss', '.retained-rule{}')
    await fixture.watch('/repo/removed.css', 'delete')
    await fixture.replay()
    expect(fixture.options.emitOrReplayCssAsset.mock.calls).toEqual([['omitted.acss', '.retained-rule{}']])
    expect(fixture.cssMemory.getKnownCssSource('/repo/removed.css')).toBeUndefined()

    await fixture.watch('/repo/removed.css', 'create')
    fixture.remember('/repo/removed.css', 'removed.acss', '.replacement-rule{}')
    await fixture.replay()
    expect(fixture.options.emitOrReplayCssAsset.mock.calls).toEqual(expect.arrayContaining([
      ['omitted.acss', '.retained-rule{}'],
      ['removed.acss', '.replacement-rule{}'],
    ]))
    expect(fixture.options.emitOrReplayCssAsset.mock.calls.flat().join('')).not.toContain('.retired-rule')
  })

  it.each([
    ['/repo/view.vue', '/repo/view.vue'],
    ['C:\\repo\\view.vue', 'C:/repo/view.vue'],
    ['C:\\view.vue', 'C:/view.vue'],
    ['../view.vue', '../view.vue'],
  ])('retires query style owners of %s without deleting another shared-output contributor', async (source, deleted) => {
    const fixture = createWatchCase()
    fixture.cssMemory.rememberKnownSfcSource(source, '<style>.retired-rule{}</style>')
    fixture.remember(`${source}?vue&type=style&index=0&lang.css`, 'shared.acss', '.retired-rule{}')
    fixture.remember(`${source}?vue&type=style&index=1&scoped=true`, 'other.acss', '.retired-scoped{}')
    fixture.remember('/repo/surviving.css', 'shared.acss', '.surviving-rule{}')
    await fixture.watch(deleted, 'delete')
    await fixture.replay()
    expect(fixture.options.emitOrReplayCssAsset.mock.calls).toEqual([['shared.acss', '.surviving-rule{}']])
    expect(fixture.cssMemory.getKnownSfcSource(source)).toBeUndefined()
    expect(fixture.assets.getViteProcessedCssAssetResult(`${source}?vue&type=style&index=0&lang.css`)).toBeUndefined()
    expect(fixture.assets.getViteProcessedCssAssetResult('/repo/surviving.css')?.css).toBe('.surviving-rule{}')
  })

  it('does not commit queued replay after source deletion', async () => {
    const fixture = createWatchCase()
    fixture.remember('/repo/removed.css', 'removed.acss', '.retired-rule{}')
    const run = await fixture.prepareReplay()
    await fixture.watch('/repo/removed.css', 'delete')
    await run()
    expect(fixture.options.emitOrReplayCssAsset).not.toHaveBeenCalled()
    expect(fixture.options.lastCssResultByFile.size).toBe(0)
    expect(fixture.assets.getViteProcessedCssAssetResult('/repo/removed.css')).toBeUndefined()
  })

  it('does not commit in-flight replay across deletion and same-name creation', async () => {
    const fixture = createWatchCase()
    fixture.remember('/repo/removed.css', 'removed.acss', '.retired-rule{}')
    let finish!: (value: { css: string, dependencies: string[] }) => void
    let started!: () => void
    const generating = new Promise<void>((resolve) => {
      started = resolve
    })
    generateTailwindV4Css.mockImplementationOnce(() => {
      started()
      return new Promise((resolve) => {
        finish = resolve
      })
    })
    const pending = fixture.replay()
    await generating
    await fixture.watch('/repo/removed.css', 'delete')
    await fixture.watch('/repo/removed.css', 'create')
    fixture.remember('/repo/removed.css', 'removed.acss', '.replacement-rule{}')
    finish({ css: '.retired-rule{}', dependencies: [] })
    await pending
    expect(fixture.options.emitOrReplayCssAsset).not.toHaveBeenCalled()
    expect(fixture.options.lastCssResultByFile.size).toBe(0)
    await fixture.replay()
    expect(fixture.options.emitOrReplayCssAsset).toHaveBeenCalledWith('removed.acss', '.replacement-rule{}')
  })

  it('captures pipeline ownership before queuing and releases old tasks without touching the recreated owner', async () => {
    const fixture = createWatchCase()
    const generate = createWatchCssGenerator(fixture.assets)
    let finish!: (value: unknown) => void
    let started!: () => void
    const generating = new Promise<void>((resolve) => {
      started = resolve
    })
    generateTailwindV4Css.mockImplementationOnce(() => {
      started()
      return new Promise((resolve) => {
        finish = resolve
      })
    }).mockImplementation(async ({ rawSource }) => ({ css: rawSource, dependencies: [], classSet: new Set() }))
    const running = generate('/repo/removed.css', '.retired-rule{}')
    await Promise.race([generating, running.then(() => {
      throw new Error('generation ended before the deferred request')
    })])
    const queued = generate('/repo/removed.css', '.retired-queued{}')
    await fixture.watch('/repo/removed.css', 'delete')
    const deleted = generate('/repo/removed.css', '.deleted-request{}')
    await fixture.watch('/repo/removed.css', 'create')
    const fresh = generate('/repo/removed.css', '.replacement-rule{}')
    finish({ css: '.retired-rule{}', dependencies: [], classSet: new Set() })
    expect(await running).toBeUndefined()
    expect(await queued).toBeUndefined()
    expect(await deleted).toBeUndefined()
    expect(await fresh).toContain('.replacement-rule{}')
    expect(generateTailwindV4Css).toHaveBeenCalledTimes(2)
    expect(fixture.assets.cleanGeneratedCssByFile.get('/repo/removed.css')).toBe('.replacement-rule{}')
    expect(fixture.assets.getViteProcessedCssAssetResult('/repo/removed.css')?.css).toBe('.replacement-rule{}')
    expect(fixture.cssMemory.getStats().pendingCssSourceOwners).toBe(0)
    await generate.dispose()
  })

  it('keeps retired source history bounded without restoring revoked tasks after eviction', async () => {
    const fixture = createWatchCase()
    const retired = fixture.cssMemory.captureSource('/repo/retired.css')
    await fixture.watch('/repo/retired.css', 'delete')
    const rejectedWhileDeleted = fixture.cssMemory.captureSource('/repo/retired.css')
    for (let index = 0; index < 256; index++) {
      const file = `/repo/removed-${index}.css`
      const lease = fixture.cssMemory.captureSource(file)
      await fixture.watch(file, 'delete')
      lease.release()
    }
    expect(retired()).toBe(false)
    await fixture.watch('/repo/retired.css', 'create')
    const fresh = fixture.cssMemory.captureSource('/repo/retired.css')
    retired.release()
    rejectedWhileDeleted.release()
    expect(fresh()).toBe(true)
    fresh.release()
    expect(fixture.cssMemory.getStats().pendingCssSourceOwners).toBe(0)
    expect(fixture.cssMemory.getStats().deletedCssSources).toBeLessThanOrEqual(128)
  })

  it('releases source leases when replay planning fails or a watch round never runs queued tasks', async () => {
    const fixture = createWatchCase()
    fixture.remember('/repo/kept.css', 'kept.acss', '.kept{}')
    fixture.options.createScopedGeneratorRuntime.mockRejectedValueOnce(new Error('plan failed'))
    await expect(fixture.replay()).rejects.toThrow('plan failed')
    expect(fixture.cssMemory.getStats().pendingCssSourceOwners).toBe(0)
    for (let index = 0; index < 3; index++) {
      await fixture.sourceTaskScope.run(() => fixture.prepareReplay())
      expect(fixture.cssMemory.getStats().pendingCssSourceOwners).toBe(0)
    }
    await fixture.replay()
    expect(fixture.options.emitOrReplayCssAsset).toHaveBeenCalledWith('kept.acss', '.kept{}')
    const queued = await fixture.prepareReplay()
    fixture.assets.dispose()
    await queued()
    expect(fixture.cssMemory.getStats().pendingCssSourceOwners).toBe(0)
    expect(fixture.options.emitOrReplayCssAsset).not.toHaveBeenCalled()
  })

  it('rejects late source admission inherited from an already finished build round', async () => {
    const fixture = createWatchCase()
    let wake!: () => void
    const pending = new Promise<void>((resolve) => {
      wake = resolve
    })
    let late!: Promise<ReturnType<typeof fixture.cssMemory.captureSource>>
    await fixture.sourceTaskScope.run(async () => {
      late = pending.then(() => fixture.sourceTaskScope.captureSource!('/repo/late.css'))
    })
    wake()
    expect((await late)()).toBe(false)
    expect(fixture.cssMemory.getStats().pendingCssSourceOwners).toBe(0)
  })
})
