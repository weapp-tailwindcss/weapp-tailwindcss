import { describe, expect, it, vi } from 'vitest'
import { setupWebpackV5UnitTest, FakeConcatSource, createAssetsFromStore, createContext, createJsHandler, createCompilerContextMock, path, replaceWxml, testState, WeappTailwindcss } from './shared'
describe('bundlers/webpack WeappTailwindcss / runtime js class set refresh', () => {
  setupWebpackV5UnitTest()
  it('refreshes runtime class set on non-watch processAssets so script-only updates stay precisely escaped', async () => {
    let runtimeSet = new Set(['bg-[#f40404]', 'text-[100rpx]', 'text-white'])
    const realJsHandler = createJsHandler({
      escapeMap: undefined,
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
    const compiler = {
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

    currentAssetStore = {
      'index.js': 'const cls = "bg-[#f40404] text-[100rpx] text-white"',
    }
    await processAssetsCallbacks[0](createAssetsFromStore(currentAssetStore))
    const firstPass = currentAssetStore['index.js']
    expect(firstPass).toContain(replaceWxml('bg-[#f40404]'))
    expect(firstPass).not.toContain('bg-[#f40404]')

    runtimeSet = new Set(['bg-[#f0a0a0]', 'text-[100rpx]', 'text-white'])
    compilation.chunks = [{ id: 'main', hash: 'hash-2' }]
    currentAssetStore = {
      'index.js': 'const cls = "bg-[#f0a0a0] text-[100rpx] text-white"',
    }
    await processAssetsCallbacks[0](createAssetsFromStore(currentAssetStore))
    const secondPass = currentAssetStore['index.js']
    expect(secondPass).toContain(replaceWxml('bg-[#f0a0a0]'))
    expect(secondPass).not.toContain('bg-[#f0a0a0]')
    expect(testState.currentContext.tailwindRuntime.extract).toHaveBeenCalledTimes(2)
  })

})
