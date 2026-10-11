import { describe, expect, it, vi } from 'vitest'
import type { LoaderModule } from './shared'
import { setupWebpackV5UnitTest, FakeConcatSource, createCompilerWithLoaderTracking, createContext, getCompilerContextMock, getWebpackLoaderRuntime, isCssGenerationLoader, isCssImportRewriteLoader, path, testState, WeappTailwindcss } from './shared'
import RuntimeClassSetLoader from '@/bundlers/webpack/loaders/weapp-tw-runtime-classset-loader'
import { getCompilerShadowReportSession } from '@/compiler'
describe('bundlers/webpack WeappTailwindcss / loader core wiring', () => {
  setupWebpackV5UnitTest()
  it.each(['sass', 'less', 'stylus'])('runs CSS generation after %s preprocessing without PostCSS', (preprocessor) => {
    testState.currentContext = createContext({
      generator: { target: 'web' },
      tailwindRuntime: { ...testState.currentContext.tailwindRuntime, majorVersion: 4 },
    })
    const { compiler, getLoaderHandler } = createCompilerWithLoaderTracking()
    new WeappTailwindcss().apply(compiler as any)
    const module: LoaderModule = {
      resource: '/workspace/theme.scss',
      loaders: [{ loader: `C:\\loaders\\${preprocessor}-loader\\index.js` }],
    }
    getLoaderHandler()?.({}, module)
    expect(module.loaders.map(entry => isCssGenerationLoader(entry) ? 'generation' : isCssImportRewriteLoader(entry) ? 'rewrite' : 'preprocessor')).toEqual(['rewrite', 'generation', 'preprocessor'])
  })

  it('injects a dedicated css generation loader before postcss-loader execution', () => {
    testState.currentContext = createContext({
      generator: { target: 'weapp' },
      tailwindRuntime: {
        ...testState.currentContext.tailwindRuntime,
        majorVersion: 4,
      },
    })
    const { compiler, getLoaderHandler } = createCompilerWithLoaderTracking()
    new WeappTailwindcss().apply(compiler as any)

    const module: LoaderModule = {
      loaders: [{ loader: '/path/postcss-loader.js' }],
      resource: '/workspace/src/app.css',
    }
    getLoaderHandler()?.({}, module)

    const generationLoaderEntry = module.loaders.find(entry => isCssGenerationLoader(entry))
    const rewriteLoaderEntry = module.loaders.find(entry => isCssImportRewriteLoader(entry))
    const classSetLoaderEntry = module.loaders.find(entry => entry.loader === testState.currentContext.runtimeLoaderPath)
    expect(generationLoaderEntry).toBeDefined()
    expect(rewriteLoaderEntry).toBeDefined()
    expect(classSetLoaderEntry).toBeDefined()
    const postcssIndex = module.loaders.findIndex(entry => entry.loader.includes('postcss-loader'))
    expect(module.loaders.indexOf(generationLoaderEntry!)).toBeGreaterThan(module.loaders.indexOf(rewriteLoaderEntry!))
    expect(module.loaders.indexOf(rewriteLoaderEntry!)).toBeGreaterThan(postcssIndex)
    expect(module.loaders.indexOf(generationLoaderEntry!)).toBeGreaterThan(postcssIndex)
    expect(module.loaders.indexOf(classSetLoaderEntry!)).toBeLessThan(postcssIndex)
  })

  it('forwards tailwindcssImportRewrite options when css import rewrite is enabled', () => {
    let loaderHandler: ((loaderContext: any, module: LoaderModule) => void) | undefined
    const compilation = {
      compiler: { outputPath: path.resolve(process.cwd(), 'dist') },
      chunks: [],
      hooks: {
        processAssets: {
          tapPromise: vi.fn(),
        },
      },
      updateAsset: vi.fn(),
      getAsset: vi.fn(),
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
    testState.currentContext = createContext({
      rewriteCssImports: true,
      tailwindRuntime: {
        ...testState.currentContext.tailwindRuntime,
        majorVersion: 4,
      },
    })
    getCompilerContextMock.mockReturnValue(testState.currentContext)
    const plugin = new WeappTailwindcss()
    plugin.apply(compiler as any)
    const module: LoaderModule = {
      loaders: [{ loader: '/path/postcss-loader.js' }],
      resource: '/workspace/src/app.css',
    }
    loaderHandler?.({}, module)
    const classSetLoaderEntry = module.loaders.find(entry => entry.loader === testState.currentContext.runtimeLoaderPath)
    const rewriteLoaderEntry = module.loaders.find(entry => isCssImportRewriteLoader(entry))
    const generationLoaderEntry = module.loaders.find(entry => isCssGenerationLoader(entry))
    expect(classSetLoaderEntry).toBeDefined()
    expect(rewriteLoaderEntry).toBeDefined()
    expect(generationLoaderEntry).toBeDefined()
    expect(rewriteLoaderEntry?.options).toEqual({
      generateCss: false,
      tailwindcssImportRewriteRuntimeKey: expect.any(String),
    })
    expect(classSetLoaderEntry?.options?.weappTailwindcssRuntimeKey).toBe(rewriteLoaderEntry?.options?.tailwindcssImportRewriteRuntimeKey)
    expect(generationLoaderEntry?.options?.tailwindcssImportRewriteRuntimeKey).toBe(rewriteLoaderEntry?.options?.tailwindcssImportRewriteRuntimeKey)
    expect(classSetLoaderEntry?.ident).toBeNull()
    expect(rewriteLoaderEntry?.ident).toBeNull()
    const classSetIndex = module.loaders.indexOf(classSetLoaderEntry!)
    const postcssIndex = module.loaders.findIndex(entry => entry.loader.includes('postcss-loader'))
    const rewriteIndex = module.loaders.indexOf(rewriteLoaderEntry!)
    const generationIndex = module.loaders.indexOf(generationLoaderEntry!)
    expect(classSetIndex).toBeLessThan(postcssIndex)
    expect(rewriteIndex).toBeGreaterThan(postcssIndex)
    expect(generationIndex).toBeGreaterThan(rewriteIndex)
  })

  it('uses safe runtime keys so runtime options are not serialized into webpack requests', () => {
    testState.currentContext = createContext({
      ...testState.currentContext,
      rewriteCssImports: true,
      customReplaceDictionary: {
        '!': '_e',
        '#': '_h',
        '/': '_f',
      },
    } as any)
    testState.currentContext.tailwindRuntime.majorVersion = 4
    getCompilerContextMock.mockReturnValue(testState.currentContext)
    const { compiler, getLoaderHandler } = createCompilerWithLoaderTracking()
    new WeappTailwindcss().apply(compiler as any)

    const module: LoaderModule = {
      resource: '/workspace/src/app.css',
      loaders: [{ loader: '/path/postcss-loader.js' }],
    }
    getLoaderHandler()?.({}, module)

    const rewriteLoaderEntry = module.loaders.find(isCssImportRewriteLoader)
    const serializedRequest = `${rewriteLoaderEntry?.loader}?${JSON.stringify(rewriteLoaderEntry?.options)}`
    expect(rewriteLoaderEntry?.options).toEqual({
      generateCss: false,
      tailwindcssImportRewriteRuntimeKey: expect.any(String),
    })
    expect(serializedRequest).not.toContain('customReplaceDictionary')
    expect(serializedRequest).not.toContain('"_e"')
    expect(serializedRequest).not.toContain('!')
  })

  it('cleans webpack loader runtime registry when watch closes', async () => {
    testState.currentContext.tailwindRuntime.majorVersion = 4
    const { compiler, getLoaderHandler } = createCompilerWithLoaderTracking()
    new WeappTailwindcss().apply(compiler as any)

    const cleanupRuntime = [...compiler.hooks.watchClose.tap.mock.calls][0]?.[1]
    expect(cleanupRuntime).toEqual(expect.any(Function))

    const module: LoaderModule = {
      loaders: [{ loader: '/path/postcss-loader.js' }],
      resource: '/workspace/src/app.css',
    }
    getLoaderHandler()?.({}, module)

    const classSetLoaderEntry = module.loaders.find(entry => entry.loader === testState.currentContext.runtimeLoaderPath)
    const runtimeKey = classSetLoaderEntry?.options?.weappTailwindcssRuntimeKey
    const runtimeEntry = getWebpackLoaderRuntime(runtimeKey)
    const runtimeState = runtimeEntry?.cssImportRewrite?.runtimeState
    expect(runtimeEntry).toBeDefined()
    expect(runtimeState).toBeDefined()
    const shadowSession = getCompilerShadowReportSession(runtimeState!)

    cleanupRuntime?.()

    expect(getWebpackLoaderRuntime(runtimeKey)).toBeUndefined()
    await vi.waitFor(() => {
      expect(() => shadowSession.snapshot()).toThrow('已释放')
    })
  })

  it('does not register css-loader runtime modules as css source content', () => {
    const registerCssSourceFile = vi.fn()
    RuntimeClassSetLoader.call({
      getOptions: () => ({
        getClassSet: vi.fn(),
        registerCssSourceFile,
      }),
      resourcePath: '/workspace/src/pages/index.wxss',
    } as any, [
      '// Imports',
      'var ___CSS_LOADER_API_IMPORT___ = require("css-loader/runtime/api.js");',
      'var ___CSS_LOADER_EXPORT___ = ___CSS_LOADER_API_IMPORT___();',
      '___CSS_LOADER_EXPORT___.push([module.id, ".user-card{color:red}", ""]);',
      'module.exports = ___CSS_LOADER_EXPORT___;',
    ].join('\n'))

    expect(registerCssSourceFile).toHaveBeenCalledWith({
      file: '/workspace/src/pages/index.wxss',
      css: undefined,
    })
  })

})
