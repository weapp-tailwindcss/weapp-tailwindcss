import type { OutputAsset, OutputChunk } from 'rollup'
import type { HmrContext, Plugin, ResolvedConfig, TransformResult } from 'vite'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uniAppXCssPipelineStrategy } from '@/bundlers/vite/frameworks/uni-app-x'
import { replaceWxml } from '@/wxml'
import {
  createContext,
  createRollupChunk,
  getCurrentContext,
  getTransformUVueMock,
  resetVitePluginTestContext,
  setCurrentContext,
} from './vite-plugin.testkit'

const TEST_TIMEOUT_MS = 30000

async function loadWeappTailwindcssPlugin() {
  const mod = await import('@/bundlers/vite')
  return mod.WeappTailwindcss
}

function getGenerateBundleHandler(plugin: Plugin) {
  const hook = plugin.generateBundle as any
  return typeof hook === 'object' ? hook.handler : hook
}

function getTransformHandler(plugin: Plugin) {
  const hook = plugin.transform as any
  return typeof hook === 'object' ? hook.handler : hook
}

function getHotUpdateHandler(plugin: Plugin) {
  const hook = plugin.handleHotUpdate as any
  return typeof hook === 'object' ? hook.handler : hook
}

function createNativeResolvedConfig() {
  return {
    command: 'serve',
    css: { postcss: { plugins: [] } },
    build: { outDir: '/project/unpackage/dist/dev/.uvue/app-android' },
    root: '/project',
  } as unknown as ResolvedConfig
}

describe('bundlers/vite WeappTailwindcss uni-app-x', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('@/bundlers/vite/incremental-runtime-class-set')
    resetVitePluginTestContext()
  })

  it('defers Native SFC apply generation to the source-aware uni-app-x plugin', () => {
    const shouldDefer = uniAppXCssPipelineStrategy.shouldDeferPreTransformTailwindGeneration
    const context = {
      currentGeneratorBranch: {},
      currentGeneratorOptions: {},
      opts: {},
      resolvedConfig: {
        ...createNativeResolvedConfig(),
        build: { outDir: '/project/unpackage/dist/dev/app-plus' },
      },
      resolveStylePlatform: () => 'app-android',
    } as any
    const id = '/project/components/BindClass.uvue?vue&type=style&index=1&scoped=true&lang.css'

    expect(shouldDefer?.({ ...context, code: '.wtu-a { @apply flex; }', id })).toBe(true)
    expect(shouldDefer?.({ ...context, code: '@import "tailwindcss";\n.wtu-a { @apply flex; }', id })).toBe(false)
    expect(shouldDefer?.({ ...context, code: '.author { color: red; }', id })).toBe(false)
  })

  it('provides uni-app-x specific transforms', async () => {
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const transformUVueMock = getTransformUVueMock()
    const runtimeSet = new Set(['uvue'])
    const tailwindRuntime = {
      getClassSet: vi.fn(async () => runtimeSet),
      getClassSetSync: vi.fn(() => {
        throw new Error('getClassSetSync is not supported for Tailwind CSS v4 projects. Use getClassSet instead.')
      }),
      extract: vi.fn(async () => ({ classSet: runtimeSet })),
      majorVersion: 4,
    }
    setCurrentContext(createContext({
      uniAppX: { enabled: true },
      tailwindRuntime,
    }))
    const currentContext = getCurrentContext()
    currentContext.onStart = vi.fn()
    currentContext.onEnd = vi.fn()

    const plugins = WeappTailwindcss()
    expect(plugins).toBeDefined()
    const cssPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:css') as Plugin
    const cssPrePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:css:pre') as Plugin
    const nvuePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:nvue') as Plugin
    const sourceCandidatesPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:source-candidates') as Plugin
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin

    expect(plugins!.indexOf(cssPrePlugin)).toBeLessThan(plugins!.findIndex(plugin => plugin.name === 'weapp-tailwindcss:adaptor:rewrite-css-imports'))
    expect(plugins!.indexOf(cssPrePlugin)).toBeLessThan(plugins!.findIndex(plugin => plugin.name === 'weapp-tailwindcss:adaptor:generate:build'))

    expect(cssPlugin?.transform).toBeTypeOf('function')
    expect(cssPrePlugin?.transform).toBeTypeOf('function')
    expect(nvuePlugin?.transform).toMatchObject({ order: 'pre' })
    expect(plugins!.findIndex(plugin => plugin.name === 'weapp-tailwindcss:adaptor:rewrite-css-imports')).toBeLessThan(plugins!.indexOf(sourceCandidatesPlugin))
    expect(plugins!.indexOf(sourceCandidatesPlugin)).toBeLessThan(plugins!.indexOf(nvuePlugin))
    expect(plugins!.indexOf(nvuePlugin)).toBeLessThan(plugins!.findIndex(plugin => plugin.name === 'weapp-tailwindcss:adaptor:generate:build'))

    await (postPlugin.configResolved as any)?.call(postPlugin, createNativeResolvedConfig())
    currentContext.tailwindRuntime.extract.mockClear()
    const cssTransform = cssPlugin.transform as any
    const cssResult = await cssTransform?.call(cssPlugin, '.foo { color: red; }', 'App.uvue?vue&type=style&index=0') as TransformResult
    expect(cssResult).toBeUndefined()
    expect(currentContext.styleHandler).not.toHaveBeenCalled()

    const nvueBuildStart = nvuePlugin.buildStart as any
    await nvueBuildStart?.call(nvuePlugin)
    expect(currentContext.tailwindRuntime.extract).toHaveBeenCalledTimes(1)
    expect(currentContext.tailwindRuntime.getClassSetSync).not.toHaveBeenCalled()
    const nvueTransform = getTransformHandler(nvuePlugin)
    const nvueResult = await nvueTransform?.call(nvuePlugin, 'console.log("x")', 'App.nvue')
    expect(currentContext.tailwindRuntime.extract).toHaveBeenCalledTimes(1)
    expect(currentContext.tailwindRuntime.getClassSetSync).not.toHaveBeenCalled()
    expect(transformUVueMock).toHaveBeenCalledWith(
      'console.log("x")',
      'App.nvue',
      currentContext.jsHandler,
      runtimeSet,
      expect.objectContaining({ enablePageLocalStyle: true }),
    )
    expect(nvueResult).toEqual({ code: 'uvue:App.nvue:console.log("x")' })

    const bundle = {
      'index.js': createRollupChunk('const answer = "text-[#424242]"'),
      'index.asset.js': {
        type: 'asset',
        fileName: 'index.js',
        source: 'console.log("text-[#565656]")',
        name: undefined,
        needsCodeReference: false,
        names: [] as string[],
        originalFileName: null,
        originalFileNames: [] as string[],
      } satisfies OutputAsset,
    }

    const generateBundle = getGenerateBundleHandler(postPlugin)
    await generateBundle?.call(postPlugin, {} as any, bundle)
    expect(currentContext.tailwindRuntime.extract).toHaveBeenCalledTimes(1)
    expect(currentContext.tailwindRuntime.getClassSetSync).not.toHaveBeenCalled()

    expect(currentContext.jsHandler).toHaveBeenCalledWith(
      'const answer = "text-[#424242]"',
      expect.any(Set),
      expect.objectContaining({
        filename: expect.stringContaining('index.js'),
        moduleGraph: expect.objectContaining({
          resolve: expect.any(Function),
          load: expect.any(Function),
        }),
        babelParserOptions: expect.objectContaining({
          sourceFilename: expect.stringContaining('index.js'),
        }),
      }),
    )
    const firstRuntimeSet = (currentContext.jsHandler as any).mock.calls[0][1] as Set<string>
    expect(firstRuntimeSet).toEqual(expect.any(Set))
    expect(firstRuntimeSet.has('uvue')).toBe(true)
    expect(firstRuntimeSet.has('text-[#424242]')).toBe(true)
    expect(firstRuntimeSet.has('text-[#565656]')).toBe(true)
    expect((bundle['index.js'] as any).code).toBe('js:const answer = "text-[#424242]"')
    expect(currentContext.jsHandler).toHaveBeenCalledWith(
      'console.log("text-[#565656]")',
      expect.any(Set),
      expect.objectContaining({
        filename: expect.stringContaining('index.asset.js'),
        moduleGraph: expect.objectContaining({
          resolve: expect.any(Function),
          load: expect.any(Function),
        }),
        babelParserOptions: expect.objectContaining({
          plugins: ['typescript'],
          sourceType: 'unambiguous',
          sourceFilename: expect.stringContaining('index.asset.js'),
        }),
        uniAppX: true,
      }),
    )
    const secondRuntimeSet = (currentContext.jsHandler as any).mock.calls[1][1] as Set<string>
    expect(secondRuntimeSet.has('uvue')).toBe(true)
    expect(secondRuntimeSet.has('text-[#424242]')).toBe(true)
    expect(secondRuntimeSet.has('text-[#565656]')).toBe(true)
    expect((bundle['index.asset.js'] as OutputAsset).source).toBe('js:console.log("text-[#565656]")')
  }, TEST_TIMEOUT_MS)

  it('validates active local-style page candidates outside configured Tailwind sources', async () => {
    const previousUtsPlatform = process.env.UNI_UTS_PLATFORM
    process.env.UNI_UTS_PLATFORM = 'web'
    const validatedCandidates = new Set([
      'bg-[#eccc68]',
      'dark:bg-[#3498db]',
    ])
    const validateCandidatesByGenerator = vi.fn(async () => validatedCandidates)
    vi.doMock('@/generation/index', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generation/index')>()
      return {
        ...actual,
        validateCandidatesByGenerator,
      }
    })

    try {
      const initialRuntimeSet = new Set(['bg-[#eccc68]'])
      setCurrentContext(createContext({
        appType: 'uni-app-x',
        uniAppX: {
          enabled: true,
          componentLocalStyles: {
            enabled: true,
            onlyWhenStyleIsolationVersion2: false,
          },
        },
        tailwindRuntime: {
          getClassSet: vi.fn(async () => initialRuntimeSet),
          getClassSetSync: vi.fn(() => initialRuntimeSet),
          extract: vi.fn(async () => ({ classSet: initialRuntimeSet })),
          majorVersion: 4,
        },
      }))
      const currentContext = getCurrentContext()
      const WeappTailwindcss = await loadWeappTailwindcssPlugin()
      const plugins = WeappTailwindcss()
      const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
      const nvuePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:nvue') as Plugin
      const source = '<template><button class="bg-[#eccc68] dark:bg-[#3498db] dark:not-a-utility-[#bad]" /></template>'
      const id = '/virtual/weapp-tailwindcss-vite-test/src/pages/issue-1091.uvue'

      await (postPlugin.configResolved as any)?.call(postPlugin, {
        command: 'build',
        css: { postcss: { plugins: [] } },
        build: { outDir: 'dist' },
        root: '/virtual/weapp-tailwindcss-vite-test',
      } as ResolvedConfig)
      await getTransformHandler(nvuePlugin)?.call(nvuePlugin, source, id)

      expect(validateCandidatesByGenerator).toHaveBeenCalledWith(expect.objectContaining({
        candidates: expect.any(Set),
        file: id,
      }))
      const extractedCandidates = validateCandidatesByGenerator.mock.calls[0]![0].candidates as Set<string>
      expect(extractedCandidates).toContain('dark:bg-[#3498db]')
      const transformRuntimeSet = getTransformUVueMock().mock.calls.at(-1)?.[3] as Set<string>
      expect(transformRuntimeSet).toContain('bg-[#eccc68]')
      expect(transformRuntimeSet).toContain('dark:bg-[#3498db]')
      expect(transformRuntimeSet).not.toContain('dark:not-a-utility-[#bad]')
      expect(currentContext.tailwindRuntime.extract).toHaveBeenCalled()
    }
    finally {
      if (previousUtsPlatform === undefined) {
        delete process.env.UNI_UTS_PLATFORM
      }
      else {
        process.env.UNI_UTS_PLATFORM = previousUtsPlatform
      }
    }
  }, TEST_TIMEOUT_MS)

  it('skips clean uni-app-x js assets during generateBundle precheck', async () => {
    const runtimeSet = new Set(['text-[#424242]'])
    const syncMock = vi.fn(async () => runtimeSet)
    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: syncMock,
        reset: vi.fn(async () => undefined),
      }),
    }))

    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    setCurrentContext(createContext({
      uniAppX: { enabled: true },
      tailwindRuntime: {
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
      },
    }))
    const currentContext = getCurrentContext()
    const plugins = WeappTailwindcss()
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
    expect(postPlugin).toBeTruthy()

    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'build',
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
      root: process.cwd(),
    } as unknown as ResolvedConfig)

    const bundle = {
      'index.asset.js': {
        type: 'asset',
        fileName: 'index.asset.js',
        source: 'console.log(1)',
        name: undefined,
        needsCodeReference: false,
        names: [] as string[],
        originalFileName: null,
        originalFileNames: [] as string[],
      } satisfies OutputAsset,
    }

    const generateBundle = getGenerateBundleHandler(postPlugin)
    await generateBundle?.call(postPlugin, {} as any, bundle)

    expect(syncMock).toHaveBeenCalledTimes(1)
    expect(currentContext.jsHandler).not.toHaveBeenCalled()
    expect((bundle['index.asset.js'] as OutputAsset).source).toBe('console.log(1)')
  }, TEST_TIMEOUT_MS)

  it('replays cached uni-app-x js asset output on clean incremental bundle rounds', async () => {
    const runtimeSet = new Set(['text-[#424242]'])
    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => runtimeSet),
        reset: vi.fn(async () => undefined),
      }),
    }))

    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    setCurrentContext(createContext({
      uniAppX: { enabled: true },
      jsHandler: vi.fn((code: string) => ({ code: `asset:${code}` })),
      tailwindRuntime: {
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
      },
    }))
    const currentContext = getCurrentContext()
    const plugins = WeappTailwindcss()
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
    expect(postPlugin).toBeTruthy()

    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'serve',
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
      root: process.cwd(),
    } as unknown as ResolvedConfig)

    const createAsset = () => ({
      type: 'asset' as const,
      fileName: 'index.asset.js',
      source: 'const cls = "text-[#424242]"',
      name: undefined,
      needsCodeReference: false,
      names: [] as string[],
      originalFileName: null,
      originalFileNames: [] as string[],
    }) satisfies OutputAsset

    const generateBundle = getGenerateBundleHandler(postPlugin)
    const firstBundle = {
      'index.asset.js': createAsset(),
    }
    await generateBundle?.call(postPlugin, {} as any, firstBundle)
    expect((firstBundle['index.asset.js'] as OutputAsset).source).toBe('asset:const cls = "text-[#424242]"')

    currentContext.jsHandler.mockClear()

    const secondBundle = {
      'index.asset.js': createAsset(),
    }
    await generateBundle?.call(postPlugin, {} as any, secondBundle)

    expect(currentContext.jsHandler).not.toHaveBeenCalled()
    expect((secondBundle['index.asset.js'] as OutputAsset).source).toBe('asset:const cls = "text-[#424242]"')
  }, TEST_TIMEOUT_MS)

  it('reprocesses uni-app-x js assets when linked chunk dependencies change', async () => {
    const rootDir = process.cwd()
    const outDir = `${rootDir}/dist`
    const linkedFile = `${outDir}/chunk.js`
    const runtimeSet = new Set(['text-[#424242]', 'text-[#111111]', 'text-[#222222]'])
    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => runtimeSet),
        reset: vi.fn(async () => undefined),
      }),
    }))

    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    setCurrentContext(createContext({
      uniAppX: { enabled: true },
      jsHandler: vi.fn((code: string, _runtimeSet: Set<string>, options?: { filename?: string }) => {
        if (options?.filename?.endsWith('index.asset.js')) {
          return {
            code: `asset:${code}`,
            linked: {
              [linkedFile]: { code: `linked:${code}` },
            },
          }
        }
        return { code: `chunk:${code}` }
      }),
      tailwindRuntime: {
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
      },
    }))
    const currentContext = getCurrentContext()
    const plugins = WeappTailwindcss()
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
    expect(postPlugin).toBeTruthy()

    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'serve',
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
      root: rootDir,
    } as unknown as ResolvedConfig)

    const createAsset = () => ({
      type: 'asset' as const,
      fileName: 'index.asset.js',
      source: 'const cls = "text-[#424242]"',
      name: undefined,
      needsCodeReference: false,
      names: [] as string[],
      originalFileName: null,
      originalFileNames: [] as string[],
    }) satisfies OutputAsset
    const generateBundle = getGenerateBundleHandler(postPlugin)
    const createChunk = (code: string) => ({
      ...createRollupChunk(code),
      fileName: 'chunk.js',
    }) as OutputChunk

    const firstBundle = {
      'index.asset.js': createAsset(),
      'chunk.js': createChunk('export const dep = "text-[#111111]"'),
    }
    await generateBundle?.call(postPlugin, {} as any, firstBundle)
    expect((firstBundle['chunk.js'] as OutputChunk).code).toBe('linked:const cls = "text-[#424242]"')

    currentContext.jsHandler.mockClear()

    const secondBundle = {
      'index.asset.js': createAsset(),
      'chunk.js': createChunk('export const dep = "text-[#222222]"'),
    }
    await generateBundle?.call(postPlugin, {} as any, secondBundle)

    const assetCalls = currentContext.jsHandler.mock.calls.filter(([, , options]) =>
      (options as any)?.filename?.endsWith('index.asset.js'))
    expect(assetCalls).toHaveLength(1)
    expect((secondBundle['index.asset.js'] as OutputAsset).source).toBe('asset:const cls = "text-[#424242]"')
    expect((secondBundle['chunk.js'] as OutputChunk).code).toBe('linked:const cls = "text-[#424242]"')
  }, TEST_TIMEOUT_MS)

  it('reuses css handler override objects for repeated uni-app-x style transforms', async () => {
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    setCurrentContext(createContext({
      uniAppX: { enabled: true },
    }))
    const currentContext = getCurrentContext()

    const plugins = WeappTailwindcss()
    const cssPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:css') as Plugin
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
    expect(cssPlugin).toBeTruthy()

    await (postPlugin.configResolved as any)?.call(postPlugin, createNativeResolvedConfig())
    const cssTransform = cssPlugin.transform as any
    await cssTransform?.call(cssPlugin, '.foo { color: red; }', '/project/main.css')
    await cssTransform?.call(cssPlugin, '.foo { color: blue; }', '/project/main.css')

    expect(currentContext.styleHandler).toHaveBeenCalledTimes(2)
    expect(currentContext.styleHandler.mock.calls[0]?.[1]).toBe(currentContext.styleHandler.mock.calls[1]?.[1])
  }, TEST_TIMEOUT_MS)

  it('defaults uni-app-x plugin appType to uni-app-x when explicit appType is absent', async () => {
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const mainCssChunkMatcher = vi.fn(() => true)
    setCurrentContext(createContext({
      appType: undefined,
      uniAppX: { enabled: true },
      mainCssChunkMatcher,
    }))

    const plugins = WeappTailwindcss()
    const cssPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:css') as Plugin
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
    expect(cssPlugin).toBeTruthy()

    await (postPlugin.configResolved as any)?.call(postPlugin, createNativeResolvedConfig())
    const cssTransform = cssPlugin.transform as any
    await cssTransform?.call(cssPlugin, '.foo { color: red; }', '/project/main.css')

    expect(mainCssChunkMatcher).toHaveBeenCalledWith('/project/main.css', 'uni-app-x')
  }, TEST_TIMEOUT_MS)

  it('transforms plain uni-app x css without writing native app output files directly', async () => {
    const previousUtsPlatform = process.env.UNI_UTS_PLATFORM
    process.env.UNI_UTS_PLATFORM = 'app-android'
    try {
      const WeappTailwindcss = await loadWeappTailwindcssPlugin()
      setCurrentContext(createContext({
        appType: 'uni-app-x',
        uniAppX: { enabled: true },
        styleHandler: vi.fn(async (code: string) => ({
          css: `handled:${code}`,
          map: {
            toJSON: () => ({
              version: 3,
              file: 'main.css',
              sources: ['main.css'],
              names: [],
              mappings: '',
              sourcesContent: [code],
            }),
          },
        })),
      }))

      const plugins = WeappTailwindcss()
      const cssPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:css') as Plugin
      expect(cssPlugin).toBeTruthy()

      const cssTransform = cssPlugin.transform as any
      const result = await cssTransform?.call({
        ...cssPlugin,
        addWatchFile: vi.fn(),
      }, '.foo { color: red; }', '/project/main.css') as TransformResult

      expect(result?.code).toBe('handled:.foo { color: red; }')
    }
    finally {
      if (previousUtsPlatform === undefined) {
        delete process.env.UNI_UTS_PLATFORM
      }
      else {
        process.env.UNI_UTS_PLATFORM = previousUtsPlatform
      }
    }
  }, TEST_TIMEOUT_MS)

  it('skips uni-app x css module exports emitted by app native css transforms', async () => {
    const previousUtsPlatform = process.env.UNI_UTS_PLATFORM
    process.env.UNI_UTS_PLATFORM = 'app-android'
    try {
      const WeappTailwindcss = await loadWeappTailwindcssPlugin()
      setCurrentContext(createContext({
        appType: 'uni-app-x',
        uniAppX: { enabled: true },
      }))
      const currentContext = getCurrentContext()

      const plugins = WeappTailwindcss()
      const cssPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:css') as Plugin
      expect(cssPlugin).toBeTruthy()

      const cssTransform = cssPlugin.transform as any
      const result = await cssTransform?.call(
        cssPlugin,
        'export default {"container":{"":{"width":"100%"}}}',
        '/project/main.css',
      )

      expect(result).toBeUndefined()
      expect(currentContext.styleHandler).not.toHaveBeenCalled()
    }
    finally {
      if (previousUtsPlatform === undefined) {
        delete process.env.UNI_UTS_PLATFORM
      }
      else {
        process.env.UNI_UTS_PLATFORM = previousUtsPlatform
      }
    }
  }, TEST_TIMEOUT_MS)

  it('skips uni-app x inline style module exports emitted after preprocessing', async () => {
    const previousUtsPlatform = process.env.UNI_UTS_PLATFORM
    process.env.UNI_UTS_PLATFORM = 'app-android'
    try {
      const WeappTailwindcss = await loadWeappTailwindcssPlugin()
      setCurrentContext(createContext({
        appType: 'uni-app-x',
        uniAppX: { enabled: true },
      }))
      const currentContext = getCurrentContext()

      const plugins = WeappTailwindcss()
      const cssPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:css') as Plugin
      expect(cssPlugin).toBeTruthy()

      const cssTransform = cssPlugin.transform as any
      const result = await cssTransform?.call(
        cssPlugin,
        'export default {"my-3":{"":{"marginTop":"24rpx","marginBottom":"24rpx"}}}',
        '/project/App.uvue?vue&type=style&index=0&inline&lang.scss',
      )

      expect(result).toBeUndefined()
      expect(currentContext.styleHandler).not.toHaveBeenCalled()
    }
    finally {
      if (previousUtsPlatform === undefined) {
        delete process.env.UNI_UTS_PLATFORM
      }
      else {
        process.env.UNI_UTS_PLATFORM = previousUtsPlatform
      }
    }
  }, TEST_TIMEOUT_MS)

  it('refreshes changed SFCs through the early HMR lifecycle and reuses unchanged transforms', async () => {
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const transformUVueMock = getTransformUVueMock()
    const runtimeSets = [
      new Set(['text-[#123456]']),
      new Set(['text-[#123456]', 'text-[#234567]']),
    ] as const
    let runtimeIndex = 0
    const getRuntimeSet = () => runtimeSets[runtimeIndex]

    setCurrentContext(createContext({
      uniAppX: { enabled: true },
      tailwindRuntime: {
        getClassSet: vi.fn(async () => getRuntimeSet()),
        getClassSetSync: vi.fn(() => getRuntimeSet()),
        extract: vi.fn(async () => ({ classSet: getRuntimeSet() })),
        majorVersion: 4,
      },
    }))

    const currentContext = getCurrentContext()
    const originalImplementation = transformUVueMock.getMockImplementation()
    transformUVueMock.mockImplementation((code: string, _id: string, _jsHandler?: unknown, runtimeSet?: Set<string>) => {
      let result = code
      for (const className of (runtimeSet ?? new Set<string>())) {
        result = result.replaceAll(className, replaceWxml(className))
      }
      return { code: result }
    })

    try {
      const plugins = WeappTailwindcss()
      const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
      const nvuePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:nvue') as Plugin
      expect(postPlugin).toBeTruthy()
      expect(nvuePlugin).toBeTruthy()

      const config = {
        command: 'serve',
        css: { postcss: { plugins: [] } },
        build: { outDir: 'dist' },
        root: process.cwd(),
      } as unknown as ResolvedConfig
      await (postPlugin.configResolved as any)?.call(postPlugin, config)
      await (nvuePlugin.buildStart as any)?.call(nvuePlugin)

      const hashedExisting = replaceWxml('text-[#123456]')
      const hashedNew = replaceWxml('text-[#234567]')

      const firstResult = await getTransformHandler(nvuePlugin)?.call(
        nvuePlugin,
        '<template><view class="text-[#123456]"/></template>',
        'Component.uvue',
      )
      expect(firstResult?.code).toContain(hashedExisting)
      expect(currentContext.tailwindRuntime.extract).toHaveBeenCalledTimes(1)
      expect(currentContext.tailwindRuntime.getClassSetSync).not.toHaveBeenCalled()

      runtimeIndex = 1
      const invalidationPlugin = plugins!.find(plugin => plugin.name === 'weapp-tailwindcss:runtime-invalidation')!
      if (config.command === 'serve') {
        await getHotUpdateHandler(invalidationPlugin).call({}, { file: 'Component.uvue' })
      }
      else {
        await (invalidationPlugin.watchChange as any).call({}, 'Component.uvue')
      }
      const secondResult = await getTransformHandler(nvuePlugin)?.call(
        nvuePlugin,
        '<template><view class="text-[#234567]"/></template>',
        'Component.uvue',
      )
      expect(secondResult?.code).toContain(hashedNew)
      expect(currentContext.tailwindRuntime.extract).toHaveBeenCalledTimes(2)
      expect(currentContext.tailwindRuntime.getClassSetSync).not.toHaveBeenCalled()
    }
    finally {
      transformUVueMock.mockImplementation(
        originalImplementation ?? ((code: string, id: string) => ({ code: `uvue:${id}:${code}` })),
      )
    }
  }, TEST_TIMEOUT_MS)

  it('refreshes runtime class set during build watch transforms so new classes are hashed immediately', async () => {
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const transformUVueMock = getTransformUVueMock()
    const runtimeSets = [
      new Set(['text-[#123456]']),
      new Set(['text-[#123456]', 'text-[#345678]']),
    ] as const
    let runtimeIndex = 0
    const getRuntimeSet = () => runtimeSets[runtimeIndex]

    setCurrentContext(createContext({
      uniAppX: { enabled: true },
      tailwindRuntime: {
        getClassSet: vi.fn(async () => getRuntimeSet()),
        getClassSetSync: vi.fn(() => getRuntimeSet()),
        extract: vi.fn(async () => ({ classSet: getRuntimeSet() })),
        majorVersion: 4,
      },
    }))

    const currentContext = getCurrentContext()
    const originalImplementation = transformUVueMock.getMockImplementation()
    transformUVueMock.mockImplementation((code: string, _id: string, _jsHandler?: unknown, runtimeSet?: Set<string>) => {
      let result = code
      for (const className of (runtimeSet ?? new Set<string>())) {
        result = result.replaceAll(className, replaceWxml(className))
      }
      return { code: result }
    })

    try {
      const plugins = WeappTailwindcss()
      const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
      const nvuePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:nvue') as Plugin
      expect(postPlugin).toBeTruthy()
      expect(nvuePlugin).toBeTruthy()

      const config = {
        command: 'build',
        css: { postcss: { plugins: [] } },
        build: { outDir: 'dist', watch: {} },
        root: process.cwd(),
      } as unknown as ResolvedConfig
      await (postPlugin.configResolved as any)?.call(postPlugin, config)
      await (nvuePlugin.buildStart as any)?.call(nvuePlugin)

      const hashedExisting = replaceWxml('text-[#123456]')
      const hashedNew = replaceWxml('text-[#345678]')

      const firstResult = await getTransformHandler(nvuePlugin)?.call(
        nvuePlugin,
        '<template><view class="text-[#123456]"/></template>',
        'Component.uvue',
      )
      expect(firstResult?.code).toContain(hashedExisting)
      expect(currentContext.tailwindRuntime.extract).toHaveBeenCalledTimes(1)
      expect(currentContext.tailwindRuntime.getClassSetSync).not.toHaveBeenCalled()

      runtimeIndex = 1
      const invalidationPlugin = plugins!.find(plugin => plugin.name === 'weapp-tailwindcss:runtime-invalidation')!
      if (config.command === 'serve') {
        await getHotUpdateHandler(invalidationPlugin).call({}, { file: 'Component.uvue' })
      }
      else {
        await (invalidationPlugin.watchChange as any).call({}, 'Component.uvue')
      }
      const secondResult = await getTransformHandler(nvuePlugin)?.call(
        nvuePlugin,
        '<template><view class="text-[#345678]"/></template>',
        'Component.uvue',
      )
      expect(secondResult?.code).toContain(hashedNew)
      expect(currentContext.tailwindRuntime.extract).toHaveBeenCalledTimes(2)
      expect(currentContext.tailwindRuntime.getClassSetSync).not.toHaveBeenCalled()
    }
    finally {
      transformUVueMock.mockImplementation(
        originalImplementation ?? ((code: string, id: string) => ({ code: `uvue:${id}:${code}` })),
      )
    }
  }, TEST_TIMEOUT_MS)

  it('refreshes runtime class set on .uvue/.nvue hot updates in serve mode', async () => {
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const runtimeSets = [
      new Set(['text-[#123456]']),
      new Set(['text-[#234567]']),
    ] as const
    let runtimeIndex = 0
    const getRuntimeSet = () => runtimeSets[runtimeIndex]

    setCurrentContext(createContext({
      uniAppX: { enabled: true },
      tailwindRuntime: {
        getClassSet: vi.fn(async () => getRuntimeSet()),
        getClassSetSync: vi.fn(() => getRuntimeSet()),
        extract: vi.fn(async () => ({ classSet: getRuntimeSet() })),
        majorVersion: 4,
      },
    }))

    const currentContext = getCurrentContext()
    const plugins = WeappTailwindcss()
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
    const nvuePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:nvue') as Plugin
    expect(postPlugin).toBeTruthy()
    expect(nvuePlugin).toBeTruthy()

    const config = {
      command: 'serve',
      css: { postcss: { plugins: [] } },
      build: { outDir: '/project/unpackage/dist/dev/.uvue/app-android' },
      root: process.cwd(),
    } as unknown as ResolvedConfig
    await (postPlugin.configResolved as any)?.call(postPlugin, config)
    await (nvuePlugin.buildStart as any)?.call(nvuePlugin)

    currentContext.tailwindRuntime.extract.mockClear()
    currentContext.tailwindRuntime.getClassSetSync.mockClear()
    runtimeIndex = 1
    const server = {
      config,
      moduleGraph: {
        getModuleById: vi.fn(),
        getModulesByFile: vi.fn(),
        invalidateModule: vi.fn(),
      },
      ws: { send: vi.fn() },
    }
    await getHotUpdateHandler(plugins!.find(plugin => plugin.name === 'weapp-tailwindcss:runtime-invalidation')!).call({}, { file: '/src/pages/foo.uvue' })
    await getHotUpdateHandler(nvuePlugin)?.call(nvuePlugin, { file: '/src/pages/foo.uvue', modules: [], server } as unknown as HmrContext)
    expect(currentContext.tailwindRuntime.extract).toHaveBeenCalledTimes(1)
    expect(currentContext.tailwindRuntime.getClassSetSync).not.toHaveBeenCalled()

    currentContext.tailwindRuntime.extract.mockClear()
    currentContext.tailwindRuntime.getClassSetSync.mockClear()
    runtimeIndex = 1
    await getHotUpdateHandler(plugins!.find(plugin => plugin.name === 'weapp-tailwindcss:runtime-invalidation')!).call({}, { file: '/src/pages/foo.nvue' })
    await getHotUpdateHandler(nvuePlugin)?.call(nvuePlugin, { file: '/src/pages/foo.nvue', modules: [], server } as unknown as HmrContext)
    expect(currentContext.tailwindRuntime.extract).toHaveBeenCalledTimes(1)
    expect(currentContext.tailwindRuntime.getClassSetSync).not.toHaveBeenCalled()

    currentContext.tailwindRuntime.extract.mockClear()
    currentContext.tailwindRuntime.getClassSetSync.mockClear()
    await getHotUpdateHandler(nvuePlugin)?.call(nvuePlugin, { file: '/src/pages/foo.vue' } as HmrContext)
    expect(currentContext.tailwindRuntime.extract).not.toHaveBeenCalled()
    expect(currentContext.tailwindRuntime.getClassSetSync).not.toHaveBeenCalled()
  }, TEST_TIMEOUT_MS)

  it('defers watch invalidations until the next build baseline', async () => {
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const runtimeSets = [
      new Set(['text-[#123456]']),
      new Set(['text-[#654321]']),
    ] as const
    let runtimeIndex = 0
    const getRuntimeSet = () => runtimeSets[runtimeIndex]

    setCurrentContext(createContext({
      uniAppX: { enabled: true },
      tailwindRuntime: {
        getClassSet: vi.fn(async () => getRuntimeSet()),
        getClassSetSync: vi.fn(() => getRuntimeSet()),
        extract: vi.fn(async () => ({ classSet: getRuntimeSet() })),
        majorVersion: 4,
      },
    }))

    const currentContext = getCurrentContext()
    const plugins = WeappTailwindcss()
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
    const nvuePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:nvue') as Plugin
    expect(postPlugin).toBeTruthy()
    expect(nvuePlugin).toBeTruthy()

    const config = {
      command: 'build',
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist', watch: {} },
      root: process.cwd(),
    } as unknown as ResolvedConfig
    await (postPlugin.configResolved as any)?.call(postPlugin, config)
    await (nvuePlugin.buildStart as any)?.call(nvuePlugin)

    runtimeIndex = 1
    currentContext.tailwindRuntime.extract.mockClear()
    const invalidationPlugin = plugins!.find(plugin => plugin.name === 'weapp-tailwindcss:runtime-invalidation')!
    for (const file of ['/src/pages/foo.uvue', '/src/pages/foo.nvue', '/src/shared/classes.ts']) {
      await (invalidationPlugin.watchChange as any).call({}, file)
    }
    expect(currentContext.tailwindRuntime.extract).not.toHaveBeenCalled()
    await (nvuePlugin.buildStart as any).call(nvuePlugin)
    expect(currentContext.tailwindRuntime.extract).toHaveBeenCalledTimes(1)
    await getTransformHandler(nvuePlugin)?.call(nvuePlugin, '<template/>', 'App.uvue')
    expect(currentContext.tailwindRuntime.extract).toHaveBeenCalledTimes(1)
  }, TEST_TIMEOUT_MS)

  it('keeps the build baseline stable across unchanged SFC transforms', async () => {
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const transformUVueMock = getTransformUVueMock()
    const runtimeSets = [
      new Set(['text-[#aaaaaa]']),
      new Set(['text-[#aaaaaa]', 'text-[#bbbbbb]']),
    ] as const
    let runtimeIndex = 0
    const getRuntimeSet = () => runtimeSets[runtimeIndex]

    setCurrentContext(createContext({
      uniAppX: { enabled: true },
      tailwindRuntime: {
        getClassSet: vi.fn(async () => getRuntimeSet()),
        getClassSetSync: vi.fn(() => getRuntimeSet()),
        extract: vi.fn(async () => ({ classSet: getRuntimeSet() })),
        majorVersion: 4,
      },
    }))

    const currentContext = getCurrentContext()
    const plugins = WeappTailwindcss()
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
    const nvuePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:nvue') as Plugin
    expect(postPlugin).toBeTruthy()
    expect(nvuePlugin).toBeTruthy()

    const config = {
      command: 'build',
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
      root: process.cwd(),
    } as unknown as ResolvedConfig
    await (postPlugin.configResolved as any)?.call(postPlugin, config)
    await (nvuePlugin.buildStart as any)?.call(nvuePlugin)

    currentContext.tailwindRuntime.extract.mockClear()
    currentContext.tailwindRuntime.getClassSetSync.mockClear()
    await getTransformHandler(nvuePlugin)?.call(nvuePlugin, '<template></template>', 'App.uvue')
    expect(currentContext.tailwindRuntime.extract).not.toHaveBeenCalled()
    expect(currentContext.tailwindRuntime.getClassSetSync).not.toHaveBeenCalled()
    expect(transformUVueMock).toHaveBeenCalledWith(
      '<template></template>',
      'App.uvue',
      currentContext.jsHandler,
      expect.any(Set),
      expect.objectContaining({ native: true }),
    )
    const transformedRuntime = transformUVueMock.mock.calls.at(-1)![3] as Set<string>
    expect(transformedRuntime.has('text-[#aaaaaa]')).toBe(true)
    expect(transformedRuntime.has('text-[#bbbbbb]')).toBe(false)
  }, TEST_TIMEOUT_MS)
})
