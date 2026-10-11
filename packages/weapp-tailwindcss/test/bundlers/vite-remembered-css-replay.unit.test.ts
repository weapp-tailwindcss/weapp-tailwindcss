import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRuntimeAffectingSourceSignature } from '@/bundlers/vite/runtime-affecting-signature'
import { createCssRuntimeSignature } from '@/bundlers/vite/generate-bundle/css-share-scope'
import { createRememberedCssRuntimeSignature } from '@/bundlers/vite/generate-bundle/remembered-css'
import { createCandidateSignature } from '@/bundlers/vite/generate-bundle/signatures'

const createCssTokenSourceMap = vi.fn()
const generateTailwindV4Css = vi.fn()

vi.mock('@/bundlers/shared/css-source-trace', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/bundlers/shared/css-source-trace')>()
  return {
    ...actual,
    createCssTokenSourceMap,
  }
})

vi.mock('@/generation/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/generation/service')>()
  return {
    ...actual,
    generateTailwindV4Css,
  }
})

describe('bundlers/vite remembered css replay', () => {
  beforeEach(() => {
    createCssTokenSourceMap.mockReset()
    generateTailwindV4Css.mockReset()
  })

  it('skips uncompiled preprocessor sources but accepts compiled css content', async () => {
    const { shouldSkipRawRememberedCssSource } = await import('@/bundlers/vite/generate-bundle/remembered-css-replay')
    const sourceFile = '/repo/pages/index/index.scss?direct'

    expect(shouldSkipRawRememberedCssSource(
      '// https://sass-lang.com/documentation\n.a { color: turquoise; }',
      sourceFile,
    )).toBe(true)
    expect(shouldSkipRawRememberedCssSource('.a { color: turquoise; }', sourceFile)).toBe(false)
  })

  it.each(['lang.scss', 'lang=scss'])('skips uncompiled SFC preprocessor requests using %s before remembered css replay', async (langQuery) => {
    const { shouldSkipRawRememberedCssSource } = await import('@/bundlers/vite/generate-bundle/remembered-css-replay')
    const sourceFile = `/repo/uni_modules/uview-ultra/components/up-checkbox/up-checkbox.uvue?vue&type=style&index=0&${langQuery}`

    expect(shouldSkipRawRememberedCssSource(
      '$up-checkbox-icon-wrap-margin-right: 6px !default;\n.up-checkbox { margin-right: $up-checkbox-icon-wrap-margin-right; }',
      sourceFile,
    )).toBe(true)
    expect(shouldSkipRawRememberedCssSource(
      '.up-checkbox { margin-right: 6px; }',
      sourceFile,
    )).toBe(false)
  })

  it('skips source trace preparation when remembered replay signature is fresh', async () => {
    const { processRememberedCssReplay } = await import('@/bundlers/vite/generate-bundle/remembered-css-replay')
    const cssTaskFactories: Array<() => Promise<void>> = []
    const activeViteCssCacheFiles = new Set<string>()
    const rawSource = '@tailwind utilities;'
    const runtime = new Set(['text-red-500'])
    const runtimeSignature = createCandidateSignature(runtime)
    const freshSignature = createRememberedCssRuntimeSignature(
      createCssRuntimeSignature(runtimeSignature, runtimeSignature),
      `hash:${createRuntimeAffectingSourceSignature(rawSource, 'css')}`,
    )
    await processRememberedCssReplay({
      addWatchFile: vi.fn(),
      activeViteCssCacheFiles,
      bundle: {},
      bundleFiles: ['pages/index/index.js'],
      cache: {
        computeHash: (source: string) => `hash:${source}`,
      },
      createScopedGeneratorRuntime: vi.fn(async () => runtime),
      createScopedSourceCandidateGetter: vi.fn(() => undefined),
      createScopedSourceCandidateSourceGetter: vi.fn(() => () => new Map()),
      cssTaskFactories,
      cssPipelineContext: { opts: { cssMatcher: (file: string) => file.endsWith('.wxss') } } as any,
      debug: vi.fn(),
      defaultStyleOutputExtension: '.wxss',
      emitOrReplayCssAsset: vi.fn(),
      generatorRuntime: new Set(['text-red-500']),
      getCssHandlerOptions: vi.fn(() => ({ isMainChunk: false })),
      getCssUserHandlerOptions: vi.fn(() => ({})),
      getRememberedCssSignature: vi.fn(() => freshSignature),
      getRememberedCssSources: () => new Map([
        ['pages/index/index.wxss', {
          outputFile: 'pages/index/index.wxss',
          rawSource,
          sourceFile: '/repo/src/pages/index/index.vue?vue&type=style&index=0&lang.css',
        }],
      ]),
      isNativeAppStyleTarget: false,
      isWebGeneratorTarget: false,
      lastCssResultByFile: new Map(),
      lastCssSourceHashByFile: new Map(),
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
      recordCssAssetResult: vi.fn(),
      recordViteProcessedCssAssetResult: vi.fn(),
      rootDir: '/repo',
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        },
        readyPromise: Promise.resolve(),
      },
      setRememberedCssSignature: vi.fn(),
      shouldInjectCssIntoMainFromOutput: vi.fn(() => false),
      shouldPreserveAppCssExtension: false,
      sourceRoot: undefined,
      styleHandler: vi.fn(async (source: string) => ({ css: source })),
      timeTask: vi.fn(async (_name: string, task: () => Promise<void>) => {
        await task()
      }),
      useIncrementalMode: true,
    } as any)

    expect(createCssTokenSourceMap).not.toHaveBeenCalled()
    expect(cssTaskFactories).toHaveLength(0)
  })

  it('preserves mini-program import shell replay without resolving output imports through tailwind', async () => {
    const { processRememberedCssReplay } = await import('@/bundlers/vite/generate-bundle/remembered-css-replay')
    const cssTaskFactories: Array<() => Promise<void>> = []
    const activeViteCssCacheFiles = new Set<string>()
    const emitOrReplayCssAsset = vi.fn((_fileName: string, source: string) => ({ source }))
    const recordCssAssetResult = vi.fn()
    const markCssAssetProcessed = vi.fn()
    const onUpdate = vi.fn()
    const optionsBundle: Record<string, any> = {}
    const rawSource = '@import "app.wxss";\n'

    generateTailwindV4Css.mockImplementation(async () => {
      throw new Error('generateTailwindV4Css should not process import shell replay')
    })

    await processRememberedCssReplay({
      addWatchFile: vi.fn(),
      activeViteCssCacheFiles,
      bundle: optionsBundle,
      bundleFiles: ['pages/index/index.js'],
      cache: {
        computeHash: (source: string) => `hash:${source}`,
      },
      createScopedGeneratorRuntime: vi.fn(async () => new Set()),
      createScopedSourceCandidateGetter: vi.fn(() => undefined),
      createScopedSourceCandidateSourceGetter: vi.fn(() => () => new Map()),
      cssTaskFactories,
      cssPipelineContext: { opts: { cssMatcher: (file: string) => file.endsWith('.wxss') } } as any,
      cssPipelineStrategy: {
        shouldKeepRootMiniProgramStyleAsImportShell: () => true,
      },
      debug: vi.fn(),
      defaultStyleOutputExtension: '.wxss',
      emitOrReplayCssAsset,
      generatorRuntime: new Set(),
      getCssHandlerOptions: vi.fn(() => ({ isMainChunk: true })),
      getCssUserHandlerOptions: vi.fn(() => ({})),
      getRememberedCssSignature: vi.fn(() => undefined),
      getRememberedCssSources: () => new Map([
        ['main.wxss', {
          outputFile: 'main.wxss',
          rawSource,
          sourceFile: 'main.wxss',
        }],
      ]),
      isNativeAppStyleTarget: false,
      isWebGeneratorTarget: false,
      lastCssResultByFile: new Map(),
      lastCssSourceHashByFile: new Map(),
      markCssAssetProcessed,
      metrics: {
        runtimeSet: 0,
        html: { total: 0, transformed: 0, cacheHits: 0, elapsed: 0 },
        js: { total: 0, transformed: 0, cacheHits: 0, elapsed: 0 },
        css: { total: 0, transformed: 0, cacheHits: 0, elapsed: 0 },
      },
      normalizeViteCssCacheKey: (file: string) => file,
      onUpdate,
      opts: {
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        htmlMatcher: (file: string) => file.endsWith('.wxml'),
      },
      recordCssAssetResult,
      recordViteProcessedCssAssetResult: vi.fn(),
      rootDir: '/repo',
      runtimeState: {
        tailwindRuntime: {
          majorVersion: 4,
        },
        readyPromise: Promise.resolve(),
      },
      setRememberedCssSignature: vi.fn(),
      shouldInjectCssIntoMainFromOutput: vi.fn(() => false),
      shouldPreserveAppCssExtension: false,
      sourceRoot: undefined,
      styleHandler: vi.fn(async (source: string) => ({ css: source })),
      timeTask: vi.fn(async (_name: string, task: () => Promise<void>) => {
        await task()
      }),
      useIncrementalMode: true,
    } as any)

    expect(cssTaskFactories).toHaveLength(1)
    await cssTaskFactories[0]!()

    expect(generateTailwindV4Css).not.toHaveBeenCalled()
    expect(emitOrReplayCssAsset).toHaveBeenCalledWith('main.wxss', '@import "./app.wxss";\n')
    expect(optionsBundle['main.wxss']).toEqual({ source: '@import "./app.wxss";\n' })
    expect(recordCssAssetResult).toHaveBeenCalledWith('main.wxss', '@import "./app.wxss";\n')
    expect(markCssAssetProcessed).toHaveBeenCalledWith({ source: '@import "./app.wxss";\n' }, 'main.wxss')
    expect(onUpdate).toHaveBeenCalledWith('main.wxss', rawSource, '@import "./app.wxss";\n')
  })
})
