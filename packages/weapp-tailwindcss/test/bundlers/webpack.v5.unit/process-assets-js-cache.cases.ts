import { describe, expect, it, vi } from 'vitest'
import type { LoaderModule } from './shared'
import { setupWebpackV5UnitTest, FakeConcatSource, createAssetsFromStore, createCompilerWithLoaderTracking, createContext, getCompilerContextMock, path, testState, WeappTailwindcss } from './shared'
describe('bundlers/webpack WeappTailwindcss / process assets js cache', () => {
  setupWebpackV5UnitTest()
  it('uses the CSS loader boundary when postcss loader is missing', () => {
    const { compiler, getLoaderHandler } = createCompilerWithLoaderTracking()
    const plugin = new WeappTailwindcss()
    plugin.apply(compiler as any)

    const handler = getLoaderHandler()
    const module: LoaderModule = {
      loaders: [{ loader: '/path/css-loader.js' }],
    }
    handler?.({}, module)

    expect(module.loaders).toHaveLength(2)
    expect(module.loaders[0].loader).toBe(testState.currentContext.runtimeLoaderPath)
    expect(module.loaders[1].loader).toBe('/path/css-loader.js')
  })

  it('keeps separate cache entries for js and wxs assets', async () => {
    testState.currentContext = createContext({
      wxsMatcher: (file: string) => file.endsWith('.wxs'),
    })
    getCompilerContextMock.mockReturnValue(testState.currentContext)

    const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
    let currentAssetStore: Record<string, string> = {}
    const updateAsset = vi.fn((file: string, source: FakeConcatSource) => {
      currentAssetStore[file] = source.toString()
    })
    const compilation = {
      compiler: { outputPath: path.resolve(process.cwd(), 'dist') },
      chunks: [{ id: 'main', hash: 'hash-1', files: ['index.js', 'index.wxs'] }],
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

    const html = '<view class="foo"></view>'
    const js = 'import { foo } from "./lib"'
    const wxs = 'const x = require("./lib")'
    const css = '.foo { color: red; }'

    const assetStore = {
      'index.wxml': html,
      'index.js': js,
      'index.wxs': wxs,
      'index.css': css,
    }
    currentAssetStore = assetStore
    const assetsRun = createAssetsFromStore(assetStore)
    await processAssetsCallbacks[0](assetsRun)

    expect(testState.currentContext.cache.has('index.js')).toBe(true)
    expect(testState.currentContext.cache.has('index.wxs')).toBe(true)
    expect(testState.currentContext.jsHandler).toHaveBeenCalledWith(
      js,
      expect.any(Set),
      expect.objectContaining({ experimentalJsFastPath: false, moduleGraph: undefined }),
    )

    const assetStoreSecond = {
      'index.wxml': html,
      'index.js': js,
      'index.wxs': wxs,
      'index.css': css,
    }
    currentAssetStore = assetStoreSecond
    const assetsSecondRun = createAssetsFromStore(assetStoreSecond)
    await processAssetsCallbacks[0](assetsSecondRun)

    const jsUpdates = updateAsset.mock.calls.filter(call => call[0] === 'index.js')
    const wxsUpdates = updateAsset.mock.calls.filter(call => call[0] === 'index.wxs')

    expect(jsUpdates).toHaveLength(2)
    expect(wxsUpdates).toHaveLength(2)
    expect(jsUpdates[0][1].toString()).toBe(`js:${js}`)
    expect(jsUpdates[1][1].toString()).toBe(`js:${js}`)
    expect(wxsUpdates[0][1].toString()).toBe(`js:${wxs}`)
    expect(wxsUpdates[1][1].toString()).toBe(`js:${wxs}`)
  })

})
