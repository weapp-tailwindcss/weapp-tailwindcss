import { describe, expect, it, vi } from 'vitest'
import { setupWebpackV5UnitTest, FakeConcatSource, createAssetsFromStore, createContext, path, testState } from './shared'
describe('bundlers/webpack WeappTailwindcss / runtime js main updates', () => {
  setupWebpackV5UnitTest()
  it('preserves plain main css when only runtime classes change', async () => {
    let generateCount = 0
    const generateMock = vi.fn(async () => {
      generateCount += 1
      return {
        css: `.runtime-${generateCount}{color:red}`,
        rawCss: `.runtime-${generateCount}{color:red}`,
        target: 'weapp',
        classSet: new Set<string>(),
        dependencies: [],
        sources: [],
        root: null,
      }
    })
    vi.doMock('@/generator/runtime', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
        })),
        normalizeWeappTailwindcssGeneratorOptions: vi.fn(() => ({
          enabled: true,
          target: 'weapp',
          importFallback: true,
        })),
      }
    })
    vi.resetModules()
    const { WeappTailwindcss } = await import('@/bundlers/webpack/BaseUnifiedPlugin/v5')
    let runtimeSet = new Set(['bg-[#101010]'])
    const cssInput = '.runtime-anchor { color: red; }'
    testState.currentContext = createContext({
      mainCssChunkMatcher: vi.fn(() => true),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
        options: {
          projectRoot: process.cwd(),
          tailwindcss: {
            v4: {
              cssSources: [{
                css: '@theme { --color-test: #000; }',
                base: process.cwd(),
              }],
            },
          },
        },
      } as any,
    })

    const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
    let currentAssetStore: Record<string, string> = {
      'app.css': cssInput,
    }
    const compilation = {
      compiler: { outputPath: path.resolve(process.cwd(), 'dist') },
      chunks: [{ id: 'app', hash: 'same-css-hash', files: ['app.css'] }],
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
    await processAssetsCallbacks[0](createAssetsFromStore(currentAssetStore))
    expect(currentAssetStore['app.css']).toBe('css:.runtime-anchor { color: red; }')

    runtimeSet = new Set(['bg-[#202020]'])
    currentAssetStore = {
      'app.css': cssInput,
    }
    await processAssetsCallbacks[0](createAssetsFromStore(currentAssetStore))

    expect(currentAssetStore['app.css']).toBe('css:.runtime-anchor { color: red; }')
    expect(generateMock).not.toHaveBeenCalled()
  })

  it('reuses template handler options for multiple html assets in one compilation', async () => {
    const { WeappTailwindcss } = await import('@/bundlers/webpack/BaseUnifiedPlugin/v5')
    const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
    let currentAssetStore: Record<string, string> = {}
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

    const plugin = new WeappTailwindcss()
    plugin.apply(compiler as any)

    currentAssetStore = {
      'pages/index/index.wxml': '<view class="foo"></view>',
      'pages/home/index.wxml': '<view class="bar"></view>',
    }
    await processAssetsCallbacks[0](createAssetsFromStore(currentAssetStore))

    expect(testState.currentContext.templateHandler).toHaveBeenCalledTimes(2)
    expect(testState.currentContext.templateHandler.mock.calls[0]?.[1]).toBe(testState.currentContext.templateHandler.mock.calls[1]?.[1])
  })

})
