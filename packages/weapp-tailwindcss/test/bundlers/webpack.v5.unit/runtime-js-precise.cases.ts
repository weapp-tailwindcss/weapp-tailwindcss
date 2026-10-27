import { describe, expect, it, vi } from 'vitest'
import { setupWebpackV5UnitTest, FakeConcatSource, createAssetsFromStore, createContext, createJsHandler, createCompilerContextMock, mkdir, mkdtemp, os, path, replaceWxml, rm, testState, WeappTailwindcss, writeFile } from './shared'
describe('bundlers/webpack WeappTailwindcss / runtime js precise matching', () => {
  setupWebpackV5UnitTest()
  it('keeps precise matching by default and still escapes classes when runtime set is fresh', async () => {
    const runtimeSet = new Set(['bg-[#f50505]', 'text-[100rpx]', 'text-white'])
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
    createCompilerContextMock.mockReturnValue(testState.currentContext)

    const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
    let currentAssetStore: Record<string, string> = {}
    const updateAsset = vi.fn((file: string, source: FakeConcatSource) => {
      currentAssetStore[file] = source.toString()
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
    expect(transformed).toContain(replaceWxml('bg-[#f50505]'))
    expect(transformed).not.toContain('bg-[#f50505]')
    expect(transformed).toContain(replaceWxml('text-[100rpx]'))
  })

  it('keeps webpack source candidates out of JS transform until Tailwind confirms runtime classes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-webpack-js-precise-'))
    const sourceFile = path.join(root, 'src/pages/index.tsx')
    const configFile = path.join(root, 'tailwind.config.js')
    const runtimeSet = new Set([
      'bg-[#f50505]',
      'text-[100rpx]',
      'w-[112px]',
    ])
    const realJsHandler = createJsHandler({
      escapeMap: undefined,
    })

    try {
      await mkdir(path.dirname(sourceFile), { recursive: true })
      await writeFile(configFile, [
        'module.exports = {',
        '  content: ["./src/**/*.{tsx,ts,js}"],',
        '}',
      ].join('\n'))
      await writeFile(sourceFile, [
        'export const sharedAlias = "bg-[#f50505] text-[100rpx] w-[112px]"',
        'export const swatchStyle = {',
        '  border: "1px solid #0f172a",',
        '  borderRadius: "6px",',
        '  height: "56px",',
        '  width: "112px",',
        '  minHeight: "100vh",',
        '  padding: "32px 24px",',
        '}',
      ].join('\n'))

      const observedClassSets: string[][] = []
      testState.currentContext = createContext({
        tailwindcssBasedir: root,
        jsHandler: vi.fn((code: string, classSet?: Set<string>, options?: Record<string, unknown>) => {
          observedClassSets.push([...classSet ?? []].sort())
          return realJsHandler(code, classSet, options as any)
        }),
        tailwindRuntime: {
          ...createContext().tailwindRuntime,
          getClassSet: vi.fn(async () => runtimeSet),
          getClassSetSync: vi.fn(() => runtimeSet),
          extract: vi.fn(async () => ({ classSet: runtimeSet })),
          majorVersion: 4,
          options: {
            projectRoot: root,
            tailwindcss: {
              config: configFile,
              cwd: root,
              v4: {
                css: '@import "tailwindcss";',
                base: root,
              },
            },
          },
        } as any,
      })
      createCompilerContextMock.mockReturnValue(testState.currentContext)

      const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
      let currentAssetStore: Record<string, string> = {}
      const updateAsset = vi.fn((file: string, source: FakeConcatSource) => {
        currentAssetStore[file] = source.toString()
      })
      const compilation = {
        compiler: { outputPath: path.join(root, 'dist') },
        chunks: [{ id: 'main', hash: 'hash-1', files: ['index.js', 'app.css'] }],
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
        watching: undefined,
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

      const js = [
        'const arbitraryAlias = "bg-[#f50505] text-[100rpx] w-[112px]"',
        'const inlineStyle = {',
        '  border: "1px solid #0f172a",',
        '  borderRadius: "6px",',
        '  height: "56px",',
        '  width: "112px",',
        '  minHeight: "100vh",',
        '  padding: "32px 24px",',
        '}',
        'console.log(arbitraryAlias, inlineStyle)',
      ].join('\n')
      const css = '@tailwind utilities;'
      currentAssetStore = {
        'index.js': js,
        'app.css': css,
      }

      await processAssetsCallbacks[0](createAssetsFromStore(currentAssetStore))

      const transformed = currentAssetStore['index.js']
      expect(observedClassSets).toHaveLength(1)
      expect(observedClassSets[0]).toEqual([...runtimeSet].sort())
      expect(transformed).toContain(replaceWxml('bg-[#f50505]'))
      expect(transformed).toContain(replaceWxml('text-[100rpx]'))
      expect(transformed).toContain(replaceWxml('w-[112px]'))
      expect(transformed).toContain('"1px solid #0f172a"')
      expect(transformed).toContain('"6px"')
      expect(transformed).toContain('"56px"')
      expect(transformed).toContain('"112px"')
      expect(transformed).toContain('"100vh"')
      expect(transformed).toContain('"32px 24px"')
      expect(transformed).not.toContain('_1px')
      expect(transformed).not.toContain('_6px')
      expect(transformed).not.toContain('_56px')
      expect(transformed).not.toContain('_112px')
      expect(transformed).not.toContain('_100vh')
    }
    finally {
      await rm(root, { force: true, recursive: true })
    }
  })

})
