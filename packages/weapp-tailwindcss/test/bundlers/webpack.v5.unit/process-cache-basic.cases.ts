import { describe, expect, it, vi } from 'vitest'
import type { LoaderModule } from './shared'
import { setupWebpackV5UnitTest, FakeConcatSource, createAssetsFromStore, createContext, createCompilerContextMock, getWebpackLoaderRuntime, isCssImportRewriteLoader, path, testState, WeappTailwindcss } from './shared'
describe('bundlers/webpack WeappTailwindcss / process cache basic', () => {
  setupWebpackV5UnitTest()
  it('wires runtime loader, processes assets and caches results', async () => {
    const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
    let loaderHandler: ((loaderContext: any, module: LoaderModule) => void) | undefined
    let currentAssetStore: Record<string, string> = {}
    const updateAsset = vi.fn((file: string, source: FakeConcatSource) => {
      currentAssetStore[file] = source.toString()
    })
    const compilation = {
      compiler: { outputPath: path.resolve(process.cwd(), 'dist') },
      chunks: [{ id: 'main', hash: 'hash-1' }],
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
            source: () => file === 'same.js'
              ? { toString: () => content }
              : content,
          },
        }
      },
    }
    // const ensureNormalModuleFactory = (compilerHooks: any) => {
    //   compilerHooks.normalModuleFactory = {
    //     tap: vi.fn((_name: string, handler: (factory: any) => void) => {
    //       handler({
    //         hooks: {
    //           beforeResolve: {
    //             tap: vi.fn(),
    //           },
    //         },
    //       })
    //     }),
    //   }
    // }

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
              tap: (_name: string, handler: (loaderContext: unknown, module: LoaderModule) => void) => {
                loaderHandler = handler
              },
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

    compiler.hooks.normalModuleFactory = {
      tap: vi.fn(() => {}),
    }

    expect(createCompilerContextMock).toHaveBeenCalledTimes(1)
    expect(testState.currentContext.onLoad).toHaveBeenCalledTimes(1)

    const module: LoaderModule = {
      loaders: [{ loader: '/path/postcss-loader.js' }],
    }
    loaderHandler?.({}, module)
    const classSetLoaderEntry = module.loaders.find(entry => entry.loader === testState.currentContext.runtimeLoaderPath)
    expect(classSetLoaderEntry?.options?.tailwindcssImportRewrite).toBeUndefined()
    const loaderRuntime = getWebpackLoaderRuntime(classSetLoaderEntry?.options?.weappTailwindcssRuntimeKey)
    expect(loaderRuntime?.classSet?.getClassSet).toEqual(expect.any(Function))
    const rewriteLoaderEntry = module.loaders.find(entry => isCssImportRewriteLoader(entry))
    expect(rewriteLoaderEntry).toBeUndefined()

    const html = '<view class="foo"></view>'
    const js = 'import { foo } from "./lib"'
    const css = '.foo { color: red; }'

    const assetStore = {
      'index.wxml': html,
      'index.js': js,
      'index.css': css,
    }
    currentAssetStore = assetStore
    const assetsRun = createAssetsFromStore(assetStore)
    await processAssetsCallbacks[0](assetsRun)

    expect(testState.currentContext.onStart).toHaveBeenCalledTimes(1)
    expect(testState.currentContext.tailwindRuntime.getClassSetSync).not.toHaveBeenCalled()
    expect(testState.currentContext.tailwindRuntime.extract).toHaveBeenCalledTimes(1)
    expect(testState.currentContext.templateHandler).toHaveBeenCalledTimes(1)
    expect(testState.currentContext.jsHandler).toHaveBeenCalledTimes(1)
    expect(testState.currentContext.styleHandler).toHaveBeenCalledTimes(1)
    const styleHandlerCallsAfterFirstRun = testState.currentContext.styleHandler.mock.calls.length
    expect(testState.currentContext.onUpdate).toHaveBeenCalledTimes(3)
    expect(testState.currentContext.cache.has('index.wxml')).toBe(true)
    expect(testState.currentContext.cache.has('index.js')).toBe(true)
    expect(testState.currentContext.cache.has('index.css')).toBe(true)

    const updateCalls = updateAsset.mock.calls
    expect(updateCalls[0][0]).toBe('index.wxml')
    expect(updateCalls[1][0]).toBe('index.js')
    expect(updateCalls[2][0]).toBe('index.css')
    expect(updateCalls[0][1].toString()).toBe(`tpl:${html}`)
    expect(updateCalls[1][1].toString()).toBe(`js:${js}`)
    expect(updateCalls[2][1].toString()).toBe(`css:${css}`)

    expect(testState.currentContext.onEnd).toHaveBeenCalledTimes(1)

    const secondAssetStore = {
      'index.wxml': html,
      'index.js': js,
      'index.css': css,
    }
    currentAssetStore = secondAssetStore
    const assetsSecondRun = createAssetsFromStore(secondAssetStore)
    await processAssetsCallbacks[0](assetsSecondRun)

    expect(testState.currentContext.templateHandler).toHaveBeenCalledTimes(1)
    expect(testState.currentContext.jsHandler).toHaveBeenCalledTimes(1)
    expect(testState.currentContext.styleHandler.mock.calls.length).toBeLessThanOrEqual(styleHandlerCallsAfterFirstRun + 1)
    expect(testState.currentContext.onStart).toHaveBeenCalledTimes(2)
    expect(testState.currentContext.onEnd).toHaveBeenCalledTimes(2)
    expect(testState.currentContext.onUpdate).toHaveBeenCalledTimes(3)
    expect(testState.currentContext.tailwindRuntime.getClassSetSync).not.toHaveBeenCalled()
    expect(testState.currentContext.tailwindRuntime.extract).toHaveBeenCalledTimes(2)
  })

  it('prunes stale webpack process cache entries between watch compilations', async () => {
    testState.currentContext = createContext()

    const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
    let currentAssetStore: Record<string, string> = {}
    const compilation = {
      compiler: { outputPath: path.resolve(process.cwd(), 'dist') },
      chunks: [{ id: 'main', hash: 'hash-1', files: ['old.wxml', 'old.js', 'old.css'] }],
      hooks: {
        processAssets: {
          tapPromise: (_options: unknown, handler: (assets: Record<string, any>) => Promise<void>) => {
            processAssetsCallbacks.push(handler)
          },
        },
      },
      updateAsset: vi.fn((file: string, source: FakeConcatSource) => {
        currentAssetStore[file] = source.toString()
      }),
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
          tap: vi.fn(() => {}),
        },
        compilation: {
          tap: vi.fn((_name: string, handler: (_compilation: any) => void) => {
            handler(compilation)
          }),
        },
      },
    }

    new WeappTailwindcss().apply(compiler as any)

    currentAssetStore = {
      'old.wxml': '<view class="foo"></view>',
      'old.js': 'const cls = "foo"',
      'old.css': '.foo { color: red; }',
    }
    await processAssetsCallbacks[0](createAssetsFromStore(currentAssetStore))
    expect(testState.currentContext.cache.has('old.wxml')).toBe(true)
    expect(testState.currentContext.cache.has('old.js')).toBe(true)
    expect(testState.currentContext.cache.has('old.css')).toBe(true)

    compilation.chunks = [{ id: 'main', hash: 'hash-2', files: ['fresh.css'] }]
    currentAssetStore = {
      'fresh.css': '.fresh { color: green; }',
    }
    await processAssetsCallbacks[0](createAssetsFromStore(currentAssetStore))

    expect(testState.currentContext.cache.has('old.wxml')).toBe(false)
    expect(testState.currentContext.cache.has('old.js')).toBe(false)
    expect(testState.currentContext.cache.has('old.css')).toBe(false)
    expect(testState.currentContext.cache.has('fresh.css')).toBe(true)
    expect(testState.currentContext.cache.hashMap.has('old.wxml:asset')).toBe(false)
    expect(testState.currentContext.cache.hashMap.has('old.js:asset')).toBe(false)
    expect(testState.currentContext.cache.hashMap.has('old.css:asset')).toBe(false)
    expect(testState.currentContext.cache.hashMap.has('fresh.css:asset')).toBe(true)
  })

})
