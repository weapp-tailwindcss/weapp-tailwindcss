import type { SetupWebpackV5ProcessAssetsHookOptions } from '@/bundlers/webpack/BaseUnifiedPlugin/v5-assets/helpers'
import { describe, expect, it, vi } from 'vitest'
import { setupWebpackV5ProcessAssetsHook } from '@/bundlers/webpack/BaseUnifiedPlugin/v5-assets'
import { createAssetsFromStore, createContext, FakeConcatSource, path } from './shared'

function createHookHarness(options: {
  assetStore: Record<string, string>
  chunkGraph?: any
  chunkFiles?: string[] | undefined
  chunks?: any[] | undefined
  compilerOutputPath?: string | undefined
  context?: ReturnType<typeof createContext> | any
  hookOptions?: Partial<SetupWebpackV5ProcessAssetsHookOptions> | undefined
  outputOptionsPath?: string | undefined
  setupProcessAssetsHook?: typeof setupWebpackV5ProcessAssetsHook | undefined
  watchMode?: boolean | undefined
}) {
  const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
  const assetStore = options.assetStore
  const compilation = {
    compiler: options.compilerOutputPath === undefined ? undefined : { outputPath: options.compilerOutputPath },
    outputOptions: options.outputOptionsPath === undefined ? undefined : { path: options.outputOptionsPath },
    chunks: options.chunks ?? [{
      id: 'main',
      hash: 'hash-main',
      files: options.chunkFiles ?? Object.keys(assetStore),
    }],
    chunkGraph: options.chunkGraph,
    fileDependencies: {
      add: vi.fn(),
    },
    hooks: {
      processAssets: {
        tapPromise: (_options: unknown, handler: (assets: Record<string, any>) => Promise<void>) => {
          processAssetsCallbacks.push(handler)
        },
      },
    },
    updateAsset: vi.fn((file: string, source: FakeConcatSource) => {
      assetStore[file] = source.toString()
    }),
    getAsset(file: string) {
      const content = assetStore[file]
      if (content === undefined) {
        return undefined
      }
      return {
        source: {
          source: () => content,
        },
      }
    },
  }
  const compiler = {
    outputPath: options.compilerOutputPath,
    webpack: {
      Compilation: {
        PROCESS_ASSETS_STAGE_SUMMARIZE: Symbol('stage'),
      },
      sources: {
        ConcatSource: FakeConcatSource,
      },
    },
    hooks: {
      compilation: {
        tap: vi.fn((_name: string, handler: (_compilation: any) => void) => {
          handler(compilation)
        }),
      },
    },
  }
  const context = options.context ?? createContext({
    tailwindRuntime: {
      ...createContext().tailwindRuntime,
      majorVersion: 4,
      getClassSet: vi.fn(async () => new Set(['bg-red-500'])),
      getClassSetSync: vi.fn(() => new Set(['bg-red-500'])),
      extract: vi.fn(async () => ({ classSet: new Set(['bg-red-500']) })),
    },
  })
  const baseHookOptions = {
    compiler,
    options: context,
    appType: context.appType,
    runtimeState: {
      tailwindRuntime: context.tailwindRuntime,
      readyPromise: Promise.resolve(),
    },
    getRuntimeRefreshRequirement: vi.fn(() => false),
    refreshRuntimeMetadata: vi.fn(async () => {}),
    consumeRuntimeRefreshRequirement: vi.fn(),
    isWatchMode: vi.fn(() => options.watchMode === true),
    getWatchChangedFiles: vi.fn(() => []),
    debug: vi.fn(),
    ...options.hookOptions,
  } satisfies SetupWebpackV5ProcessAssetsHookOptions

  ;(options.setupProcessAssetsHook ?? setupWebpackV5ProcessAssetsHook)(baseHookOptions as any)

  return {
    assetStore,
    compilation,
    context,
    hookOptions: baseHookOptions,
    processAssets: () => processAssetsCallbacks[0](createAssetsFromStore(assetStore)),
    processAssetsWith: (assets: Record<string, any>) => processAssetsCallbacks[0](assets),
  }
}

class ObjectSource {
  constructor(private readonly value: string) {}

  toString() {
    return this.value
  }
}

function createObjectSourceAssets(store: Record<string, any>) {
  return Object.fromEntries(
    Object.keys(store).map(file => [
      file,
      {
        source: () => typeof store[file] === 'string' ? new ObjectSource(store[file]) : store[file],
      },
    ]),
  )
}

function createObjectSourceStore(initial: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(initial).map(([file, source]) => [file, new ObjectSource(source)]),
  ) as Record<string, any>
}

describe('bundlers/webpack v5-assets hook branch coverage', () => {
  it('keeps css-loader runtime sources unchanged and hits its cache on repeated builds', async () => {
    const assetStore = {
      'runtime.css': [
        'var ___CSS_LOADER_API_IMPORT___ = require("css-loader/dist/runtime/api.js");',
        'var ___CSS_LOADER_EXPORT___ = ___CSS_LOADER_API_IMPORT___(false);',
        'module.exports = ___CSS_LOADER_EXPORT___;',
      ].join('\n'),
    }
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.css'),
      mainCssChunkMatcher: vi.fn(() => false),
      styleHandler: vi.fn(async (code: string) => ({ css: `handled:${code}` })),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => new Set()),
        getClassSetSync: vi.fn(() => new Set()),
      },
    })
    const harness = createHookHarness({ assetStore, context })

    await harness.processAssets()
    await harness.processAssets()

    expect(assetStore['runtime.css']).toContain('___CSS_LOADER_EXPORT___')
    expect(context.styleHandler).not.toHaveBeenCalled()
    expect(harness.compilation.updateAsset).toHaveBeenCalled()
  })

  it('keeps css-loader runtime generator sources unchanged', async () => {
    const sourceFile = path.resolve(process.cwd(), 'src/runtime-source.css')
    const loaderRuntimeSource = [
      '@import "tailwindcss";',
      'var ___CSS_LOADER_API_IMPORT___ = require("css-loader/dist/runtime/api.js");',
      'var ___CSS_LOADER_EXPORT___ = ___CSS_LOADER_API_IMPORT___(false);',
      'module.exports = ___CSS_LOADER_EXPORT___;',
    ].join('\n')
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.css'),
      mainCssChunkMatcher: vi.fn(() => false),
      styleHandler: vi.fn(async (code: string) => ({ css: `handled:${code}` })),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => new Set()),
        getClassSetSync: vi.fn(() => new Set()),
      },
    })
    const harness = createHookHarness({
      assetStore: {
        'runtime-source.css': '.asset{color:red}',
      },
      chunkFiles: ['runtime-source.css'],
      chunkGraph: {
        getChunkModulesIterable: () => [{ resource: sourceFile }],
      },
      context,
      hookOptions: {
        getWebpackCssSources: () => [[sourceFile, { css: loaderRuntimeSource }]],
        prepareWebpackCssSources: vi.fn(files => files),
      },
    })

    await harness.processAssets()

    expect(harness.assetStore['runtime-source.css']).toBe('.asset{color:red}')
    expect(context.styleHandler).not.toHaveBeenCalled()
  })

  it('falls back to the cached runtime set when watch incremental sync fails', async () => {
    const runtimeSet = new Set(['bg-red-500'])
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.css'),
      htmlMatcher: (file: string) => file.endsWith('.wxml'),
      mainCssChunkMatcher: vi.fn(() => false),
      templateHandler: vi.fn(async (code: string) => code.replace('bg-red-500', 'bg-_b_red-500_B')),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
      },
    })
    const runtimeClassSetManager = {
      sync: vi.fn(async () => {
        throw new Error('incremental failure')
      }),
      reset: vi.fn(async () => {}),
    }
    const harness = createHookHarness({
      assetStore: {
        'pages/index/index.wxml': '<view class="bg-red-500"></view>',
      },
      context,
      watchMode: true,
      hookOptions: {
        runtimeClassSetManager: runtimeClassSetManager as any,
      },
    })

    await harness.processAssets()

    expect(runtimeClassSetManager.sync).toHaveBeenCalled()
    expect(runtimeClassSetManager.reset).toHaveBeenCalled()
    expect(context.templateHandler).toHaveBeenCalledWith(
      '<view class="bg-red-500"></view>',
      expect.objectContaining({ runtimeSet }),
    )
    expect(harness.assetStore['pages/index/index.wxml']).toBe('<view class="bg-_b_red-500_B"></view>')
  })

  it('updates linked js outputs through the webpack output module graph', async () => {
    const outDir = path.resolve(process.cwd(), 'dist-linked')
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.css'),
      jsMatcher: (file: string) => file.endsWith('.js'),
      wxsMatcher: () => false,
      jsHandler: vi.fn(async (code: string, _runtimeSet: Set<string>, options: any) => {
        if (options.filename.endsWith('linked.js')) {
          return { code: 'const linked = "new"' }
        }
        const linkedId = options.moduleGraph.resolve('./linked', path.join(outDir, 'entry.js'))
        expect(options.moduleGraph.filter(linkedId)).toBe(true)
        expect(options.moduleGraph.load(linkedId)).toBe('const linked = "old"')
        expect(options.moduleGraph.load(path.join(outDir, 'missing.js'))).toBeUndefined()
        return {
          code: code.replace('old-entry', 'new-entry'),
          linked: {
            [linkedId]: { code: 'const linked = "new"' },
            [path.join(outDir, 'untracked.js')]: { code: 'const ignored = true' },
          },
        }
      }),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => new Set(['bg-[#123456]'])),
        getClassSetSync: vi.fn(() => new Set(['bg-[#123456]'])),
      },
    })
    const harness = createHookHarness({
      assetStore: {
        'entry.js': 'const cls = "old-entry bg-[#123456]"',
        'linked.js': 'const linked = "old"',
      },
      chunkFiles: [],
      compilerOutputPath: outDir,
      context,
    })

    await harness.processAssets()

    expect(harness.assetStore['entry.js']).toContain('new-entry')
    const linkedUpdate = harness.compilation.updateAsset.mock.calls.find(([file]) => file === 'linked.js')
    expect(linkedUpdate?.[1].toString()).toBe('const linked = "new"')
  })

  it('skips linked js updates when linked code is unchanged', async () => {
    const outDir = path.resolve(process.cwd(), 'dist-linked-unchanged')
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.css'),
      jsMatcher: (file: string) => file.endsWith('.js'),
      wxsMatcher: () => false,
      jsHandler: vi.fn(async (code: string, _runtimeSet: Set<string>, options: any) => {
        const linkedId = options.moduleGraph.resolve('./linked', path.join(outDir, 'entry.js'))
        return {
          code: code.replace('old-entry', 'new-entry'),
          linked: {
            [linkedId]: { code: 'const linked = "old"' },
          },
        }
      }),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => new Set(['bg-[#123456]'])),
        getClassSetSync: vi.fn(() => new Set(['bg-[#123456]'])),
      },
    })
    const harness = createHookHarness({
      assetStore: {
        'entry.js': 'const cls = "old-entry bg-[#123456]"',
        'linked.js': 'const linked = "old"',
      },
      chunkFiles: [],
      compilerOutputPath: outDir,
      context,
    })

    await harness.processAssets()

    expect(harness.assetStore['entry.js']).toContain('new-entry')
    expect(harness.compilation.updateAsset.mock.calls.some(([file]) => file === 'linked.js')).toBe(false)
  })

  it('reads non-string webpack source objects from module graph and linked assets', async () => {
    const outDir = path.resolve(process.cwd(), 'dist-linked-object-source')
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.css'),
      jsMatcher: (file: string) => file.endsWith('.js'),
      jsHandler: vi.fn(async (code: string, _runtimeSet: Set<string>, options: any) => {
        const linkedId = options.moduleGraph.resolve('./linked', path.join(outDir, 'entry.js'))
        expect(options.moduleGraph.load(linkedId)).toBe('const linked = "object-old"')
        return {
          code: code.replace('object-entry-old', 'object-entry-new'),
          linked: {
            [linkedId]: { code: 'const linked = "object-new"' },
          },
        }
      }),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => new Set(['bg-[#654321]'])),
        getClassSetSync: vi.fn(() => new Set(['bg-[#654321]'])),
      },
    })
    const harness = createHookHarness({
      assetStore: createObjectSourceStore({
        'entry.js': 'const cls = "object-entry-old bg-[#654321]"',
        'linked.js': 'const linked = "object-old"',
      }),
      chunkFiles: [],
      compilerOutputPath: outDir,
      context,
    })

    await harness.processAssetsWith(createObjectSourceAssets(harness.assetStore))

    expect(harness.assetStore['entry.js']).toContain('object-entry-new')
    const linkedUpdate = harness.compilation.updateAsset.mock.calls.find(([file, source]) =>
      file === 'linked.js' && source.toString() === 'const linked = "object-new"')
    expect(linkedUpdate).toBeDefined()
  })

  it('resolves relative css chunk resources from issuer context when compiler outputPath is absent', async () => {
    const outDir = path.resolve(process.cwd(), 'dist-output-options')
    const sourceFile = path.resolve(process.cwd(), 'src/styles/page.css')
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.css'),
      mainCssChunkMatcher: vi.fn(() => false),
      styleHandler: vi.fn(async (code: string, options: any) => {
        expect(options.postcssOptions.options.from).toBe(sourceFile)
        return { css: `handled:${code}` }
      }),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => new Set()),
        getClassSetSync: vi.fn(() => new Set()),
      },
    })
    const harness = createHookHarness({
      assetStore: {
        'styles/page.css': '.card{color:red}',
      },
      chunkFiles: ['styles/page.css'],
      chunkGraph: {
        getChunkModulesIterable: () => [{
          context: path.dirname(sourceFile),
          resource: './page.css?modules',
        }],
      },
      compilerOutputPath: undefined,
      context,
      hookOptions: {
        getWebpackCssSources: () => [[sourceFile, { css: '.source-card{color:blue}', processed: true }]],
        prepareWebpackCssSources: vi.fn(files => files),
      },
      outputOptionsPath: outDir,
    })

    await harness.processAssets()

    expect(context.styleHandler).toHaveBeenCalled()
    expect(harness.assetStore['styles/page.css']).toContain('handled:')
  })

  it('uses the single active webpack css resource when no registered css source exists', async () => {
    const sourceFile = path.resolve(process.cwd(), 'src/pages/active.css')
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.css'),
      mainCssChunkMatcher: vi.fn(() => false),
      styleHandler: vi.fn(async (code: string, options: any) => {
        expect(options.postcssOptions.options.from).toBe(sourceFile)
        return { css: code }
      }),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => new Set()),
        getClassSetSync: vi.fn(() => new Set()),
      },
    })
    const harness = createHookHarness({
      assetStore: {
        'pages/active.css': '.active{color:red}',
      },
      chunkFiles: ['pages/active.css'],
      chunkGraph: {
        getChunkModulesIterable: () => [{ resource: sourceFile }],
      },
      context,
      hookOptions: {
        prepareWebpackCssSources: vi.fn(files => files),
      },
    })

    await harness.processAssets()

    expect(context.styleHandler).toHaveBeenCalled()
  })

  it('prefers the active webpack css resource when registered sources are ambiguous', async () => {
    const activeSourceFile = path.resolve(process.cwd(), 'src/pages/active-registered.css')
    const otherSourceFile = path.resolve(process.cwd(), 'src/pages/other-registered.css')
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.css'),
      mainCssChunkMatcher: vi.fn(() => false),
      styleHandler: vi.fn(async (code: string, options: any) => {
        expect(options.postcssOptions.options.from).toBe(activeSourceFile)
        return { css: code }
      }),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => new Set()),
        getClassSetSync: vi.fn(() => new Set()),
      },
    })
    const harness = createHookHarness({
      assetStore: {
        'pages/active-registered.css': '.active{color:red}',
      },
      chunkFiles: ['pages/active-registered.css'],
      chunkGraph: {
        getChunkModulesIterable: () => [{ resource: activeSourceFile }],
      },
      context,
      hookOptions: {
        getWebpackCssSources: () => [
          [activeSourceFile, { css: '.active-source{color:blue}' }],
          [otherSourceFile, { css: '.other-source{color:green}' }],
        ],
        prepareWebpackCssSources: vi.fn(files => files),
      },
    })

    await harness.processAssets()

    expect(context.styleHandler).toHaveBeenCalled()
  })

  it('uses the active webpack css resource when it is not registered as a css source', async () => {
    const activeSourceFile = path.resolve(process.cwd(), 'src/pages/active-unregistered.css')
    const registeredSourceFile = path.resolve(process.cwd(), 'src/pages/registered-only.css')
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.css'),
      mainCssChunkMatcher: vi.fn(() => false),
      styleHandler: vi.fn(async (code: string, options: any) => {
        expect(options.postcssOptions.options.from).toBe(activeSourceFile)
        return { css: code }
      }),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => new Set()),
        getClassSetSync: vi.fn(() => new Set()),
      },
    })
    const harness = createHookHarness({
      assetStore: {
        'pages/active-unregistered.css': '.active{color:red}',
      },
      chunkFiles: ['pages/active-unregistered.css'],
      chunkGraph: {
        getChunkModulesIterable: () => [{ resource: activeSourceFile }],
      },
      context,
      hookOptions: {
        getWebpackCssSources: () => [
          [registeredSourceFile, { css: '.registered{color:blue}' }],
        ],
        prepareWebpackCssSources: vi.fn(files => files),
      },
    })

    await harness.processAssets()

    expect(context.styleHandler).toHaveBeenCalled()
  })

  it('keeps asset scope when webpack resources exist but none is active', async () => {
    const firstSourceFile = path.resolve(process.cwd(), 'src/source/inactive-source-a.css')
    const secondSourceFile = path.resolve(process.cwd(), 'src/source/inactive-source-b.css')
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.css'),
      mainCssChunkMatcher: vi.fn(() => false),
      styleHandler: vi.fn(async (code: string, options: any) => {
        expect(options.postcssOptions.options.from).toBe('pages/inactive.css')
        return { css: code }
      }),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => new Set()),
        getClassSetSync: vi.fn(() => new Set()),
      },
    })
    const harness = createHookHarness({
      assetStore: {
        'pages/inactive.css': '.inactive{color:red}',
      },
      chunkFiles: ['pages/inactive.css'],
      chunkGraph: {
        getChunkModulesIterable: () => [
          { resource: firstSourceFile },
          { resource: secondSourceFile },
        ],
      },
      context,
      hookOptions: {
        prepareWebpackCssSources: vi.fn(() => new Set()),
      },
    })

    await harness.processAssets()

    expect(context.styleHandler).toHaveBeenCalled()
  })

  it('falls back to asset scope when inactive webpack resources do not match registered css sources', async () => {
    const firstInactiveSourceFile = path.resolve(process.cwd(), 'src/source/inactive-resource-a.css')
    const secondInactiveSourceFile = path.resolve(process.cwd(), 'src/source/inactive-resource-b.css')
    const registeredSourceFile = path.resolve(process.cwd(), 'src/source/registered-only.css')
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.css'),
      mainCssChunkMatcher: vi.fn(() => false),
      styleHandler: vi.fn(async (code: string, options: any) => {
        expect(options.postcssOptions.options.from).toBe('pages/inactive-registered.css')
        return { css: code }
      }),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => new Set()),
        getClassSetSync: vi.fn(() => new Set()),
      },
    })
    const harness = createHookHarness({
      assetStore: {
        'pages/inactive-registered.css': '.inactive{color:red}',
      },
      chunkFiles: ['pages/inactive-registered.css'],
      chunkGraph: {
        getChunkModulesIterable: () => [
          { resource: firstInactiveSourceFile },
          { resource: secondInactiveSourceFile },
        ],
      },
      context,
      hookOptions: {
        getWebpackCssSources: () => [
          [registeredSourceFile, { css: '.registered{color:blue}' }],
        ],
        prepareWebpackCssSources: vi.fn(() => new Set()),
      },
    })

    await harness.processAssets()

    expect(context.styleHandler).toHaveBeenCalled()
  })

  it('uses unknown major version cache keys when runtime metadata omits majorVersion', async () => {
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.css'),
      mainCssChunkMatcher: vi.fn(() => false),
      styleHandler: vi.fn(async (code: string, options: any) => {
        expect(options.majorVersion).toBeUndefined()
        return { css: code }
      }),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: undefined,
        getClassSet: vi.fn(async () => new Set()),
        getClassSetSync: vi.fn(() => new Set()),
      },
    } as any)
    const harness = createHookHarness({
      assetStore: {
        'unknown-version.css': '.unknown{color:red}',
      },
      chunkFiles: ['unknown-version.css'],
      context,
    })

    await harness.processAssets()

    expect(context.styleHandler).toHaveBeenCalled()
  })

  it('uses process cwd output fallback and optional hook defaults when webpack omits optional state', async () => {
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.css'),
      mainCssChunkMatcher: vi.fn(() => false),
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => new Set()),
        getClassSetSync: vi.fn(() => new Set()),
      },
    })
    const harness = createHookHarness({
      assetStore: {
        'style.css': '.plain{color:red}',
      },
      chunks: [{
        files: ['style.css'],
      }],
      compilerOutputPath: undefined,
      context,
      hookOptions: {
        getWatchChangedFiles: undefined,
        isWatchMode: undefined,
        prepareWebpackCssSources: undefined,
        pruneWebpackCssSources: undefined,
      },
    })

    await harness.processAssets()

    expect(context.onStart).toHaveBeenCalled()
    expect(context.onEnd).toHaveBeenCalled()
    expect(harness.assetStore['style.css']).toContain('.plain')
  })

  it('skips the initial web watch runtime bundle scan for css-only web builds', async () => {
    const runtimeSet = new Set(['flex'])
    const runtimeClassSetManager = {
      sync: vi.fn(async () => new Set(['should-not-run'])),
      reset: vi.fn(async () => {}),
    }
    const context = createContext({
      generator: {
        target: 'web',
      },
      cssMatcher: (file: string) => file.endsWith('.css'),
      mainCssChunkMatcher: vi.fn(() => false),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
      },
    })
    const harness = createHookHarness({
      assetStore: {
        'style.css': '.flex{display:flex}',
      },
      context,
      hookOptions: {
        runtimeClassSetManager: runtimeClassSetManager as any,
      },
      watchMode: true,
    })

    await harness.processAssets()

    expect(runtimeClassSetManager.sync).not.toHaveBeenCalled()
    expect(runtimeClassSetManager.reset).not.toHaveBeenCalled()
  })

  it('resets runtime bundle state when a forced runtime refresh is required', async () => {
    const runtimeClassSetManager = {
      sync: vi.fn(async () => new Set()),
      reset: vi.fn(async () => {}),
    }
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.css'),
      mainCssChunkMatcher: vi.fn(() => false),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => new Set(['flex'])),
        getClassSetSync: vi.fn(() => new Set(['flex'])),
      },
    })
    const harness = createHookHarness({
      assetStore: {
        'style.css': '.flex{display:flex}',
      },
      context,
      hookOptions: {
        getRuntimeRefreshRequirement: vi.fn(() => true),
        runtimeClassSetManager: runtimeClassSetManager as any,
      },
      watchMode: true,
    })

    await harness.processAssets()

    expect(runtimeClassSetManager.reset).toHaveBeenCalled()
    expect(harness.hookOptions.refreshRuntimeMetadata).toHaveBeenCalledWith(true)
    expect(harness.hookOptions.consumeRuntimeRefreshRequirement).toHaveBeenCalled()
  })

  it('processes entries when no css assets are present', async () => {
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.css'),
      htmlMatcher: (file: string) => file.endsWith('.wxml'),
      jsMatcher: (file: string) => file.endsWith('.js'),
      templateHandler: vi.fn(async (code: string) => code.replace('alpha', 'beta')),
      jsHandler: vi.fn(async (code: string) => ({ code: code.replace('alpha', 'beta') })),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => new Set(['alpha'])),
        getClassSetSync: vi.fn(() => new Set(['alpha'])),
      },
    })
    const harness = createHookHarness({
      assetStore: {
        'pages/index.wxml': '<view class="alpha"></view>',
        'pages/index.js': 'const cls = "alpha"',
      },
      chunkFiles: ['pages/index.wxml', 'pages/index.js'],
      context,
    })

    await harness.processAssets()

    expect(harness.assetStore['pages/index.wxml']).toContain('beta')
    expect(harness.assetStore['pages/index.js']).toContain('alpha')
  })

  it('ignores invalid escaped runtime candidates emitted by transformed js assets', async () => {
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.css'),
      jsMatcher: (file: string) => file.endsWith('.js'),
      jsHandler: vi.fn(async () => ({ code: 'const cls = "foo_B_g"' })),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => new Set(['bg-[#123456]'])),
        getClassSetSync: vi.fn(() => new Set(['bg-[#123456]'])),
      },
    })
    const harness = createHookHarness({
      assetStore: {
        'entry.js': 'const cls = "bg-[#123456]"',
      },
      chunkFiles: ['entry.js'],
      context,
    })

    await harness.processAssets()

    expect(harness.assetStore['entry.js']).toContain('foo_B_g')
  })

  it('marks initial watch runtime assets before syncing the runtime set', async () => {
    const candidate = 'bg-[#123456]'
    const escapedCandidate = 'bg-_b_#123456_B_'
    const runtimeClassSetManager = {
      sync: vi.fn(async () => new Set([candidate])),
      reset: vi.fn(async () => {}),
    }
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.css'),
      htmlMatcher: (file: string) => file.endsWith('.wxml'),
      jsMatcher: (file: string) => file.endsWith('.js'),
      templateHandler: vi.fn(async (code: string) => code.replace(candidate, escapedCandidate)),
      jsHandler: vi.fn(async (code: string) => ({ code: code.replace(candidate, escapedCandidate) })),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => new Set([candidate])),
        getClassSetSync: vi.fn(() => new Set([candidate])),
      },
    })
    const harness = createHookHarness({
      assetStore: {
        'pages/index.wxml': `<view class="${candidate}"></view>`,
        'pages/index.js': `const cls = "${candidate}"`,
      },
      chunkFiles: ['pages/index.wxml', 'pages/index.js'],
      context,
      hookOptions: {
        runtimeClassSetManager: runtimeClassSetManager as any,
      },
      watchMode: true,
    })

    await harness.processAssets()

    expect(runtimeClassSetManager.sync).toHaveBeenCalled()
    expect(context.jsHandler).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Set),
      expect.objectContaining({ experimentalJsFastPath: 'oxc' }),
    )
  })

  it('consumes loader generated css directly when no asset user css is present', async () => {
    const sourceFile = path.resolve(process.cwd(), 'src/generated.css')
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.css'),
      mainCssChunkMatcher: vi.fn(() => false),
      styleHandler: vi.fn(async (code: string) => ({ css: `handled:${code}` })),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => new Set(['bg-red-500'])),
        getClassSetSync: vi.fn(() => new Set(['bg-red-500'])),
      },
    })
    const harness = createHookHarness({
      assetStore: {
        'generated.css': '/*! weapp-tailwindcss generated */\n.bg-red-500{color:red}',
      },
      chunkFiles: ['generated.css'],
      chunkGraph: {
        getChunkModulesIterable: () => [{ resource: sourceFile }],
      },
      context,
      hookOptions: {
        getWebpackCssSources: () => [[sourceFile, { css: '.local{color:blue}' }]],
        getWebpackGeneratedCssSources: () => [[sourceFile, {
          classSet: new Set(['bg-red-500']),
          css: '/*! weapp-tailwindcss generated */\n.bg-red-500{color:red}',
          dependencies: [sourceFile],
        } as any]],
        prepareWebpackCssSources: vi.fn(files => files),
      },
    })

    await harness.processAssets()

    expect(harness.assetStore['generated.css']).toContain('.bg-red-500')
    expect(context.styleHandler).toHaveBeenCalledWith(
      expect.stringContaining('.bg-red-500{color:red}'),
      expect.objectContaining({ isMainChunk: false, majorVersion: 4 }),
    )
    expect(harness.compilation.fileDependencies.add).toHaveBeenCalledWith(sourceFile)
  })

  it('keeps web generated processed css assets without mini-program style handling', async () => {
    const context = createContext({
      generator: {
        target: 'web',
      },
      cssMatcher: (file: string) => file.endsWith('.css'),
      mainCssChunkMatcher: vi.fn(() => true),
      styleHandler: vi.fn(async (code: string) => ({ css: `handled:${code}` })),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => new Set(['bg-red-500'])),
        getClassSetSync: vi.fn(() => new Set(['bg-red-500'])),
      },
    })
    const harness = createHookHarness({
      assetStore: {
        'web.css': '/*! tailwindcss v4.0.0 */\n.bg-red-500{color:red}',
      },
      chunkFiles: ['web.css'],
      context,
      hookOptions: {
        isWebpackProcessedCssAsset: vi.fn(() => true),
      },
    })

    await harness.processAssets()

    expect(harness.assetStore['web.css']).toContain('.bg-red-500')
    expect(context.styleHandler).not.toHaveBeenCalled()
  })

  it('transforms mini-program generated processed css assets without bundler markers', async () => {
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.css'),
      mainCssChunkMatcher: vi.fn(() => true),
      styleHandler: vi.fn(async (code: string) => ({ css: `handled:${code}` })),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => new Set(['bg-red-500'])),
        getClassSetSync: vi.fn(() => new Set(['bg-red-500'])),
      },
    })
    const harness = createHookHarness({
      assetStore: {
        'mini-generated.css': '/*! tailwindcss v4.0.0 */\n.bg-red-500{color:red}',
      },
      chunkFiles: ['mini-generated.css'],
      context,
      hookOptions: {
        isWebpackProcessedCssAsset: vi.fn(() => true),
      },
    })

    await harness.processAssets()

    expect(context.styleHandler).toHaveBeenCalled()
    expect(harness.assetStore['mini-generated.css']).toContain('handled:')
  })

  it('appends current asset user css when the registered source css is processed', async () => {
    const sourceFile = path.resolve(process.cwd(), 'src/processed-source.css')
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.css'),
      mainCssChunkMatcher: vi.fn(() => false),
      styleHandler: vi.fn(async (code: string) => ({ css: `handled:${code}` })),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => new Set(['bg-red-500'])),
        getClassSetSync: vi.fn(() => new Set(['bg-red-500'])),
      },
    })
    const harness = createHookHarness({
      assetStore: {
        'processed-source.css': '.asset-user{color:red}',
      },
      chunkFiles: ['processed-source.css'],
      chunkGraph: {
        getChunkModulesIterable: () => [{ resource: sourceFile }],
      },
      context,
      hookOptions: {
        getWebpackCssSources: () => [[sourceFile, {
          css: '.registered-user{color:blue}',
          processed: true,
        }]],
        prepareWebpackCssSources: vi.fn(files => files),
      },
    })

    await harness.processAssets()

    expect(context.styleHandler).toHaveBeenCalled()
    expect(harness.assetStore['processed-source.css']).toContain('handled:')
  })

  it('rethrows generator errors for explicit Tailwind css sources', async () => {
    vi.resetModules()
    const generateError = new Error('forced generator failure')
    vi.doMock('@/generation/service', () => ({
      generateTailwindV4Css: vi.fn(async () => {
        throw generateError
      }),
    }))
    const { setupWebpackV5ProcessAssetsHook: mockedSetupWebpackV5ProcessAssetsHook } = await import('@/bundlers/webpack/BaseUnifiedPlugin/v5-assets')
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.css'),
      mainCssChunkMatcher: vi.fn(() => true),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => new Set()),
        getClassSetSync: vi.fn(() => new Set()),
      },
    })
    const harness = createHookHarness({
      assetStore: {
        'explicit.css': '@tailwind utilities;',
      },
      chunkFiles: ['explicit.css'],
      context,
      setupProcessAssetsHook: mockedSetupWebpackV5ProcessAssetsHook,
    })

    await expect(harness.processAssets()).rejects.toThrow(generateError)
    vi.doUnmock('@/generation/service')
  })

  it('regenerates dependency-affected scopes once and keeps the dependency revision stable', async () => {
    vi.resetModules()
    const dependency = path.resolve(process.cwd(), 'tailwind.plugin.ts')
    const source = '@tailwind utilities;'
    const generateTailwindV4Css = vi.fn(async (options: any) => ({
      css: `.generated-${generateTailwindV4Css.mock.calls.length}{display:block}`,
      target: 'weapp',
      source: 'generator' as const,
      classSet: new Set(['block']),
      dependencies: [dependency],
      metadata: {
        file: options.file,
        majorVersion: 4,
        outputFile: options.outputFile,
      },
    }))
    vi.doMock('@/generation/service', () => ({
      generateTailwindV4Css,
    }))
    try {
      const [
        { setupWebpackV5ProcessAssetsHook: mockedSetupWebpackV5ProcessAssetsHook },
        { getCompilationSessionPool },
      ] = await Promise.all([
        import('@/bundlers/webpack/BaseUnifiedPlugin/v5-assets'),
        import('@/compiler'),
      ])
      const changedFiles = new Set<string>()
      const context = createContext({
        cssMatcher: (file: string) => file.endsWith('.css'),
        mainCssChunkMatcher: vi.fn(() => true),
        tailwindRuntime: {
          ...createContext().tailwindRuntime,
          majorVersion: 4,
          getClassSet: vi.fn(async () => new Set(['block'])),
          getClassSetSync: vi.fn(() => new Set(['block'])),
        },
      })
      const harness = createHookHarness({
        assetStore: { 'explicit.css': source },
        chunkFiles: ['explicit.css'],
        context,
        hookOptions: {
          getWatchChangedFiles: () => changedFiles,
        },
        setupProcessAssetsHook: mockedSetupWebpackV5ProcessAssetsHook,
        watchMode: true,
      })
      const compilationPool = getCompilationSessionPool(harness.hookOptions.runtimeState)
      await compilationPool.run({
        scope: { id: 'explicit.css', kind: 'global' },
        outputId: 'explicit.css',
        sources: [{ id: '/src/app.css', kind: 'css', candidates: ['block'] }],
      }, async compilation => ({
        classSet: compilation.candidates,
        dependenciesBySource: [[
          '/src/app.css',
          [{ id: dependency, kind: 'config' as const }],
        ]] as const,
      }))

      await harness.processAssets()
      harness.assetStore['explicit.css'] = source
      changedFiles.add(dependency)
      await harness.processAssets()
      harness.assetStore['explicit.css'] = source
      changedFiles.clear()
      await harness.processAssets()

      expect(generateTailwindV4Css).toHaveBeenCalledTimes(2)
      expect(generateTailwindV4Css).toHaveBeenLastCalledWith(expect.objectContaining({
        compilationChanges: [{ id: dependency, type: 'dependency-changed' }],
        scope: { id: 'explicit.css', kind: 'global' },
      }))
      expect(harness.compilation.fileDependencies.add).toHaveBeenCalledWith(dependency)
      expect(compilationPool.getScopeDependencyRevision('explicit.css')).toBe(1)
    }
    finally {
      vi.doUnmock('@/generation/service')
      vi.resetModules()
    }
  })

  it('chooses represented css sources by scored source file matches', async () => {
    const root = path.resolve(process.cwd(), 'represented-root')
    const exactSource = path.join(root, 'styles/page.css')
    const lowerScoreSource = path.join(root, 'other/page.css')
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.css'),
      mainCssChunkMatcher: vi.fn(() => false),
      styleHandler: vi.fn(async (code: string, options: any) => {
        expect(options.postcssOptions.options.from).toBe(exactSource)
        return { css: code }
      }),
      tailwindcssBasedir: root,
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => new Set()),
        getClassSetSync: vi.fn(() => new Set()),
      },
    } as any)
    const sourceCss = [
      '@tailwind utilities;',
      '.source-card{color:red}',
    ].join('\n')
    const harness = createHookHarness({
      assetStore: {
        'styles/page.css': '.source-card{color:red}',
      },
      chunkFiles: ['styles/page.css'],
      context,
      hookOptions: {
        getWebpackCssSources: () => [
          [lowerScoreSource, { css: sourceCss }],
          [exactSource, { css: sourceCss }],
        ],
      },
    })

    await harness.processAssets()

    expect(context.styleHandler).toHaveBeenCalled()
  })

  it('sorts represented css source matches with equal scores before choosing', async () => {
    const root = path.resolve(process.cwd(), 'represented-sort-root')
    const firstSource = path.join(root, 'a/shared.css')
    const secondSource = path.join(root, 'b/shared.css')
    const sourceCss = [
      '@tailwind utilities;',
      '.shared-card{color:red}',
    ].join('\n')
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.css'),
      mainCssChunkMatcher: vi.fn(() => false),
      styleHandler: vi.fn(async (code: string, options: any) => {
        expect(options.postcssOptions.options.from).toBe('dist/shared.css')
        return { css: code }
      }),
      tailwindcssBasedir: root,
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => new Set()),
        getClassSetSync: vi.fn(() => new Set()),
      },
    } as any)
    const harness = createHookHarness({
      assetStore: {
        'dist/shared.css': '.shared-card{color:red}',
      },
      chunkFiles: ['dist/shared.css'],
      context,
      hookOptions: {
        getWebpackCssSources: () => [
          [secondSource, { css: sourceCss }],
          [firstSource, { css: sourceCss }],
        ],
      },
    })

    await harness.processAssets()

    expect(context.styleHandler).toHaveBeenCalled()
  })

  it('chooses css sources by path score when raw asset has no source markers', async () => {
    const root = path.resolve(process.cwd(), 'path-score-root')
    const exactSource = path.join(root, 'styles/page.css')
    const lowerScoreSource = path.join(root, 'other/page.css')
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.css'),
      mainCssChunkMatcher: vi.fn(() => false),
      styleHandler: vi.fn(async (code: string, options: any) => {
        expect(options.postcssOptions.options.from).toBe(exactSource)
        return { css: code }
      }),
      tailwindcssBasedir: root,
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => new Set()),
        getClassSetSync: vi.fn(() => new Set()),
      },
    } as any)
    const harness = createHookHarness({
      assetStore: {
        'styles/page.css': '.asset-only{color:red}',
      },
      chunkFiles: ['styles/page.css'],
      context,
      hookOptions: {
        getWebpackCssSources: () => [
          [lowerScoreSource, { css: '.other{color:blue}' }],
          [exactSource, { css: '.exact{color:green}' }],
        ],
      },
    })

    await harness.processAssets()

    expect(context.styleHandler).toHaveBeenCalled()
  })

  it('sorts multiple css source path matches before choosing the best source', async () => {
    const root = path.resolve(process.cwd(), 'path-sort-root')
    const nestedSource = path.join(root, 'src/styles/page.css')
    const basenameSource = path.join(root, 'vendor/page.css')
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.css'),
      mainCssChunkMatcher: vi.fn(() => false),
      styleHandler: vi.fn(async (code: string, options: any) => {
        expect(options.postcssOptions.options.from).toBe(nestedSource)
        return { css: code }
      }),
      tailwindcssBasedir: root,
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => new Set()),
        getClassSetSync: vi.fn(() => new Set()),
      },
    } as any)
    const harness = createHookHarness({
      assetStore: {
        'styles/page.css': '.asset-only{color:red}',
      },
      chunkFiles: ['styles/page.css'],
      context,
      hookOptions: {
        getWebpackCssSources: () => [
          [basenameSource, { css: '.vendor{color:blue}' }],
          [nestedSource, { css: '.nested{color:green}' }],
        ],
      },
    })

    await harness.processAssets()

    expect(context.styleHandler).toHaveBeenCalled()
  })

  it('sorts ambiguous css source path matches before falling back to the asset', async () => {
    const root = path.resolve(process.cwd(), 'path-ambiguous-sort-root')
    const firstSource = path.join(root, 'a/shared.css')
    const secondSource = path.join(root, 'b/shared.css')
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.css'),
      mainCssChunkMatcher: vi.fn(() => false),
      styleHandler: vi.fn(async (code: string, options: any) => {
        expect(options.postcssOptions.options.from).toBe('shared.css')
        return { css: code }
      }),
      tailwindcssBasedir: root,
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => new Set()),
        getClassSetSync: vi.fn(() => new Set()),
      },
    } as any)
    const harness = createHookHarness({
      assetStore: {
        'shared.css': '.asset-only{color:red}',
      },
      chunkFiles: ['shared.css'],
      context,
      hookOptions: {
        getWebpackCssSources: () => [
          [secondSource, { css: '.second{color:blue}' }],
          [firstSource, { css: '.first{color:green}' }],
        ],
      },
    })

    await harness.processAssets()

    expect(context.styleHandler).toHaveBeenCalled()
  })
})
