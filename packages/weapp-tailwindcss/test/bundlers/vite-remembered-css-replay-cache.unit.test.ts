import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createGeneratedReplayCacheKey, createGeneratedReplayCacheSignature } from '@/bundlers/vite/generate-bundle/remembered-css'
import { processRememberedCssReplay } from '@/bundlers/vite/generate-bundle/remembered-css-replay'

const { annotateCssSourceTrace, generateTailwindV4Css, getCompilationScopeDependencyRevision } = vi.hoisted(() => ({
  annotateCssSourceTrace: vi.fn((css: string) => css),
  generateTailwindV4Css: vi.fn(),
  getCompilationScopeDependencyRevision: vi.fn(() => 0),
}))

vi.mock('@/context/generation', async importOriginal => ({
  ...await importOriginal<typeof import('@/context/generation')>(),
  generateTailwindV4Css,
}))
vi.mock('@/bundlers/shared/css-source-trace', async importOriginal => ({
  ...await importOriginal<typeof import('@/bundlers/shared/css-source-trace')>(),
  annotateCssSourceTrace,
}))
vi.mock('@/compiler', async importOriginal => ({
  ...await importOriginal<typeof import('@/compiler')>(),
  getCompilationScopeDependencyRevision,
}))

function createReplayCase() {
  const remembered = {
    outputFile: 'theme.acss',
    rawSource: '@tailwind utilities;',
    sourceFile: '/repo/styles/entry.css',
  }
  const signatures = new Map<string, string>()
  const runtime = new Set(['text-red-500'])
  const getTraceSources = vi.fn(() => new Map())
  const options = {
    addWatchFile: vi.fn(),
    activeViteCssCacheFiles: new Set<string>(),
    bundle: {},
    bundleFiles: ['view.js'],
    cache: { computeHash: (source: string) => `hash:${source}` },
    changedCssFiles: new Set<string>(),
    createScopedGeneratorRuntime: vi.fn(async () => runtime),
    createScopedSourceCandidateGetter: vi.fn(() => undefined),
    createScopedSourceCandidateSourceGetter: vi.fn(() => getTraceSources),
    cssTaskFactories: [] as Array<() => Promise<void>>,
    cssPipelineContext: {},
    debug: vi.fn(),
    defaultStyleOutputExtension: '.acss',
    emitOrReplayCssAsset: vi.fn((fileName: string, source: string) => ({ fileName, source })),
    generatorRuntime: runtime,
    generatorPlatform: 'ali',
    getCssHandlerOptions: vi.fn(() => ({ isMainChunk: false })),
    getCssUserHandlerOptions: vi.fn(() => ({})),
    getRememberedCssSignature: (file: string) => signatures.get(file),
    getRememberedCssSources: () => [['entry', remembered]],
    isNativeAppStyleTarget: false,
    isWebGeneratorTarget: false,
    lastCssRawSourceHashByFile: new Map<string, string>(),
    lastCssResultByFile: new Map<string, string>(),
    lastCssSourceHashByFile: new Map<string, string>(),
    markCssAssetProcessed: vi.fn(),
    metrics: { css: { total: 0, transformed: 0, cacheHits: 0, elapsed: 0 } },
    normalizeViteCssCacheKey: (file: string) => file,
    onUpdate: vi.fn(),
    opts: { cssSourceTrace: false, cssMatcher: (file: string) => file.endsWith('.acss'), htmlMatcher: () => false },
    pendingRememberedCssReplayUpdates: [],
    recordCssAssetResult: vi.fn(),
    recordViteProcessedCssAssetResult: vi.fn(),
    rootDir: '/repo',
    runtimeSignature: 'runtime:initial',
    runtimeState: { tailwindRuntime: { majorVersion: 4 }, readyPromise: Promise.resolve() },
    setRememberedCssSignature: (file: string, signature: string) => signatures.set(file, signature),
    shouldInjectCssIntoMainFromOutput: vi.fn(() => false),
    shouldPreserveAppCssExtension: false,
    sourceRoot: undefined,
    styleHandler: vi.fn(async (css: string) => ({ css })),
    timeTask: async (_name: string, task: () => Promise<void>) => task(),
    useIncrementalMode: true,
  }
  const rebuild = async () => {
    options.bundle = {}
    options.activeViteCssCacheFiles.clear()
    options.cssTaskFactories = []
    await processRememberedCssReplay(options as any)
    await Promise.all(options.cssTaskFactories.map(task => task()))
    return options.cssTaskFactories.length
  }
  return { options, remembered, rebuild, runtime, getTraceSources }
}

describe('bundlers/vite remembered css replay cache', () => {
  beforeEach(() => {
    annotateCssSourceTrace.mockReset().mockImplementation(css => css)
    generateTailwindV4Css.mockReset()
    getCompilationScopeDependencyRevision.mockReset().mockReturnValue(0)
  })

  it.each(['.processed { color: red; }', ''])('emits every absent round while reusing only clean generation: %j', async (css) => {
    const { options, remembered, rebuild } = createReplayCase()
    generateTailwindV4Css.mockResolvedValue({ css, dependencies: ['/repo/config/nested.cjs', '/repo/plugins/utility.cjs'] })
    expect(await rebuild()).toBe(1)
    options.lastCssResultByFile.set(remembered.outputFile, `${css}.removed-framework-rule{}`)
    expect(await rebuild()).toBe(1)
    expect(await rebuild()).toBe(1)
    expect(generateTailwindV4Css).toHaveBeenCalledTimes(1)
    expect(options.emitOrReplayCssAsset.mock.calls).toEqual(Array.from({ length: 3 }, () => [remembered.outputFile, css]))
    expect(options.recordViteProcessedCssAssetResult).toHaveBeenLastCalledWith(remembered.outputFile, css, expect.objectContaining({ outputFile: remembered.outputFile }))
    expect(options.markCssAssetProcessed).toHaveBeenCalledTimes(3)
    expect(options.metrics.css.cacheHits).toBe(2)
    expect(options.addWatchFile.mock.calls).toEqual(Array.from({ length: 3 }, () => [['/repo/config/nested.cjs'], ['/repo/plugins/utility.cjs']]).flat())
  })

  it('does not prepare disabled source trace on either generation or cached emission', async () => {
    const { rebuild, getTraceSources } = createReplayCase()
    generateTailwindV4Css.mockResolvedValue({ css: '.generated{}', dependencies: [] })
    await rebuild()
    await rebuild()
    expect(getTraceSources).not.toHaveBeenCalled()
    expect(generateTailwindV4Css).toHaveBeenCalledTimes(1)
  })

  it('re-annotates clean cached css with the current source trace', async () => {
    const { options, remembered, rebuild } = createReplayCase()
    options.opts.cssSourceTrace = true
    generateTailwindV4Css.mockResolvedValue({ css: '.generated{}', dependencies: [] })
    annotateCssSourceTrace.mockImplementation(css => `${css}/* old source */`)
    await rebuild()
    annotateCssSourceTrace.mockImplementation(css => `${css}/* current source */`)
    await rebuild()
    expect(generateTailwindV4Css).toHaveBeenCalledTimes(1)
    expect(options.emitOrReplayCssAsset).toHaveBeenLastCalledWith(remembered.outputFile, '.generated{}/* current source */')
    expect(options.lastCssResultByFile.get(createGeneratedReplayCacheKey(remembered.outputFile))).toBe('.generated{}')
  })

  it.each(['result', 'proof', 'missing-dependencies', 'dependencies', 'corrupt', 'raw', 'source', 'candidate', 'runtime', 'dependency', 'changed', 'output', 'platform', 'main'])('regenerates instead of trusting a stale %s cache', async (mutation) => {
    const { options, remembered, rebuild, runtime } = createReplayCase()
    generateTailwindV4Css.mockResolvedValueOnce({ css: '.old{}', dependencies: [] })
    await rebuild()
    options.lastCssResultByFile.set(remembered.outputFile, '.old{}.removed-framework-rule{}')
    const key = createGeneratedReplayCacheKey(remembered.outputFile)
    switch (mutation) {
      case 'result': options.lastCssResultByFile.delete(key)
        break
      case 'proof': options.lastCssSourceHashByFile.delete(key)
        break
      case 'missing-dependencies': {
        const proof = JSON.parse(options.lastCssSourceHashByFile.get(key)!)
        options.lastCssSourceHashByFile.set(key, JSON.stringify({ signature: proof.signature }))
        break
      }
      case 'dependencies': {
        const proof = JSON.parse(options.lastCssSourceHashByFile.get(key)!)
        options.lastCssSourceHashByFile.set(key, JSON.stringify({ ...proof, dependencies: [42] }))
        break
      }
      case 'corrupt': options.lastCssSourceHashByFile.set(key, '{invalid')
        break
      case 'raw': remembered.rawSource += '/* new comment */'
        break
      case 'source': remembered.sourceFile = '/repo/other/entry.css'
        break
      case 'candidate': runtime.add('grid')
        break
      case 'runtime': options.runtimeSignature = 'runtime:changed'
        break
      case 'dependency': getCompilationScopeDependencyRevision.mockReturnValue(1)
        break
      case 'changed': options.changedCssFiles.add(remembered.sourceFile)
        break
      case 'output': remembered.outputFile = 'other.acss'
        break
      case 'platform': options.generatorPlatform = 'swan'
        break
      case 'main': options.getCssHandlerOptions.mockReturnValue({ isMainChunk: true })
        break
    }
    generateTailwindV4Css.mockResolvedValueOnce({ css: '.fresh{}', dependencies: [] })
    expect(await rebuild()).toBe(1)
    expect(generateTailwindV4Css).toHaveBeenCalledTimes(2)
    expect(generateTailwindV4Css).toHaveBeenLastCalledWith(expect.objectContaining({ previousCss: undefined }))
    expect(options.emitOrReplayCssAsset).toHaveBeenLastCalledWith(remembered.outputFile, '.fresh{}')
  })

  it('rejects a different source order even when merged content and candidates match', async () => {
    const { options, remembered, rebuild } = createReplayCase()
    const second = { ...remembered, sourceFile: '/repo/other/entry.css' }
    let sources = [['first', remembered], ['second', second]]
    options.getRememberedCssSources = () => sources as any
    generateTailwindV4Css.mockResolvedValue({ css: '.generated{}', dependencies: [] })
    await rebuild()
    sources = [['second', second], ['first', remembered]]
    await rebuild()
    expect(generateTailwindV4Css).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['/repo/view.vue', '/repo/view.vue'],
    ['C:\\repo\\view.vue', 'C:/repo/view.vue'],
    ['C:\\view.vue', 'C:/view.vue'],
    ['../view.vue', '../view.vue'],
  ])('normalizes source identity %s while retaining the style block owner', (source, equivalent) => {
    const signature = (file: string, outputFile = 'theme.acss') => createGeneratedReplayCacheSignature({
      outputFile,
      rememberedOutputFile: outputFile,
      sources: [{ sourceFile: file, outputFile, rawSource: '@tailwind utilities;' }],
      computeHash: value => value,
      rawSource: '@tailwind utilities;',
      generatorRawSource: '@tailwind utilities;',
      rememberedSignature: 'candidates',
      runtimeSignature: 'runtime',
      dependencyRevision: 0,
    })
    expect(signature(`${source}?vue&type=style&index=0&lang.css`)).toBe(signature(`${equivalent}?vue&type=style&index=0&lang.css`))
    expect(signature(`${source}?vue&type=style&index=0&lang.css`)).not.toBe(signature(`${source}?vue&type=style&index=1&lang.css`))
    expect(signature(source)).not.toBe(signature(source, 'other.acss'))
  })

  it.each(['current', 'planned'])('keeps the %s graph owner without duplicate emission', async (owner) => {
    const { options, remembered } = createReplayCase()
    if (owner === 'current') {
      options.bundleFiles.push(remembered.outputFile)
    }
    else {
      options.activeViteCssCacheFiles.add(`planned:${remembered.outputFile}`)
    }
    await processRememberedCssReplay(options as any)
    expect(options.cssTaskFactories).toHaveLength(0)
    expect(options.emitOrReplayCssAsset).not.toHaveBeenCalled()
    expect(options.createScopedGeneratorRuntime).not.toHaveBeenCalled()
  })
})
