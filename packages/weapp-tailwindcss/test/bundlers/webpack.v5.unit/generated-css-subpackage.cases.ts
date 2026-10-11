import { describe, expect, it, vi } from 'vitest'
import { getDefaultCssPreflight } from '@/defaults'
import type { LoaderModule } from './shared'
import { setupWebpackV5UnitTest, FakeConcatSource, createAssetsFromStore, createContext, fs, getWebpackLoaderRuntime, mkdir, mkdtemp, os, path, rm, testState, WeappTailwindcss, writeFile } from './shared'

function toPosixPath(value: string) {
  return value.replace(/\\/g, '/')
}

describe('bundlers/webpack WeappTailwindcss / generated css subpackages', () => {
  setupWebpackV5UnitTest()
  it('scopes webpack Tailwind v4 subpackage css generation to each config content entry', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-webpack-v4-subpackage-'))
    const srcDir = path.join(dir, 'src')
    const appCss = path.join(srcDir, 'app.wxss')
    const moduleBCss = path.join(srcDir, 'moduleB/pages/index.wxss')
    const moduleCCss = path.join(srcDir, 'moduleC/pages/index.wxss')
    const subNormalCss = path.join(srcDir, 'sub-normal/pages/index.css')
    const appWxml = path.join(srcDir, 'pages/index/index.wxml')
    const moduleBWxml = path.join(srcDir, 'moduleB/pages/index.wxml')
    const moduleCWxml = path.join(srcDir, 'moduleC/pages/index.wxml')
    const subNormalWxml = path.join(srcDir, 'sub-normal/pages/index.wxml')
    await fs.promises.mkdir(path.dirname(appWxml), { recursive: true })
    await fs.promises.mkdir(path.dirname(moduleBWxml), { recursive: true })
    await fs.promises.mkdir(path.dirname(moduleCWxml), { recursive: true })
    await fs.promises.mkdir(path.dirname(subNormalWxml), { recursive: true })
    await writeFile(path.join(dir, 'tailwind.config.js'), 'module.exports = { content: ["./src/pages/**/*.{wxml,ts}"] }')
    await writeFile(path.join(dir, 'tailwind.config.sub-b.js'), 'module.exports = { content: ["./src/moduleB/**/*.{wxml,ts}"] }')
    await writeFile(path.join(dir, 'tailwind.config.sub-c.js'), 'module.exports = { content: ["./src/moduleC/**/*.{wxml,ts}"] }')
    await writeFile(path.join(dir, 'tailwind.config.sub-normal.js'), 'module.exports = { content: ["./src/sub-normal/**/*.{wxml,ts}"] }')
    await writeFile(appCss, [
      '@config "../tailwind.config.js";',
      '@tailwind utilities;',
    ].join('\n'))
    await writeFile(moduleBCss, [
      '@config "../../../tailwind.config.sub-b.js";',
      '@tailwind utilities;',
    ].join('\n'))
    await writeFile(moduleCCss, [
      '@config "../../../tailwind.config.sub-c.js";',
      '@tailwind utilities;',
    ].join('\n'))
    await writeFile(subNormalCss, [
      '@import "tailwindcss/base";',
      '@import "tailwindcss/components";',
      '@import "tailwindcss/utilities";',
      '@config "../../../tailwind.config.sub-normal.js";',
    ].join('\n'))
    await writeFile(appWxml, '<view class="app-only"></view>')
    await writeFile(moduleBWxml, '<view class="module-b-only"></view>')
    await writeFile(moduleCWxml, '<view class="module-c-only"></view>')
    await writeFile(subNormalWxml, '<view class="normal-only"></view>')

    const generateMock = vi.fn(async ({ candidates, source }: { candidates: Set<string>, source?: { css?: string } }) => {
      const shouldEmitPreflight = source?.css?.includes('tailwindcss/base') === true
        || /@import\s+["']tailwindcss["']/.test(source?.css ?? '')
      const css = [
        ...(shouldEmitPreflight ? ['view,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border:0 solid}'] : []),
        ...[...candidates].sort().map(candidate => `.${candidate}{display:block}`),
      ].join('\n')
      return {
        css,
        rawCss: css,
        target: 'weapp',
        classSet: new Set(candidates),
        dependencies: [],
        sources: [],
        root: null,
      }
    })
    vi.resetModules()
    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn((source: any) => ({
        generate: (options: any) => generateMock({
          ...options,
          source,
        }),
      })),
      normalizeWeappTailwindcssGeneratorOptions: vi.fn(() => ({
        enabled: true,
        target: 'weapp',
        styleOptions: {},
      })),
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: dir,
        base: dir,
        baseFallbacks: [],
        css: options.css,
        config: options.config,
        dependencies: options.config ? [options.config] : [],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: dir,
        base: dir,
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: dir,
        baseFallbacks: [],
      })),
    }))

    try {
      const { WeappTailwindcss: MockedWeappTailwindcss } = await import('@/bundlers/webpack/BaseUnifiedPlugin/v5')
      testState.currentContext = createContext({
        cssMatcher: (file: string) => file.endsWith('.wxss') || file.includes('.css'),
        mainCssChunkMatcher: vi.fn(() => true),
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
        tailwindcssBasedir: dir,
        tailwindRuntime: {
          ...createContext().tailwindRuntime,
          majorVersion: 4,
        },
      } as any)

      const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
      let assetStore: Record<string, string> = {
        'app.wxss': '@tailwind utilities;',
        'moduleB/pages/index.wxss': '@tailwind utilities;',
        'moduleC/pages/index.wxss': '@tailwind utilities;',
        'sub-normal/pages/index.wxss': '@tailwind utilities;',
      }
      const compilation = {
        compiler: { outputPath: path.join(dir, 'dist') },
        chunks: [
          { id: 'app', hash: 'hash-app', files: ['app.wxss'] },
          { id: 'module-b', hash: 'hash-module-b', files: ['moduleB/pages/index.wxss'] },
          { id: 'module-c', hash: 'hash-module-c', files: ['moduleC/pages/index.wxss'] },
          { id: 'sub-normal', hash: 'hash-sub-normal', files: ['sub-normal/pages/index.wxss'] },
        ],
        chunkGraph: {
          getChunkModulesIterable: (chunk: { id?: string }) => {
            if (chunk.id === 'app') {
              return [{ resource: appCss }]
            }
            if (chunk.id === 'module-b') {
              return [{ resource: moduleBCss }]
            }
            if (chunk.id === 'module-c') {
              return [{ resource: moduleCCss }]
            }
            if (chunk.id === 'sub-normal') {
              return [{ resource: subNormalCss }]
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
        outputPath: path.join(dir, 'dist'),
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
                tap: vi.fn(),
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
      const loaderHook = compiler.webpack.NormalModule.getCompilationHooks.mock.results[0]?.value?.loader?.tap.mock.calls[0]?.[1]
      const appModule: LoaderModule = {
        resource: appCss,
        loaders: [{ loader: '/path/postcss-loader.js' }],
      }
      const moduleBModule: LoaderModule = {
        resource: moduleBCss,
        loaders: [{ loader: '/path/postcss-loader.js' }],
      }
      const moduleCModule: LoaderModule = {
        resource: moduleCCss,
        loaders: [{ loader: '/path/postcss-loader.js' }],
      }
      const subNormalModule: LoaderModule = {
        resource: subNormalCss,
        loaders: [{ loader: '/path/postcss-loader.js' }],
      }
      loaderHook?.({}, appModule)
      loaderHook?.({}, moduleBModule)
      loaderHook?.({}, moduleCModule)
      loaderHook?.({}, subNormalModule)
      for (const [module, cssFile] of [
        [appModule, appCss],
        [moduleBModule, moduleBCss],
        [moduleCModule, moduleCCss],
        [subNormalModule, subNormalCss],
      ] as const) {
        const classSetLoaderEntry = module.loaders.find(entry => entry.loader === testState.currentContext.runtimeLoaderPath)
        const loaderRuntime = getWebpackLoaderRuntime(classSetLoaderEntry?.options?.weappTailwindcssRuntimeKey)
        loaderRuntime?.classSet?.registerCssSourceFile?.({
          file: cssFile,
          css: await fs.promises.readFile(cssFile, 'utf8'),
        })
      }
      await processAssetsCallbacks[0](createAssetsFromStore(assetStore))

      const callsByFile = new Map<string, Set<string>>()
      for (const call of generateMock.mock.calls) {
        const source = call[0]?.source
        const config = source?.config
          ?? [
            'tailwind.config.sub-normal.js',
            'tailwind.config.sub-b.js',
            'tailwind.config.sub-c.js',
            'tailwind.config.js',
          ]
            .map(file => path.join(dir, file))
            .find(file => source?.css?.includes(toPosixPath(file)) || source?.css?.includes(file))
        callsByFile.set(config ? toPosixPath(config) : config, call[0]?.candidates as Set<string>)
      }
      expect(callsByFile.get(toPosixPath(path.join(dir, 'tailwind.config.js')))).toEqual(new Set(['app-only']))
      expect(callsByFile.get(toPosixPath(path.join(dir, 'tailwind.config.sub-b.js')))).toEqual(new Set(['module-b-only']))
      expect(callsByFile.get(toPosixPath(path.join(dir, 'tailwind.config.sub-c.js')))).toEqual(new Set(['module-c-only']))
      expect(callsByFile.get(toPosixPath(path.join(dir, 'tailwind.config.sub-normal.js')))).toEqual(new Set(['normal-only']))
    }
    finally {
      vi.doUnmock('@/generator')
      vi.resetModules()
      await rm(dir, { force: true, recursive: true })
    }
  })

  it('does not merge main runtime candidates into webpack Tailwind v4 subpackage css', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-webpack-v4-subpackage-runtime-'))
    const srcDir = path.join(dir, 'src')
    const subNormalCss = path.join(srcDir, 'sub-normal/pages/index.css')
    const appCss = path.join(srcDir, 'app.css')
    const appWxml = path.join(srcDir, 'pages/index/index.wxml')
    const subNormalWxml = path.join(srcDir, 'sub-normal/pages/index.wxml')
    await fs.promises.mkdir(path.dirname(appWxml), { recursive: true })
    await fs.promises.mkdir(path.dirname(subNormalWxml), { recursive: true })
    await writeFile(path.join(dir, 'tailwind.config.js'), 'module.exports = { content: ["./src/pages/**/*.{wxml,ts}"] }')
    await writeFile(path.join(dir, 'tailwind.config.sub-normal.js'), [
      'module.exports = {',
      '  content: ["./src/sub-normal/**/*.{wxml,ts}"],',
      '  theme: { extend: { colors: { "normal-subpackage-marker": "#2563eb" } } },',
      '}',
    ].join('\n'))
    await writeFile(subNormalCss, [
      '@layer theme, utilities;',
      '@import "tailwindcss/theme.css" layer(theme);',
      '@import "tailwindcss/utilities.css" layer(utilities) source(none);',
      '@config "../../../tailwind.config.sub-normal.js";',
    ].join('\n'))
    await writeFile(appCss, [
      '@import "tailwindcss" source(none);',
      '@config "../tailwind.config.js";',
    ].join('\n'))
    await writeFile(appWxml, '<view class="main-only"></view>')
    await writeFile(subNormalWxml, '<view class="bg-normal-subpackage-marker sub-only"></view>')

    const generateMock = vi.fn(async ({ candidates }: { candidates: Set<string> }) => ({
      css: [
        'view,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border:0 solid}',
        ...[...candidates].sort().map(candidate => `.${candidate}{display:block}`),
      ].join('\n'),
      rawCss: [
        'view,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border:0 solid}',
        ...[...candidates].sort().map(candidate => `.${candidate}{display:block}`),
      ].join('\n'),
      target: 'weapp',
      classSet: new Set(candidates),
      dependencies: [],
      sources: [],
      root: null,
    }))
    vi.resetModules()
    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn((source: any) => ({
        generate: (options: any) => generateMock({
          ...options,
          source,
        }),
      })),
      normalizeWeappTailwindcssGeneratorOptions: vi.fn(() => ({
        enabled: true,
        target: 'weapp',
        styleOptions: {},
      })),
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: dir,
        base: dir,
        baseFallbacks: [],
        css: options.css,
        config: options.config,
        dependencies: options.config ? [options.config] : [],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: dir,
        base: dir,
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: dir,
        baseFallbacks: [],
      })),
    }))

    try {
      const { WeappTailwindcss: MockedWeappTailwindcss } = await import('@/bundlers/webpack/BaseUnifiedPlugin/v5')
      testState.currentContext = createContext({
        cssMatcher: (file: string) => file.endsWith('.wxss') || file.includes('.css'),
        mainCssChunkMatcher: vi.fn((file: string) => file === 'app.wxss'),
        cssPreflight: getDefaultCssPreflight(),
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
        tailwindcssBasedir: dir,
        tailwindRuntime: {
          getClassSet: vi.fn(async () => new Set(['main-only', 'bg-normal-subpackage-marker', 'sub-only'])),
          getClassSetSync: vi.fn(() => new Set(['main-only', 'bg-normal-subpackage-marker', 'sub-only'])),
          extract: vi.fn(async () => ({ classSet: new Set(['main-only', 'bg-normal-subpackage-marker', 'sub-only']) })),
          majorVersion: 4,
          options: {
            tailwindcss: {
              v4: {
                cssEntries: [appCss, subNormalCss],
              },
            },
          },
        },
      } as any)

      const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
      let assetStore: Record<string, string> = {
        'app.wxss': '@tailwind utilities;',
      }
      const compilation = {
        compiler: { outputPath: path.join(dir, 'dist') },
        chunks: [{ id: 'app', hash: 'hash-1', files: Object.keys(assetStore) }],
        chunkGraph: {
          getChunkModulesIterable: (chunk: { id?: string }) => {
            if (chunk.id === 'app') {
              return [{ resource: appCss }]
            }
            if (chunk.id === 'sub-normal') {
              return [{ resource: subNormalCss }]
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
        outputPath: path.join(dir, 'dist'),
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
                tap: vi.fn(),
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
      const loaderHook = compiler.webpack.NormalModule.getCompilationHooks.mock.results[0]?.value?.loader?.tap.mock.calls[0]?.[1]
      const appModule: LoaderModule = {
        resource: `${appCss}?type=style`,
        loaders: [{ loader: '/path/postcss-loader.js' }],
      }
      const subNormalModule: LoaderModule = {
        resource: `${subNormalCss}?type=style`,
        loaders: [{ loader: '/path/postcss-loader.js' }],
      }
      loaderHook?.({}, appModule)
      loaderHook?.({}, subNormalModule)
      for (const [module, cssFile] of [
        [appModule, appCss],
        [subNormalModule, subNormalCss],
      ] as const) {
        const classSetLoaderEntry = module.loaders.find(entry => entry.loader === testState.currentContext.runtimeLoaderPath)
        const loaderRuntime = getWebpackLoaderRuntime(classSetLoaderEntry?.options?.weappTailwindcssRuntimeKey)
        loaderRuntime?.classSet?.registerCssSourceFile?.({
          file: cssFile,
          css: await fs.promises.readFile(cssFile, 'utf8'),
        })
      }
      await processAssetsCallbacks[0](createAssetsFromStore(assetStore))
      const appWxss = assetStore['app.wxss']
      assetStore = {
        'sub-normal/pages/index.wxss': '@tailwind utilities;',
      }
      compilation.chunks[0] = { id: 'sub-normal', hash: 'hash-2', files: Object.keys(assetStore) }
      await processAssetsCallbacks[0](createAssetsFromStore(assetStore))

      expect(generateMock.mock.calls).toHaveLength(2)
      expect(generateMock.mock.calls[0]?.[0]?.candidates).toEqual(new Set(['main-only']))
      expect(generateMock.mock.calls[1]?.[0]?.candidates).toEqual(new Set(['bg-normal-subpackage-marker', 'sub-only']))
      expect(appWxss).toContain('.main-only')
      expect(assetStore['sub-normal/pages/index.wxss']).toContain('.bg-normal-subpackage-marker')
      expect(assetStore['sub-normal/pages/index.wxss']).toContain('.sub-only')
      expect(assetStore['sub-normal/pages/index.wxss']).not.toContain('.main-only')
      expect(assetStore['sub-normal/pages/index.wxss']).toContain('view,text,::after,::before')
      expect(assetStore['sub-normal/pages/index.wxss']).toContain('box-sizing:border-box')
    }
    finally {
      vi.doUnmock('@/generator')
      vi.resetModules()
      await rm(dir, { force: true, recursive: true })
    }
  })

  it('keeps explicit Taro independent subpackage cssEntries isolated by webpack asset resource', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-webpack-v4-issue-951-'))
    const srcDir = path.join(dir, 'src')
    const appCss = path.join(srcDir, 'app.css')
    const subACss = path.join(srcDir, 'sub-a/pages/index.css')
    const subBCss = path.join(srcDir, 'sub-b/pages/index.css')
    const appWxml = path.join(srcDir, 'pages/index/index.wxml')
    const subAWxml = path.join(srcDir, 'sub-a/pages/index.wxml')
    const subBWxml = path.join(srcDir, 'sub-b/pages/index.wxml')
    await fs.promises.mkdir(path.dirname(appWxml), { recursive: true })
    await fs.promises.mkdir(path.dirname(subAWxml), { recursive: true })
    await fs.promises.mkdir(path.dirname(subBWxml), { recursive: true })
    await writeFile(appCss, [
      '@import "tailwindcss" source(none);',
      '@source "./pages/**/*.{wxml,ts}";',
    ].join('\n'))
    await writeFile(subACss, [
      '@import "tailwindcss" source(none);',
      '@source "./**/*.{wxml,ts}";',
    ].join('\n'))
    await writeFile(subBCss, [
      '@import "tailwindcss" source(none);',
      '@source "./**/*.{wxml,ts}";',
    ].join('\n'))
    await writeFile(appWxml, '<view class="main-only"></view>')
    await writeFile(subAWxml, '<view class="sub-a-only"></view>')
    await writeFile(subBWxml, '<view class="sub-b-only"></view>')

    const generateMock = vi.fn(async ({ candidates, source }: { candidates: Set<string>, source: { css?: string } }) => ({
      css: [...candidates].sort().map(candidate => `.${candidate}{display:block}`).join('\n'),
      rawCss: [...candidates].sort().map(candidate => `.${candidate}{display:block}`).join('\n'),
      target: 'weapp',
      classSet: new Set(candidates),
      dependencies: [],
      sources: [],
      root: null,
      sourceCss: source.css,
    }))
    vi.resetModules()
    vi.doMock('@/generator', () => ({
      createWeappTailwindcssGenerator: vi.fn((source: any) => ({
        generate: (options: any) => generateMock({
          ...options,
          source,
        }),
      })),
      normalizeWeappTailwindcssGeneratorOptions: vi.fn(() => ({
        enabled: true,
        target: 'weapp',
        styleOptions: {},
      })),
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: dir,
        base: dir,
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: dir,
        base: dir,
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: dir,
        baseFallbacks: [],
      })),
    }))

    try {
      const { WeappTailwindcss: MockedWeappTailwindcss } = await import('@/bundlers/webpack/BaseUnifiedPlugin/v5')
      const allClasses = new Set(['main-only', 'sub-a-only', 'sub-b-only'])
      testState.currentContext = createContext({
        rewriteCssImports: true,
        cssMatcher: (file: string) => file.endsWith('.wxss') || file.includes('.css'),
        mainCssChunkMatcher: vi.fn(() => true),
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
        tailwindcssBasedir: dir,
        tailwindRuntime: {
          getClassSet: vi.fn(async () => allClasses),
          getClassSetSync: vi.fn(() => allClasses),
          extract: vi.fn(async () => ({ classSet: allClasses })),
          collectContentTokens: vi.fn(async (entries?: Array<{ base?: string, pattern?: string }>) => {
            const base = entries?.map(entry => `${entry.base ?? ''}/${entry.pattern ?? ''}`).join('\n') ?? ''
            const sourceText = base || entries?.map(entry => String(entry)).join('\n') || ''
            if (sourceText.includes('/sub-a/')) {
              return { candidates: new Set(['sub-a-only']), sourcesByToken: new Map([['sub-a-only', new Set([subAWxml])]]) }
            }
            if (sourceText.includes('/sub-b/')) {
              return { candidates: new Set(['sub-b-only']), sourcesByToken: new Map([['sub-b-only', new Set([subBWxml])]]) }
            }
            if (sourceText.includes('/pages/')) {
              return { candidates: new Set(['main-only']), sourcesByToken: new Map([['main-only', new Set([appWxml])]]) }
            }
            return {
              candidates: allClasses,
              sourcesByToken: new Map([
                ['main-only', new Set([appWxml])],
                ['sub-a-only', new Set([subAWxml])],
                ['sub-b-only', new Set([subBWxml])],
              ]),
            }
          }),
          majorVersion: 4,
          options: {
            tailwindcss: {
              v4: {
                cssEntries: [appCss, subACss, subBCss],
              },
            },
          },
        },
      } as any)

      const processAssetsCallbacks: Array<(assets: Record<string, any>) => Promise<void>> = []
      let assetStore: Record<string, string> = {
        'app.wxss': '@tailwind utilities;',
        'pages/index/index.wxss': '.page-local{display:block}',
      }
      const compilation = {
        compiler: { outputPath: path.join(dir, 'dist') },
        chunks: [
          { id: 'app', hash: 'hash-app', files: ['app.wxss'] },
          { id: 'page', hash: 'hash-page', files: ['pages/index/index.wxss'] },
        ],
        chunkGraph: {
          getChunkModulesIterable: (chunk: { id?: string }) => {
            if (chunk.id === 'app') {
              return [{ resource: appCss }]
            }
            if (chunk.id === 'page') {
              return []
            }
            if (chunk.id === 'sub-a') {
              return [{ resource: subACss }]
            }
            if (chunk.id === 'sub-b') {
              return [{ resource: subBCss }]
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
        outputPath: path.join(dir, 'dist'),
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
                tap: vi.fn(),
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
      const loaderHook = compiler.webpack.NormalModule.getCompilationHooks.mock.results[0]?.value?.loader?.tap.mock.calls[0]?.[1]
      const appModule: LoaderModule = {
        resource: `${appCss}?type=style`,
        loaders: [{ loader: '/path/postcss-loader.js' }],
      }
      const subAModule: LoaderModule = {
        resource: `${subACss}?type=style`,
        loaders: [{ loader: '/path/postcss-loader.js' }],
      }
      const subBModule: LoaderModule = {
        resource: `${subBCss}?type=style`,
        loaders: [{ loader: '/path/postcss-loader.js' }],
      }
      loaderHook?.({}, appModule)
      loaderHook?.({}, subAModule)
      loaderHook?.({}, subBModule)
      for (const [module, cssFile] of [
        [appModule, appCss],
        [subAModule, subACss],
        [subBModule, subBCss],
      ] as const) {
        const classSetLoaderEntry = module.loaders.find(entry => entry.loader === testState.currentContext.runtimeLoaderPath)
        const loaderRuntime = getWebpackLoaderRuntime(classSetLoaderEntry?.options?.weappTailwindcssRuntimeKey)
        loaderRuntime?.classSet?.registerCssSourceFile?.({
          file: cssFile,
          css: await fs.promises.readFile(cssFile, 'utf8'),
        })
        const rewriteLoaderEntry = module.loaders.find(entry => entry.loader?.includes('weapp-tw-css-import-rewrite-loader'))
        const rewriteRuntime = getWebpackLoaderRuntime(rewriteLoaderEntry?.options?.tailwindcssImportRewriteRuntimeKey)
        const css = cssFile === appCss
          ? '.main-only{display:block}'
          : cssFile === subACss
            ? '.sub-a-only{display:block}'
            : '.sub-b-only{display:block}'
        rewriteRuntime?.cssImportRewrite?.registerGeneratedCss?.({
          classSet: new Set(cssFile === appCss
            ? ['main-only']
            : cssFile === subACss
              ? ['sub-a-only']
              : ['sub-b-only']),
          css,
          dependencies: [],
          file: cssFile,
        })
      }
      await processAssetsCallbacks[0](createAssetsFromStore(assetStore))
      const appWxss = assetStore['app.wxss']
      const pageWxss = assetStore['pages/index/index.wxss']

      assetStore = {
        'sub-a/pages/index.wxss': '@tailwind utilities;',
      }
      compilation.chunks = [
        { id: 'sub-a', hash: 'hash-sub-a', files: ['sub-a/pages/index.wxss'] },
      ]
      await processAssetsCallbacks[0](createAssetsFromStore(assetStore))
      const subAWxss = assetStore['sub-a/pages/index.wxss']

      assetStore = {
        'sub-b/pages/index.wxss': '@tailwind utilities;',
      }
      compilation.chunks = [
        { id: 'sub-b', hash: 'hash-sub-b', files: ['sub-b/pages/index.wxss'] },
      ]
      await processAssetsCallbacks[0](createAssetsFromStore(assetStore))
      const subBWxss = assetStore['sub-b/pages/index.wxss']

      expect(appWxss).toContain('.main-only')
      expect(appWxss).not.toContain('.sub-a-only')
      expect(appWxss).not.toContain('.sub-b-only')
      expect(pageWxss).toContain('.page-local')
      expect(pageWxss).not.toContain('.main-only')
      expect(pageWxss).not.toContain('.sub-a-only')
      expect(pageWxss).not.toContain('.sub-b-only')
      expect(subAWxss).toContain('.sub-a-only')
      expect(subAWxss).not.toContain('.main-only')
      expect(subAWxss).not.toContain('.sub-b-only')
      expect(subBWxss).toContain('.sub-b-only')
      expect(subBWxss).not.toContain('.main-only')
      expect(subBWxss).not.toContain('.sub-a-only')
      expect(generateMock).toHaveBeenCalledTimes(3)
      const subACall = generateMock.mock.calls.find(call => call[0]?.candidates?.has('sub-a-only'))
      const subBCall = generateMock.mock.calls.find(call => call[0]?.candidates?.has('sub-b-only'))
      expect(subACall?.[0]?.scanSources).toBe(false)
      expect(subBCall?.[0]?.scanSources).toBe(false)
    }
    finally {
      vi.doUnmock('@/generator')
      vi.resetModules()
      await rm(dir, { force: true, recursive: true })
    }
  })

})
