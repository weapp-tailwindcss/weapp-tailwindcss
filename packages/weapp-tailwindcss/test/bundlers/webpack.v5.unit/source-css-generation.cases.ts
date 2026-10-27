import { describe, expect, it, vi } from 'vitest'
import type { LoaderModule } from './shared'
import { setupWebpackV5UnitTest, FakeConcatSource, createAssetsFromStore, createContext, getWebpackLoaderRuntime, mkdir, mkdtemp, os, path, rm, testState, WeappTailwindcss, writeFile } from './shared'
describe('bundlers/webpack WeappTailwindcss / registered source css generation', () => {
  setupWebpackV5UnitTest()
  it('generates Taro webpack v4 css from loader registered source css when final wxss has no Tailwind directives', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-webpack-v4-source-css-'))
    const sourceCssFile = path.join(root, 'src/sub-normal/pages/index.css')
    const sourceCss = [
      '@import "tailwindcss" source(none);',
      '@config "../../../tailwind.config.sub-normal.js";',
      '@source "../**/*.{css,ts,js,vue,html}";',
    ].join('\n')
    const generatedCss = '.bg-normal-subpackage-marker{background-color:#2563eb}'
    const generateMock = vi.fn(async () => ({
      css: generatedCss,
      rawCss: generatedCss,
      target: 'weapp',
      classSet: new Set(['bg-normal-subpackage-marker']),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.resetModules()
    vi.doMock('@/generator/runtime', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: vi.fn(() => ({
        enabled: true,
        target: 'weapp',
        importFallback: true,
        styleOptions: {},
      })),
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: root,
        base: options.base,
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      })),
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
      })),
    }))

    try {
      await mkdir(path.dirname(sourceCssFile), { recursive: true })
      await writeFile(sourceCssFile, sourceCss, { encoding: 'utf8' })
      await writeFile(path.join(root, 'tailwind.config.sub-normal.js'), 'module.exports = { content: [] }')

      const { WeappTailwindcss: MockedWeappTailwindcss } = await import('@/bundlers/webpack/BaseUnifiedPlugin/v5')
      testState.currentContext = createContext({
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        mainCssChunkMatcher: vi.fn(() => false),
        styleHandler: vi.fn(async (code: string) => ({ css: `handled:${code}` })),
        tailwindcssBasedir: root,
        tailwindRuntime: {
          ...createContext().tailwindRuntime,
          majorVersion: 4,
          getClassSet: vi.fn(async () => new Set(['bg-normal-subpackage-marker'])),
          getClassSetSync: vi.fn(() => new Set(['bg-normal-subpackage-marker'])),
          extract: vi.fn(async () => ({ classSet: new Set(['bg-normal-subpackage-marker']) })),
        },
      } as any)

      const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
      let loaderHandler: ((loaderContext: any, module: LoaderModule) => void) | undefined
      let assetStore: Record<string, string> = {
        'sub-normal/pages/index.wxss': 'view,text{box-sizing:border-box}',
      }
      const compilation = {
        compiler: { outputPath: path.join(root, 'dist') },
        chunks: [{ id: 'sub-normal', hash: 'hash-source-css', files: ['sub-normal/pages/index.wxss'] }],
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
        options: {},
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
            tap: vi.fn((_name: string, handler: (factory: any) => void) => {
              handler({
                hooks: {
                  beforeResolve: {
                    tap: vi.fn(),
                  },
                },
              })
            }),
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

      await processAssetsCallbacks[0](createAssetsFromStore(assetStore))

      expect(generateMock).toHaveBeenCalledTimes(1)
      expect(testState.currentContext.styleHandler).not.toHaveBeenCalled()
      expect(assetStore['sub-normal/pages/index.wxss']).toContain('.bg-normal-subpackage-marker')
      expect(assetStore['sub-normal/pages/index.wxss']).not.toContain('handled:')
    }
    finally {
      vi.doUnmock('@/generator')
      vi.resetModules()
      await rm(root, { force: true, recursive: true })
    }
  })

  it('keeps webpack extracted third-party css when generation uses registered source css', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-webpack-v4-source-css-user-'))
    const sourceCssFile = path.join(root, 'src/pages/index/index.css')
    const sourceCss = [
      '@import "./third-party-ui.css";',
      '@import "tailwindcss" source(none);',
      '@config "../../../tailwind.config.js";',
      '@source "../**/*.{css,ts,js,tsx}";',
      '.tw-page-style-watch-anchor{color:inherit}',
    ].join('\n')
    const extractedCss = [
      '.weapp-tw-user-ui-card{display:inline-flex;color:#175e75}',
      '@keyframes weappTwUserUiBreathe{50%{opacity:.65}}',
      '.tw-page-style-watch-anchor{color:inherit}',
      '.nut-icon{display:inline-block;width:var(--nut-icon-width,32rpx)}',
      '.nut-icon-loading{animation:rotation 1s linear infinite}',
      '@keyframes rotation{to{transform:rotate(360deg)}}',
    ].join('\n')
    const generatedCss = '.bg-page-marker{background-color:#2563eb}'
    const generateMock = vi.fn(async () => ({
      css: generatedCss,
      rawCss: generatedCss,
      target: 'weapp',
      classSet: new Set(['bg-page-marker']),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.resetModules()
    vi.doMock('@/generator/runtime', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: vi.fn(() => ({
        enabled: true,
        target: 'weapp',
        importFallback: true,
        styleOptions: {},
      })),
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: root,
        base: options.base,
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      })),
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
      })),
    }))

    try {
      await mkdir(path.dirname(sourceCssFile), { recursive: true })
      await writeFile(sourceCssFile, sourceCss, { encoding: 'utf8' })
      await writeFile(path.join(path.dirname(sourceCssFile), 'third-party-ui.css'), '.weapp-tw-user-ui-card{display:inline-flex;color:#175e75}')
      await writeFile(path.join(root, 'tailwind.config.js'), 'module.exports = { content: [] }')

      const { WeappTailwindcss: MockedWeappTailwindcss } = await import('@/bundlers/webpack/BaseUnifiedPlugin/v5')
      testState.currentContext = createContext({
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        mainCssChunkMatcher: vi.fn(() => false),
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
        tailwindcssBasedir: root,
        tailwindRuntime: {
          ...createContext().tailwindRuntime,
          majorVersion: 4,
          getClassSet: vi.fn(async () => new Set(['bg-page-marker'])),
          getClassSetSync: vi.fn(() => new Set(['bg-page-marker'])),
          extract: vi.fn(async () => ({ classSet: new Set(['bg-page-marker']) })),
        },
      } as any)

      const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
      let loaderHandler: ((loaderContext: any, module: LoaderModule) => void) | undefined
      let assetStore: Record<string, string> = {
        'pages/index/index.wxss': extractedCss,
      }
      const compilation = {
        compiler: { outputPath: path.join(root, 'dist') },
        chunks: [{ id: 'pages/index/index', hash: 'hash-source-css-user', files: ['pages/index/index.wxss'] }],
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
        options: {},
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
            tap: vi.fn((_name: string, handler: (factory: any) => void) => {
              handler({
                hooks: {
                  beforeResolve: {
                    tap: vi.fn(),
                  },
                },
              })
            }),
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

      await processAssetsCallbacks[0](createAssetsFromStore(assetStore))

      const css = assetStore['pages/index/index.wxss'] ?? ''
      expect(generateMock).toHaveBeenCalledTimes(1)
      expect(css).toContain('.bg-page-marker')
      expect(css).toContain('.weapp-tw-user-ui-card')
      expect(css).toContain('@keyframes weappTwUserUiBreathe')
      expect(css).toContain('.tw-page-style-watch-anchor')
      expect(css).toContain('.nut-icon')
      expect(css).toContain('.nut-icon-loading')
      expect(css).toContain('@keyframes rotation')
      expect(css).not.toContain('@import "./third-party-ui.css"')
      expect(css).not.toContain('@import "tailwindcss"')
    }
    finally {
      vi.doUnmock('@/generator')
      vi.resetModules()
      await rm(root, { force: true, recursive: true })
    }
  })

  it('chooses the Tailwind css source from chunk graph resources when third-party css shares the same asset', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-webpack-v4-multi-source-css-'))
    const sourceCssFile = path.join(root, 'src/styles/root-entry.css')
    const vendorCssFile = path.join(root, 'src/vendor/nutui.css')
    const sourceCss = [
      '@import "../vendor/nutui.css";',
      '@import "tailwindcss" source(none);',
      '@config "../../tailwind.config.js";',
      '@source "../pages/index";',
      '@custom-variant system-dark {',
      '  @media (prefers-color-scheme: dark) {',
      '    @slot;',
      '  }',
      '}',
      '.weapp-tw-user-ui-card{display:inline-flex}',
    ].join('\n')
    const vendorCss = [
      '.nut-icon{display:inline-block;width:var(--nut-icon-width,32rpx)}',
      '@keyframes rotation{0%{}to{}}',
    ].join('\n')
    const extractedCss = [
      vendorCss,
      '.weapp-tw-user-ui-card{display:inline-flex}',
    ].join('\n')
    const generatedCss = [
      '.bg-page-marker{background-color:#2563eb}',
      '@media (prefers-color-scheme: dark){.system-dark_cbg-slate-900{background-color:#0f172a}}',
    ].join('\n')
    const generateMock = vi.fn(async () => ({
      css: generatedCss,
      rawCss: generatedCss,
      target: 'weapp',
      classSet: new Set(['bg-page-marker', 'system-dark:bg-slate-900']),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.resetModules()
    const resolveTailwindV4SourceMock = vi.fn(async (options: any) => ({
      projectRoot: root,
      base: options.base,
      baseFallbacks: [],
      css: options.css,
      dependencies: [],
    }))
    vi.doMock('@/generator/runtime', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: vi.fn(() => ({
        enabled: true,
        target: 'weapp',
        importFallback: true,
        styleOptions: {},
      })),
      resolveTailwindV4Source: resolveTailwindV4SourceMock,
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
      })),
    }))

    try {
      await mkdir(path.dirname(sourceCssFile), { recursive: true })
      await mkdir(path.dirname(vendorCssFile), { recursive: true })
      await writeFile(sourceCssFile, sourceCss, { encoding: 'utf8' })
      await writeFile(vendorCssFile, vendorCss, { encoding: 'utf8' })
      await writeFile(path.join(root, 'tailwind.config.js'), 'module.exports = { content: [] }')

      const { WeappTailwindcss: MockedWeappTailwindcss } = await import('@/bundlers/webpack/BaseUnifiedPlugin/v5')
      testState.currentContext = createContext({
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        mainCssChunkMatcher: vi.fn(() => false),
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
        tailwindcssBasedir: root,
        tailwindRuntime: {
          ...createContext().tailwindRuntime,
          majorVersion: 4,
          getClassSet: vi.fn(async () => new Set(['bg-page-marker', 'system-dark:bg-slate-900'])),
          getClassSetSync: vi.fn(() => new Set(['bg-page-marker', 'system-dark:bg-slate-900'])),
          extract: vi.fn(async () => ({ classSet: new Set(['bg-page-marker', 'system-dark:bg-slate-900']) })),
        },
      } as any)

      const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
      let loaderHandler: ((loaderContext: any, module: LoaderModule) => void) | undefined
      let assetStore: Record<string, string> = {
        'entry/root-style.bundle.wxss': extractedCss,
      }
      const compilation = {
        compiler: { outputPath: path.join(root, 'dist') },
        chunks: [{
          id: 'entry-runtime',
          hash: 'hash-v4-multi-source',
          files: ['entry/root-style.bundle.wxss'],
          hasRuntime: () => true,
        }],
        chunkGraph: {
          getChunkModulesIterable: () => [
            { resource: vendorCssFile },
            { resource: sourceCssFile },
          ],
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
        options: {},
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
            tap: vi.fn((_name: string, handler: (factory: any) => void) => {
              handler({
                hooks: {
                  beforeResolve: {
                    tap: vi.fn(),
                  },
                },
              })
            }),
          },
          compilation: {
            tap: vi.fn((_name: string, handler: (_compilation: any) => void) => {
              handler(compilation)
            }),
          },
        },
      }

      new MockedWeappTailwindcss().apply(compiler as any)
      for (const resource of [sourceCssFile, vendorCssFile]) {
        const sourceCssModule: LoaderModule = {
          loaders: [{ loader: '/path/postcss-loader.js' }],
          resource,
        }
        loaderHandler?.({}, sourceCssModule)
      }
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
        file: vendorCssFile,
        css: vendorCss,
        processed: true,
      })

      await processAssetsCallbacks[0](createAssetsFromStore(assetStore))

      const css = assetStore['entry/root-style.bundle.wxss'] ?? ''
      expect(generateMock).toHaveBeenCalledTimes(1)
      expect(resolveTailwindV4SourceMock).toHaveBeenCalledWith(expect.objectContaining({
        css: expect.not.stringContaining('@import "../vendor/nutui.css"'),
      }))
      expect(css).toContain('.bg-page-marker')
      expect(css).toContain('@media (prefers-color-scheme: dark)')
      expect(css).toContain('.system-dark_cbg-slate-900')
      expect(css).toContain('.nut-icon')
      expect(css).toContain('@keyframes rotation')
      expect(css.match(/\.nut-icon\{/g)).toHaveLength(1)
      expect(css.match(/@keyframes rotation/g)).toHaveLength(1)
      expect(css).not.toContain('@import "tailwindcss"')
    }
    finally {
      vi.doUnmock('@/generator')
      vi.resetModules()
      await rm(root, { force: true, recursive: true })
    }
  })

  it('keeps webpack extracted third-party css when generated css is already in the asset', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-webpack-v4-generated-user-'))
    const appCssFile = path.join(root, 'src/app.css')
    const sourceCss = [
      '@config "../tailwind.config.js";',
      '@tailwind base;',
      '@tailwind components;',
      '@tailwind utilities;',
    ].join('\n')
    const generatedRawCss = [
      '/*! tailwindcss v4.3.1 | MIT License | https://tailwindcss.com */',
      '.bg-page-marker{background-color:#2563eb}',
    ].join('\n')
    const extractedCss = [
      generatedRawCss,
      '.weapp-tw-user-ui-card{display:inline-flex;color:#175e75}',
      '.weapp-tw-user-ui-loading{animation:weappTwUserUiRotation 1s linear infinite}',
      '@keyframes weappTwUserUiRotation{to{transform:rotate(360deg)}}',
    ].join('\n')
    const generateMock = vi.fn(async () => ({
      css: generatedRawCss,
      rawCss: generatedRawCss,
      target: 'weapp',
      classSet: new Set(['bg-page-marker']),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.resetModules()
    vi.doMock('@/generator/runtime', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: vi.fn(() => ({
        enabled: true,
        target: 'weapp',
        importFallback: true,
        styleOptions: {},
      })),
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: root,
        base: options.base,
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      })),
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
      })),    }))

    try {
      await mkdir(path.dirname(appCssFile), { recursive: true })
      await writeFile(appCssFile, sourceCss, { encoding: 'utf8' })
      await writeFile(path.join(root, 'tailwind.config.js'), 'module.exports = { content: [] }')

      const { WeappTailwindcss: MockedWeappTailwindcss } = await import('@/bundlers/webpack/BaseUnifiedPlugin/v5')
      testState.currentContext = createContext({
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        mainCssChunkMatcher: vi.fn(() => true),
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
        tailwindcssBasedir: root,
        tailwindRuntime: {
          ...createContext().tailwindRuntime,
          majorVersion: 4,
          getClassSet: vi.fn(async () => new Set(['bg-page-marker'])),
          getClassSetSync: vi.fn(() => new Set(['bg-page-marker'])),
          extract: vi.fn(async () => ({ classSet: new Set(['bg-page-marker']) })),
        },
      } as any)

      const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
      let loaderHandler: ((loaderContext: any, module: LoaderModule) => void) | undefined
      let assetStore: Record<string, string> = {
        'app.wxss': extractedCss,
      }
      const compilation = {
        compiler: { outputPath: path.join(root, 'dist') },
        chunks: [{ id: 'app', hash: 'hash-v4-generated-user', files: ['app.wxss'] }],
        chunkGraph: {
          getChunkModulesIterable: () => [{
            resource: appCssFile,
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
        options: {},
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
            tap: vi.fn((_name: string, handler: (factory: any) => void) => {
              handler({
                hooks: {
                  beforeResolve: {
                    tap: vi.fn(),
                  },
                },
              })
            }),
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
        resource: appCssFile,
      }
      loaderHandler?.({}, sourceCssModule)
      const classSetLoaderEntry = sourceCssModule.loaders.find(entry => entry.loader === testState.currentContext.runtimeLoaderPath)
      const loaderRuntime = getWebpackLoaderRuntime(classSetLoaderEntry?.options?.weappTailwindcssRuntimeKey)
      loaderRuntime?.classSet?.registerCssSourceFile?.({
        file: appCssFile,
        css: sourceCss,
      })

      await processAssetsCallbacks[0](createAssetsFromStore(assetStore))

      const css = assetStore['app.wxss'] ?? ''
      expect(generateMock).toHaveBeenCalledTimes(1)
      expect(css).toContain('.bg-page-marker')
      expect(css).toContain('.weapp-tw-user-ui-card')
      expect(css).toContain('.weapp-tw-user-ui-loading')
      expect(css).toContain('@keyframes weappTwUserUiRotation')
      expect(css.match(/\.bg-page-marker/g)).toHaveLength(1)
      expect(css).not.toContain('@tailwind utilities')
    }
    finally {
      vi.doUnmock('@/generator')
      vi.resetModules()
      await rm(root, { force: true, recursive: true })
    }
  })

  it('keeps processed webpack user css with data urls without relying on app or main filenames', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-webpack-v4-processed-user-'))
    const entryCssFile = path.join(root, 'src/styles/root-entry.css')
    const sourceCss = [
      '@config "../../tailwind.config.js";',
      '@tailwind base;',
      '@tailwind components;',
      '@tailwind utilities;',
    ].join('\n')
    const generatedRawCss = [
      '/*! tailwindcss v4.3.1 | MIT License | https://tailwindcss.com */',
      '.bg-entry-marker{background-color:#2563eb}',
    ].join('\n')
    const extractedCss = [
      generatedRawCss,
      '@font-face{font-family:NutUI;src:url(data:font/ttf;charset=utf-8;base64,AAEAAA) format("truetype")}',
      '.nut-icon{display:inline-block;width:var(--nut-icon-width,32rpx)}',
      '@keyframes rotation{0%{}to{}}',
    ].join('\n')
    const generateMock = vi.fn(async () => ({
      css: generatedRawCss,
      rawCss: generatedRawCss,
      target: 'weapp',
      classSet: new Set(['bg-entry-marker']),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.resetModules()
    vi.doMock('@/generator/runtime', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: vi.fn(() => ({
        enabled: true,
        target: 'weapp',
        importFallback: true,
        styleOptions: {},
      })),
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: root,
        base: options.base,
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      })),
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
      })),    }))

    try {
      await mkdir(path.dirname(entryCssFile), { recursive: true })
      await writeFile(entryCssFile, sourceCss, { encoding: 'utf8' })
      await writeFile(path.join(root, 'tailwind.config.js'), 'module.exports = { content: [] }')

      const { WeappTailwindcss: MockedWeappTailwindcss } = await import('@/bundlers/webpack/BaseUnifiedPlugin/v5')
      testState.currentContext = createContext({
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        mainCssChunkMatcher: vi.fn(() => false),
        styleHandler: vi.fn(async (code: string) => {
          if (code.includes('data:font/ttf')) {
            throw new Error('processed webpack user css should not be reprocessed')
          }
          return { css: code }
        }),
        tailwindcssBasedir: root,
        tailwindRuntime: {
          ...createContext().tailwindRuntime,
          majorVersion: 4,
          getClassSet: vi.fn(async () => new Set(['bg-entry-marker'])),
          getClassSetSync: vi.fn(() => new Set(['bg-entry-marker'])),
          extract: vi.fn(async () => ({ classSet: new Set(['bg-entry-marker']) })),
        },
      } as any)

      const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
      let loaderHandler: ((loaderContext: any, module: LoaderModule) => void) | undefined
      let assetStore: Record<string, string> = {
        'entry/root-style.bundle.wxss': extractedCss,
      }
      const compilation = {
        compiler: { outputPath: path.join(root, 'dist') },
        chunks: [{
          id: 'entry-runtime',
          hash: 'hash-v4-processed-user',
          files: ['entry/root-style.bundle.wxss'],
          hasRuntime: () => true,
        }],
        chunkGraph: {
          getChunkModulesIterable: () => [{
            resource: entryCssFile,
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
        options: {},
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
            tap: vi.fn((_name: string, handler: (factory: any) => void) => {
              handler({
                hooks: {
                  beforeResolve: {
                    tap: vi.fn(),
                  },
                },
              })
            }),
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
        resource: entryCssFile,
      }
      loaderHandler?.({}, sourceCssModule)
      const classSetLoaderEntry = sourceCssModule.loaders.find(entry => entry.loader === testState.currentContext.runtimeLoaderPath)
      const loaderRuntime = getWebpackLoaderRuntime(classSetLoaderEntry?.options?.weappTailwindcssRuntimeKey)
      loaderRuntime?.classSet?.registerCssSourceFile?.({
        file: entryCssFile,
        css: sourceCss,
      })
      loaderRuntime?.classSet?.registerCssSourceFile?.({
        file: path.join(root, 'src/vendor/nutui-icons.css'),
        css: extractedCss,
        processed: true,
      })

      await processAssetsCallbacks[0](createAssetsFromStore(assetStore))

      const css = assetStore['entry/root-style.bundle.wxss'] ?? ''
      expect(generateMock).toHaveBeenCalledTimes(1)
      expect(css).toContain('.bg-entry-marker')
      expect(css).toContain('@font-face')
      expect(css).toContain('data:font/ttf')
      expect(css).toContain('.nut-icon')
      expect(css).toContain('@keyframes rotation')
      expect(css.match(/\.bg-entry-marker/g)).toHaveLength(1)
      expect(testState.currentContext.styleHandler).not.toHaveBeenCalledWith(
        expect.stringContaining('data:font/ttf'),
        expect.anything(),
      )
    }
    finally {
      vi.doUnmock('@/generator')
      vi.resetModules()
      await rm(root, { force: true, recursive: true })
    }
  })

})
