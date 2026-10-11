import { describe, expect, it, vi } from 'vitest'

const generateTailwindV4Css = vi.fn()

vi.mock('@/generation/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/generation/service')>()
  return {
    ...actual,
    generateTailwindV4Css,
  }
})

describe('bundlers/vite remembered css replay root shell', () => {
  it('replays generated css into the remembered root import target', async () => {
    const {
      processRememberedCssReplay,
      resolveRememberedCssReplayOutputFile,
    } = await import('@/bundlers/vite/generate-bundle/remembered-css-replay')
    const cssTaskFactories: Array<() => Promise<void>> = []
    const bundle = {
      'app-origin.wxss': {
        fileName: 'app-origin.wxss',
        name: undefined,
        names: [],
        needsCodeReference: false,
        originalFileName: undefined,
        originalFileNames: [],
        source: '.stale{color:red}',
        type: 'asset' as const,
      },
    }
    const generatedCss = [
      '@import "@nutui/nutui-react-taro/dist/style.css";',
      '.fresh{color:green}',
    ].join('\n')
    const createScopedGeneratorRuntime = vi.fn(async () => new Set(['fresh']))
    const pendingRememberedCssReplayUpdates: Array<{
      css: string
      file: string
      injectIntoMain?: boolean
      outputFile: string
    }> = []
    const recordViteProcessedCssAssetResult = vi.fn()
    const rememberedCssSignatures = new Map<string, string>()
    const lastCssResultByFile = new Map<string, string>()
    const lastCssSourceHashByFile = new Map<string, string>()

    generateTailwindV4Css.mockResolvedValueOnce({
      css: generatedCss,
      dependencies: [],
    })

    const options = {
      activeViteCssCacheFiles: new Set<string>(),
      addWatchFile: vi.fn(),
      bundle,
      bundleFiles: ['app-origin.wxss'],
      cache: {
        computeHash: (source: string) => `hash:${source}`,
      },
      changedCssFiles: new Set(),
      createScopedGeneratorRuntime,
      createScopedSourceCandidateGetter: vi.fn(() => undefined),
      createScopedSourceCandidateSourceGetter: vi.fn(() => undefined),
      cssPipelineContext: { opts: { cssMatcher: (file: string) => file.endsWith('.wxss') } } as any,
      cssPipelineStrategy: {
        shouldKeepRootMiniProgramStyleAsImportShell: ({ file }: { file: string }) => file === 'app.wxss',
      },
      cssTaskFactories,
      debug: vi.fn(),
      defaultStyleOutputExtension: '.wxss',
      emitOrReplayCssAsset: vi.fn(),
      frameworkRootImportShellTargetByFile: new Map([
        ['app.wxss', 'app-origin.wxss'],
      ]),
      generatorRuntime: new Set(['fresh']),
      getCssHandlerOptions: vi.fn((file: string) => ({ isMainChunk: file === 'app.wxss' })),
      getCssUserHandlerOptions: vi.fn(() => ({})),
      getRememberedCssSignature: vi.fn((file: string) => rememberedCssSignatures.get(file)),
      getRememberedCssSources: () => new Map([
        ['app.wxss', {
          outputFile: 'app.wxss',
          rawSource: '@import "tailwindcss" source(none);\n@source "./pages/**/*";',
          sourceFile: '/repo/src/app.css',
        }],
      ]),
      isNativeAppStyleTarget: false,
      isWebGeneratorTarget: false,
      lastCssRawSourceHashByFile: new Map(),
      lastCssResultByFile,
      lastCssSourceHashByFile,
      markCssAssetProcessed: vi.fn(),
      metrics: {
        runtimeSet: 0,
        html: { total: 0, transformed: 0, cacheHits: 0, elapsed: 0 },
        js: { total: 0, transformed: 0, cacheHits: 0, elapsed: 0 },
        css: { total: 0, transformed: 0, cacheHits: 0, elapsed: 0 },
      },
      normalizeViteCssCacheKey: (file: string) => file,
      onUpdate: vi.fn(),
      opts: {
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        htmlMatcher: (file: string) => file.endsWith('.wxml'),
      },
      pendingRememberedCssReplayUpdates,
      recordCssAssetResult: vi.fn(),
      recordViteProcessedCssAssetResult,
      rootDir: '/repo',
      runtimeState: {
        readyPromise: Promise.resolve(),
        tailwindRuntime: { majorVersion: 4 },
      },
      setRememberedCssSignature: vi.fn((file: string, signature: string) => rememberedCssSignatures.set(file, signature)),
      shouldInjectCssIntoMainFromOutput: vi.fn(() => false),
      shouldPreserveAppCssExtension: false,
      sourceRoot: '/repo/src',
      styleHandler: vi.fn(async (source: string) => ({ css: source })),
      timeTask: vi.fn(async (_name: string, task: () => Promise<void>) => {
        await task()
      }),
      useIncrementalMode: true,
    } as any

    await processRememberedCssReplay(options)

    expect(cssTaskFactories).toHaveLength(1)
    await cssTaskFactories[0]!()

    expect(generateTailwindV4Css).toHaveBeenCalledWith(expect.objectContaining({
      cssHandlerOptions: expect.objectContaining({ isMainChunk: true }),
      file: '/repo/src/app.css',
      outputFile: 'app-origin.wxss',
    }))
    expect(createScopedGeneratorRuntime).toHaveBeenCalledWith(
      'app-origin.wxss',
      expect.objectContaining({ isMainChunk: true }),
      expect.any(Set),
      expect.any(String),
      '/repo/src/app.css',
    )
    expect(bundle['app-origin.wxss'].source).toBe('.stale{color:red}')
    expect(recordViteProcessedCssAssetResult).not.toHaveBeenCalled()
    expect(pendingRememberedCssReplayUpdates).toContainEqual({
      css: generatedCss,
      file: 'app-origin.wxss',
      injectIntoMain: true,
      outputFile: 'app-origin.wxss',
    })
    expect(pendingRememberedCssReplayUpdates).toContainEqual({
      css: generatedCss,
      file: '/repo/src/app.css',
      injectIntoMain: true,
      outputFile: 'app-origin.wxss',
    })

    // 最终产物缓存可能已经合并本轮随后删除的框架规则，不能当作入口源缓存。
    lastCssResultByFile.set('app-origin.wxss', generatedCss + '\n.removed-framework-rule{color:red}')
    const cachedReplayTasks: Array<() => Promise<void>> = []
    const cachedReplayUpdates: typeof pendingRememberedCssReplayUpdates = []
    await processRememberedCssReplay({
      ...options,
      bundle: {
        'app-origin.wxss': {
          ...bundle['app-origin.wxss'],
          source: '.fresh-framework-bundle{color:blue}',
        },
      },
      cssTaskFactories: cachedReplayTasks,
      pendingRememberedCssReplayUpdates: cachedReplayUpdates,
    })

    expect(cachedReplayTasks).toHaveLength(1)
    await cachedReplayTasks[0]!()
    expect(generateTailwindV4Css).toHaveBeenCalledTimes(1)
    expect(cachedReplayUpdates).toEqual(pendingRememberedCssReplayUpdates)

    rememberedCssSignatures.clear()
    generateTailwindV4Css.mockResolvedValueOnce({ css: generatedCss, dependencies: [] })
    const staleReplayTasks: Array<() => Promise<void>> = []
    await processRememberedCssReplay({
      ...options,
      bundle: {
        'app-origin.wxss': {
          ...bundle['app-origin.wxss'],
          source: '.fresh-framework-bundle{color:blue}',
        },
      },
      cssTaskFactories: staleReplayTasks,
      pendingRememberedCssReplayUpdates: [],
    })
    expect(staleReplayTasks).toHaveLength(1)
    await staleReplayTasks[0]!()
    expect(generateTailwindV4Css).toHaveBeenLastCalledWith(expect.objectContaining({ previousCss: undefined }))
    expect(generateTailwindV4Css).toHaveBeenCalledTimes(2)

    // 同轮框架样式会写入目标时，配置入口重放必须合并，不能覆盖基础样式。
    const contributionUpdates: typeof pendingRememberedCssReplayUpdates = []
    const emitContribution = vi.fn()
    generateTailwindV4Css.mockResolvedValueOnce({ css: generatedCss, dependencies: [] })
    const contributionTasks: Array<() => Promise<void>> = []
    await processRememberedCssReplay({
      ...options,
      bundle: { 'framework.acss': { ...bundle['app-origin.wxss'], fileName: 'framework.acss', source: 'page{height:100%}' } },
      bundleFiles: ['framework.acss'],
      frameworkRootImportShellTargetByFile: new Map([['framework.acss', 'generated.acss']]),
      opts: { cssMatcher: (file: string) => file.endsWith('.acss'), htmlMatcher: () => false },
      getRememberedCssSources: () => new Map([['entry', {
        outputFile: 'generated.acss', sourceFile: '/repo/theme.css', rawSource: '@import "tailwindcss";',
      }]]),
      cssTaskFactories: contributionTasks,
      pendingRememberedCssReplayUpdates: contributionUpdates,
      emitOrReplayCssAsset: emitContribution,
    })
    await Promise.all(contributionTasks.map(task => task()))
    expect(emitContribution).not.toHaveBeenCalled()
    expect(contributionUpdates).toContainEqual(expect.objectContaining({ outputFile: 'generated.acss', css: generatedCss, injectIntoMain: true }))

    lastCssResultByFile.clear()
    const cacheMissReplayTasks: Array<() => Promise<void>> = []
    await processRememberedCssReplay({
      ...options,
      cssTaskFactories: cacheMissReplayTasks,
      pendingRememberedCssReplayUpdates: [],
    })
    expect(cacheMissReplayTasks).toHaveLength(1)
    expect(resolveRememberedCssReplayOutputFile(
      'nested/app.wxss',
      new Map([['nested\\app.wxss', 'app-origin.wxss']]),
    )).toBe('app-origin.wxss')
    // 增量产物缺席时，多入口重放仍保留各目录与候选归属。
    const ownedSources = ['/repo/one/entry.css', '/repo/two/entry.css'].map(sourceFile => ({
      sourceFile,
      outputFile: 'merged.wxss',
      rawSource: '@import "tailwindcss" source(none); @source "./target.vue";',
    }))
    let swapped = false
    const scopedGetter = (entries: Array<{ base: string }> | undefined) =>
      new Set([entries?.[0]?.base === '/repo/one' ? (swapped ? 'grid' : 'flex') : (swapped ? 'flex' : 'grid')])
    const replayOwned = async () => {
      const tasks: Array<() => Promise<void>> = []
      await processRememberedCssReplay({
        ...options,
        bundle: {},
        bundleFiles: [],
        cssTaskFactories: tasks,
        frameworkRootImportShellTargetByFile: new Map(),
        pendingRememberedCssReplayUpdates: [],
        getRememberedCssSources: () => ownedSources.map(source => [source.sourceFile, source]),
        createScopedSourceCandidateGetter: () => scopedGetter,
      })
      await Promise.all(tasks.map(task => task()))
      return tasks.length
    }
    generateTailwindV4Css.mockResolvedValue({ css: '.flex{display:flex}', dependencies: [] })
    expect(await replayOwned()).toBe(1)
    expect(generateTailwindV4Css).toHaveBeenLastCalledWith(expect.objectContaining({
      cssHandlerOptions: expect.objectContaining({ sourceOptions: expect.objectContaining({
        cssSources: [
          { file: ownedSources[0]!.sourceFile, base: '/repo/one', css: ownedSources[0]!.rawSource },
          { file: ownedSources[1]!.sourceFile, base: '/repo/two', css: ownedSources[1]!.rawSource },
        ],
      }) }),
    }))
    expect(createScopedGeneratorRuntime).toHaveBeenCalledWith('merged.wxss', expect.anything(), expect.any(Set), ownedSources[1]!.rawSource, ownedSources[1]!.sourceFile, true)
    expect(await replayOwned()).toBe(0)
    swapped = true
    expect(await replayOwned()).toBe(1)

  })

  it('skips scoped runtime work when the remembered file is already in the bundle', async () => {
    const { processRememberedCssReplay } = await import('@/bundlers/vite/generate-bundle/remembered-css-replay')
    const createScopedGeneratorRuntime = vi.fn(async () => new Set(['fresh']))
    const cssTaskFactories: Array<() => Promise<void>> = []
    await processRememberedCssReplay({
      activeViteCssCacheFiles: new Set<string>(),
      addWatchFile: vi.fn(),
      bundle: {},
      bundleFiles: ['app.wxss'],
      cache: { computeHash: (source: string) => `hash:${source}` },
      changedCssFiles: new Set(),
      createScopedGeneratorRuntime,
      createScopedSourceCandidateGetter: vi.fn(() => undefined),
      createScopedSourceCandidateSourceGetter: vi.fn(() => undefined),
      cssPipelineContext: { opts: { cssMatcher: (file: string) => file.endsWith('.wxss') } } as any,
      cssPipelineStrategy: {},
      cssTaskFactories,
      debug: vi.fn(),
      defaultStyleOutputExtension: '.wxss',
      emitOrReplayCssAsset: vi.fn(),
      generatorRuntime: new Set(['fresh']),
      getCssHandlerOptions: vi.fn(() => ({ isMainChunk: true })),
      getCssUserHandlerOptions: vi.fn(() => ({})),
      getRememberedCssSources: () => new Map([
        ['app.wxss', {
          outputFile: 'app.wxss',
          rawSource: '@import "tailwindcss";',
          sourceFile: '/repo/src/app.css',
        }],
      ]),
      isNativeAppStyleTarget: false,
      isWebGeneratorTarget: false,
      lastCssRawSourceHashByFile: new Map(),
      lastCssResultByFile: new Map(),
      lastCssSourceHashByFile: new Map(),
      metrics: { css: { total: 0, transformed: 0, cacheHits: 0, elapsed: 0 } },
      onUpdate: vi.fn(),
      opts: { cssMatcher: (file: string) => file.endsWith('.wxss'), htmlMatcher: () => false },
      pendingRememberedCssReplayUpdates: [],
      recordCssAssetResult: vi.fn(),
      recordViteProcessedCssAssetResult: vi.fn(),
      rootDir: '/repo',
      runtimeState: { tailwindRuntime: { majorVersion: 4 } },
      shouldPreserveAppCssExtension: false,
      sourceRoot: undefined,
      styleHandler: vi.fn(),
      timeTask: async (_name: string, task: () => Promise<void>) => task(),
      useIncrementalMode: false,
    } as any)
    expect(createScopedGeneratorRuntime).not.toHaveBeenCalled()
    expect(cssTaskFactories).toHaveLength(0)
  })

  it('skips scoped runtime work when the remembered file uses a different path separator', async () => {
    const { processRememberedCssReplay } = await import('@/bundlers/vite/generate-bundle/remembered-css-replay')
    const createScopedGeneratorRuntime = vi.fn(async () => new Set(['fresh']))
    const cssTaskFactories: Array<() => Promise<void>> = []
    await processRememberedCssReplay({
      activeViteCssCacheFiles: new Set<string>(),
      addWatchFile: vi.fn(),
      bundle: {},
      bundleFiles: ['pages\\index\\index.wxss'],
      cache: { computeHash: (source: string) => `hash:${source}` },
      changedCssFiles: new Set(),
      createScopedGeneratorRuntime,
      createScopedSourceCandidateGetter: vi.fn(() => undefined),
      createScopedSourceCandidateSourceGetter: vi.fn(() => undefined),
      cssPipelineContext: { opts: { cssMatcher: (file: string) => file.endsWith('.wxss') } } as any,
      cssPipelineStrategy: {},
      cssTaskFactories,
      debug: vi.fn(),
      defaultStyleOutputExtension: '.wxss',
      emitOrReplayCssAsset: vi.fn(),
      generatorRuntime: new Set(['fresh']),
      getCssHandlerOptions: vi.fn(() => ({ isMainChunk: true })),
      getCssUserHandlerOptions: vi.fn(() => ({})),
      getRememberedCssSources: () => new Map([
        ['pages/index/index.wxss', {
          outputFile: 'pages/index/index.wxss',
          rawSource: '@import "tailwindcss";',
          sourceFile: '/repo/src/pages/index/index.css',
        }],
      ]),
      isNativeAppStyleTarget: false,
      isWebGeneratorTarget: false,
      lastCssRawSourceHashByFile: new Map(),
      lastCssResultByFile: new Map(),
      lastCssSourceHashByFile: new Map(),
      metrics: { css: { total: 0, transformed: 0, cacheHits: 0, elapsed: 0 } },
      onUpdate: vi.fn(),
      opts: { cssMatcher: (file: string) => file.endsWith('.wxss'), htmlMatcher: () => false },
      pendingRememberedCssReplayUpdates: [],
      recordCssAssetResult: vi.fn(),
      recordViteProcessedCssAssetResult: vi.fn(),
      rootDir: '/repo',
      runtimeState: { tailwindRuntime: { majorVersion: 4 } },
      shouldPreserveAppCssExtension: false,
      sourceRoot: '/repo/src',
      styleHandler: vi.fn(),
      timeTask: async (_name: string, task: () => Promise<void>) => task(),
      useIncrementalMode: false,
    } as any)
    expect(createScopedGeneratorRuntime).not.toHaveBeenCalled()
    expect(cssTaskFactories).toHaveLength(0)

  })
})
