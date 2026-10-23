import { describe, expect, it, vi } from 'vitest'
import { setupWebpackV5UnitTest, FakeConcatSource, createAssetsFromStore, createContext, createJsHandler, createCompilerContextMock, path, replaceWxml, testState, WeappTailwindcss } from './shared'
describe('bundlers/webpack WeappTailwindcss / runtime js stale fallback', () => {
  setupWebpackV5UnitTest()
  it('does not let the legacy fallback option bypass webpack runtime classes', async () => {
    const runtimeSet = new Set(['text-[100rpx]', 'text-white'])
    const realJsHandler = createJsHandler({
      escapeMap: undefined,
      jsArbitraryValueFallback: true,
      tailwindcssMajorVersion: 4,
    })
    testState.currentContext = createContext({
      jsHandler: vi.fn((code: string, classSet?: Set<string>, options?: Record<string, unknown>) =>
        realJsHandler(code, classSet, options as any)),
      tailwindRuntime: {
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
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
          tapPromise: (_options: any, handler: (assets: Record<string, any>) => Promise<void>) => {
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
    const compiler = {
      watching: {},
      options: {
        watch: false,
      },
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
      },
    }

    const plugin = new WeappTailwindcss()
    plugin.apply(compiler as any)

    const js = 'const cls = "bg-[#f50505] text-[100rpx] text-white"'
    const assetStore = {
      'index.js': js,
    }
    currentAssetStore = assetStore
    await processAssetsCallbacks[0](createAssetsFromStore(assetStore))

    const transformed = currentAssetStore['index.js']
    expect(transformed).toContain('bg-[#f50505]')
    expect(transformed).not.toContain(replaceWxml('bg-[#f50505]'))
    expect(transformed).toContain(replaceWxml('text-[100rpx]'))
  })

})
