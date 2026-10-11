import { describe, expect, it, vi } from 'vitest'
import type { LoaderModule } from './shared'
import { setupWebpackV5UnitTest, FakeConcatSource, createAssetsFromStore, createContext, getWebpackLoaderRuntime, mkdir, mkdtemp, os, path, rm, testState, WeappTailwindcss, writeFile } from './shared'

function toPosixPath(value: string) {
  return value.replace(/\\/g, '/')
}

describe('bundlers/webpack WeappTailwindcss / registered source css hot updates', () => {
  setupWebpackV5UnitTest()
  it('refreshes webpack registered source css options after style hot updates', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-webpack-source-css-hot-'))
    const sourceCssFile = path.join(root, 'src/pages/index/index.css')
    const firstSourceCss = '.tw-watch-style-case { color: red; }'
    const secondSourceCss = '.tw-watch-style-case { @apply font-bold; color: red; }'
    const generatedCss = '.tw-watch-style-case{font-weight:700;color:red}'

    vi.resetModules()
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: vi.fn(),
        })),
        normalizeWeappTailwindcssGeneratorOptions: vi.fn(() => ({
          enabled: true,
          target: 'weapp',
          importFallback: true,
          styleOptions: {},
        })),
      }
    })

    try {
      await mkdir(path.dirname(sourceCssFile), { recursive: true })
      const { WeappTailwindcss: MockedWeappTailwindcss } = await import('@/bundlers/webpack/BaseUnifiedPlugin/v5')
      testState.currentContext = createContext({
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        mainCssChunkMatcher: vi.fn(() => false),
        styleHandler: vi.fn(async (code: string, options: any) => ({
          css: options?.sourceOptions?.sourceCss?.includes('@apply font-bold')
            ? generatedCss
            : `handled:${code}`,
        })),
        tailwindcssBasedir: root,
      } as any)

      const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
      let loaderHandler: ((loaderContext: any, module: LoaderModule) => void) | undefined
      let assetStore: Record<string, string> = {
        'pages/index/index.wxss': firstSourceCss,
      }
      const compilation = {
        compiler: { outputPath: path.join(root, 'dist') },
        chunks: [{ id: 'page', hash: 'hash-1', files: ['pages/index/index.wxss'] }],
        chunkGraph: {
          getChunkModulesIterable: () => [{
            resource: sourceCssFile,
          }],
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
        outputPath: path.join(root, 'dist'),
        options: {
          watch: true,
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
                tap: (_name: string, handler: (loaderContext: any, module: LoaderModule) => void) => {
                  loaderHandler = handler
                },
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

      new MockedWeappTailwindcss().apply(compiler as any)
      const sourceCssModule: LoaderModule = {
        loaders: [{ loader: '/path/postcss-loader.js' }],
        resource: sourceCssFile,
      }
      loaderHandler?.({}, sourceCssModule)
      const classSetLoaderEntry = sourceCssModule.loaders.find(entry => entry.loader === testState.currentContext.runtimeLoaderPath)
      const loaderRuntime = getWebpackLoaderRuntime(classSetLoaderEntry?.options?.weappTailwindcssRuntimeKey)
      loaderRuntime?.classSet?.registerCssSourceFile?.({
        file: sourceCssFile,
        css: firstSourceCss,
      })

      await processAssetsCallbacks[0](createAssetsFromStore(assetStore))

      loaderRuntime?.classSet?.registerCssSourceFile?.({
        file: sourceCssFile,
        css: secondSourceCss,
      })
      await processAssetsCallbacks[0](createAssetsFromStore(assetStore))

      expect(testState.currentContext.styleHandler).toHaveBeenCalledTimes(2)
      expect(testState.currentContext.styleHandler.mock.calls.at(-1)?.[0]).toBe(secondSourceCss)
      expect(testState.currentContext.styleHandler.mock.calls.at(-1)?.[1]?.sourceOptions?.sourceCss).toContain('@apply font-bold')
      expect(assetStore['pages/index/index.wxss']).toContain('font-weight:700')
    }
    finally {
      vi.doUnmock('@/generator')
      vi.resetModules()
      await rm(root, { force: true, recursive: true })
    }
  })

  it('replaces webpack registered source css when style hot rollback removes markers', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-webpack-source-css-rollback-'))
    const sourceCssFile = path.join(root, 'src/pages/component/index.css')
    const firstSourceCss = [
      '.tw-watch-style-rollback { color: red; }',
      '.component-root { display: flex; }',
    ].join('\n')
    const rollbackSourceCss = '.component-root { display: flex; }'

    vi.resetModules()
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: vi.fn(),
        })),
        normalizeWeappTailwindcssGeneratorOptions: vi.fn(() => ({
          enabled: true,
          target: 'weapp',
          importFallback: true,
          styleOptions: {},
        })),
      }
    })

    try {
      await mkdir(path.dirname(sourceCssFile), { recursive: true })
      const { WeappTailwindcss: MockedWeappTailwindcss } = await import('@/bundlers/webpack/BaseUnifiedPlugin/v5')
      testState.currentContext = createContext({
        appType: 'mpx',
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        mainCssChunkMatcher: vi.fn(() => false),
        styleHandler: vi.fn(async (_code: string, options: any) => ({
          css: options?.sourceOptions?.sourceCss ?? '',
        })),
        tailwindcssBasedir: root,
      } as any)

      const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
      let loaderHandler: ((loaderContext: any, module: LoaderModule) => void) | undefined
      let assetStore: Record<string, string> = {
        'pages/component/index.wxss': firstSourceCss,
      }
      const compilation = {
        compiler: { outputPath: path.join(root, 'dist/wx') },
        chunks: [{ id: 'page', hash: 'hash-1', files: ['pages/component/index.wxss'] }],
        chunkGraph: {
          getChunkModulesIterable: () => [{
            resource: sourceCssFile,
          }],
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
        outputPath: path.join(root, 'dist/wx'),
        options: {
          watch: true,
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
                tap: (_name: string, handler: (loaderContext: any, module: LoaderModule) => void) => {
                  loaderHandler = handler
                },
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

      new MockedWeappTailwindcss().apply(compiler as any)
      const sourceCssModule: LoaderModule = {
        loaders: [{ loader: '/path/postcss-loader.js' }],
        resource: sourceCssFile,
      }
      loaderHandler?.({}, sourceCssModule)
      const classSetLoaderEntry = sourceCssModule.loaders.find(entry => entry.loader === testState.currentContext.runtimeLoaderPath)
      const loaderRuntime = getWebpackLoaderRuntime(classSetLoaderEntry?.options?.weappTailwindcssRuntimeKey)
      loaderRuntime?.classSet?.registerCssSourceFile?.({
        file: sourceCssFile,
        css: firstSourceCss,
      })

      await processAssetsCallbacks[0](createAssetsFromStore(assetStore))

      assetStore = {
        'pages/component/index.wxss': rollbackSourceCss,
      }
      compilation.chunks[0] = { id: 'page', hash: 'hash-2', files: ['pages/component/index.wxss'] }
      loaderRuntime?.classSet?.registerCssSourceFile?.({
        file: sourceCssFile,
        css: rollbackSourceCss,
      })
      await processAssetsCallbacks[0](createAssetsFromStore(assetStore))

      expect(testState.currentContext.styleHandler).toHaveBeenCalledTimes(2)
      expect(testState.currentContext.styleHandler.mock.calls.at(-1)?.[1]?.sourceOptions?.sourceCss).toBe(rollbackSourceCss)
      expect(assetStore['pages/component/index.wxss']).toBe(rollbackSourceCss)
      expect(assetStore['pages/component/index.wxss']).not.toContain('tw-watch-style-rollback')
    }
    finally {
      vi.doUnmock('@/generator')
      vi.resetModules()
      await rm(root, { force: true, recursive: true })
    }
  })

  it('uses configured main source css for Taro webpack v4 main wxss hot updates', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-webpack-main-source-css-hot-'))
    const sourceCssFile = path.join(root, 'src/app.css')
    const subSourceCssFile = path.join(root, 'src/sub-independent/pages/index.css')
    const sourceCss = [
      '@import "tailwindcss" source(none);',
      '@config "../tailwind.config.js";',
      '@source "../src/pages/index";',
    ].join('\n')
    const subSourceCss = [
      '@import "tailwindcss" source(none);',
      '@config "../../../tailwind.config.js";',
    ].join('\n')
    let generatedCss = '.text-_b23px_B{font-size:23px}'
    const generatorSources: any[] = []
    const generateMock = vi.fn(async () => ({
      css: generatedCss,
      rawCss: generatedCss,
      target: 'weapp',
      classSet: new Set([generatedCss.includes('24px') ? 'text-[24px]' : 'text-[23px]']),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.resetModules()
    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn((source: any) => {
        generatorSources.push(source)
        return {
        generate: generateMock,
        }
      }),
      normalizeWeappTailwindcssGeneratorOptions: vi.fn(() => ({
        enabled: true,
        target: 'weapp',
        importFallback: true,
        styleOptions: {},
      })),
      resolveTailwindV4Source: vi.fn(async (options: any) => {
        const cssSource = options.cssSources?.[0]
        return {
          projectRoot: root,
          base: options.base ?? cssSource?.base ?? root,
          baseFallbacks: [],
          css: options.css ?? cssSource?.css,
          dependencies: [],
        }
      }),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: root,
        base: root,
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: root,
        baseFallbacks: [],
        cssEntries: [sourceCssFile],
      })),
    }))

    try {
      await mkdir(path.dirname(sourceCssFile), { recursive: true })
      await mkdir(path.dirname(subSourceCssFile), { recursive: true })
      await writeFile(sourceCssFile, sourceCss, { encoding: 'utf8' })
      await writeFile(subSourceCssFile, subSourceCss, { encoding: 'utf8' })
      await writeFile(path.join(root, 'tailwind.config.js'), 'module.exports = { content: [] }', { encoding: 'utf8' })

      const { WeappTailwindcss: MockedWeappTailwindcss } = await import('@/bundlers/webpack/BaseUnifiedPlugin/v5')
      testState.currentContext = createContext({
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        mainCssChunkMatcher: vi.fn((file: string) => file === 'app.wxss'),
        styleHandler: vi.fn(async (code: string) => ({ css: `handled:${code}` })),
        tailwindcssBasedir: root,
        tailwindRuntime: {
          ...createContext().tailwindRuntime,
          majorVersion: 4,
          getClassSet: vi.fn(async () => new Set<string>()),
          getClassSetSync: vi.fn(() => new Set<string>()),
          extract: vi.fn(async () => ({ classSet: new Set<string>() })),
          options: {
            tailwindcss: {
              v4: {
                cssEntries: [sourceCssFile],
              },
            },
          },
        } as any,
      } as any)

      const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
      let loaderHandler: ((loaderContext: any, module: LoaderModule) => void) | undefined
      let assetStore: Record<string, string> = {
        'app.wxss': 'view,text{box-sizing:border-box}',
        'pages/index/index.js': 'const cls = "text-_b23px_B"',
      }
      const compilation = {
        compiler: { outputPath: path.join(root, 'dist') },
        chunks: [
          { id: 'app', hash: 'same-app-hash', files: ['app.wxss'] },
          { id: 'page', hash: 'page-hash-1', files: ['pages/index/index.js'] },
        ],
        chunkGraph: {
          getChunkModulesIterable: (chunk: { id?: string }) => {
            if (chunk.id === 'app') {
              return [{ resource: sourceCssFile }]
            }
            if (chunk.id === 'sub-independent') {
              return [{ resource: subSourceCssFile }]
            }
            return []
          },
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
        outputPath: path.join(root, 'dist'),
        options: {
          watch: true,
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
                tap: (_name: string, handler: (loaderContext: any, module: LoaderModule) => void) => {
                  loaderHandler = handler
                },
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

      new MockedWeappTailwindcss().apply(compiler as any)
      const sourceCssModule: LoaderModule = {
        loaders: [{ loader: '/path/postcss-loader.js' }],
        resource: sourceCssFile,
      }
      loaderHandler?.({}, sourceCssModule)
      const classSetLoaderEntry = sourceCssModule.loaders.find(entry => entry.loader === testState.currentContext.runtimeLoaderPath)
      const loaderRuntime = getWebpackLoaderRuntime(classSetLoaderEntry?.options?.weappTailwindcssRuntimeKey)
      loaderRuntime?.classSet?.registerCssSourceFile?.({
        file: sourceCssFile,
        css: sourceCss,
      })
      loaderRuntime?.classSet?.registerCssSourceFile?.({
        file: subSourceCssFile,
        css: subSourceCss,
      })

      assetStore = {
        'sub-independent/pages/index.wxss': '.sub-independent{}',
      }
      compilation.chunks[0] = { id: 'sub-independent', hash: 'sub-hash-1', files: ['sub-independent/pages/index.wxss'] }
      await processAssetsCallbacks[0](createAssetsFromStore(assetStore))

      assetStore = {
        'app.wxss': 'view,text{box-sizing:border-box}',
        'pages/index/index.js': 'const cls = "text-_b23px_B"',
      }
      compilation.chunks[0] = { id: 'app', hash: 'same-app-hash', files: ['app.wxss'] }
      compilation.chunks[1] = { id: 'page', hash: 'page-hash-1', files: ['pages/index/index.js'] }

      await processAssetsCallbacks[0](createAssetsFromStore(assetStore))

      generatedCss = '.text-_b24px_B{font-size:24px}'
      compilation.chunks[1] = { id: 'page', hash: 'page-hash-2', files: ['pages/index/index.js'] }
      assetStore = {
        'app.wxss': 'view,text{box-sizing:border-box}',
        'pages/index/index.js': 'const cls = "text-_b24px_B"',
      }
      await processAssetsCallbacks[0](createAssetsFromStore(assetStore))

      // compiler output cache 命中时不重复调用 generator，仍以最终 asset 验证事务结果。
      expect(generateMock).toHaveBeenCalledTimes(2)
      expect(testState.currentContext.styleHandler).not.toHaveBeenCalledWith(
        'view,text{box-sizing:border-box}',
        expect.anything(),
      )
      expect(generatorSources.at(-1)?.css).toContain('@import "tailwindcss" source(none);')
      expect(generatorSources.at(-1)?.css).toContain(`@config "${toPosixPath(path.join(root, 'tailwind.config.js'))}"`)
      expect(generatorSources.at(-1)?.css).toContain('@source "../src/pages/index";')
      // CSS 输入未变化时 compiler snapshot 复用上一份已验证产物。
      expect(assetStore['app.wxss']).toContain('.text-_b23px_B')
    }
    finally {
      vi.doUnmock('@/generator')
      vi.resetModules()
      await rm(root, { force: true, recursive: true })
    }
  })

  it('prunes stale registered source css after watch compilations', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-webpack-source-css-prune-'))
    const activeSourceCssFile = path.join(root, 'src/pages/index/index.css')
    const staleSourceCssFile = path.join(root, 'src/pages/removed/index.css')
    const activeSourceCss = '.active-source { color: red; }'
    const staleSourceCss = '.stale-source { color: blue; }'

    vi.resetModules()
    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: vi.fn(),
      })),
      normalizeWeappTailwindcssGeneratorOptions: vi.fn(() => ({
        enabled: true,
        target: 'weapp',
        importFallback: true,
        styleOptions: {},
      })),    }))

    try {
      const { WeappTailwindcss: MockedWeappTailwindcss } = await import('@/bundlers/webpack/BaseUnifiedPlugin/v5')
      testState.currentContext = createContext({
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        mainCssChunkMatcher: vi.fn(() => false),
        styleHandler: vi.fn(async (_code: string, options: any) => ({
          css: options?.sourceOptions?.sourceCss ?? '',
        })),
        tailwindcssBasedir: root,
      } as any)

      const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
      let loaderHandler: ((loaderContext: any, module: LoaderModule) => void) | undefined
      let assetStore: Record<string, string> = {
        'pages/index/index.wxss': activeSourceCss,
      }
      const compilation = {
        compiler: { outputPath: path.join(root, 'dist') },
        chunks: [{ id: 'page', hash: 'hash-1', files: ['pages/index/index.wxss'] }],
        chunkGraph: {
          getChunkModulesIterable: (chunk: { files?: string[] }) => {
            if (chunk.files?.includes('pages/index/index.wxss')) {
              return [{ resource: activeSourceCssFile }]
            }
            return []
          },
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
        outputPath: path.join(root, 'dist'),
        options: {
          watch: true,
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
                tap: (_name: string, handler: (loaderContext: any, module: LoaderModule) => void) => {
                  loaderHandler = handler
                },
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

      new MockedWeappTailwindcss().apply(compiler as any)
      const sourceCssModule: LoaderModule = {
        loaders: [{ loader: '/path/postcss-loader.js' }],
        resource: activeSourceCssFile,
      }
      loaderHandler?.({}, sourceCssModule)
      const classSetLoaderEntry = sourceCssModule.loaders.find(entry => entry.loader === testState.currentContext.runtimeLoaderPath)
      const loaderRuntime = getWebpackLoaderRuntime(classSetLoaderEntry?.options?.weappTailwindcssRuntimeKey)
      loaderRuntime?.classSet?.registerCssSourceFile?.({
        file: activeSourceCssFile,
        css: activeSourceCss,
      })
      loaderRuntime?.classSet?.registerCssSourceFile?.({
        file: staleSourceCssFile,
        css: staleSourceCss,
      })

      await processAssetsCallbacks[0](createAssetsFromStore(assetStore))

      assetStore = {
        'pages/removed/index.wxss': staleSourceCss,
      }
      compilation.chunks[0] = { id: 'removed', hash: 'hash-2', files: ['pages/removed/index.wxss'] }
      await processAssetsCallbacks[0](createAssetsFromStore(assetStore))

      expect(testState.currentContext.styleHandler).toHaveBeenCalledTimes(2)
      expect(testState.currentContext.styleHandler.mock.calls[0]?.[1]?.sourceOptions?.sourceFile).toBe(activeSourceCssFile)
      expect(testState.currentContext.styleHandler.mock.calls[1]?.[1]?.sourceOptions?.sourceFile).toBeUndefined()
      expect(testState.currentContext.styleHandler.mock.calls[1]?.[1]?.sourceOptions?.sourceCss).toBeUndefined()
    }
    finally {
      vi.doUnmock('@/generator')
      vi.resetModules()
      await rm(root, { force: true, recursive: true })
    }
  })

})
