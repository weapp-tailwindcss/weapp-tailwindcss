import { describe, expect, it, vi } from 'vitest'
import type { LoaderModule } from './shared'
import { setupWebpackV5UnitTest, CSS_IMPORT_REWRITE_LOADER_PATH, createCompilerWithLoaderTracking, createContext, createCompilerContextMock, isCssImportRewriteLoader, path, testState, WeappTailwindcss } from './shared'
describe('bundlers/webpack WeappTailwindcss / mpx loader wiring', () => {
  setupWebpackV5UnitTest()
  it('uses mpx style compiler loader as anchor when appType is mpx', () => {
    testState.currentContext = createContext({ appType: 'mpx', rewriteCssImports: true } as any)
    createCompilerContextMock.mockReturnValue(testState.currentContext)
    const { compiler, getLoaderHandler } = createCompilerWithLoaderTracking()
    const plugin = new WeappTailwindcss()
    plugin.apply(compiler as any)

    const handler = getLoaderHandler()
    const module: LoaderModule = {
      loaders: [{ loader: '/abs/node_modules/@mpxjs/webpack-plugin/lib/style-compiler/index.js??ruleSet[1]' }],
    }
    handler?.({}, module)

    const classSetLoaderEntry = module.loaders.find(entry => entry.loader === testState.currentContext.runtimeLoaderPath)
    expect(classSetLoaderEntry).toBeDefined()
    const anchorIndex = module.loaders.findIndex(entry =>
      entry.loader.includes('@mpxjs/webpack-plugin/lib/style-compiler/index'),
    )
    expect(anchorIndex).toBeGreaterThanOrEqual(0)
    const classSetIndex = module.loaders.indexOf(classSetLoaderEntry!)
    expect(classSetIndex).toBeLessThan(anchorIndex)
  })

  it('inserts rewrite loader after style compiler for mpx modules', () => {
    testState.currentContext = createContext({ appType: 'mpx', rewriteCssImports: true } as any)
    testState.currentContext.tailwindRuntime.majorVersion = 4
    createCompilerContextMock.mockReturnValue(testState.currentContext)
    const { compiler, getLoaderHandler } = createCompilerWithLoaderTracking()
    const plugin = new WeappTailwindcss()
    plugin.apply(compiler as any)

    const handler = getLoaderHandler()
    const module: LoaderModule = {
      loaders: [
        { loader: '/abs/node_modules/@mpxjs/webpack-plugin/lib/style-compiler/strip-conditional-loader.js??ruleSet[1]' },
        { loader: '/abs/node_modules/@mpxjs/webpack-plugin/lib/style-compiler/index.js??ruleSet[1]' },
      ],
      resource: '/abs/src/page.mpx?type=styles&lang=css',
    }
    handler?.({}, module)

    const styleIndex = module.loaders.findIndex(entry =>
      entry.loader.includes('@mpxjs/webpack-plugin/lib/style-compiler/index'),
    )
    const rewriteIndex = module.loaders.findIndex(entry =>
      isCssImportRewriteLoader(entry),
    )
    expect(styleIndex).toBeGreaterThanOrEqual(0)
    expect(rewriteIndex).toBeGreaterThan(styleIndex)
  })

  it('falls back to strip-conditional loader when style compiler anchor is missing', () => {
    testState.currentContext = createContext({ appType: 'mpx', rewriteCssImports: true } as any)
    testState.currentContext.tailwindRuntime.majorVersion = 4
    createCompilerContextMock.mockReturnValue(testState.currentContext)
    const { compiler, getLoaderHandler } = createCompilerWithLoaderTracking()
    const plugin = new WeappTailwindcss()
    plugin.apply(compiler as any)

    const handler = getLoaderHandler()
    const module: LoaderModule = {
      loaders: [
        { loader: '/abs/node_modules/@mpxjs/webpack-plugin/lib/style-compiler/strip-conditional-loader.js??ruleSet[1]' },
      ],
      resource: '/abs/src/page.mpx?type=styles&lang=css',
    }
    handler?.({}, module)

    const stripIndex = module.loaders.findIndex(entry =>
      entry.loader.includes('@mpxjs/webpack-plugin/lib/style-compiler/strip-conditional-loader'),
    )
    const rewriteIndex = module.loaders.findIndex(entry =>
      isCssImportRewriteLoader(entry),
    )
    expect(stripIndex).toBeGreaterThanOrEqual(0)
    expect(rewriteIndex).toBeGreaterThan(stripIndex)
  })

  it('reorders an existing rewrite loader so it runs before the mpx style compiler', () => {
    testState.currentContext = createContext({ appType: 'mpx', rewriteCssImports: true } as any)
    testState.currentContext.tailwindRuntime.majorVersion = 4
    createCompilerContextMock.mockImplementation(() => testState.currentContext)
    const { compiler, getLoaderHandler } = createCompilerWithLoaderTracking()
    const plugin = new WeappTailwindcss()
    plugin.apply(compiler as any)

    const handler = getLoaderHandler()
    const module: LoaderModule = {
      loaders: [
        { loader: CSS_IMPORT_REWRITE_LOADER_PATH },
        { loader: '/abs/node_modules/@mpxjs/webpack-plugin/lib/style-compiler/index.js??ruleSet[0]' },
      ],
      resource: '/abs/src/page.mpx?type=styles&lang=css',
    }

    handler?.({}, module)

    const styleIndex = module.loaders.findIndex(entry => entry.loader?.includes('@mpxjs/webpack-plugin/lib/style-compiler/index'))
    const rewriteIndex = module.loaders.findIndex(entry => isCssImportRewriteLoader(entry))
    expect(styleIndex).toBeGreaterThanOrEqual(0)
    expect(rewriteIndex).toBeGreaterThan(styleIndex)
    expect(module.loaders.filter(entry => isCssImportRewriteLoader(entry))).toHaveLength(1)
  })

  it('falls back to css matcher when anchor is missing', () => {
    testState.currentContext = createContext({ appType: 'mpx', rewriteCssImports: true } as any)
    testState.currentContext.tailwindRuntime.majorVersion = 4
    createCompilerContextMock.mockReturnValue(testState.currentContext)
    const { compiler, getLoaderHandler } = createCompilerWithLoaderTracking()
    const plugin = new WeappTailwindcss()
    plugin.apply(compiler as any)

    const handler = getLoaderHandler()
    const module: LoaderModule = {
      loaders: [],
      resource: '/abs/src/app.css',
    } as any

    handler?.({}, module)
    const rewriteLoaderEntry = module.loaders.find(entry => isCssImportRewriteLoader(entry))
    const classSetLoaderEntry = module.loaders.find(entry => entry.loader === testState.currentContext.runtimeLoaderPath)
    expect(rewriteLoaderEntry).toBeDefined()
    expect(classSetLoaderEntry).toBeDefined()
    // rewrite should execute before class-set (right-to-left), so rewrite is appended, class-set unshifted.
    const lastIndex = module.loaders.length - 1
    expect(module.loaders[lastIndex]).toBe(rewriteLoaderEntry)
    expect(module.loaders[0]).toBe(classSetLoaderEntry)
  })

  it('treats resources with queries as css modules', () => {
    testState.currentContext = createContext({ rewriteCssImports: true } as any)
    testState.currentContext.tailwindRuntime.majorVersion = 4
    createCompilerContextMock.mockReturnValue(testState.currentContext)
    const { compiler, getLoaderHandler } = createCompilerWithLoaderTracking()
    const plugin = new WeappTailwindcss()
    plugin.apply(compiler as any)

    const handler = getLoaderHandler()
    const module: LoaderModule = {
      loaders: [],
      resource: '/abs/app.css?type=styles',
    }

    handler?.({}, module)
    const rewriteLoaderEntry = module.loaders.find(entry => isCssImportRewriteLoader(entry))
    const classSetLoaderEntry = module.loaders.find(entry => entry.loader.includes(testState.currentContext.runtimeLoaderPath))
    expect(rewriteLoaderEntry).toBeDefined()
    expect(classSetLoaderEntry).toBeDefined()
  })

  it('injects rewrite loader for preprocessor and SFC style modules', () => {
    testState.currentContext = createContext({ rewriteCssImports: true } as any)
    testState.currentContext.tailwindRuntime.majorVersion = 4
    createCompilerContextMock.mockReturnValue(testState.currentContext)
    const { compiler, getLoaderHandler } = createCompilerWithLoaderTracking()
    const plugin = new WeappTailwindcss()
    plugin.apply(compiler as any)

    const handler = getLoaderHandler()
    const scssModule: LoaderModule = {
      loaders: [{ loader: '/path/sass-loader.js' }],
      resource: '/abs/app.scss?inline',
    }
    const sfcLessModule: LoaderModule = {
      loaders: [{ loader: '/path/less-loader.js' }],
      resource: '/abs/component.vue?vue&type=style&index=0&lang=less',
    }

    handler?.({}, scssModule)
    handler?.({}, sfcLessModule)

    expect(scssModule.loaders.find(entry => isCssImportRewriteLoader(entry))).toBeDefined()
    expect(sfcLessModule.loaders.find(entry => isCssImportRewriteLoader(entry))).toBeDefined()
  })

  it('walks loader debug branches for app and page css modules', () => {
    const previousDebug = process.env.WEAPP_TW_LOADER_DEBUG
    process.env.WEAPP_TW_LOADER_DEBUG = '1'
    try {
      testState.currentContext = createContext({ rewriteCssImports: true } as any)
      createCompilerContextMock.mockReturnValue(testState.currentContext)
      const { compiler, getLoaderHandler } = createCompilerWithLoaderTracking()
      const plugin = new WeappTailwindcss()
      plugin.apply(compiler as any)

      const handler = getLoaderHandler()
      const appModule: LoaderModule = {
        loaders: [{ loader: '/path/postcss-loader.js' }],
        resource: '/abs/src/app.css',
      }
      const pageModule: LoaderModule = {
        loaders: [{ loader: '/path/postcss-loader.js' }],
        resource: '/abs/src/page.css',
      }

      handler?.({}, appModule)
      handler?.({}, pageModule)

      expect(appModule.loaders.some(entry => entry.loader === testState.currentContext.runtimeLoaderPath)).toBe(true)
      expect(pageModule.loaders.some(entry => entry.loader === testState.currentContext.runtimeLoaderPath)).toBe(true)
    }
    finally {
      if (previousDebug === undefined) {
        delete process.env.WEAPP_TW_LOADER_DEBUG
      }
      else {
        process.env.WEAPP_TW_LOADER_DEBUG = previousDebug
      }
    }
  })

  it('detects mpx style modules via resource query', () => {
    testState.currentContext = createContext({ appType: 'mpx', rewriteCssImports: true } as any)
    testState.currentContext.tailwindRuntime.majorVersion = 4
    createCompilerContextMock.mockReturnValue(testState.currentContext)
    const { compiler, getLoaderHandler } = createCompilerWithLoaderTracking()
    const plugin = new WeappTailwindcss()
    plugin.apply(compiler as any)

    const handler = getLoaderHandler()
    const module: LoaderModule = {
      loaders: [],
      resource: '/abs/src/page.mpx?type=styles&lang=css',
    }

    handler?.({}, module)
    const classSetLoaderEntry = module.loaders.find(entry => entry.loader.includes(testState.currentContext.runtimeLoaderPath))
    expect(classSetLoaderEntry).toBeDefined()
  })

  it('avoids inserting duplicate rewrite loaders when already present', () => {
    testState.currentContext = createContext({ rewriteCssImports: true } as any)
    testState.currentContext.tailwindRuntime.majorVersion = 4
    createCompilerContextMock.mockReturnValue(testState.currentContext)
    const { compiler, getLoaderHandler } = createCompilerWithLoaderTracking()
    const plugin = new WeappTailwindcss()
    plugin.apply(compiler as any)

    const handler = getLoaderHandler()
    const module: LoaderModule = {
      loaders: [
        { loader: `${CSS_IMPORT_REWRITE_LOADER_PATH}??ruleSet[0].rules[0]` },
      ],
      resource: '/abs/app.css',
    }

    handler?.({}, module)
    const rewriteLoaders = module.loaders.filter(entry => isCssImportRewriteLoader(entry))
    expect(rewriteLoaders).toHaveLength(1)
  })

})
