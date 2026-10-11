import type { Plugin, ResolvedConfig } from 'vite'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { vitePluginName } from '@/constants'
import {
  createContext,
  getTransformUVueMock,
  resetVitePluginTestContext,
  setCurrentContext,
} from './vite-plugin.testkit'

const mocks = vi.hoisted(() => ({
  generateTailwindV4Css: vi.fn(),
}))
const createdDirs: string[] = []

vi.mock('@/generation/service', () => ({
  generateTailwindV4Css: mocks.generateTailwindV4Css,
}))

async function loadWeappTailwindcssPlugin() {
  const mod = await import('@/bundlers/vite')
  return mod.WeappTailwindcss
}

function getTransformHandler(plugin: Plugin) {
  return typeof plugin.transform === 'function'
    ? plugin.transform
    : plugin.transform?.handler
}

function getHandleHotUpdateHandler(plugin: Plugin) {
  const hook = plugin.handleHotUpdate
  return typeof hook === 'object' ? hook.handler : hook
}

function getPlugin(plugins: Plugin[], suffix: string) {
  return plugins.find(plugin => plugin.name === `${vitePluginName}:${suffix}`) as Plugin
}

describe('bundlers/vite WeappTailwindcss hook coverage', () => {
  afterEach(async () => {
    await Promise.all(
      createdDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })),
    )
  })

  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('@/bundlers/vite/shared/configured-css-entry-observer')
    resetVitePluginTestContext()
    mocks.generateTailwindV4Css.mockReset()
    mocks.generateTailwindV4Css.mockResolvedValue({
      css: '.generated{color:red}',
      dependencies: ['/project/tailwind.config.ts'],
      classSet: new Set(['generated']),
      target: 'weapp',
    })
  })

  it('observes configured web css entries only when Vite transforms their style modules', async () => {
    const cssFile = '/project/main.css'
    const observer = {
      dispose: vi.fn(),
      flush: vi.fn(),
      observe: vi.fn(),
      observeSourceImports: vi.fn(),
      requestCheck: vi.fn(),
    }
    vi.doMock('@/bundlers/vite/shared/configured-css-entry-observer', () => ({
      createConfiguredCssEntryDiagnostics: vi.fn(() => ({
        observer,
        plugin: {
          name: `${vitePluginName}:configured-css-entry-observer`,
          transform(_code: string, id: string) {
            observer.observe(id)
          },
        },
      })),
    }))
    const context = createContext({
      appType: 'uni-app-x',
      cssEntries: [cssFile],
      generator: { target: 'web' },
      tailwindcssBasedir: '/project',
    })
    setCurrentContext(context)
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()!
    const css = '@import "tailwindcss";'
    const serveCssPlugin = getPlugin(plugins, 'generate:serve')

    await getTransformHandler(serveCssPlugin)?.call(
      { addWatchFile: vi.fn() },
      css,
      cssFile,
    )
    expect(observer.observe).not.toHaveBeenCalled()

    const entryObserverPlugin = getPlugin(plugins, 'configured-css-entry-observer')
    await getTransformHandler(entryObserverPlugin)?.call(entryObserverPlugin, css, `${cssFile}?direct`)
    expect(observer.observe).toHaveBeenCalledOnce()
    expect(observer.observe).toHaveBeenCalledWith(`${cssFile}?direct`)
  })

  it('drives source candidate transform, watch change, hot update, build start, and post config hooks', async () => {
    const context = createContext({
      appType: 'uni-app',
      cssEntries: ['/project/src/app.css'],
      tailwindcssBasedir: '/project',
    })
    setCurrentContext(context)
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()!
    const sourcePlugin = plugins.find(plugin => plugin.name === `${vitePluginName}:source-candidates`) as Plugin
    const postPlugin = plugins.find(plugin => plugin.name === `${vitePluginName}:post`) as Plugin

    expect(sourcePlugin).toBeTruthy()
    expect(postPlugin).toBeTruthy()

    const transform = getTransformHandler(sourcePlugin)!
    await transform.call(sourcePlugin as any, 'export const cls = "text-red-500"', '/project/src/page.ts')
    await sourcePlugin.watchChange?.('/project/src/page.ts', { event: 'update' } as any)
    await sourcePlugin.watchChange?.('/project/src/page.ts', { event: 'delete' } as any)

    const hotResult = await getHandleHotUpdateHandler(sourcePlugin)?.call(sourcePlugin, {
      file: '/project/src/page.ts',
      modules: [],
      server: {
        moduleGraph: {
          getModulesByFile: () => undefined,
        },
        ws: {
          send: vi.fn(),
        },
      },
    } as any)
    expect(hotResult).toEqual([])

    await sourcePlugin.buildStart?.call({
      addWatchFile: vi.fn(),
    } as any)

    const configResult = await postPlugin.config?.({
      plugins: [
        { name: '@tailwindcss/vite:generate:serve' },
        { name: 'other' },
      ],
      root: '/project',
    } as any, { command: 'build', mode: 'production' } as any)

    expect(configResult).toMatchObject({
      resolve: {
        alias: expect.any(Array),
      },
    })
  })

  it('ignores null Vite module identities while recording root css hot modules', async () => {
    const context = createContext({
      appType: 'uni-app-x',
      cssEntries: ['/project/main.css'],
      tailwindcssBasedir: '/project',
    })
    setCurrentContext(context)
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()!
    const sourcePlugin = getPlugin(plugins, 'source-candidates')
    const postPlugin = getPlugin(plugins, 'post')
    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'serve',
      root: '/project',
      plugins: [{ name: 'vite:uni' }],
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist/web' },
    } as any)
    const cssModule = {
      file: null,
      id: null,
      url: '/main.css?direct',
    }
    const assertStringId = (id: unknown) => {
      if (typeof id !== 'string') {
        throw new TypeError('module id must be a string')
      }
      return id
    }
    const getModuleById = vi.fn((id: unknown) => {
      return assertStringId(id) === cssModule.url ? cssModule : undefined
    })
    const getModulesByFile = vi.fn((id: unknown) => {
      assertStringId(id)
      return undefined
    })

    await expect(getHandleHotUpdateHandler(sourcePlugin)?.call(sourcePlugin, {
      file: '/project/main.css',
      modules: [cssModule],
      read: vi.fn(async () => '@import "tailwindcss";\n@theme { --color-issue-1021: #123456; }'),
      timestamp: 1021,
      server: {
        config: {
          root: '/project',
          build: { outDir: 'dist/web' },
        },
        moduleGraph: {
          getModuleById,
          getModulesByFile,
          invalidateModule: vi.fn(),
        },
        ws: { send: vi.fn() },
      },
    } as any)).resolves.not.toThrow()
    expect(getModuleById.mock.calls.flat().every(id => typeof id === 'string' && id.length > 0)).toBe(true)
    expect(getModulesByFile.mock.calls.flat().every(id => typeof id === 'string' && id.length > 0)).toBe(true)
  })

  it('refreshes the Tailwind runtime and registered root source before a native css hot update', async () => {
    const cssFile = '/project/main.css'
    const initialCss = '@import "tailwindcss";'
    const updatedCss = `${initialCss}\n@theme static { --color-issue-1021-hmr: #0f5132; }`
    const context = createContext({
      appType: 'uni-app-x',
      cssEntries: [cssFile],
      platform: 'android',
      tailwindcssBasedir: '/project',
    })
    setCurrentContext(context)
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()!
    const postPlugin = getPlugin(plugins, 'post')
    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'serve',
      root: '/project',
      plugins: [{ name: 'vite:uni' }],
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist/web' },
    } as any)

    const serveCssPlugin = getPlugin(plugins, 'generate:serve')
    await getTransformHandler(serveCssPlugin)?.call(
      { addWatchFile: vi.fn() },
      initialCss,
      cssFile,
    )

    const cssModule = { file: cssFile, id: `${cssFile}?direct`, url: '/main.css?direct' }
    const sourcePlugin = getPlugin(plugins, 'source-candidates')
    context.refreshTailwindcssRuntime.mockClear()
    await getHandleHotUpdateHandler(sourcePlugin)?.call(sourcePlugin, {
      file: cssFile,
      modules: [cssModule],
      read: vi.fn(async () => updatedCss),
      timestamp: 1021,
      server: {
        config: {
          root: '/project',
          build: { outDir: 'dist/web' },
        },
        moduleGraph: {
          getModuleById: vi.fn(id => id === cssModule.id ? cssModule : undefined),
          getModulesByFile: vi.fn(id => id === cssFile ? new Set([cssModule]) : undefined),
          invalidateModule: vi.fn(),
        },
        ws: { send: vi.fn() },
      },
    } as any)
    expect(context.refreshTailwindcssRuntime).toHaveBeenCalledTimes(1)

    mocks.generateTailwindV4Css.mockClear()
    const serveCssHmrPlugin = getPlugin(plugins, 'generate:serve-hmr')
    const staleTransformedCss = `${initialCss}\n.probe { @apply bg-issue-1021-hmr; }`
    const hmrCode = `const __vite__css = ${JSON.stringify(staleTransformedCss)};\n__vite__updateStyle(__vite__id, __vite__css)`
    await getTransformHandler(serveCssHmrPlugin)?.call(
      { addWatchFile: vi.fn() },
      hmrCode,
      `${cssFile}?direct&t=1021`,
    )

    expect(mocks.generateTailwindV4Css).toHaveBeenCalledWith(expect.objectContaining({
      cssSources: [expect.objectContaining({
        css: expect.stringContaining('--color-issue-1021-hmr: #0f5132'),
        file: cssFile,
      })],
    }))
  })

  it('refreshes a changed Tailwind root before the next native watch compilation', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-vite-root-watch-'))
    createdDirs.push(root)
    const cssFile = path.join(root, 'main.css')
    const initialCss = '@import "tailwindcss";'
    const updatedCss = `${initialCss}\n@theme static { --color-issue-1021-hmr: #3b0764; }`
    await writeFile(cssFile, initialCss, 'utf8')
    const context = createContext({
      appType: 'uni-app-x',
      cssEntries: [cssFile],
      platform: 'android',
      tailwindcssBasedir: root,
    })
    setCurrentContext(context)
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()!
    const postPlugin = getPlugin(plugins, 'post')
    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'build',
      root,
      plugins: [{ name: 'vite:uni' }],
      css: { postcss: { plugins: [] } },
      build: { outDir: path.join(root, 'unpackage/dist/dev/.uvue/app-android'), watch: {} },
    } as any)

    const serveCssPlugin = getPlugin(plugins, 'generate:serve')
    await getTransformHandler(serveCssPlugin)?.call(
      { addWatchFile: vi.fn() },
      initialCss,
      cssFile,
    )
    context.refreshTailwindcssRuntime.mockClear()
    await writeFile(cssFile, updatedCss, 'utf8')

    const sourcePlugin = getPlugin(plugins, 'source-candidates')
    await sourcePlugin.watchChange?.(cssFile, { event: 'update' } as any)

    expect(context.refreshTailwindcssRuntime).toHaveBeenCalledTimes(1)
  })

  it('compiles uni conditional CSS before downstream style checks on mini-program platforms', async () => {
    const previousUniPlatform = process.env.UNI_PLATFORM
    process.env.UNI_PLATFORM = 'mp-weixin'
    try {
      const context = createContext({
        appType: 'uni-app-vite',
        tailwindcssBasedir: '/project',
      })
      setCurrentContext(context)
      const WeappTailwindcss = await loadWeappTailwindcssPlugin()
      const plugins = WeappTailwindcss()!
      const sourcePlugin = getPlugin(plugins, 'source-candidates')

      expect(sourcePlugin.transform).toMatchObject({ order: 'pre' })

      const result = await getTransformHandler(sourcePlugin)?.call(
        sourcePlugin,
        [
          '@import "tailwindcss" source(none);',
          '@layer base {',
          '  /* #ifdef H5 */',
          '  svg { display: initial; }',
          '  /* #endif */',
          '  /* #ifdef MP-WEIXIN */',
          '  .wx-only { color: red; }',
          '  /* #endif */',
          '}',
        ].join('\n'),
        '/project/src/tailwind.css',
      )

      expect(result).toMatchObject({
        code: expect.stringContaining('.wx-only'),
        map: null,
      })
      expect(result?.code).not.toContain('svg')
      expect(result?.code).not.toContain('#ifdef H5')
      expect(result?.code).not.toContain('@layer base')
    }
    finally {
      if (previousUniPlatform === undefined) {
        delete process.env.UNI_PLATFORM
      }
      else {
        process.env.UNI_PLATFORM = previousUniPlatform
      }
    }
  })

  it('keeps uni-app x uvue transform enabled on Web targets', async () => {
    const context = createContext({
      appType: 'uni-app-x',
      tailwindcssBasedir: '/project',
      uniAppX: {
        enabled: false,
      },
    })
    setCurrentContext(context)
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()!
    const uvuePlugin = plugins.find(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:nvue') as Plugin | undefined

    expect(uvuePlugin).toBeTruthy()

    const result = await getTransformHandler(uvuePlugin!)?.call(
      uvuePlugin,
      '<template><view class="text-[#f7fbff]">Hello</view></template>',
      '/project/pages/index/index.uvue',
    )

    expect(getTransformUVueMock()).toHaveBeenCalledWith(
      '<template><view class="text-[#f7fbff]">Hello</view></template>',
      '/project/pages/index/index.uvue',
      context.jsHandler,
      expect.any(Set),
      expect.objectContaining({
        enablePageLocalStyle: true,
        native: true,
      }),
    )
    expect(result?.code).toContain('uvue:/project/pages/index/index.uvue:')
  })

  it('infers mini-program platform from vite output directory for early CSS macro compilation', async () => {
    const previousUniPlatform = process.env.UNI_PLATFORM
    delete process.env.UNI_PLATFORM
    try {
      const context = createContext({
        appType: 'uni-app-vite',
        tailwindcssBasedir: '/project',
      })
      setCurrentContext(context)
      const WeappTailwindcss = await loadWeappTailwindcssPlugin()
      const plugins = WeappTailwindcss()!
      const postPlugin = getPlugin(plugins, 'post')
      await (postPlugin.configResolved as any)?.call(postPlugin, {
        command: 'serve',
        root: '/project',
        plugins: [],
        css: { postcss: { plugins: [] } },
        build: { outDir: 'dist/dev/mp-weixin' },
      } as ResolvedConfig)

      const sourcePlugin = getPlugin(plugins, 'source-candidates')
      const result = await getTransformHandler(sourcePlugin)?.call(
        sourcePlugin,
        [
          '@layer base {',
          '  /* #ifdef H5 */',
          '  svg { display: initial; }',
          '  /* #endif */',
          '  /* #ifdef MP-WEIXIN */',
          '  .wx-only { color: red; }',
          '  /* #endif */',
          '}',
        ].join('\n'),
        '/project/src/tailwind.css',
      )

      expect(result?.code).toContain('.wx-only')
      expect(result?.code).not.toContain('svg')
      expect(result?.code).not.toContain('@layer base')
    }
    finally {
      if (previousUniPlatform === undefined) {
        delete process.env.UNI_PLATFORM
      }
      else {
        process.env.UNI_PLATFORM = previousUniPlatform
      }
    }
  })

  it('keeps uni-app-vite default css root and preflight untouched after vite root inference', async () => {
    const previousUniPlatform = process.env.UNI_PLATFORM
    delete process.env.UNI_PLATFORM
    try {
      const context = createContext({
        appType: 'uni-app-vite',
        tailwindcssBasedir: '/project',
        cssPreflight: {
          'box-sizing': 'border-box',
          margin: '0',
          padding: '0',
          border: '0 solid',
        },
        cssSelectorReplacement: {
          root: ['page', '.tw-root', 'wx-root-portal-content'],
          universal: ['view', 'text'],
        },
      })
      setCurrentContext(context)
      const WeappTailwindcss = await loadWeappTailwindcssPlugin()
      const plugins = WeappTailwindcss()!
      const postPlugin = getPlugin(plugins, 'post')

      await (postPlugin.configResolved as any)?.call(postPlugin, {
        command: 'serve',
        root: '/project',
        plugins: [],
        css: { postcss: { plugins: [] } },
        build: { outDir: 'dist/dev/mp-weixin' },
      } as ResolvedConfig)

      expect(context.cssPreflight).toMatchObject({
        'box-sizing': 'border-box',
        margin: '0',
        padding: '0',
        border: '0 solid',
      })
      expect(context.cssSelectorReplacement?.root).toStrictEqual(['page', '.tw-root', 'wx-root-portal-content'])
    }
    finally {
      if (previousUniPlatform === undefined) {
        delete process.env.UNI_PLATFORM
      }
      else {
        process.env.UNI_PLATFORM = previousUniPlatform
      }
    }
  })

  it('strips Tailwind cascade layer syntax from vite serve css before uni bundle style checks', async () => {
    mocks.generateTailwindV4Css.mockResolvedValueOnce({
      css: [
        '@layer theme, base, components, utilities;',
        '@layer base {',
        '  .base-reset { box-sizing: border-box; }',
        '}',
        '@layer utilities {',
        '  .text-red-500 { color: red; }',
        '}',
      ].join('\n'),
      dependencies: [],
      classSet: new Set(['base-reset', 'text-red-500']),
      target: 'weapp',
    })
    const context = createContext({
      appType: 'uni-app-vite',
      tailwindcssBasedir: '/project',
    })
    setCurrentContext(context)
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()!
    const postPlugin = getPlugin(plugins, 'post')
    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'serve',
      root: '/project',
      plugins: [],
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist/dev/mp-weixin' },
    } as ResolvedConfig)

    const serveCssPlugin = getPlugin(plugins, 'generate:serve')
    const result = await getTransformHandler(serveCssPlugin)?.call(
      { addWatchFile: vi.fn() },
      '@import "tailwindcss";',
      '/project/src/tailwind.css',
    )

    expect(result?.code).toContain('.base-reset')
    expect(result?.code).toContain('.text-red-500')
    expect(result?.code).not.toContain('@layer')
  })

  it('uses inferred uni-app-vite WebView branch for app-plus serve css compat', async () => {
    const previousUniPlatform = process.env.UNI_PLATFORM
    const previousUniUtsPlatform = process.env.UNI_UTS_PLATFORM
    process.env.UNI_PLATFORM = 'app-plus'
    process.env.UNI_UTS_PLATFORM = 'app-android'
    const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-uni-app-vite-webview-'))
    createdDirs.push(root)
    await writeFile(path.join(root, 'package.json'), JSON.stringify({
      dependencies: {
        '@dcloudio/uni-app': '^3.0.0',
      },
      devDependencies: {
        '@dcloudio/vite-plugin-uni': '^3.0.0',
      },
    }), 'utf8')
    try {
      mocks.generateTailwindV4Css.mockResolvedValueOnce({
        css: [
          '.bg-gradient-to-br {',
          '  --tw-gradient-position: to bottom right in oklab;',
          '  background-image: linear-gradient(var(--tw-gradient-stops));',
          '}',
        ].join('\n'),
        dependencies: [],
        classSet: new Set(['bg-gradient-to-br']),
        target: 'web',
      })
      const context = createContext({
        appType: undefined,
        tailwindcssBasedir: root,
      })
      setCurrentContext(context)
      const WeappTailwindcss = await loadWeappTailwindcssPlugin()
      const plugins = WeappTailwindcss()!
      const postPlugin = getPlugin(plugins, 'post')
      await (postPlugin.configResolved as any)?.call(postPlugin, {
        command: 'serve',
        root,
        plugins: [],
        css: { postcss: { plugins: [] } },
        build: { outDir: 'dist/dev/app-plus' },
      } as ResolvedConfig)

      expect(context.appType).toBe('uni-app-vite')

      const serveCssPlugin = getPlugin(plugins, 'generate:serve')
      const result = await getTransformHandler(serveCssPlugin)?.call(
        { addWatchFile: vi.fn() },
        '@import "tailwindcss";',
        path.join(root, 'src/main.css'),
      )

      expect(result?.code).toContain('--tw-gradient-position: to bottom right')
      expect(result?.code).not.toContain('to bottom right in oklab')
      expect(mocks.generateTailwindV4Css).toHaveBeenCalledWith(expect.objectContaining({
        outputFile: 'src/main.css',
        restoreLocalCssImports: false,
      }))
    }
    finally {
      if (previousUniPlatform === undefined) {
        delete process.env.UNI_PLATFORM
      }
      else {
        process.env.UNI_PLATFORM = previousUniPlatform
      }
      if (previousUniUtsPlatform === undefined) {
        delete process.env.UNI_UTS_PLATFORM
      }
      else {
        process.env.UNI_UTS_PLATFORM = previousUniUtsPlatform
      }
    }
  })

  it('keeps post config inert when plugin ownership is disabled', async () => {
    setCurrentContext(createContext({
      disabled: { plugin: true },
    }))
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()

    expect(plugins).toBeUndefined()
  })

  it('generates vite serve css, hmr css modules, and serve js transforms', async () => {
    const context = createContext({
      appType: 'uni-app',
      tailwindcssBasedir: '/project',
      mainCssChunkMatcher: vi.fn((file: string) => file.endsWith('app.css')),
      jsHandler: vi.fn((code: string) => ({ code: `js:${code}` })),
    })
    setCurrentContext(context)
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()!
    const postPlugin = getPlugin(plugins, 'post')
    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'serve',
      root: '/project',
      plugins: [{ name: 'vite:css' }],
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
    } as any)

    const serveCssPlugin = getPlugin(plugins, 'generate:serve')
    const serveCssHmrPlugin = getPlugin(plugins, 'generate:serve-hmr')
    const serveJsPlugin = getPlugin(plugins, 'js:serve')
    const addWatchFile = vi.fn()

    const cssResult = await getTransformHandler(serveCssPlugin)?.call(
      { addWatchFile },
      '@import "tailwindcss";\n.app{}',
      '/project/src/app.css',
    )
    expect(cssResult).toMatchObject({
      code: expect.stringContaining('.generated{color:red}'),
      map: null,
    })
    expect(addWatchFile).toHaveBeenCalledWith('/project/tailwind.config.ts')
    expect(mocks.generateTailwindV4Css).toHaveBeenCalledWith(expect.objectContaining({
      file: '/project/src/app.css',
      outputFile: 'src/app.css',
      cssSources: expect.any(Array),
      deferCssAdaptation: false,
    }))

    const hmrCode = 'const __vite__css = "@import \\"tailwindcss\\";\\n.page{}";\n__vite__updateStyle(__vite__id, __vite__css)'
    const hmrResult = await getTransformHandler(serveCssHmrPlugin)?.call(
      { addWatchFile },
      hmrCode,
      '/project/src/pages/index.css?vue&type=style&direct',
    )
    expect(hmrResult).toMatchObject({
      code: expect.stringContaining('.generated{color:red}'),
      map: null,
    })

    const jsResult = await getTransformHandler(serveJsPlugin)?.call(
      serveJsPlugin,
      'const cls = "alpha"',
      '/project/src/pages/index.ts',
    )
    expect(jsResult).toBeUndefined()
    expect(context.jsHandler).not.toHaveBeenCalled()
  })

  it('serializes concurrent generation for the same Vite style module', async () => {
    const context = createContext({
      appType: 'uni-app-x',
      generator: { target: 'web' },
      tailwindcssBasedir: '/project',
    })
    setCurrentContext(context)
    let releaseFirst!: () => void
    let markFirstStarted!: () => void
    const firstPending = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve
    })
    let activeGenerations = 0
    let maxActiveGenerations = 0
    mocks.generateTailwindV4Css.mockImplementation(async () => {
      activeGenerations += 1
      maxActiveGenerations = Math.max(maxActiveGenerations, activeGenerations)
      if (mocks.generateTailwindV4Css.mock.calls.length === 1) {
        markFirstStarted()
        await firstPending
      }
      activeGenerations -= 1
      return {
        css: '.generated{color:red}',
        dependencies: [],
        classSet: new Set(['generated']),
        target: 'web',
      }
    })

    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()!
    const postPlugin = getPlugin(plugins, 'post')
    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'serve',
      root: '/project',
      plugins: [{ name: 'vite:css' }],
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist/web' },
    } as ResolvedConfig)
    const serveCssPlugin = getPlugin(plugins, 'generate:serve')
    const serveCssHmrPlugin = getPlugin(plugins, 'generate:serve-hmr')
    const transform = getTransformHandler(serveCssPlugin)!
    const transformHmr = getTransformHandler(serveCssHmrPlugin)!
    const source = '@import "tailwindcss";'
    const id = '/project/pages/index/index.uvue?vue&type=style&index=0&scoped=abc&lang.css'
    const hmrCode = `const __vite__css = ${JSON.stringify(source)};\n__vite__updateStyle(__vite__id, __vite__css)`

    const first = transform.call(serveCssPlugin, source, id)
    await firstStarted
    const second = transformHmr.call(serveCssHmrPlugin, hmrCode, `${id}&t=2`)
    await Promise.resolve()

    expect(mocks.generateTailwindV4Css).toHaveBeenCalledTimes(1)
    releaseFirst()
    const results = await Promise.all([first, second])

    expect(mocks.generateTailwindV4Css).toHaveBeenCalledTimes(2)
    expect(maxActiveGenerations).toBe(1)
    expect(results).toEqual([
      expect.objectContaining({ code: expect.stringContaining('.generated{color:red}') }),
      expect.objectContaining({ code: expect.stringContaining('.generated{color:red}') }),
    ])
  })

  it('generates build css in a pre transform before Vite PostCSS and asset finalization', async () => {
    const context = createContext({
      appType: 'native',
      generator: {
        target: 'web',
      },
      tailwindcssBasedir: '/project',
    })
    setCurrentContext(context)
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()!
    const postPlugin = getPlugin(plugins, 'post')
    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'build',
      root: '/project',
      plugins: [{ name: 'vite:css' }],
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist/web' },
    } as ResolvedConfig)

    const sourcePluginIndex = plugins.findIndex(plugin => plugin.name === `${vitePluginName}:source-candidates`)
    const buildPluginIndex = plugins.findIndex(plugin => plugin.name === `${vitePluginName}:generate:build`)
    const finalizerPluginIndex = plugins.findIndex(plugin => plugin.name === 'weapp-tailwindcss:adaptor:css-finalizer')
    const sourcePlugin = plugins[sourcePluginIndex] as Plugin
    const buildPlugin = plugins[buildPluginIndex] as Plugin

    const applySourceCandidates = sourcePlugin.apply
    expect(applySourceCandidates).toBeTypeOf('function')
    expect(typeof applySourceCandidates === 'function' && applySourceCandidates({ build: {} }, { command: 'build', mode: 'production' })).toBe(false)
    expect(buildPlugin).toMatchObject({
      apply: 'build',
      enforce: 'pre',
    })
    expect(sourcePluginIndex).toBeLessThan(buildPluginIndex)
    expect(buildPluginIndex).toBeLessThan(finalizerPluginIndex)

    const addWatchFile = vi.fn()
    const result = await getTransformHandler(buildPlugin)?.call(
      { addWatchFile },
      '.card { @apply flex; }',
      '/project/src/card.css',
    )

    expect(result).toMatchObject({
      code: expect.stringContaining('.generated{color:red}'),
      map: null,
    })
    expect(addWatchFile).toHaveBeenCalledWith('/project/tailwind.config.ts')
    expect(mocks.generateTailwindV4Css).toHaveBeenCalledTimes(1)
    expect(mocks.generateTailwindV4Css).toHaveBeenCalledWith(expect.objectContaining({
      file: '/project/src/card.css',
      outputFile: 'src/card.css',
    }))

    const finalizerPlugin = plugins[finalizerPluginIndex] as Plugin
    const finalizerHook = finalizerPlugin.generateBundle as any
    const finalize = typeof finalizerHook === 'function' ? finalizerHook : finalizerHook?.handler
    const output = {
      type: 'asset',
      fileName: 'card.css',
      names: [],
      originalFileNames: ['/project/src/card.css'],
      source: result?.code ?? '',
    }
    await finalize?.call(finalizerPlugin, {}, {
      'card.css': output,
    })

    expect(mocks.generateTailwindV4Css).toHaveBeenCalledTimes(1)
    expect(output.source).not.toContain('weapp-tailwindcss vite-generated-css')
  })

  it('keeps source candidates enabled for Generic Web production source tracing', async () => {
    const context = createContext({
      appType: 'native',
      cssSourceTrace: true,
      generator: {
        target: 'web',
      },
      tailwindcssBasedir: '/project',
    })
    setCurrentContext(context)
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()!
    const sourcePlugin = getPlugin(plugins, 'source-candidates')

    const applySourceCandidates = sourcePlugin.apply
    expect(applySourceCandidates).toBeTypeOf('function')
    expect(typeof applySourceCandidates === 'function' && applySourceCandidates({ build: {} }, { command: 'build', mode: 'production' })).toBe(true)
  })

  it('keeps mini-program build css generation in the final asset pipeline', async () => {
    setCurrentContext(createContext({
      appType: 'uni-app',
      tailwindcssBasedir: '/project',
    }))
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()!
    const postPlugin = getPlugin(plugins, 'post')
    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'build',
      root: '/project',
      plugins: [{ name: 'vite:css' }],
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist/dev/mp-weixin' },
    } as ResolvedConfig)

    const buildPlugin = getPlugin(plugins, 'generate:build')
    const result = await getTransformHandler(buildPlugin)?.call(
      { addWatchFile: vi.fn() },
      '.card { @apply flex; }',
      '/project/src/card.css',
    )

    expect(result).toBeUndefined()
    expect(mocks.generateTailwindV4Css).not.toHaveBeenCalled()
  })

  it('regenerates uni-app-vite root css after vue template hmr adds named arbitrary colors', async () => {
    mocks.generateTailwindV4Css.mockImplementation(async (options: any) => ({
      css: [...options.runtime].sort().map((candidate: string) => `.${candidate}{display:block}`).join('\n'),
      dependencies: [],
      classSet: new Set(options.runtime),
      target: 'weapp',
    }))
    const context = createContext({
      appType: 'uni-app-vite',
      cssEntries: ['/project/src/tailwind.css'],
      tailwindcssBasedir: '/project',
      mainCssChunkMatcher: vi.fn((file: string) => file.endsWith('tailwind.css')),
    })
    setCurrentContext(context)
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()!
    const postPlugin = getPlugin(plugins, 'post')
    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'serve',
      root: '/project',
      plugins: [{ name: 'vite:uni' }],
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist/dev/mp-weixin' },
    } as any)

    const serveCssPlugin = getPlugin(plugins, 'generate:serve')
    await getTransformHandler(serveCssPlugin)?.call(
      { addWatchFile: vi.fn() },
      '@import "tailwindcss";\n@source "./pages/**/*.vue";',
      '/project/src/tailwind.css',
    )

    mocks.generateTailwindV4Css.mockClear()
    const sourcePlugin = getPlugin(plugins, 'source-candidates')
    const send = vi.fn()
    const hotResult = await getHandleHotUpdateHandler(sourcePlugin)?.call(sourcePlugin, {
      file: '/project/src/pages/index.vue',
      modules: [{ id: '/project/src/pages/index.vue', isSelfAccepting: true }],
      read: vi.fn(async () => '<template><view class="text-[yellow] bg-[blue]">hmr</view></template>'),
      timestamp: 1000,
      server: {
        config: {
          root: '/project',
          build: { outDir: 'dist/dev/mp-weixin' },
        },
        moduleGraph: {
          getModuleById: vi.fn(),
          getModulesByFile: vi.fn(() => []),
          invalidateModule: vi.fn(),
        },
        ws: {
          send,
        },
      },
    } as any)
    await Promise.resolve()

    expect(hotResult).toBeUndefined()
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'full-reload' }))
    expect(send).toHaveBeenCalledWith({
      type: 'update',
      updates: [expect.objectContaining({
        path: '/src/tailwind.css',
        acceptedPath: '/src/tailwind.css',
      })],
    })

    const serveCssHmrPlugin = getPlugin(plugins, 'generate:serve-hmr')
    const hmrCode = 'const __vite__css = "@import \\"tailwindcss\\";\\n@source \\"./pages/**/*.vue\\";";\n__vite__updateStyle(__vite__id, __vite__css)'
    const hmrResult = await getTransformHandler(serveCssHmrPlugin)?.call(
      { addWatchFile: vi.fn() },
      hmrCode,
      '/project/src/tailwind.css?direct&t=1000',
    )

    expect(hmrResult?.code).toContain('.text-[yellow]{display:block}')
    expect(hmrResult?.code).toContain('.bg-[blue]{display:block}')
    expect(mocks.generateTailwindV4Css).toHaveBeenLastCalledWith(expect.objectContaining({
      runtime: expect.objectContaining({
        has: expect.any(Function),
      }),
    }))
    const lastRuntime = mocks.generateTailwindV4Css.mock.calls.at(-1)?.[0]?.runtime as Set<string>
    expect(lastRuntime.has('text-[yellow]')).toBe(true)
    expect(lastRuntime.has('bg-[blue]')).toBe(true)
  })

  it('merges duplicate vite dependency events into one compiler changeset', async () => {
    const dependency = '/project/tailwind.config.ts'
    const context = createContext({
      appType: 'uni-app-vite',
      cssEntries: ['/project/src/tailwind.css'],
      tailwindcssBasedir: '/project',
      mainCssChunkMatcher: vi.fn((file: string) => file.endsWith('tailwind.css')),
    })
    setCurrentContext(context)
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const compiler = await import('@/compiler')
    let runtimeState: object | undefined
    let scopeId: string | undefined
    mocks.generateTailwindV4Css.mockImplementation(async (options: any) => {
      runtimeState = options.runtimeState
      scopeId = options.outputFile ?? options.file
      const scope = {
        id: scopeId!,
        kind: options.cssHandlerOptions.isMainChunk ? 'global' as const : 'component' as const,
      }
      await compiler.getCompilationSessionPool(runtimeState!).run({
        scope,
        outputId: scope.id,
        sources: [{
          id: options.file,
          kind: 'css',
          candidates: options.runtime,
        }],
      }, async compilation => ({
        classSet: compilation.candidates,
        dependenciesBySource: [[
          options.file,
          [{ id: dependency, kind: 'config' as const }],
        ]] as const,
      }))
      return {
        css: '.generated{color:red}',
        dependencies: [dependency],
        classSet: new Set(['generated']),
        target: 'weapp',
      }
    })
    const plugins = WeappTailwindcss()!
    const postPlugin = getPlugin(plugins, 'post')
    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'serve',
      root: '/project',
      plugins: [{ name: 'vite:uni' }],
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist/dev/mp-weixin' },
    } as any)
    const serveCssPlugin = getPlugin(plugins, 'generate:serve')
    await getTransformHandler(serveCssPlugin)?.call(
      { addWatchFile: vi.fn() },
      '@import "tailwindcss";',
      '/project/src/tailwind.css',
    )
    expect(runtimeState).toBeDefined()
    expect(scopeId).toBeDefined()
    const generationPool = compiler.getTailwindGenerationSessionPool(runtimeState!)
    const invalidate = vi.spyOn(generationPool, 'invalidate')
    const sourcePlugin = getPlugin(plugins, 'source-candidates')

    await sourcePlugin.watchChange?.(dependency, { event: 'update' } as any)
    await getHandleHotUpdateHandler(sourcePlugin)?.call(sourcePlugin, {
      file: dependency,
      modules: [],
      read: vi.fn(async () => 'export default {}'),
      server: {
        moduleGraph: {
          getModuleById: vi.fn(),
          getModulesByFile: vi.fn(() => []),
          invalidateModule: vi.fn(),
        },
        ws: { send: vi.fn() },
      },
    } as any)

    expect(compiler.getCompilationScopeDependencyRevision(runtimeState!, scopeId!)).toBe(1)
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(compiler.consumeCompilationScopeChanges(runtimeState!, scopeId!)).toEqual([
      { id: dependency, type: 'dependency-changed' },
    ])
    expect(compiler.consumeCompilationScopeChanges(runtimeState!, scopeId!)).toBeUndefined()
  })

  it('keeps vite serve css unchanged when generator returns no css', async () => {
    mocks.generateTailwindV4Css.mockResolvedValueOnce(undefined)
    const context = createContext({
      appType: 'uni-app',
      tailwindcssBasedir: '/project',
    })
    setCurrentContext(context)
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()!
    const postPlugin = getPlugin(plugins, 'post')
    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'serve',
      root: '/project',
      plugins: [{ name: 'vite:css' }],
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
    } as any)

    const serveCssPlugin = getPlugin(plugins, 'generate:serve')
    const cssResult = await getTransformHandler(serveCssPlugin)?.call(
      { addWatchFile: vi.fn() },
      '@import "tailwindcss";\n.plain{color:red}',
      '/project/src/plain.css',
    )

    expect(cssResult).toBeUndefined()
    expect(mocks.generateTailwindV4Css).toHaveBeenCalledWith(expect.objectContaining({
      file: '/project/src/plain.css',
    }))
  })

  it('skips vite serve js transform for web generator targets', async () => {
    const context = createContext({
      appType: 'h5',
      generator: {
        target: 'web',
      },
      jsHandler: vi.fn((code: string) => ({ code: `js:${code}` })),
    })
    setCurrentContext(context)
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()!
    const postPlugin = getPlugin(plugins, 'post')
    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'serve',
      root: '/project',
      plugins: [{ name: 'vite:css' }],
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
    } as any)

    const serveJsPlugin = getPlugin(plugins, 'js:serve')
    const jsResult = await getTransformHandler(serveJsPlugin)?.call(
      serveJsPlugin,
      'const cls = "alpha"',
      '/project/src/pages/index.ts',
    )

    expect(jsResult).toBeUndefined()
    expect(context.jsHandler).not.toHaveBeenCalled()
  })

  it('sends a full reload for unresolved source hot updates in uni vite projects', async () => {
    const context = createContext({
      appType: 'uni-app',
      cssEntries: ['/project/src/app.css'],
      tailwindcssBasedir: '/project',
    })
    setCurrentContext(context)
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()!
    const postPlugin = getPlugin(plugins, 'post')
    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'serve',
      root: '/project',
      plugins: [{ name: 'vite:uni' }],
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
    } as any)

    const sourcePlugin = getPlugin(plugins, 'source-candidates')
    const send = vi.fn()
    const hotResult = await getHandleHotUpdateHandler(sourcePlugin)?.call(sourcePlugin, {
      file: '/project/src/pages/index.ts',
      modules: [{ id: '/project/src/pages/index.ts', isSelfAccepting: false }],
      server: {
        moduleGraph: {
          getModulesByFile: () => undefined,
        },
        ws: {
          send,
        },
      },
    } as any)

    expect(hotResult).toEqual([])
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'full-reload' }))
  })

  it('does not treat ordinary web macro subrequests as Nuxt page macro reloads', async () => {
    const context = createContext({
      cssEntries: ['/project/src/style.css'],
      generator: {
        target: 'web',
      },
      tailwindcssBasedir: '/project',
    })
    setCurrentContext(context)
    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()!
    const postPlugin = getPlugin(plugins, 'post')
    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'serve',
      root: '/project',
      plugins: [],
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
    } as any)

    const sourcePlugin = getPlugin(plugins, 'source-candidates')
    const send = vi.fn()
    const module = {
      id: '/project/src/main.tsx?macro=true',
      url: '/src/main.tsx?macro=true',
      isSelfAccepting: true,
    }
    const hotResult = await getHandleHotUpdateHandler(sourcePlugin)?.call(sourcePlugin, {
      file: '/project/src/main.tsx',
      modules: [module],
      server: {
        moduleGraph: {
          getModulesByFile: () => undefined,
          getModuleById: () => undefined,
          invalidateModule: vi.fn(),
        },
        ws: {
          send,
        },
      },
    } as any)

    expect(hotResult).toBeUndefined()
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'full-reload' }))
  })
})
