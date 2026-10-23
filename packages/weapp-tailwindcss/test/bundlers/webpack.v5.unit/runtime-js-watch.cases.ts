import { describe, expect, it, vi } from 'vitest'
import { setupWebpackV5UnitTest, FakeConcatSource, createAssetsFromStore, createContext, createJsHandler, createCompilerContextMock, path, replaceWxml, testState, WeappTailwindcss } from './shared'
describe('bundlers/webpack WeappTailwindcss / runtime js watch candidates', () => {
  setupWebpackV5UnitTest()
  it('uses incremental runtime candidates during webpack watch processAssets updates for Tailwind v4', async () => {
    const realJsHandler = createJsHandler({
      escapeMap: undefined,
    })
    const incrementalRuntimeSet = new Set<string>()
    const incrementalRuntimeManager = {
      reset: vi.fn(async () => undefined),
      sync: vi.fn(async (_runtime: unknown, snapshot: { runtimeAffectingChangedByType: { js: Set<string> }, entries: Array<{ file: string, source: string }> }) => {
        for (const file of snapshot.runtimeAffectingChangedByType.js) {
          const entry = snapshot.entries.find(item => item.file === file)
          if (!entry) {
            continue
          }
          const matches = entry.source.match(/[a-z-]+-\[[^\]]+\]/g) ?? []
          for (const match of matches) {
            incrementalRuntimeSet.add(match)
          }
        }
        return new Set(incrementalRuntimeSet)
      }),
    }
    testState.currentContext = createContext({
      jsHandler: vi.fn((code: string, classSet?: Set<string>, options?: Record<string, unknown>) =>
        realJsHandler(code, classSet, options as any)),
      __internalWebpackRuntimeClassSetManager: incrementalRuntimeManager,
      tailwindRuntime: {
        getClassSet: vi.fn(async () => new Set<string>()),
        getClassSetSync: vi.fn(() => new Set<string>()),
        extract: vi.fn(async () => ({ classSet: new Set<string>() })),
        majorVersion: 4,
        packageInfo: {
          name: 'tailwindcss4',
        },
        options: {
          projectRoot: process.cwd(),
          tailwindcss: {
            packageName: 'tailwindcss',
            v4: {
              css: '@import "tailwindcss";',
              base: process.cwd(),
            },
          },
        },
      },
    })
    createCompilerContextMock.mockImplementation(() => testState.currentContext)

    const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
    let currentAssetStore: Record<string, string> = {}
    const updateAsset = vi.fn((file: string, source: any) => {
      const value = source.source()
      currentAssetStore[file] = typeof value === 'string' ? value : value.toString()
    })
    const compilation = {
      compiler: { outputPath: path.resolve(process.cwd(), 'dist') },
      chunks: [{ id: 'main', hash: 'hash-1', files: ['index.js'] }],
      hooks: {
        processAssets: {
          tapPromise: (_options: unknown, handler: (assets: Record<string, any>) => Promise<void>) => {
            processAssetsCallbacks.push(handler)
          },
        },
      },
      updateAsset,
      getAsset(file: string) {
        const content = currentAssetStore[file]
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
    const watchRunHandlers: Array<() => void> = []
    const compiler = {
      options: { watch: true },
      webpack: {
        Compilation: {
          PROCESS_ASSETS_STAGE_SUMMARIZE: Symbol('stage'),
        },
        sources: {
          ConcatSource: FakeConcatSource,
        },
        NormalModule: {
          getCompilationHooks: vi.fn(() => ({
            loader: {
              tap: vi.fn(),
            },
          })),
        },
      },
      hooks: {
        normalModuleFactory: {
          tap: (_name: string, handler: (factory: any) => void) => {
            handler({
              hooks: {
                beforeResolve: {
                  tap: vi.fn(),
                },
              },
            })
          },
        },
        compilation: {
          tap: (_name: string, handler: (_compilation: any) => void) => {
            handler(compilation)
          },
        },
        watchRun: {
          tap: (_name: string, handler: () => void) => {
            watchRunHandlers.push(handler)
          },
        },
      },
    }

    new WeappTailwindcss().apply(compiler as any)

    currentAssetStore = {
      'index.js': 'const cls = "bg-[#101010] text-[100rpx]"',
    }
    await processAssetsCallbacks[0](createAssetsFromStore(currentAssetStore))
    expect(incrementalRuntimeManager.sync).toHaveBeenCalledTimes(1)
    expect(incrementalRuntimeSet.has('bg-[#101010]')).toBe(true)
    expect(currentAssetStore['index.js']).toContain(replaceWxml('bg-[#101010]'))

    currentAssetStore = {
      'index.js': 'const cls = "bg-[#202020] text-[100rpx]"',
    }
    compilation.chunks = [{ id: 'main', hash: 'hash-2', files: ['index.js'] }]
    watchRunHandlers[0]?.()
    await processAssetsCallbacks[0](createAssetsFromStore(currentAssetStore))

    expect(currentAssetStore['index.js']).toContain(replaceWxml('bg-[#202020]'))
    expect(currentAssetStore['index.js']).not.toContain('bg-[#202020]')
    expect(incrementalRuntimeManager.sync).toHaveBeenCalledTimes(2)
    expect(testState.currentContext.tailwindRuntime.extract).not.toHaveBeenCalled()
  })

})
