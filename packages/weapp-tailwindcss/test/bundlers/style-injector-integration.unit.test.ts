import type { OutputAsset } from 'rollup'
import type { Plugin, ResolvedConfig } from 'vite'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  createBuiltinViteStyleInjectorPlugins,
  createBuiltinWebpackStyleInjectorPlugin,
} from '@/style-injector/internal'
import { createContext, resetVitePluginTestContext, setCurrentContext } from './vite-plugin.testkit'

async function loadViteWeappTailwindcssPlugin() {
  const mod = await import('@/bundlers/vite')
  return mod.WeappTailwindcss
}

function getGenerateBundleHandler(plugin: Plugin) {
  const hook = plugin.generateBundle
  return typeof hook === 'function' ? hook : hook?.handler
}

function asset(fileName: string, source: string): OutputAsset {
  return {
    type: 'asset',
    fileName,
    name: fileName,
    names: [fileName],
    originalFileName: null,
    originalFileNames: [],
    source,
    needsCodeReference: false,
  }
}

describe('bundlers/vite builtin styleInjector', () => {
  it('delegates Vite style injector lifecycle hooks in order', async () => {
    const configResolved = vi.fn()
    const buildStart = vi.fn()
    const loadA = vi.fn()
    const loadB = vi.fn(() => 'loaded')
    const transformA = vi.fn((code: string) => `${code}:a`)
    const transformB = vi.fn((code: string) => ({ code: `${code}:b` }))
    const generateBundleA = vi.fn()
    const generateBundleB = vi.fn()
    const delegateFactory = vi.fn(() => [
      {
        name: 'delegate-a',
        configResolved,
        buildStart,
        load: loadA,
        transform: transformA,
        generateBundle: generateBundleA,
      },
      {
        name: 'delegate-b',
        load: loadB,
        transform: { handler: transformB },
        generateBundle: { handler: generateBundleB },
      },
    ] as Plugin[])
    const factory = Object.assign(delegateFactory, { slots: [
      { name: 'delegate-a', hooks: { configResolved: true as const, buildStart: true as const, load: true as const, transform: true as const, generateBundle: true as const } },
      { name: 'delegate-b', hooks: { load: true as const, transform: true as const, generateBundle: true as const } },
    ] })
    const plugins = createBuiltinViteStyleInjectorPlugins(true, () => factory)
    const prePlugin = plugins[0]!
    const postPlugin = plugins[1]!
    const config = { root: process.cwd(), plugins, css: {} } as ResolvedConfig
    const hookContext = { addWatchFile: vi.fn() } as any

    await prePlugin.configResolved?.call(prePlugin, config)
    await prePlugin.buildStart?.call(hookContext, {} as any)
    await prePlugin.buildStart?.call(hookContext, {} as any)
    expect(prePlugin.load?.call(hookContext, 'virtual.css', {} as any)).toBeUndefined()
    expect(postPlugin.load?.call(hookContext, 'virtual.css', {} as any)).toBe('loaded')
    expect(prePlugin.transform?.call(hookContext, 'code', 'virtual.css', {} as any)).toBe('code:a')
    expect(postPlugin.transform?.call(hookContext, 'code:a', 'virtual.css', {} as any)).toEqual({ code: 'code:a:b' })
    await postPlugin.configResolved?.call(postPlugin, config)
    await getGenerateBundleHandler(prePlugin)?.call(hookContext, {} as any, {}, false)
    await getGenerateBundleHandler(postPlugin)?.call(hookContext, {} as any, {}, false)

    expect(delegateFactory).toHaveBeenCalledTimes(1)
    expect(configResolved).toHaveBeenCalledTimes(1)
    expect(buildStart).toHaveBeenCalledTimes(2)
    expect(loadA).toHaveBeenCalled()
    expect(loadB).toHaveBeenCalled()
    expect(generateBundleA).toHaveBeenCalled()
    expect(generateBundleB).toHaveBeenCalled()
  })

  it('normalizes builtin style injector disabled and webpack options', () => {
    expect(createBuiltinViteStyleInjectorPlugins(undefined, vi.fn())).toEqual([])
    const delegateFactory = vi.fn(() => ({ name: 'webpack-style-injector' }) as any)
    expect(createBuiltinWebpackStyleInjectorPlugin(undefined, delegateFactory)).toBeUndefined()

    const webpackPlugin = createBuiltinWebpackStyleInjectorPlugin({
      generateSubpackageStyle: () => 'sub{}',
      loadSubpackageTargetStyle: () => Buffer.from('target{}'),
    }, delegateFactory)
    const webpackOptions = delegateFactory.mock.calls[0]?.[0] as any

    expect(webpackPlugin).toEqual({ name: 'webpack-style-injector' })
    expect(webpackOptions.generateSubpackageStyle({})).toBe('sub{}')
    expect(String(webpackOptions.loadSubpackageTargetStyle('a.wxss', '/repo/a.wxss'))).toBe('target{}')

    createBuiltinWebpackStyleInjectorPlugin({
      generateSubpackageStyle: async () => 'sub{}',
      loadSubpackageTargetStyle: async () => 'target{}',
    }, delegateFactory)
    const asyncWebpackOptions = delegateFactory.mock.calls[1]?.[0] as any
    expect(() => asyncWebpackOptions.generateSubpackageStyle({})).toThrow('must return synchronously')
    expect(() => asyncWebpackOptions.loadSubpackageTargetStyle('a.wxss', '/repo/a.wxss')).toThrow('must return synchronously')
  })

  it('injects configured imports before generation and final CSS cleanup', async () => {
    resetVitePluginTestContext()
    setCurrentContext(createContext({
      appType: 'native',
      styleInjector: {
        imports: ['shared.wxss'],
      },
    }))
    const WeappTailwindcss = await loadViteWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss({ appType: 'native', styleInjector: { imports: ['shared.wxss'] } })!
    const styleInjectorPlugin = plugins.find(plugin => plugin.name === 'weapp-tailwindcss:style-injector')!
    const bundle = {
      'app.wxss': asset('app.wxss', '.app{}'),
    }

    await styleInjectorPlugin.configResolved?.call(styleInjectorPlugin, {
      root: process.cwd(),
      plugins,
      css: {},
    } as ResolvedConfig)
    await getGenerateBundleHandler(styleInjectorPlugin)?.call({
      emitFile(file: { type: 'asset', fileName?: string, source?: string | Uint8Array }) {
        if (file.type === 'asset' && file.fileName) {
          bundle[file.fileName] = asset(file.fileName, String(file.source ?? ''))
        }
        return file.fileName ?? ''
      },
    } as any, {} as any, bundle as any, false)

    expect(bundle['app.wxss'].source).toBe('@import "shared.wxss";\n.app{}')
    expect(plugins.findIndex(plugin => plugin.name === 'weapp-tailwindcss:style-injector')).toBeLessThan(plugins.findIndex(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post'))
    expect(styleInjectorPlugin.generateBundle).toMatchObject({ order: 'post' })
  })

  it('submits injector assets before uni-app-x consumes style placeholders', async () => {
    resetVitePluginTestContext()
    setCurrentContext(createContext({ appType: 'uni-app-vite', uniAppX: true, styleInjector: true }))
    const WeappTailwindcss = await loadViteWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss({ appType: 'uni-app-vite', uniAppX: true, styleInjector: true })!
    const injector = plugins.findIndex(plugin => plugin.name === 'weapp-tailwindcss:style-injector')
    const placeholder = plugins.findIndex(plugin => plugin.name === 'weapp-tailwindcss:uni-app-x:style-placeholder')
    expect(injector).toBeGreaterThan(-1)
    expect(placeholder).toBeGreaterThan(injector)
    expect(plugins[injector]?.generateBundle).toMatchObject({ order: 'post' })
    expect(plugins[placeholder]?.generateBundle).toMatchObject({ order: 'post' })
  })

  it('uses the selected uni-app Vite framework styleInjector preset', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-style-injector-'))
    await mkdir(path.join(root, 'sub'), { recursive: true })
    await writeFile(path.join(root, 'pages.json'), JSON.stringify({
      subPackages: [
        {
          root: 'sub',
          pages: ['pages/index'],
        },
      ],
    }), 'utf8')
    await writeFile(path.join(root, 'sub/index.css'), '.sub{}', 'utf8')

    resetVitePluginTestContext()
    const context = createContext({
      appType: 'uni-app-vite',
      styleInjector: {
        subPackages: {
          pagesJsonPath: path.join(root, 'pages.json'),
          preprocess: false,
        },
      },
    })
    setCurrentContext(context)
    const WeappTailwindcss = await loadViteWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss({ appType: 'uni-app-vite', styleInjector: context.styleInjector })!
    const styleInjectorPrePlugin = plugins.find(plugin => plugin.name === 'weapp-tailwindcss:style-injector-pre')!
    const styleInjectorPlugin = plugins.find(plugin => plugin.name === 'weapp-tailwindcss:style-injector')!
    const bundle = {
      'sub/pages/index.wxss': asset('sub/pages/index.wxss', '.page{}'),
      'sub/index.wxss': asset('sub/index.wxss', '.sub{}'),
    }

    await styleInjectorPrePlugin.configResolved?.call(styleInjectorPrePlugin, {
      root: process.cwd(),
      plugins,
      css: {},
    } as ResolvedConfig)
    await styleInjectorPrePlugin.buildStart?.call({
      addWatchFile: () => {},
    } as any, {} as any)
    await styleInjectorPlugin.configResolved?.call(styleInjectorPlugin, {
      root: process.cwd(),
      plugins,
      css: {},
    } as ResolvedConfig)
    await getGenerateBundleHandler(styleInjectorPlugin)?.call({
      emitFile(file: { type: 'asset', fileName?: string, source?: string | Uint8Array }) {
        if (file.type === 'asset' && file.fileName) {
          bundle[file.fileName] = asset(file.fileName, String(file.source ?? ''))
        }
        return file.fileName ?? ''
      },
    } as any, {} as any, bundle as any, false)

    expect(bundle['sub/pages/index.wxss'].source).toBe('@import "../index.wxss";\n.page{}')
  })

  it('does not append styleInjector plugins when the main vite plugin is disabled', async () => {
    resetVitePluginTestContext()
    setCurrentContext(createContext({
      disabled: { plugin: true },
      styleInjector: true,
    }))
    const WeappTailwindcss = await loadViteWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss() ?? []

    expect(plugins.some(plugin => plugin.name.startsWith('weapp-tailwindcss:style-injector'))).toBe(false)
  })
})
