import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { describe, expect, it, vi } from 'vitest'
import { createJsHandlerOptionsFactory, resolveGenerateBundleJsFastPath } from '@/bundlers/vite/generate-bundle/js-handler-options'
import { processJsBundleEntry, replayCleanJsBundleEntry } from '@/bundlers/vite/generate-bundle/js-processing'
import { createTransformFilter, createTransformFilterSignature, shouldSkipViteJsChunkTransform } from '@/bundlers/vite/generate-bundle/transform-filter'
import { createCache } from '@/cache'
import { createJsHandler } from '@/js'
import * as babel from '@/js/babel'
import { createRollupChunk } from './vite-plugin.testkit'

function createMetrics() {
  return {
    runtimeSet: 0,
    html: { total: 0, transformed: 0, cacheHits: 0, elapsed: 0 },
    js: { total: 0, transformed: 0, cacheHits: 0, elapsed: 0 },
    css: { total: 0, transformed: 0, cacheHits: 0, elapsed: 0 },
  }
}

function createSnapshot(file: string, sourceHash: string) {
  return {
    entries: [],
    jsEntries: new Map(),
    sourceHashByFile: new Map([[file, sourceHash]]),
    runtimeAffectingSignatureByFile: new Map(),
    runtimeAffectingHashByFile: new Map(),
    hasOmittedKnownFiles: false,
    removedFiles: new Set(),
    changedByType: {
      html: new Set(),
      js: new Set(),
      css: new Set(),
      other: new Set(),
    },
    runtimeAffectingChangedByType: {
      html: new Set(),
      js: new Set(),
      css: new Set(),
      other: new Set(),
    },
    processFiles: {
      html: new Set(),
      js: new Set(),
      css: new Set(),
    },
    linkedImpactsByEntry: new Map(),
  }
}

describe('bundlers/vite js processing', () => {
  it('selects the JS fast path from the current bundler lifecycle', () => {
    let experimentalJsFastPath: false | 'oxc' = false
    const createHandlerOptions = createJsHandlerOptionsFactory({
      getExperimentalJsFastPath: () => experimentalJsFastPath,
      getMajorVersion: () => 4,
      moduleGraph: undefined,
    })

    expect(createHandlerOptions('/repo/dist/index.js')).toMatchObject({
      experimentalJsFastPath: false,
    })

    experimentalJsFastPath = 'oxc'
    expect(createHandlerOptions('/repo/dist/index.js')).toMatchObject({
      experimentalJsFastPath: 'oxc',
    })
  })

  it('uses oxc in production generateBundle and keeps moduleGraph only for incremental rebuilds', () => {
    expect(resolveGenerateBundleJsFastPath({ useIncrementalMode: false })).toEqual({
      experimentalJsFastPath: 'oxc',
      moduleGraphEnabled: false,
    })
    expect(resolveGenerateBundleJsFastPath({ useIncrementalMode: true })).toEqual({
      experimentalJsFastPath: 'oxc',
      moduleGraphEnabled: true,
    })
    expect(resolveGenerateBundleJsFastPath({
      experimentalJsFastPath: false,
      useIncrementalMode: false,
    })).toEqual({
      experimentalJsFastPath: false,
      moduleGraphEnabled: false,
    })
  })

  it('keeps production conditional comparison values unchanged under Oxc', () => {
    const productionFastPath = resolveGenerateBundleJsFastPath({ useIncrementalMode: false })
    const createHandlerOptions = createJsHandlerOptionsFactory({
      getExperimentalJsFastPath: () => productionFastPath.experimentalJsFastPath,
      getMajorVersion: () => 4,
      moduleGraph: productionFastPath.moduleGraphEnabled
        ? { resolve: () => undefined, load: () => undefined }
        : undefined,
    })
    const sharedOptions = {
      escapeMap: MappingChars2String,
      alwaysEscape: true,
    }
    const fastOptions = createHandlerOptions('/repo/dist/index.js', sharedOptions)
    const babelOptions = {
      ...fastOptions,
      experimentalJsFastPath: false,
    } as const
    expect(fastOptions.experimentalJsFastPath).toBe('oxc')
    expect(babelOptions.experimentalJsFastPath).toBe(false)
    const fastHandler = createJsHandler(fastOptions)
    const babelHandler = createJsHandler(babelOptions)
    const source = 'const cls = value === "w-[10px]" ? "h-[10px]" : "plain"'

    const babelSpy = vi.spyOn(babel, 'jsHandler')
    try {
      const fast = fastHandler(source, new Set())
      expect(babelSpy).not.toHaveBeenCalled()
      const expected = babelHandler(source, new Set())
      expect(babelSpy).toHaveBeenCalledOnce()

      expect(fast.code).toBe(expected.code)
      expect(fast.code).toContain('value === "w-[10px]"')
      expect(fast.code).toContain('"h-_b10px_B"')
    }
    finally {
      babelSpy.mockRestore()
    }
  })

  it('directly replays cached clean incremental chunks without scheduling js work', () => {
    const cache = createCache()
    const file = 'assets/index.js'
    const source = 'const cls = "text-red-500"'
    const cached = 'const cls = "tw-text-red-500"'
    const sourceHash = cache.computeHash(source)
    const runtimeSignature = 'runtime:stable'
    const processHash = `${sourceHash}:${runtimeSignature}:transform-filter:include:none;exclude:none`
    cache.set(file, cached)
    cache.setHashValue(`${file}:js`, {
      changed: false,
      hash: processHash,
    })
    const chunk = {
      ...createRollupChunk(source),
      fileName: file,
    }
    const jsTaskFactories: Array<() => Promise<void>> = []
    const linkedByEntry = new Map<string, Set<string>>()

    processJsBundleEntry({
      applyLinkedUpdates: vi.fn(),
      bundle: {},
      cache,
      createHandlerOptions: vi.fn(() => ({} as any)),
      debug: vi.fn(),
      disableJsPrecheck: false,
      entry: {
        file,
        output: chunk,
        source,
        type: 'js',
      },
      getJsEntry: vi.fn(),
      jsHandler: vi.fn(),
      jsTaskFactories,
      linkedByEntry,
      metrics: createMetrics(),
      onUpdate: vi.fn(),
      outDir: '/repo/dist',
      processFiles: {
        html: new Set(),
        js: new Set(),
        css: new Set(),
      },
      rememberProcessCacheKey: vi.fn(),
      runtimeSignature,
      snapshot: createSnapshot(file, sourceHash) as any,
      shouldSkipAstTransform: undefined,
      slowJsAstWarnMs: 1000,
      timeTask: vi.fn(async (_name: string, task: () => Promise<void>) => {
        await task()
      }),
      transformFilterSignature: 'include:none;exclude:none',
      transformRuntime: new Set(['text-red-500']),
      transformRuntimeSignature: runtimeSignature,
      uniAppX: undefined,
      useIncrementalMode: true,
    })

    expect(chunk.code).toBe(cached)
    expect(jsTaskFactories).toHaveLength(0)
    expect(linkedByEntry.get(file)).toEqual(new Set())
  })

  it('plans a cached clean chunk without creating a js handler task or replacing linked state', () => {
    const cache = createCache()
    const file = 'assets/clean.js'
    const source = 'const cls = "text-red-500"'
    const sourceHash = cache.computeHash(source)
    const runtimeSignature = 'runtime:stable'
    const processHash = `${sourceHash}:${runtimeSignature}:transform-filter:include:none;exclude:none`
    const cached = 'const cls = "tw-text-red-500"'
    cache.set(file, cached)
    cache.setHashValue(`${file}:js`, { changed: false, hash: processHash })
    const chunk = { ...createRollupChunk(source), fileName: file }
    const metrics = createMetrics()
    const rememberProcessCacheKey = vi.fn()

    const replayed = replayCleanJsBundleEntry({
      cache,
      debug: vi.fn(),
      entry: { file, output: chunk, source, type: 'js' },
      metrics,
      rememberProcessCacheKey,
      snapshot: createSnapshot(file, sourceHash) as any,
      transformFilterSignature: 'include:none;exclude:none',
      transformRuntimeSignature: runtimeSignature,
      useIncrementalMode: true,
    })

    expect(replayed).toBe(true)
    expect(chunk.code).toBe(cached)
    expect(metrics.js.cacheHits).toBe(1)
    expect(rememberProcessCacheKey).toHaveBeenCalledWith(file, `${file}:js`)
  })

  it('skips js ast work when all chunk modules match transform.exclude', async () => {
    const cache = createCache()
    const rootDir = '/repo'
    const file = 'generated/openapi-client.js'
    const source = 'export const cls = "text-red-500"'
    const sourceHash = cache.computeHash(source)
    const chunk = {
      ...createRollupChunk(source),
      fileName: file,
      moduleIds: ['/repo/src/generated/openapi-client.ts?hash=1'],
      modules: {
        '/repo/src/generated/openapi-client.ts': {},
      },
    } as any
    const filter = createTransformFilter({ exclude: ['src/generated/**'] }, rootDir)
    const jsTaskFactories: Array<() => Promise<void>> = []
    const jsHandler = vi.fn((code: string) => ({ code: `js:${code}` }))

    processJsBundleEntry({
      applyLinkedUpdates: vi.fn(),
      bundle: {},
      cache,
      createHandlerOptions: vi.fn(() => ({} as any)),
      debug: vi.fn(),
      disableJsPrecheck: false,
      entry: {
        file,
        output: chunk,
        source,
        type: 'js',
      },
      getJsEntry: vi.fn(),
      jsHandler,
      jsTaskFactories,
      linkedByEntry: undefined,
      metrics: createMetrics(),
      onUpdate: vi.fn(),
      outDir: '/repo/dist',
      processFiles: {
        html: new Set(),
        js: new Set([file]),
        css: new Set(),
      },
      rememberProcessCacheKey: vi.fn(),
      runtimeSignature: 'runtime:stable',
      snapshot: createSnapshot(file, sourceHash) as any,
      shouldSkipAstTransform: chunk => shouldSkipViteJsChunkTransform(chunk, filter),
      slowJsAstWarnMs: 1000,
      timeTask: vi.fn(async (_name: string, task: () => Promise<void>) => {
        await task()
      }),
      transformFilterSignature: createTransformFilterSignature({ exclude: ['src/generated/**'] }),
      transformRuntime: new Set(['text-red-500']),
      transformRuntimeSignature: 'runtime:stable',
      uniAppX: undefined,
      useIncrementalMode: false,
    })

    expect(jsTaskFactories).toHaveLength(1)
    await jsTaskFactories[0]?.()

    expect(jsHandler).not.toHaveBeenCalled()
    expect(chunk.code).toBe(source)
  })

  it('does not skip mixed js chunks when only some modules match transform.exclude', () => {
    const filter = createTransformFilter({ exclude: ['src/generated/**'] }, '/repo')
    const chunk = {
      ...createRollupChunk('const cls = "text-red-500"'),
      moduleIds: [
        '/repo/src/generated/openapi-client.ts',
        '/repo/src/pages/index.ts',
      ],
    } as any

    expect(shouldSkipViteJsChunkTransform(chunk, filter)).toBe(false)
  })

  it('skips js ast work when chunk modules do not match transform.include', async () => {
    const cache = createCache()
    const rootDir = '/repo'
    const file = 'generated/openapi-client.js'
    const source = 'export const cls = "text-red-500"'
    const sourceHash = cache.computeHash(source)
    const chunk = {
      ...createRollupChunk(source),
      fileName: file,
      moduleIds: ['/repo/src/generated/openapi-client.ts'],
      modules: {
        '/repo/src/generated/openapi-client.ts': {},
      },
    } as any
    const filter = createTransformFilter({ include: ['src/pages/**'] }, rootDir)
    const jsTaskFactories: Array<() => Promise<void>> = []
    const jsHandler = vi.fn((code: string) => ({ code: `js:${code}` }))

    processJsBundleEntry({
      applyLinkedUpdates: vi.fn(),
      bundle: {},
      cache,
      createHandlerOptions: vi.fn(() => ({} as any)),
      debug: vi.fn(),
      disableJsPrecheck: false,
      entry: {
        file,
        output: chunk,
        source,
        type: 'js',
      },
      getJsEntry: vi.fn(),
      jsHandler,
      jsTaskFactories,
      linkedByEntry: undefined,
      metrics: createMetrics(),
      onUpdate: vi.fn(),
      outDir: '/repo/dist',
      processFiles: {
        html: new Set(),
        js: new Set([file]),
        css: new Set(),
      },
      rememberProcessCacheKey: vi.fn(),
      runtimeSignature: 'runtime:stable',
      snapshot: createSnapshot(file, sourceHash) as any,
      shouldSkipAstTransform: chunk => shouldSkipViteJsChunkTransform(chunk, filter),
      slowJsAstWarnMs: 1000,
      timeTask: vi.fn(async (_name: string, task: () => Promise<void>) => {
        await task()
      }),
      transformFilterSignature: createTransformFilterSignature({ include: ['src/pages/**'] }),
      transformRuntime: new Set(['text-red-500']),
      uniAppX: undefined,
      useIncrementalMode: false,
    })

    expect(jsTaskFactories).toHaveLength(1)
    await jsTaskFactories[0]?.()

    expect(jsHandler).not.toHaveBeenCalled()
    expect(chunk.code).toBe(source)
  })

  it('warns when js ast transform is slow', async () => {
    const loggerModule = await import('@/logger')
    const warnSpy = vi.spyOn(loggerModule.logger, 'warn').mockImplementation(() => {})
    const cache = createCache()
    const file = 'pages/index.js'
    const source = 'const cls = "text-red-500"'
    const sourceHash = cache.computeHash(source)
    const chunk = {
      ...createRollupChunk(source),
      fileName: file,
    }
    const jsTaskFactories: Array<() => Promise<void>> = []

    processJsBundleEntry({
      applyLinkedUpdates: vi.fn(),
      bundle: {},
      cache,
      createHandlerOptions: vi.fn(() => ({} as any)),
      debug: vi.fn(),
      disableJsPrecheck: true,
      entry: {
        file,
        output: chunk,
        source,
        type: 'js',
      },
      getJsEntry: vi.fn(),
      jsHandler: vi.fn((code: string) => ({ code: `js:${code}` })),
      jsTaskFactories,
      linkedByEntry: undefined,
      metrics: createMetrics(),
      onUpdate: vi.fn(),
      outDir: '/repo/dist',
      processFiles: {
        html: new Set(),
        js: new Set([file]),
        css: new Set(),
      },
      rememberProcessCacheKey: vi.fn(),
      runtimeSignature: 'runtime:stable',
      snapshot: createSnapshot(file, sourceHash) as any,
      shouldSkipAstTransform: undefined,
      slowJsAstWarnMs: 0,
      timeTask: vi.fn(async (_name: string, task: () => Promise<void>) => {
        await task()
      }),
      transformFilterSignature: 'include:none;exclude:none',
      transformRuntime: new Set(['text-red-500']),
      uniAppX: undefined,
      useIncrementalMode: false,
    })

    await jsTaskFactories[0]?.()

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0]?.[0]).toContain('JS AST 转译耗时较长')
    expect(warnSpy.mock.calls[0]?.[1]).toBe(file)
  })
})
