import type { OutputAsset } from 'rollup'
import type { HmrContext, Plugin, ResolvedConfig, TransformResult } from 'vite'
import type { CreateJsHandlerOptions } from '@/types'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createCache } from '@/cache'
import { collectUniAppXHarmonyApplyStyleSources, createUniAppXHarmonyApplyGeneratorSource, injectUniAppXHarmonyBundleStyles, injectUniAppXStylePlaceholder } from '@/uni-app-x/style-asset'
import { createUniAppXAssetTask, createUniAppXPlugins } from '@/uni-app-x/vite'
import { createUniAppXHarmonyApplyExpander } from '@/uni-app-x/vite/harmony-apply'
import { clearUniAppXStyleIsolationCache } from '@/uni-app-x/style-isolation'
import { resolveUniAppXStyleSource } from '@/uni-app-x/vite/style-source'
import { createViteHmrCssModuleVersionTracker } from '@/bundlers/vite/shared/framework-hmr-module-version'

/** 将平台路径转为 posix 格式，与源码 normalizePath 行为一致 */
function toPosix(p: string): string {
  return p.split(path.sep).join('/')
}

type TransformUVueMock = (
  code: string,
  id: string,
  jsHandler: unknown,
  runtimeSet?: Set<string>,
  options?: unknown,
) => TransformResult | undefined

const transformUVueMock = vi.hoisted(() => vi.fn<Parameters<TransformUVueMock>, TransformResult | undefined>())
vi.mock('@/uni-app-x/transform', () => ({
  transformUVue: transformUVueMock,
}))

const preprocessorSources = {
  scss: [
    '$up-checkbox-icon-wrap-margin-right: 6px !default;',
    '.up-checkbox {',
    '  margin-right: $up-checkbox-icon-wrap-margin-right;',
    '  @apply text-white;',
    '}',
  ].join('\n'),
  sass: [
    '$up-checkbox-icon-wrap-margin-right: 6px !default',
    '.up-checkbox',
    '  margin-right: $up-checkbox-icon-wrap-margin-right',
    '  @apply text-white',
  ].join('\n'),
  less: [
    '@up-checkbox-icon-wrap-margin-right: 6px;',
    '.up-checkbox {',
    '  margin-right: @up-checkbox-icon-wrap-margin-right;',
    '  @apply text-white;',
    '}',
  ].join('\n'),
  styl: [
    '$up-checkbox-icon-wrap-margin-right = 6px',
    '.up-checkbox',
    '  margin-right $up-checkbox-icon-wrap-margin-right',
    '  @apply text-white',
  ].join('\n'),
  stylus: [
    '$up-checkbox-icon-wrap-margin-right = 6px',
    '.up-checkbox',
    '  margin-right $up-checkbox-icon-wrap-margin-right',
    '  @apply text-white',
  ].join('\n'),
} as const

function createAsset(source: string): OutputAsset {
  return {
    type: 'asset',
    fileName: 'entry.js',
    name: undefined,
    source,
  } as unknown as OutputAsset
}

function createChunk(code: string, extra: Record<string, unknown> = {}) {
  return {
    type: 'chunk',
    fileName: 'entry.js',
    name: 'entry',
    code,
    ...extra,
  }
}

function getGenerateBundleHandler(plugin: Plugin | undefined) {
  const hook = plugin?.generateBundle as any
  return typeof hook === 'object' ? hook.handler : hook
}

function getTransformHandler(plugin: Plugin | undefined) {
  const hook = plugin?.transform as any
  return typeof hook === 'object' ? hook.handler : hook
}

function getHotUpdateHandler(plugin: Plugin | undefined) {
  const hook = plugin?.handleHotUpdate as any
  return typeof hook === 'object' ? hook.handler : hook
}

describe('uni-app-x vite plugins', () => {
  it('reuses an authoritative SFC reference for generated local @apply style requests', () => {
    const expander = createUniAppXHarmonyApplyExpander({
      getResolvedConfig: () => undefined,
      isHarmonyBuildTarget: () => true,
      transformCss: async css => css,
    })
    const id = 'C:\\project\\pages\\index\\index.uvue'

    expander.rememberSource([
      '<template><view class="bg-primary" /></template>',
      '<style scoped>',
      '@reference "../../main.css";',
      '.content { @apply flex; }',
      '</style>',
    ].join('\n'), id, true)

    expect(expander.prepareStyles(
      '.wtu-bg-primary { @apply bg-primary; }',
      `${id}?vue&type=style&index=1`,
    )).toBe([
      '@reference "C:/project/main.css";',
      '.wtu-bg-primary { @apply bg-primary; }',
    ].join('\n'))
  })

  it('skips plugin lifecycle work when disabled and ignores unrelated updates', async () => {
    let enabled = false
    let currentConfig: ResolvedConfig = { command: 'serve', build: { watch: false } } as ResolvedConfig
    const styleHandler = vi.fn()
    const ensureRuntimeClassSet = vi.fn(async () => new Set<string>())
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x',
      customAttributesEntities: [],
      disabledDefaultTemplateHandler: false,
      mainCssChunkMatcher: vi.fn(() => true),
      runtimeState: { readyPromise: Promise.resolve() },
      styleHandler,
      jsHandler: vi.fn(),
      ensureRuntimeClassSet,
      getResolvedConfig: () => currentConfig,
      isEnabled: () => enabled,
    })
    const preCssPlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:css:pre')
    const cssPlugin = plugins.find((p): p is Plugin => Boolean(p.name?.includes(':css')))
    const nvuePlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:nvue')
    const placeholderPlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:style-placeholder')

    await getTransformHandler(preCssPlugin)?.call(preCssPlugin, '.a{}', '/foo.css')
    await cssPlugin!.transform?.('.a{}', '/foo.css')
    await nvuePlugin!.buildStart?.()
    await getTransformHandler(nvuePlugin)?.call(nvuePlugin, '<template/>', '/foo.uvue')
    await getHotUpdateHandler(nvuePlugin)?.call(nvuePlugin, { file: '/foo.uvue' } as HmrContext)
    await nvuePlugin!.watchChange?.('/foo.uvue')
    await getGenerateBundleHandler(placeholderPlugin)?.({} as any, {
      'App.uvue.ts': createAsset('const GenAppStyles = []'),
    } as any, false)

    expect(styleHandler).not.toHaveBeenCalled()
    expect(ensureRuntimeClassSet).not.toHaveBeenCalled()
    expect(transformUVueMock).not.toHaveBeenCalled()

    enabled = true
    await getTransformHandler(nvuePlugin)?.call(nvuePlugin, '<template/>', '/foo.ts')
    currentConfig = { command: 'build', build: { watch: false } } as ResolvedConfig
    await getHotUpdateHandler(nvuePlugin)?.call(nvuePlugin, { file: '/foo.uvue' } as HmrContext)
    await nvuePlugin!.watchChange?.('/foo.uvue')
    currentConfig = { command: 'build', build: { watch: true } } as ResolvedConfig
    await nvuePlugin!.watchChange?.('/foo.ts')

    expect(ensureRuntimeClassSet).not.toHaveBeenCalled()
    expect(transformUVueMock).not.toHaveBeenCalled()
  })

  it('detects iOS preprocessor requests from inline lang markers and extensions', async () => {
    const styleHandler = vi.fn()
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x',
      customAttributesEntities: [],
      disabledDefaultTemplateHandler: false,
      isIosPlatform: true,
      mainCssChunkMatcher: vi.fn(() => true),
      runtimeState: { readyPromise: Promise.resolve() },
      styleHandler,
      jsHandler: vi.fn(),
      ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
      isNativeAppStyleTarget: () => true,
      getResolvedConfig: () => ({
        command: 'build',
        build: { outDir: '/project/unpackage/dist/dev/.uvue/app-android', watch: false },
      } as ResolvedConfig),
    })
    const preCssPlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:css:pre')

    await getTransformHandler(preCssPlugin)?.call(preCssPlugin, '$color: red;', '/pages/index/index.lang.less.css')
    await getTransformHandler(preCssPlugin)?.call(preCssPlugin, '$color: red;', '/pages/index/theme.less?direct')

    expect(styleHandler).not.toHaveBeenCalled()
  })

  it('processes Native Tailwind root css and forwards its source boundary', async () => {
    const styleHandler = vi.fn(async (code: string, options?: Record<string, unknown>) => ({
      css: `css:${code}`,
      map: {
        toJSON: () => ({
          version: 3,
          file: options?.postcssOptions?.options?.from ?? '',
          sources: [options?.postcssOptions?.options?.from ?? ''],
          names: [],
          mappings: '',
          sourcesContent: [code],
        }),
      },
    }))
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x',
      customAttributesEntities: [],
      disabledDefaultTemplateHandler: false,
      isIosPlatform: true,
      mainCssChunkMatcher: vi.fn(() => true),
      runtimeState: { readyPromise: Promise.resolve() },
      styleHandler,
      jsHandler: vi.fn(),
      ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
      getResolvedConfig: () => ({
        command: 'build',
        build: { outDir: '/project/unpackage/dist/dev/.uvue/app-android', watch: false },
      } as ResolvedConfig),
    })
    const cssPlugin = plugins.find((p): p is Plugin => Boolean(p.name?.includes(':css')))
    expect(cssPlugin).toBeDefined()

    const source = '@import "tailwindcss";'
    const result = await cssPlugin!.transform?.(source, '/foo.css')

    expect(styleHandler).toHaveBeenCalledWith(
      source,
      expect.objectContaining({
        isMainChunk: true,
        uniAppXCssSource: 'tailwind-root',
        uniAppXUnsupported: 'warn',
        postcssOptions: expect.objectContaining({
          options: expect.objectContaining({
            from: '/foo.css',
            map: expect.objectContaining({ sourcesContent: true }),
          }),
        }),
      }),
    )
    expect(result?.code).toBe(`css:${source}`)
    // formatPostcssSourceMap 使用 path.resolve 后转 posix，Windows 下会带盘符
    const expectedFooCss = toPosix(path.resolve(path.dirname('/foo.css'), '/foo.css'))
    const sourceMap = typeof result?.map === 'string' ? JSON.parse(result.map) : result?.map
    expect(sourceMap?.sources).toContain(expectedFooCss)
    expect(sourceMap?.sourcesContent).toEqual([source])
  })

  it('treats imported Native Tailwind roots as global css when the SFC request is not a main chunk', async () => {
    const styleHandler = vi.fn(async (code: string, options?: Record<string, unknown>) => ({
      css: code,
      map: {
        toJSON: () => ({
          version: 3,
          file: options?.postcssOptions?.options?.from ?? '',
          sources: [options?.postcssOptions?.options?.from ?? ''],
          names: [],
          mappings: '',
          sourcesContent: [code],
        }),
      },
    }))
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x',
      customAttributesEntities: [],
      disabledDefaultTemplateHandler: false,
      mainCssChunkMatcher: vi.fn(() => false),
      runtimeState: { readyPromise: Promise.resolve() },
      styleHandler,
      generateCss: vi.fn(async () => '.space-y-2 > view + view { margin-top: 8px; }\n.flex { display: flex; }'),
      jsHandler: vi.fn(),
      ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
      getResolvedConfig: () => ({
        command: 'build',
        build: { outDir: '/project/unpackage/dist/dev/.uvue/app-harmony', watch: false },
      } as ResolvedConfig),
    })
    const cssPlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:css')

    await cssPlugin!.transform?.(
      '@import "tailwindcss";',
      '/project/App.uvue?vue&type=style&index=0&lang.css',
    )

    expect(styleHandler).toHaveBeenCalledWith(
      expect.stringContaining('.space-y-2'),
      expect.objectContaining({
        isMainChunk: true,
        uniAppXCssSource: 'tailwind-root',
        uniAppXCssTarget: 'uvue',
      }),
    )
  })

  it('extracts the requested style block from a full uni-app x SFC HMR payload', async () => {
    const styleHandler = vi.fn(async (code: string, options?: Record<string, unknown>) => ({
      css: `css:${code}`,
      map: {
        toJSON: () => ({
          version: 3,
          file: options?.postcssOptions?.options?.from ?? '',
          sources: [options?.postcssOptions?.options?.from ?? ''],
          names: [],
          mappings: '',
          sourcesContent: [code],
        }),
      },
    }))
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x',
      customAttributesEntities: [],
      disabledDefaultTemplateHandler: false,
      mainCssChunkMatcher: vi.fn(() => false),
      runtimeState: { readyPromise: Promise.resolve() },
      styleHandler,
      generateCss: vi.fn(async () => undefined),
      jsHandler: vi.fn(),
      ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
      getResolvedConfig: () => ({ command: 'serve', build: { outDir: 'dist/dev/h5', watch: false } } as ResolvedConfig),
      isWebGeneratorTarget: () => true,
    })
    const cssPrePlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:css:pre')
    const id = '/project/pages/index/index.uvue?vue&type=style&index=1&scoped=true&lang.css&direct'
    const source = [
      '<template><text>{{ theme.themeClass }}</text></template>',
      '<style>.root { color: red; }</style>',
      '<style scoped>.content { @apply flex; }</style>',
    ].join('\n')

    const result = await getTransformHandler(cssPrePlugin)?.call(cssPrePlugin, source, id)

    expect(result).toEqual(expect.objectContaining({ code: 'css:.content { @apply flex; }' }))
    expect(styleHandler).toHaveBeenCalledWith(
      '.content { @apply flex; }',
      expect.objectContaining({ postcssOptions: expect.any(Object) }),
    )
    expect(styleHandler.mock.calls[0]?.[0]).not.toContain('<template>')
  })

  it('skips Vite CSS HMR wrappers in the uni-app x CSS transformer', async () => {
    const styleHandler = vi.fn()
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x',
      customAttributesEntities: [],
      disabledDefaultTemplateHandler: false,
      mainCssChunkMatcher: vi.fn(() => false),
      runtimeState: { readyPromise: Promise.resolve() },
      styleHandler,
      generateCss: vi.fn(),
      jsHandler: vi.fn(),
      ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
      getResolvedConfig: () => ({ command: 'serve', build: { outDir: 'dist/dev/h5', watch: false } } as ResolvedConfig),
      isWebGeneratorTarget: () => true,
    })
    const cssPrePlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:css:pre')
    const cssPlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:css')
    const id = '/project/pages/index/index.uvue?vue&type=style&index=1&scoped=true&lang.css&direct'
    const hmrCode = [
      `const __vite__css = ${JSON.stringify('<style scoped>.content { @apply flex; }</style>')}`,
      '__vite__updateStyle(__vite__id, __vite__css)',
    ].join('\n')

    await expect(getTransformHandler(cssPrePlugin)?.call(cssPrePlugin, hmrCode, id)).resolves.toBeUndefined()
    await expect(getTransformHandler(cssPlugin)?.call(cssPlugin, hmrCode, id)).resolves.toBeUndefined()
    expect(styleHandler).not.toHaveBeenCalled()
  })

  it('skips CSS HMR wrappers before query parsing when the request is not a Vue style module', () => {
    const hmrCode = [
      `const __vite__css = ${JSON.stringify('<template><view class="mt-24!" /></template>')}`,
      '__vite__updateStyle(__vite__id, __vite__css)',
    ].join('\n')

    expect(resolveUniAppXStyleSource(hmrCode, {} as any)).toEqual({ skip: true })
  })

  it('skips pre hook for preprocessor styles and runs after preprocess', async () => {
    const originalPlatform = process.env.UNI_UTS_PLATFORM
    process.env.UNI_UTS_PLATFORM = 'app-ios'
    try {
      const styleHandler = vi.fn(async (code: string, options?: Record<string, unknown>) => ({
        css: `css:${code}`,
        map: {
          toJSON: () => ({
            version: 3,
            file: options?.postcssOptions?.options?.from ?? '',
            sources: [options?.postcssOptions?.options?.from ?? ''],
            names: [],
            mappings: '',
            sourcesContent: [code],
          }),
        },
      }))
      const plugins = createUniAppXPlugins({
        appType: 'uni-app-x',
        customAttributesEntities: [['a-navbar', ['leftClass']]],
        disabledDefaultTemplateHandler: false,
        isIosPlatform: true,
        mainCssChunkMatcher: vi.fn(() => true),
        runtimeState: { readyPromise: Promise.resolve() },
        styleHandler,
        jsHandler: vi.fn(),
        ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
        getResolvedConfig: () => ({ command: 'build', build: { watch: false } } as ResolvedConfig),
      })
      const cssPlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:css')
      const preCssPlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:css:pre')
      expect(cssPlugin).toBeDefined()
      expect(preCssPlugin).toBeDefined()

      const scssId = '/pages/index/index.uvue?vue&type=style&index=0&lang.scss'

      const preResult = await getTransformHandler(preCssPlugin)?.call(preCssPlugin, '$color: red;', scssId)
      expect(preResult).toBeUndefined()
      expect(styleHandler).not.toHaveBeenCalled()

      const generatedApplyResult = await getTransformHandler(preCssPlugin)?.call(preCssPlugin,
        '.issue-1002-apply { border-radius: calc(infinity * 1px); }',
        scssId,
      )
      expect(generatedApplyResult).toEqual({
        code: '.issue-1002-apply { border-radius: 9999px; }',
        map: null,
      })
      expect(styleHandler).not.toHaveBeenCalled()

      const result = await cssPlugin!.transform?.('body { color: red; }', scssId)
      expect(result).toBeUndefined()
      expect(styleHandler).not.toHaveBeenCalled()
    }
    finally {
      process.env.UNI_UTS_PLATFORM = originalPlatform
    }
  })

  it('leaves Native preprocessor author styles to the framework on non-iOS platforms', async () => {
    const styleHandler = vi.fn(async (code: string, options?: Record<string, unknown>) => ({
      css: `css:${code}`,
      map: {
        toJSON: () => ({
          version: 3,
          file: options?.postcssOptions?.options?.from ?? '',
          sources: [options?.postcssOptions?.options?.from ?? ''],
          names: [],
          mappings: '',
          sourcesContent: [code],
        }),
      },
    }))
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x',
      customAttributesEntities: [],
      disabledDefaultTemplateHandler: false,
      isIosPlatform: false,
      mainCssChunkMatcher: vi.fn(() => true),
      runtimeState: { readyPromise: Promise.resolve() },
      styleHandler,
      jsHandler: vi.fn(),
      ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
      getResolvedConfig: () => ({
        command: 'build',
        build: { outDir: '/project/unpackage/dist/dev/.uvue/app-android', watch: false },
      } as ResolvedConfig),
    })
    const preCssPlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:css:pre')
    expect(preCssPlugin).toBeDefined()

    const scssId = '/pages/index/index.uvue?vue&type=style&index=0&lang.scss'
    await getTransformHandler(preCssPlugin)?.call(preCssPlugin, '$color: red;', scssId)
    expect(styleHandler).not.toHaveBeenCalled()
  })

  it('expands component-local @apply before the Native SCSS compiler', async () => {
    const styleHandler = vi.fn(async (code: string, options?: Record<string, unknown>) => ({
      css: `css:${code}`,
      map: {
        toJSON: () => ({
          version: 3,
          file: options?.postcssOptions?.options?.from ?? '',
          sources: [options?.postcssOptions?.options?.from ?? ''],
          names: [],
          mappings: '',
          sourcesContent: [code],
        }),
      },
    }))
    const generateCss = vi.fn(async () => '.wtu-transform { transform: translate(0, 0); }')
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x',
      customAttributesEntities: [],
      disabledDefaultTemplateHandler: false,
      isIosPlatform: false,
      mainCssChunkMatcher: vi.fn(() => false),
      runtimeState: { readyPromise: Promise.resolve() },
      styleHandler,
      generateCss,
      jsHandler: vi.fn(),
      ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
      isNativeAppStyleTarget: () => true,
      getResolvedConfig: () => ({
        command: 'build',
        build: { outDir: '/project/unpackage/dist/dev/.uvue/app-android', watch: false },
      } as ResolvedConfig),
    })
    const preCssPlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:css:pre')
    const id = '/components/line/line.uvue?vue&type=style&index=0&lang.scss&scoped=true'
    const source = '.wtu-transform { @apply transform; }'

    const result = await getTransformHandler(preCssPlugin)?.call(preCssPlugin, source, id)

    expect(generateCss).toHaveBeenCalledWith(id, source, expect.objectContaining({
      disableSourceScan: true,
      sourceCandidates: [],
      transient: true,
    }))
    expect(styleHandler).toHaveBeenCalledWith(
      '.wtu-transform { transform: translate(0, 0); }',
      expect.objectContaining({
        uniAppXCssSource: 'author-apply',
        uniAppXCssTarget: 'uvue',
      }),
    )
    expect(result).toEqual(expect.objectContaining({
      code: 'css:.wtu-transform { transform: translate(0, 0); }',
    }))
  })

  it('leaves component-local @apply styles to the Web preprocessor before generation', async () => {
    const styleHandler = vi.fn()
    const generateCss = vi.fn()
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x',
      customAttributesEntities: [],
      disabledDefaultTemplateHandler: false,
      isIosPlatform: false,
      mainCssChunkMatcher: vi.fn(() => false),
      runtimeState: { readyPromise: Promise.resolve() },
      styleHandler,
      generateCss,
      jsHandler: vi.fn(),
      ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
      isWebGeneratorTarget: () => true,
      getResolvedConfig: () => ({
        command: 'serve',
        build: { outDir: '/project/unpackage/dist/dev/web', watch: false },
      } as ResolvedConfig),
    })
    const preCssPlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:css:pre')
    const id = '/uni_modules/uview-ultra/components/up-line/up-line.uvue?vue&type=style&index=0&scoped=abc&lang.scss'
    const source = [
      '@import "../../libs/css/components.scss";',
      '.up-line {}',
      '.wtu-transform { @apply transform; }',
    ].join('\n')

    const result = await getTransformHandler(preCssPlugin)?.call(preCssPlugin, source, id)

    expect(result).toBeUndefined()
    expect(generateCss).not.toHaveBeenCalled()
    expect(styleHandler).not.toHaveBeenCalled()
  })

  it('normalizes important @apply before the Web Sass HMR preprocessor', async () => {
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x',
      customAttributesEntities: [],
      disabledDefaultTemplateHandler: false,
      mainCssChunkMatcher: vi.fn(() => false),
      runtimeState: { readyPromise: Promise.resolve() },
      styleHandler: vi.fn(),
      jsHandler: vi.fn(),
      ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
      isWebGeneratorTarget: () => true,
      getResolvedConfig: () => ({
        command: 'serve',
        build: { outDir: '/project/unpackage/dist/dev/web', watch: false },
      } as ResolvedConfig),
    })
    const preCssPlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:css:pre')
    const id = '/pages/index/index.uvue?vue&type=style&index=0&scoped=abc&lang.scss'

    const result = await getTransformHandler(preCssPlugin)?.call(preCssPlugin, '.probe { @apply !mt-6 mt-6!; }', id)

    expect(result).toEqual({
      code: '.probe { @apply mt-6__weapp_tw_important__ mt-6__weapp_tw_important__; }',
      map: null,
    })
  })

  it.each(Object.entries(preprocessorSources))('leaves mini-program %s variables and local @apply to the framework preprocessor', async ([lang, source]) => {
    const styleHandler = vi.fn()
    const generateCss = vi.fn()
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x',
      customAttributesEntities: [],
      disabledDefaultTemplateHandler: false,
      isIosPlatform: false,
      mainCssChunkMatcher: vi.fn(() => false),
      runtimeState: { readyPromise: Promise.resolve() },
      styleHandler,
      generateCss,
      jsHandler: vi.fn(),
      ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
      isNativeAppStyleTarget: () => false,
      isWebGeneratorTarget: () => false,
      getResolvedConfig: () => ({
        command: 'build',
        build: { outDir: '/project/unpackage/dist/dev/mp-weixin', watch: false },
      } as ResolvedConfig),
    })
    const preCssPlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:css:pre')
    const id = `/uni_modules/uview-ultra/components/up-checkbox/up-checkbox.uvue?vue&type=style&index=0&scoped=abc&lang=${lang}`

    const result = await getTransformHandler(preCssPlugin)?.call(preCssPlugin, source, id)

    expect(result).toBeUndefined()
    expect(generateCss).not.toHaveBeenCalled()
    expect(styleHandler).not.toHaveBeenCalled()
  })

  it('records uni-app-x style @apply for generator css without short-circuiting style handling', async () => {
    const styleHandler = vi.fn(async (code: string, options?: Record<string, unknown>) => ({
      css: `css:${code}`,
      map: {
        toJSON: () => ({
          version: 3,
          file: options?.postcssOptions?.options?.from ?? '',
          sources: [options?.postcssOptions?.options?.from ?? ''],
          names: [],
          mappings: '',
          sourcesContent: [code],
        }),
      },
    }))
    const generateCss = vi.fn(async () => '.content{display:flex}')
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x',
      customAttributesEntities: [],
      disabledDefaultTemplateHandler: false,
      isIosPlatform: false,
      mainCssChunkMatcher: vi.fn(() => false),
      runtimeState: { readyPromise: Promise.resolve() },
      styleHandler,
      generateCss,
      jsHandler: vi.fn(),
      ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
      getResolvedConfig: () => ({
        command: 'build',
        build: { outDir: '/project/unpackage/dist/dev/.uvue/app-android', watch: false },
      } as ResolvedConfig),
    })
    const cssPlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:css')
    expect(cssPlugin).toBeDefined()

    const id = '/pages/index/index.uvue?vue&type=style&index=0&lang.scss&scoped=true'
    const result = await cssPlugin!.transform?.('.content { @apply flex; }', id)

    expect(generateCss).toHaveBeenCalledWith(id, '.content { @apply flex; }', expect.objectContaining({
      disableSourceScan: true,
      sourceCandidates: [],
      transient: true,
    }))
    expect(styleHandler).toHaveBeenCalledTimes(1)
    expect(styleHandler).toHaveBeenCalledWith(
      '.content{display:flex}',
      expect.objectContaining({ uniAppXCssSource: 'author-apply' }),
    )
    expect(result?.code).toBe('css:.content{display:flex}')
  })

  it('keeps only author rules when expanding scoped @apply styles', async () => {
    const styleHandler = vi.fn(async (code: string, options?: Record<string, unknown>) => ({
      css: code,
      map: {
        toJSON: () => ({
          version: 3,
          file: options?.postcssOptions?.options?.from ?? '',
          sources: [options?.postcssOptions?.options?.from ?? ''],
          names: [],
          mappings: '',
          sourcesContent: [code],
        }),
      },
    }))
    const generateCss = vi.fn(async () => [
      '/*! tailwindcss v4.3.3 */',
      'view,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border:0 solid}',
      '.flex{display:flex}',
      '.content{display:flex;color:var(--author-color,red)}',
      '@supports (display:grid){.content{display:grid}}',
      '@property --tw-content { syntax: "*"; inherits: false; initial-value: ""; }',
    ].join('\n'))
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x',
      customAttributesEntities: [],
      disabledDefaultTemplateHandler: false,
      mainCssChunkMatcher: vi.fn(() => false),
      runtimeState: { readyPromise: Promise.resolve() },
      styleHandler,
      generateCss,
      jsHandler: vi.fn(),
      ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
      getResolvedConfig: () => ({ command: 'serve', build: { watch: false } } as ResolvedConfig),
    })
    const cssPlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:css')
    const id = '/pages/index/index.uvue?vue&type=style&index=0&lang.scss&scoped=true'
    const result = await cssPlugin!.transform?.([
      '@reference "../../main.css";',
      '.content { @apply flex; color: var(--author-color, red); }',
      '@supports (display: grid) { .content { @apply flex; } }',
    ].join('\n'), id)

    expect(result?.code).toContain('.content{display:flex;color:var(--author-color,red)}')
    expect(result?.code).toContain('@supports (display:grid){.content{display:grid}}')
    expect(result?.code).not.toContain('view,text')
    expect(result?.code).not.toContain('.flex{')
    expect(result?.code).not.toContain('@property')
    expect(result?.code).not.toContain('tailwindcss v4')
  })

  it('keeps scoped uvue author css outside the generated css handler', async () => {
    const scopedCss = [
      'view.data-v-abc{color:red}',
      '.card.data-v-abc{padding:16px}',
      '.card.data-v-abc .title.data-v-abc{font-weight:700}',
    ].join('')
    const styleHandler = vi.fn(async (_code: string, options?: Record<string, any>) => ({
      css: scopedCss,
      map: {
        toJSON: () => ({
          version: 3,
          file: options?.postcssOptions?.options?.from ?? '',
          sources: [options?.postcssOptions?.options?.from ?? ''],
          names: [],
          mappings: '',
          sourcesContent: [scopedCss],
        }),
      },
      warnings: () => [],
    }))
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x',
      customAttributesEntities: [],
      disabledDefaultTemplateHandler: false,
      isIosPlatform: false,
      mainCssChunkMatcher: vi.fn(() => false),
      runtimeState: { readyPromise: Promise.resolve() },
      styleHandler,
      jsHandler: vi.fn(),
      ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
      getResolvedConfig: () => ({
        command: 'build',
        build: { outDir: '/project/unpackage/dist/dev/.uvue/app-android', watch: false },
      } as ResolvedConfig),
    })
    const cssPlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:css')
    expect(cssPlugin).toBeDefined()

    const id = '/src/components/ScopedChild.uvue?vue&type=style&index=0&scoped=abc&lang.css'
    const result = await cssPlugin!.transform?.('.card { padding: 16px; }', id)

    expect(styleHandler).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
  })

  it('leaves H5 uvue author styles to the Sass and Vue scoped pipeline', async () => {
    const id = '/src/components/ScopedChild.uvue?vue&type=style&index=0&scoped=abc&lang.css'
    const styleHandler = vi.fn(async (code: string, options?: Record<string, any>) => ({
      css: code,
      map: {
        toJSON: () => ({
          version: 3,
          file: options?.postcssOptions?.options?.from ?? '',
          sources: [options?.postcssOptions?.options?.from ?? ''],
          names: [],
          mappings: '',
          sourcesContent: [code],
        }),
      },
      warnings: () => [],
    }))
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x',
      customAttributesEntities: [],
      disabledDefaultTemplateHandler: false,
      isIosPlatform: false,
      mainCssChunkMatcher: vi.fn(() => false),
      runtimeState: { readyPromise: Promise.resolve() },
      styleHandler,
      jsHandler: vi.fn(),
      ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
      getResolvedConfig: () => ({
        command: 'build',
        build: { outDir: '/project/unpackage/dist/build/h5', watch: false },
      } as ResolvedConfig),
    })
    const cssPlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:css')

    const result = await cssPlugin!.transform?.('.up-button { &--primary { display: inline-flex; } }', id)

    expect(result).toBeUndefined()
    expect(styleHandler).not.toHaveBeenCalled()
  })

  it('runs nvue transform with runtime set and custom options', async () => {
    const runtimeSet = new Set(['alpha'])
    const ensureRuntimeClassSet = vi.fn(async () => runtimeSet)
    const jsHandler = vi.fn()
    const customAttributesEntities = [['*', ['foo']]]
    let currentConfig: ResolvedConfig = { command: 'serve', build: { watch: false } } as ResolvedConfig
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x',
      customAttributesEntities,
      disabledDefaultTemplateHandler: true,
      mainCssChunkMatcher: vi.fn(() => true),
      runtimeState: { readyPromise: Promise.resolve() },
      styleHandler: vi.fn(),
      jsHandler,
      ensureRuntimeClassSet,
      getResolvedConfig: () => currentConfig,
    })
    const nvuePlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:nvue')
    const cssPrePlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:css:pre')
    expect(nvuePlugin).toBeDefined()
    transformUVueMock.mockReturnValue({ code: 'transformed', map: null } as TransformResult)

    await nvuePlugin!.buildStart?.()
    expect(ensureRuntimeClassSet).toHaveBeenCalledWith()

    const transformResult = await getTransformHandler(nvuePlugin)?.call(nvuePlugin, '<template/>', '/foo.uvue')
    expect(transformUVueMock).toHaveBeenCalledWith(
      '<template/>',
      '/foo.uvue',
      jsHandler,
      runtimeSet,
      {
        customAttributesEntities,
        disabledDefaultTemplateHandler: true,
        native: true,
        localStyleVariants: true,
      },
    )
    expect(transformResult).toEqual({ code: 'transformed', map: null })

    await getHotUpdateHandler(nvuePlugin)?.call(nvuePlugin, { file: '/foo.uvue' } as HmrContext)
    expect(ensureRuntimeClassSet).toHaveBeenCalledWith()

    currentConfig = { command: 'build', build: { watch: true } } as ResolvedConfig
    await nvuePlugin!.watchChange?.('/foo.uvue?vue&type=template')
    expect(ensureRuntimeClassSet).toHaveBeenCalledWith()
  })

  it('reloads a native app when a uvue hot update expands the runtime class set', async () => {
    const initialRuntimeSet = new Set(['text-red-500'])
    const expandedRuntimeSet = new Set(['text-red-500', 'bg-blue-500'])
    const ensureRuntimeClassSet = vi.fn()
      .mockResolvedValueOnce(initialRuntimeSet)
      .mockResolvedValueOnce(expandedRuntimeSet)
      .mockResolvedValueOnce(initialRuntimeSet)
    const send = vi.fn()
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x',
      customAttributesEntities: [],
      disabledDefaultTemplateHandler: false,
      mainCssChunkMatcher: vi.fn(() => true),
      runtimeState: { readyPromise: Promise.resolve() },
      styleHandler: vi.fn(),
      jsHandler: vi.fn(),
      ensureRuntimeClassSet,
      getResolvedConfig: () => ({
        command: 'serve',
        build: { outDir: '/project/unpackage/dist/dev/.uvue/app-android', watch: false },
      } as ResolvedConfig),
    })
    const nvuePlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:nvue')
    const context = {
      file: '/project/pages/index/index.uvue',
      modules: [],
      server: { ws: { send } },
    } as unknown as HmrContext

    await nvuePlugin!.buildStart?.()
    await getHotUpdateHandler(nvuePlugin)?.call(nvuePlugin, context)

    expect(send).toHaveBeenCalledWith({
      type: 'full-reload',
      path: '*',
      triggeredBy: context.file,
    })

    send.mockClear()
    await getHotUpdateHandler(nvuePlugin)?.call(nvuePlugin, context)
    expect(send).toHaveBeenCalledWith({
      type: 'full-reload',
      path: '*',
      triggeredBy: context.file,
    })
  })

  it('invalidates and returns deduplicated Tailwind CSS modules for uvue hot updates', async () => {
    const projectRoot = path.resolve('/project')
    const sourceFile = toPosix(path.join(projectRoot, 'pages', 'index', 'index.uvue'))
    const cssFile = toPosix(path.join(projectRoot, 'main.css'))
    const runtimeSet = new Set(['text-red-500'])
    const sourceModule = { id: sourceFile, url: '/pages/index/index.uvue' }
    const cssModule = { file: cssFile, id: `${cssFile}?direct`, url: '/main.css?direct' }
    const invalidateModule = vi.fn()
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x',
      customAttributesEntities: [],
      disabledDefaultTemplateHandler: false,
      mainCssChunkMatcher: vi.fn(() => true),
      runtimeState: { readyPromise: Promise.resolve() },
      styleHandler: vi.fn(),
      jsHandler: vi.fn(),
      ensureRuntimeClassSet: vi.fn(async () => runtimeSet),
      getResolvedConfig: () => ({
        command: 'serve',
        build: { outDir: path.join(projectRoot, 'unpackage', 'dist', 'dev', '.uvue', 'app-android'), watch: false },
      } as ResolvedConfig),
      tailwindRootCssModuleIds: new Set([cssFile]),
      viteProcessedCssSourceFiles: new Set([cssFile]),
    })
    const nvuePlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:nvue')
    const context = {
      file: sourceFile,
      modules: [sourceModule, cssModule],
      server: {
        config: { root: projectRoot },
        moduleGraph: {
          getModuleById: vi.fn(() => undefined),
          getModulesByFile: vi.fn((file: string) => file === cssFile ? new Set([cssModule]) : undefined),
          invalidateModule,
        },
      },
    } as unknown as HmrContext

    await nvuePlugin!.buildStart?.()
    const modules = await getHotUpdateHandler(nvuePlugin)?.call(nvuePlugin, context)

    expect(invalidateModule).toHaveBeenCalledWith(cssModule)
    expect(modules).toEqual([sourceModule, cssModule])
  })

  it('synchronizes candidates before retransforms for Native add, delete, and rollback updates', async () => {
    const projectRoot = path.resolve('/project')
    const sourceFile = toPosix(path.join(projectRoot, 'pages', 'index', 'index.uvue'))
    const cssFile = toPosix(path.join(projectRoot, 'main.css'))
    const order: string[] = []
    let runtimeSet = new Set(['text-red-500'])
    const ensureRuntimeClassSet = vi.fn(async () => {
      order.push('runtime')
      return new Set(runtimeSet)
    })
    const syncSourceCandidatesForHotUpdate = vi.fn(async () => {
      order.push('sync')
    })
    const send = vi.fn()
    const sourceModule = {
      file: sourceFile,
      id: sourceFile,
      url: '/pages/index/index.uvue',
      isSelfAccepting: true,
    }
    const cssModule = {
      file: cssFile,
      id: `${cssFile}?direct`,
      url: '/main.css?direct',
    }
    const invalidateModule = vi.fn((mod: { file: string }) => {
      order.push(`invalidate:${mod.file}`)
    })
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x',
      customAttributesEntities: [],
      disabledDefaultTemplateHandler: false,
      mainCssChunkMatcher: vi.fn(() => true),
      runtimeState: { readyPromise: Promise.resolve() },
      styleHandler: vi.fn(),
      jsHandler: vi.fn(),
      ensureRuntimeClassSet,
      syncSourceCandidatesForHotUpdate,
      getResolvedConfig: () => ({
        command: 'serve',
        root: projectRoot,
        build: { outDir: path.join(projectRoot, 'unpackage', 'dist', 'dev', '.uvue', 'app-android'), watch: false },
      } as ResolvedConfig),
      tailwindRootCssModuleIds: new Set([cssFile]),
    })
    const nvuePlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:nvue')
    const context = {
      file: sourceFile,
      modules: [sourceModule],
      server: {
        config: { root: projectRoot },
        moduleGraph: {
          getModuleById: vi.fn((id: string) => id === sourceModule.id ? sourceModule : undefined),
          getModulesByFile: vi.fn((file: string) => {
            if (file === sourceModule.file) {
              return new Set([sourceModule])
            }
            if (file === cssModule.file) {
              return new Set([cssModule])
            }
            return undefined
          }),
          invalidateModule,
        },
        ws: { send },
      },
    } as unknown as HmrContext

    await nvuePlugin!.buildStart?.()
    for (const nextRuntime of [
      new Set(['text-red-500', 'mt-200']),
      new Set(['text-red-500']),
      new Set(['text-red-500', 'mt-200']),
    ]) {
      runtimeSet = nextRuntime
      order.length = 0
      invalidateModule.mockClear()
      const modules = await getHotUpdateHandler(nvuePlugin)?.call(nvuePlugin, context)

      expect(order.slice(0, 2)).toEqual(['sync', 'runtime'])
      expect(invalidateModule).toHaveBeenCalledWith(sourceModule)
      expect(invalidateModule).toHaveBeenCalledWith(cssModule)
      expect(modules).toEqual([sourceModule, cssModule])
      expect(send).not.toHaveBeenCalled()
    }
  })

  it('retransforms loaded Native local style modules when a Tailwind root changes the candidate signature', async () => {
    const projectRoot = path.resolve('/project')
    const sourceFile = toPosix(path.join(projectRoot, 'pages', 'index', 'index.uvue'))
    const cssFile = toPosix(path.join(projectRoot, 'main.css'))
    let runtimeSet = new Set(['text-red-500'])
    const ensureRuntimeClassSet = vi.fn(async () => new Set(runtimeSet))
    const pageModule = {
      file: sourceFile,
      id: sourceFile,
      url: '/pages/index/index.uvue',
      isSelfAccepting: true,
    }
    const cssModule = {
      file: cssFile,
      id: `${cssFile}?direct`,
      url: '/main.css?direct',
    }
    const invalidateModule = vi.fn()
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x',
      customAttributesEntities: [],
      disabledDefaultTemplateHandler: false,
      mainCssChunkMatcher: vi.fn(() => true),
      runtimeState: { readyPromise: Promise.resolve() },
      styleHandler: vi.fn(),
      jsHandler: vi.fn(),
      ensureRuntimeClassSet,
      syncSourceCandidatesForHotUpdate: vi.fn(),
      getResolvedConfig: () => ({
        command: 'serve',
        root: projectRoot,
        build: { outDir: path.join(projectRoot, 'unpackage', 'dist', 'dev', '.uvue', 'app-android'), watch: false },
      } as ResolvedConfig),
      tailwindRootCssModuleIds: new Set([cssFile]),
    })
    const nvuePlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:nvue')
    transformUVueMock.mockReturnValue({ code: 'transformed', map: null } as TransformResult)
    await nvuePlugin!.buildStart?.()
    await getTransformHandler(nvuePlugin)?.call(nvuePlugin, '<template><view class="issue-1021-hmr" /></template>', pageModule.id)

    runtimeSet = new Set(['text-red-500', 'issue-1021-hmr'])
    const modules = await getHotUpdateHandler(nvuePlugin)?.call(nvuePlugin, {
      file: cssFile,
      modules: [cssModule],
      read: vi.fn(async () => '@theme { --color-issue-1021-hmr: #0f5132; }'),
      server: {
        config: { root: projectRoot },
        moduleGraph: {
          getModuleById: vi.fn((id: string) => {
            if (id === pageModule.id) {
              return pageModule
            }
            if (id === cssModule.id) {
              return cssModule
            }
            return undefined
          }),
          getModulesByFile: vi.fn((file: string) => {
            if (file === pageModule.file) {
              return new Set([pageModule])
            }
            if (file === cssModule.file) {
              return new Set([cssModule])
            }
            return undefined
          }),
          invalidateModule,
        },
        ws: { send: vi.fn() },
      },
    } as unknown as HmrContext)

    expect(invalidateModule).toHaveBeenCalledWith(pageModule)
    expect(invalidateModule).toHaveBeenCalledWith(cssModule)
    expect(modules).toEqual([pageModule, cssModule])
  })

  it('adds the bridged scoped style module to web uvue hot updates', async () => {
    const ensureRuntimeClassSet = vi.fn(async () => new Set(['text-red-500']))
    const invalidateModule = vi.fn()
    const send = vi.fn()
    const webCssEntryDiagnostics = {
      dispose: vi.fn(),
      flush: vi.fn(),
      observeSourceImports: vi.fn(),
      requestCheck: vi.fn(),
    }
    const hmrCssModuleVersions = createViteHmrCssModuleVersionTracker()
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x',
      customAttributesEntities: [['a-navbar', ['leftClass']]],
      disabledDefaultTemplateHandler: false,
      mainCssChunkMatcher: vi.fn(() => true),
      runtimeState: { readyPromise: Promise.resolve() },
      styleHandler: vi.fn(),
      jsHandler: vi.fn(),
      ensureRuntimeClassSet,
      getResolvedConfig: () => ({ command: 'serve', root: '/project' } as ResolvedConfig),
      isWebGeneratorTarget: () => true,
      tailwindRootCssModuleIds: new Set(['/project/main.css']),
      viteProcessedCssSourceFiles: new Set(['/project/main.css']),
      webCssEntryDiagnostics,
      hmrCssModuleVersions,
    })
    const nvuePlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:nvue')
    const cssPrePlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:css:pre')
    const pageModule = { id: '/project/pages/index/index.uvue', url: '/pages/index/index.uvue' }
    const styleModule = {
      id: '/project/pages/index/index.uvue?vue&type=style&index=0&scoped=abc&lang.scss',
      url: '/pages/index/index.uvue?vue&type=style&index=0&scoped=abc&lang.scss',
    }
    hmrCssModuleVersions.filterModules([styleModule as any], 200, '/project')
    const context = {
      file: '/project/pages/index/index.uvue',
      modules: [pageModule],
      timestamp: 100,
      read: vi.fn(async () => '<template><a-navbar leftClass="text-red-500" /></template><style scoped>.author { color: red; }</style>'),
      server: {
        config: { root: '/project' },
        moduleGraph: {
          getModuleById: vi.fn(),
          getModulesByFile: vi.fn(() => new Set([pageModule, styleModule])),
          invalidateModule,
        },
        ws: { send },
      },
    } as unknown as HmrContext

    expect(nvuePlugin?.handleHotUpdate).toMatchObject({ order: 'post' })

    await nvuePlugin!.buildStart?.()
    ensureRuntimeClassSet.mockClear()
    transformUVueMock.mockImplementation((_code, _id, _jsHandler, _runtimeSet, options) => {
      const bridge = (options as { onWebLocalStyleRules?: (rules: string) => void }).onWebLocalStyleRules
      bridge?.('.wtu-hmr { @apply text-red-500; }\n')
      return { code: 'transformed', map: null } as TransformResult
    })
    const modules = await getHotUpdateHandler(nvuePlugin)?.call(nvuePlugin, context)

    expect(modules).toEqual([pageModule, styleModule])
    expect(ensureRuntimeClassSet).toHaveBeenCalledWith()
    expect(invalidateModule).toHaveBeenCalledWith(styleModule)
    expect(send).not.toHaveBeenCalled()
    expect(webCssEntryDiagnostics.requestCheck).toHaveBeenCalledTimes(1)
    const styleResult = await getTransformHandler(cssPrePlugin)?.call(
      cssPrePlugin,
      '.author { color: red; }',
      styleModule.id,
    ) as TransformResult
    expect(styleResult).toEqual({
      code: '.author { color: red; }\n.wtu-hmr { @apply text-red-500; }\n',
      map: null,
    })

    await nvuePlugin!.buildEnd?.()
    await nvuePlugin!.closeBundle?.()
    expect(webCssEntryDiagnostics.flush).toHaveBeenCalledTimes(1)
    expect(webCssEntryDiagnostics.dispose).toHaveBeenCalledTimes(1)
  })

  it('waits for concurrent SFC local style collection before transforming its style module', async () => {
    let releaseCandidates!: () => void
    const candidatesReady = new Promise<void>((resolve) => {
      releaseCandidates = resolve
    })
    const registerModuleGraphCandidates = vi.fn(async () => {
      await candidatesReady
      return new Set(['bg-primary'])
    })
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x',
      customAttributesEntities: [],
      disabledDefaultTemplateHandler: false,
      mainCssChunkMatcher: vi.fn(() => true),
      registerModuleGraphCandidates,
      runtimeState: { readyPromise: Promise.resolve() },
      styleHandler: vi.fn(),
      jsHandler: vi.fn(),
      ensureRuntimeClassSet: vi.fn(async () => new Set(['bg-primary'])),
      getResolvedConfig: () => ({ command: 'serve', root: '/project' } as ResolvedConfig),
      isWebGeneratorTarget: () => true,
      uniAppX: {
        enabled: true,
        componentLocalStyles: {
          enabled: true,
          onlyWhenStyleIsolationVersion2: false,
        },
      },
    })
    const nvuePlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:nvue')
    const cssPrePlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:css:pre')
    transformUVueMock.mockImplementation((_code, _id, _jsHandler, _runtimeSet, options) => {
      const bridge = (options as { onWebLocalStyleRules?: (rules: string) => void }).onWebLocalStyleRules
      bridge?.('.wtu-concurrent { @apply bg-primary; }\n')
      return { code: 'transformed', map: null } as TransformResult
    })

    const sfcTransform = getTransformHandler(nvuePlugin)?.call(
      nvuePlugin,
      '<template><view class="bg-primary" /></template><style scoped>.author { color: red; }</style>',
      '/project/pages/index/index.uvue',
    )
    await vi.waitFor(() => expect(registerModuleGraphCandidates).toHaveBeenCalled())
    let styleTransformSettled = false
    const styleTransform = getTransformHandler(cssPrePlugin)?.call(
      cssPrePlugin,
      '.author { color: red; }',
      '/project/pages/index/index.uvue?vue&type=style&index=0&scoped=abc&lang.scss',
    ).finally(() => {
      styleTransformSettled = true
    })
    await Promise.resolve()
    expect(styleTransformSettled).toBe(false)

    releaseCandidates()
    await sfcTransform
    await expect(styleTransform).resolves.toEqual({
      code: '.author { color: red; }\n.wtu-concurrent { @apply bg-primary; }\n',
      map: null,
    })
  })

  it('falls back to a full reload for Web HMR when an SFC contains important Sass apply', async () => {
    const send = vi.fn()
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x',
      customAttributesEntities: [],
      disabledDefaultTemplateHandler: false,
      mainCssChunkMatcher: vi.fn(() => true),
      runtimeState: { readyPromise: Promise.resolve() },
      styleHandler: vi.fn(),
      jsHandler: vi.fn(),
      ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
      isWebGeneratorTarget: () => true,
      getResolvedConfig: () => ({ command: 'serve', root: '/project' } as ResolvedConfig),
    })
    const nvuePlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:nvue')
    const context = {
      file: '/project/pages/index/index.uvue',
      modules: [],
      read: vi.fn(async () => '<template><view /></template><style lang="scss">.probe { @apply mt-6!; }</style>'),
      server: { ws: { send } },
    } as unknown as HmrContext

    const modules = await getHotUpdateHandler(nvuePlugin)?.call(nvuePlugin, context)

    expect(modules).toEqual([])
    expect(send).toHaveBeenCalledWith({ type: 'full-reload', path: context.file })
  })

  it('enables component local style transform when manifest.json sets styleIsolationVersion=2', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-tw-issue-822-'))
    try {
      await fs.writeFile(path.join(root, 'manifest.json'), `{
  // HBuilderX manifest.json allows comments
  "uni-app-x": {
    /* issue 822 regression */
    "styleIsolationVersion": "2"
  }
}
`, 'utf8')
      clearUniAppXStyleIsolationCache()
      const runtimeSet = new Set(['alpha'])
      const ensureRuntimeClassSet = vi.fn(async () => runtimeSet)
      const jsHandler = vi.fn()
      const plugins = createUniAppXPlugins({
        appType: 'uni-app-x',
        customAttributesEntities: [],
        disabledDefaultTemplateHandler: false,
        mainCssChunkMatcher: vi.fn(() => true),
        runtimeState: { readyPromise: Promise.resolve() },
        styleHandler: vi.fn(),
        jsHandler,
        ensureRuntimeClassSet,
        getResolvedConfig: () => ({ command: 'build', build: { watch: false }, root } as ResolvedConfig),
        uniAppX: {
          enabled: true,
          componentLocalStyles: true,
        },
      })
      const nvuePlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:nvue')
      expect(nvuePlugin).toBeDefined()
      transformUVueMock.mockClear()
      transformUVueMock.mockReturnValue({ code: 'transformed', map: null } as TransformResult)

      await getTransformHandler(nvuePlugin)?.call(nvuePlugin, '<template/>', '/src/components/foo.uvue')

      expect(transformUVueMock).toHaveBeenLastCalledWith(
        '<template/>',
        '/src/components/foo.uvue',
        jsHandler,
        runtimeSet,
        {
          enableComponentLocalStyle: true,
          native: true,
          localStyleVariants: true,
        },
      )
    }
    finally {
      clearUniAppXStyleIsolationCache()
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('passes custom local style matchers to the uvue transform', async () => {
    const runtimeSet = new Set(['px-4'])
    const jsHandler = vi.fn()
    const componentMatcher = (id: string) => id.endsWith('/layouts/default.uvue')
    const pageMatcher = (id: string) => id.endsWith('/screens/home.uvue')
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x',
      customAttributesEntities: [],
      disabledDefaultTemplateHandler: false,
      mainCssChunkMatcher: vi.fn(() => true),
      runtimeState: { readyPromise: Promise.resolve() },
      styleHandler: vi.fn(),
      jsHandler,
      ensureRuntimeClassSet: vi.fn(async () => runtimeSet),
      getResolvedConfig: () => ({ command: 'build', build: { watch: false }, root: '/project' } as ResolvedConfig),
      uniAppX: {
        enabled: true,
        componentLocalStyles: {
          componentMatcher,
          onlyWhenStyleIsolationVersion2: false,
          pageMatcher,
        },
      },
    })
    const nvuePlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:nvue')
    transformUVueMock.mockClear()
    transformUVueMock.mockReturnValue({ code: 'transformed', map: null } as TransformResult)

    await getTransformHandler(nvuePlugin)?.call(
      nvuePlugin,
      '<template><view class="px-4" /></template>',
      '/project/src/layouts/default.uvue?vue&type=template',
    )

    expect(transformUVueMock).toHaveBeenLastCalledWith(
      '<template><view class="px-4" /></template>',
      '/project/src/layouts/default.uvue?vue&type=template',
      jsHandler,
      runtimeSet,
        {
          componentMatcher,
          enableComponentLocalStyle: true,
          native: true,
          localStyleVariants: true,
          pageMatcher,
        },
    )
  })

  it('enables page local style transform on app-harmony without styleIsolationVersion=2', async () => {
    const originalPlatform = process.env.UNI_UTS_PLATFORM
    process.env.UNI_UTS_PLATFORM = 'app-harmony'
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-tw-harmony-page-local-style-'))
    try {
      await fs.writeFile(path.join(root, 'manifest.json'), `{
  "uni-app-x": {}
}
`, 'utf8')
      clearUniAppXStyleIsolationCache()
      const runtimeSet = new Set(['alpha'])
      const ensureRuntimeClassSet = vi.fn(async () => runtimeSet)
      const jsHandler = vi.fn()
      const plugins = createUniAppXPlugins({
        appType: 'uni-app-x',
        customAttributesEntities: [],
        disabledDefaultTemplateHandler: false,
        mainCssChunkMatcher: vi.fn(() => true),
        runtimeState: { readyPromise: Promise.resolve() },
        styleHandler: vi.fn(),
        jsHandler,
        ensureRuntimeClassSet,
        getResolvedConfig: () => ({ command: 'build', build: { watch: false }, root } as ResolvedConfig),
        uniAppX: {
          enabled: true,
          componentLocalStyles: true,
        },
      })
      const nvuePlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:nvue')
      expect(nvuePlugin).toBeDefined()
      transformUVueMock.mockClear()
      transformUVueMock.mockReturnValue({ code: 'transformed', map: null } as TransformResult)

      await getTransformHandler(nvuePlugin)?.call(nvuePlugin, '<template/>', '/src/pages/index/index.uvue')

      expect(transformUVueMock).toHaveBeenLastCalledWith(
        '<template/>',
        '/src/pages/index/index.uvue',
        jsHandler,
        runtimeSet,
        {
          enablePageLocalStyle: true,
          native: true,
        },
      )
    }
    finally {
      clearUniAppXStyleIsolationCache()
      await fs.rm(root, { recursive: true, force: true })
      process.env.UNI_UTS_PLATFORM = originalPlatform
    }
  })

  it('enables page local styles for web when component local styles are enabled', async () => {
    const originalPlatform = process.env.UNI_UTS_PLATFORM
    process.env.UNI_UTS_PLATFORM = 'web'
    const synchronizedRuntimeSet = new Set(['bg-primary', 'w-[100rpx]!'])
    const jsHandler = vi.fn()
    try {
      const plugins = createUniAppXPlugins({
        appType: 'uni-app-x',
        customAttributesEntities: [['a-navbar', ['leftClass']]],
        disabledDefaultTemplateHandler: false,
        mainCssChunkMatcher: vi.fn(() => true),
        runtimeState: { readyPromise: Promise.resolve() },
        styleHandler: vi.fn(),
        jsHandler,
        ensureRuntimeClassSet: vi.fn(async () => synchronizedRuntimeSet),
        getResolvedConfig: () => ({ command: 'build', build: { watch: false }, root: '/project' } as ResolvedConfig),
        isWebGeneratorTarget: () => true,
        uniAppX: {
          enabled: true,
          componentLocalStyles: {
            enabled: true,
            onlyWhenStyleIsolationVersion2: false,
          },
        },
      })
      const nvuePlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:nvue')
      const cssPrePlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:css:pre')
      transformUVueMock.mockClear()
      transformUVueMock.mockImplementation((_code, _id, _jsHandler, _runtimeSet, options) => {
        const bridge = (options as { onWebLocalStyleRules?: (rules: string) => void }).onWebLocalStyleRules
        bridge?.('.wtu-web { @apply bg-primary; }\n')
        return { code: 'transformed', map: null } as TransformResult
      })

      await getTransformHandler(nvuePlugin)?.call(
        nvuePlugin,
        '<template><image class="w-[100rpx]!" /></template>',
        '/project/pages/index/index.uvue',
      )

      expect(transformUVueMock).toHaveBeenLastCalledWith(
        '<template><image class="w-[100rpx]!" /></template>',
        '/project/pages/index/index.uvue',
        jsHandler,
        synchronizedRuntimeSet,
        {
          customAttributesEntities: [['a-navbar', ['leftClass']]],
          enableComponentLocalStyle: true,
          enablePageLocalStyle: true,
          native: true,
          onWebLocalStyleRules: expect.any(Function),
          webCustomAttributeDeep: true,
        },
      )
      const cssResult = await getTransformHandler(cssPrePlugin)?.call(
        cssPrePlugin,
        '.author { color: red; }',
        '/project/pages/index/index.uvue?vue&type=style&index=0&scoped=abc&lang.scss',
      ) as TransformResult
      expect(cssResult).toEqual({
        code: '.author { color: red; }\n.wtu-web { @apply bg-primary; }\n',
        map: null,
      })
    }
    finally {
      process.env.UNI_UTS_PLATFORM = originalPlatform
    }
  })

  it('enables page local styles when HBuilderX exposes Android through temporary module ids', async () => {
    const originalPlatform = process.env.UNI_UTS_PLATFORM
    delete process.env.UNI_UTS_PLATFORM
    const runtimeSet = new Set(['text-xs', 'text-white'])
    const jsHandler = vi.fn()
    try {
      const plugins = createUniAppXPlugins({
        appType: 'uni-app-x',
        customAttributesEntities: [],
        disabledDefaultTemplateHandler: false,
        mainCssChunkMatcher: vi.fn(() => true),
        runtimeState: { readyPromise: Promise.resolve() },
        styleHandler: vi.fn(),
        jsHandler,
        ensureRuntimeClassSet: vi.fn(async () => runtimeSet),
        getResolvedConfig: () => ({ command: 'build', build: { watch: false }, root: '/project' } as ResolvedConfig),
        uniAppX: {
          enabled: true,
          componentLocalStyles: {
            enabled: true,
            onlyWhenStyleIsolationVersion2: false,
          },
        },
      })
      const nvuePlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:nvue')
      transformUVueMock.mockClear()
      transformUVueMock.mockReturnValue({ code: 'transformed', map: null } as TransformResult)

      await getTransformHandler(nvuePlugin)?.call(
        nvuePlugin,
        '<template><text class="text-xs text-white" /></template>',
        '/tmp/demo-weapp-tw-app-android-12345/pages/index/index.uvue',
      )

      expect(transformUVueMock).toHaveBeenLastCalledWith(
        '<template><text class="text-xs text-white" /></template>',
        '/tmp/demo-weapp-tw-app-android-12345/pages/index/index.uvue',
        jsHandler,
        runtimeSet,
        {
          enableComponentLocalStyle: true,
          enablePageLocalStyle: true,
          native: true,
        },
      )
    }
    finally {
      process.env.UNI_UTS_PLATFORM = originalPlatform
    }
  })

  it('expands harmony page apply rules before the native compiler reads the transformed uvue source', async () => {
    const originalPlatform = process.env.UNI_UTS_PLATFORM
    process.env.UNI_UTS_PLATFORM = 'app-harmony'
    try {
      const generateCss = vi.fn(async (_id: string) => '.issue-1002-apply { border-radius: calc(infinity * 1px); font-size: var(--text-xs); color: var(--color-white); }')
      const styleHandler = vi.fn(async () => ({
        css: '.issue-1002-apply { border-top-left-radius: 9999px; border-bottom-left-radius: 9999px; font-size: 24rpx; color: #fff; }',
        map: { toJSON: () => ({ version: 3, sources: [], names: [], mappings: '' }) },
      }))
      const plugins = createUniAppXPlugins({
        appType: 'uni-app-x',
        customAttributesEntities: [],
        disabledDefaultTemplateHandler: false,
        mainCssChunkMatcher: vi.fn(() => false),
        runtimeState: { readyPromise: Promise.resolve() },
        styleHandler,
        generateCss,
        jsHandler: vi.fn(),
        ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
        getResolvedConfig: () => ({ command: 'build', build: { watch: false }, root: '/project' } as ResolvedConfig),
      })
      const nvuePlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:nvue')
      transformUVueMock.mockReturnValue({
        code: '<template><text class="issue-1002-apply" /></template>\n<style scoped>\n@reference "../../main.css";\n.issue-1002-apply { @apply rounded-full text-xs text-white; }\n</style>',
        map: null,
      } as TransformResult)

      const result = await getTransformHandler(nvuePlugin)?.call(nvuePlugin, '<template/>', '/project/pages/index/index.uvue') as TransformResult

      expect(result.code).toContain('border-top-left-radius: 9999px')
      expect(result.code).toContain('font-size: 24rpx')
      expect(result.code).toContain('color: #fff')
      expect(result.code).not.toContain('@apply')
      expect(result.code).not.toContain('calc(infinity')
      expect(result.map).toBeNull()
      expect(generateCss).toHaveBeenCalledWith(
        expect.any(String),
        `@reference "${toPosix(path.resolve('/project/main.css'))}";\n.issue-1002-apply { @apply rounded-full text-xs text-white; }`,
        expect.objectContaining({
          disableSourceScan: true,
          sourceCandidates: [],
          transient: true,
        }),
      )
      const generatedId = generateCss.mock.calls[0]![0] as string
      expect(path.dirname(generatedId)).toBe(path.resolve('/project'))
      expect(path.basename(generatedId)).toMatch(/^uni-app-x-harmony-apply-[a-z0-9]+\.css$/)
      expect(styleHandler).toHaveBeenCalledWith(
        expect.stringContaining('calc(infinity'),
        expect.objectContaining({ uniAppXCssTarget: 'uvue' }),
      )
    }
    finally {
      process.env.UNI_UTS_PLATFORM = originalPlatform
    }
  })


  it('allows disabling component local style transform from uniAppX options', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-tw-issue-822-disabled-'))
    try {
      await fs.writeFile(path.join(root, 'manifest.json'), `{
  "uni-app-x": {
    "styleIsolationVersion": "2"
  }
}
`, 'utf8')
      clearUniAppXStyleIsolationCache()
      const runtimeSet = new Set(['alpha'])
      const ensureRuntimeClassSet = vi.fn(async () => runtimeSet)
      const jsHandler = vi.fn()
      const plugins = createUniAppXPlugins({
        appType: 'uni-app-x',
        customAttributesEntities: [],
        disabledDefaultTemplateHandler: false,
        mainCssChunkMatcher: vi.fn(() => true),
        runtimeState: { readyPromise: Promise.resolve() },
        styleHandler: vi.fn(),
        jsHandler,
        ensureRuntimeClassSet,
        getResolvedConfig: () => ({ command: 'build', build: { watch: false }, root } as ResolvedConfig),
        uniAppX: {
          enabled: true,
          componentLocalStyles: false,
        },
      })
      const nvuePlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:nvue')
      expect(nvuePlugin).toBeDefined()
      transformUVueMock.mockClear()
      transformUVueMock.mockReturnValue({ code: 'transformed', map: null } as TransformResult)

      await getTransformHandler(nvuePlugin)?.call(nvuePlugin, '<template/>', '/src/components/foo.uvue')

      expect(transformUVueMock).toHaveBeenLastCalledWith(
        '<template/>',
        '/src/components/foo.uvue',
        jsHandler,
        runtimeSet,
        {
          native: true,
          localStyleVariants: true,
        },
      )
    }
    finally {
      clearUniAppXStyleIsolationCache()
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('injects uni-app-x style placeholders in the post bundle hook', async () => {
    const originalPlatform = process.env.UNI_UTS_PLATFORM
    process.env.UNI_UTS_PLATFORM = 'app-harmony'
    try {
      const plugins = createUniAppXPlugins({
        appType: 'uni-app-x',
        customAttributesEntities: [],
        disabledDefaultTemplateHandler: false,
        mainCssChunkMatcher: vi.fn(() => true),
        runtimeState: { readyPromise: Promise.resolve() },
        styleHandler: vi.fn(),
        jsHandler: vi.fn(),
        ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
        getResolvedConfig: () => ({ command: 'build', build: { outDir: 'unpackage/dist/dev/.app-harmony', watch: false } } as ResolvedConfig),
      })
      const placeholderPlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:style-placeholder')
      expect(placeholderPlugin).toBeDefined()
      const bundle = {
        'App.uvue.ts': createAsset('const GenAppStyles = [_uM([["bg-_b_h102938_B", _pS(_uM([["backgroundColor", "rgba(16,41,56,1)"]]))]])]'),
        'pages/index/index.uvue.ts': createAsset('_cE("view", _uM({ class: "bg-_b_h102938_B" }))\nconst GenPagesIndexIndexStyles = []'),
      }

      await getGenerateBundleHandler(placeholderPlugin)?.({} as any, bundle as any, false)

      expect(bundle['pages/index/index.uvue.ts'].source).toContain('const GenPagesIndexIndexStyles = [_uM([["bg-_b_h102938_B"')
    }
    finally {
      process.env.UNI_UTS_PLATFORM = originalPlatform
    }
  })

  it('merges app global styles into harmony page chunks in the post bundle hook', async () => {
    const originalPlatform = process.env.UNI_UTS_PLATFORM
    process.env.UNI_UTS_PLATFORM = 'app-harmony'
    try {
      const plugins = createUniAppXPlugins({
        appType: 'uni-app-x',
        customAttributesEntities: [],
        disabledDefaultTemplateHandler: false,
        mainCssChunkMatcher: vi.fn(() => true),
        runtimeState: { readyPromise: Promise.resolve() },
        styleHandler: vi.fn(),
        jsHandler: vi.fn(),
        ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
        getResolvedConfig: () => ({ command: 'build', build: { watch: false } } as ResolvedConfig),
      })
      const placeholderPlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:style-placeholder')
      expect(placeholderPlugin).toBeDefined()
      const bundle = {
        'assets/App.js': createChunk('const _style_0 = {"flex":{"":{"display":"flex"}},"text-white":{"":{"color":"#FFFFFF"}}};'),
        'assets/pages/index/index.js': createChunk('const _style_0 = {"wtu-a":{"":{"height":100}}};\nfunction render(){return createElementVNode("view", { class: "flex wtu-a text-white" })}\nconst index = _export_sfc(_sfc_main, [["render", render], ["styles", [_style_0]], ["__file", "pages/index/index.uvue"]]);'),
      }

      await getGenerateBundleHandler(placeholderPlugin)?.({} as any, bundle as any, false)

      expect(bundle['assets/pages/index/index.js'].code).toContain('"wtu-a":{"":{"height":100}}')
      expect(bundle['assets/pages/index/index.js'].code).toContain('"flex":{"":{"display":"flex"}}')
      expect(bundle['assets/pages/index/index.js'].code).toContain('"text-white":{"":{"color":"#FFFFFF"}}')
    }
    finally {
      process.env.UNI_UTS_PLATFORM = originalPlatform
    }
  })

  it('adds harmony styles option for component chunks without local styles', async () => {
    const originalPlatform = process.env.UNI_UTS_PLATFORM
    process.env.UNI_UTS_PLATFORM = 'app-harmony'
    try {
      const plugins = createUniAppXPlugins({
        appType: 'uni-app-x',
        customAttributesEntities: [],
        disabledDefaultTemplateHandler: false,
        mainCssChunkMatcher: vi.fn(() => true),
        runtimeState: { readyPromise: Promise.resolve() },
        styleHandler: vi.fn(),
        jsHandler: vi.fn(),
        ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
        getResolvedConfig: () => ({ command: 'build', build: { watch: false } } as ResolvedConfig),
      })
      const placeholderPlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:style-placeholder')
      expect(placeholderPlugin).toBeDefined()
      const bundle = {
        'assets/App.js': createChunk('const _style_0 = {"px-4":{"":{"paddingLeft":"32rpx","paddingRight":"32rpx"}}};'),
        'assets/components/Logo.js': createChunk('function render(){return createElementVNode("view", { class: "px-4" })}\nconst Logo = _export_sfc(_sfc_main, [["render", render], ["__file", "components/Logo.uvue"]]);'),
      }

      await getGenerateBundleHandler(placeholderPlugin)?.({} as any, bundle as any, false)

      expect(bundle['assets/components/Logo.js'].code).toContain('const _style_wt = {"px-4":{"":{"paddingLeft":"32rpx","paddingRight":"32rpx"}}};')
      expect(bundle['assets/components/Logo.js'].code).toContain('["styles", [_style_wt]], ["__file"')
    }
    finally {
      process.env.UNI_UTS_PLATFORM = originalPlatform
    }
  })

  it('does not inject harmony styles into mp-weixin bundles with harmony marker files', async () => {
    const originalPlatform = process.env.UNI_UTS_PLATFORM
    process.env.UNI_UTS_PLATFORM = 'mp-weixin'
    try {
      const plugins = createUniAppXPlugins({
        appType: 'uni-app-x',
        customAttributesEntities: [],
        disabledDefaultTemplateHandler: false,
        mainCssChunkMatcher: vi.fn(() => true),
        runtimeState: { readyPromise: Promise.resolve() },
        styleHandler: vi.fn(),
        jsHandler: vi.fn(),
        ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
        getResolvedConfig: () => ({ command: 'build', build: { outDir: 'unpackage/dist/dev/.app-harmony', watch: false } } as ResolvedConfig),
      })
      const placeholderPlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:style-placeholder')
      expect(placeholderPlugin).toBeDefined()
      const bundle = {
        'assets/App.js': createChunk('const _style_0 = {"px-4":{"":{"paddingLeft":"32rpx","paddingRight":"32rpx"}}};'),
        'import/app-service.ets': createAsset(''),
        'assets/components/Logo.js': createChunk('function render(){return createElementVNode("view", { class: "px-4" })}\nconst Logo = _export_sfc(_sfc_main, [["render", render], ["__file", "components/Logo.uvue"]]);'),
      }

      await getGenerateBundleHandler(placeholderPlugin)?.({} as any, bundle as any, false)

      expect(bundle['assets/components/Logo.js'].code).not.toContain('const _style_wt')
      expect(bundle['assets/components/Logo.js'].code).not.toContain('["styles", [_style_wt]]')
    }
    finally {
      process.env.UNI_UTS_PLATFORM = originalPlatform
    }
  })

  it('keeps harmony component chunks isolated when styleIsolationVersion=2 enables local styles', async () => {
    const originalPlatform = process.env.UNI_UTS_PLATFORM
    process.env.UNI_UTS_PLATFORM = 'app-harmony'
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-tw-harmony-style-isolation-v2-'))
    try {
      await fs.writeFile(path.join(root, 'manifest.json'), `{
  "uni-app-x": {
    "styleIsolationVersion": "2"
  }
}
`, 'utf8')
      clearUniAppXStyleIsolationCache()
      const plugins = createUniAppXPlugins({
        appType: 'uni-app-x',
        customAttributesEntities: [],
        disabledDefaultTemplateHandler: false,
        mainCssChunkMatcher: vi.fn(() => true),
        runtimeState: { readyPromise: Promise.resolve() },
        styleHandler: vi.fn(),
        jsHandler: vi.fn(),
        ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
        getResolvedConfig: () => ({ command: 'build', build: { watch: false }, root } as ResolvedConfig),
        uniAppX: {
          enabled: true,
          componentLocalStyles: {
            componentMatcher: id => /(?:^|\/)(?:components|layouts)\//.test(id),
          },
        },
      })
      const placeholderPlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:style-placeholder')
      expect(placeholderPlugin).toBeDefined()
      const bundle = {
        'assets/App.js': createChunk('const _style_0 = {"px-4":{"":{"paddingLeft":"32rpx","paddingRight":"32rpx"}}};'),
        'assets/components/Logo.js': createChunk('function render(){return createElementVNode("view", { class: "px-4" })}\nconst Logo = _export_sfc(_sfc_main, [["render", render], ["__file", "components/Logo.uvue"]]);'),
        'assets/layouts/default.js': createChunk('function render(){return createElementVNode("view", { class: "px-4" })}\nconst layout = _export_sfc(_sfc_main, [["render", render], ["__file", "layouts/default.uvue"]]);'),
        'assets/pages/index/index.js': createChunk('const _style_0 = {};\nfunction render(){return createElementVNode("view", { class: "px-4" })}\nconst index = _export_sfc(_sfc_main, [["render", render], ["styles", [_style_0]], ["__file", "pages/index/index.uvue"]]);'),
      }

      await getGenerateBundleHandler(placeholderPlugin)?.({} as any, bundle as any, false)

      expect(bundle['assets/components/Logo.js'].code).not.toContain('const _style_wt')
      expect(bundle['assets/components/Logo.js'].code).not.toContain('"px-4":{"":{"paddingLeft":"32rpx"')
      expect(bundle['assets/layouts/default.js'].code).not.toContain('const _style_wt')
      expect(bundle['assets/layouts/default.js'].code).not.toContain('"px-4":{"":{"paddingLeft":"32rpx"')
      expect(bundle['assets/pages/index/index.js'].code).toContain('"px-4":{"":{"paddingLeft":"32rpx"')
    }
    finally {
      clearUniAppXStyleIsolationCache()
      await fs.rm(root, { recursive: true, force: true })
      process.env.UNI_UTS_PLATFORM = originalPlatform
    }
  })

  it('hydrates harmony chunk styles from css assets and source map apply rules', async () => {
    const originalPlatform = process.env.UNI_UTS_PLATFORM
    process.env.UNI_UTS_PLATFORM = 'app-harmony'
    try {
      const plugins = createUniAppXPlugins({
        appType: 'uni-app-x',
        customAttributesEntities: [],
        disabledDefaultTemplateHandler: false,
        mainCssChunkMatcher: vi.fn(() => true),
        runtimeState: { readyPromise: Promise.resolve() },
        styleHandler: vi.fn(),
        jsHandler: vi.fn(),
        ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
        getResolvedConfig: () => ({ command: 'build', build: { watch: false } } as ResolvedConfig),
      })
      const placeholderPlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:style-placeholder')
      expect(placeholderPlugin).toBeDefined()
      const bundle = {
        'assets/App.js': createChunk('const _style_0 = {};'),
        'styles/theme.wxss': createAsset('.flex { display: flex; } .bg-_b_h102938_B { background-color: #102938; } .text-_b_hf7fbff_B { color: #f7fbff; }'),
        'assets/pages/index/index.js': createChunk('const _style_0 = {};\nfunction render(){return createElementVNode("view", { class: "flex wtu-a wtu-b" })}\nconst index = _export_sfc(_sfc_main, [["render", render], ["styles", [_style_0]], ["__file", "pages/index/index.uvue"]]);', {
          isEntry: true,
          viteMetadata: {
            importedCss: new Set(['styles/theme.wxss']),
          },
        }),
        'assets/pages/index/index.js.map': createAsset(JSON.stringify({
          sourcesContent: [
            '<style scoped>\n.wtu-a {\n  @apply bg-[#102938];\n}\n.wtu-b {\n  @apply text-[#f7fbff];\n}\n</style>',
          ],
        })),
      }

      await getGenerateBundleHandler(placeholderPlugin)?.({} as any, bundle as any, false)

      expect(bundle['assets/pages/index/index.js'].code).toContain('"flex":{"":{"display":"flex"}}')
      expect(bundle['assets/pages/index/index.js'].code).toContain('"wtu-a":{"":{"backgroundColor":"#102938"}}')
      expect(bundle['assets/pages/index/index.js'].code).toContain('"wtu-b":{"":{"color":"#f7fbff"}}')
    }
    finally {
      process.env.UNI_UTS_PLATFORM = originalPlatform
    }
  })

  it('hydrates harmony chunk styles when platform env is app-harmony', async () => {
    const originalPlatform = process.env.UNI_UTS_PLATFORM
    process.env.UNI_UTS_PLATFORM = 'app-harmony'
    try {
      const plugins = createUniAppXPlugins({
        appType: 'uni-app-x',
        customAttributesEntities: [],
        disabledDefaultTemplateHandler: false,
        mainCssChunkMatcher: vi.fn(() => true),
        runtimeState: { readyPromise: Promise.resolve() },
        styleHandler: vi.fn(),
        jsHandler: vi.fn(),
        ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
        getResolvedConfig: () => ({ command: 'build', build: { watch: false } } as ResolvedConfig),
      })
      const placeholderPlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:style-placeholder')
      expect(placeholderPlugin).toBeDefined()
      const bundle = {
        'assets/App.js': createChunk('const _style_0 = {"bg-_b_h102938_B":{"":{"backgroundColor":"#102938"}}};'),
        'assets/pages/index/index.js': createChunk('const _style_0 = {};\nfunction render(){return createElementVNode("view", { class: "bg-_b_h102938_B" })}\nconst index = _export_sfc(_sfc_main, [["render", render], ["styles", [_style_0]], ["__file", "pages/index/index.uvue"]]);'),
        'import/app-service.ets': createAsset(''),
        'uni_modules/oh-package.json5': createAsset('{}'),
      }

      await getGenerateBundleHandler(placeholderPlugin)?.({} as any, bundle as any, false)

      expect(bundle['assets/pages/index/index.js'].code).toContain('"bg-_b_h102938_B":{"":{"backgroundColor":"#102938"}}')
    }
    finally {
      if (originalPlatform === undefined) {
        delete process.env.UNI_UTS_PLATFORM
      }
      else {
        process.env.UNI_UTS_PLATFORM = originalPlatform
      }
    }
  })

  it('generates harmony apply css in the post bundle hook before hydrating app-harmony chunks', async () => {
    const originalPlatform = process.env.UNI_UTS_PLATFORM
    process.env.UNI_UTS_PLATFORM = 'app-harmony'
    try {
      const generateCss = vi.fn(async () => [
        '.wtu-a { background-color: rgba(16,41,56,1); }',
        '.wtu-b { color: rgba(247,251,255,1); }',
        '.wtu-c { width: 173px; }',
      ].join('\n'))
      const plugins = createUniAppXPlugins({
        appType: 'uni-app-x',
        customAttributesEntities: [],
        disabledDefaultTemplateHandler: false,
        mainCssChunkMatcher: vi.fn(() => true),
        runtimeState: { readyPromise: Promise.resolve() },
        styleHandler: vi.fn(),
        generateCss,
        jsHandler: vi.fn(),
        ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
        getResolvedConfig: () => ({ command: 'build', build: { watch: false } } as ResolvedConfig),
      })
      const placeholderPlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:style-placeholder')
      expect(placeholderPlugin).toBeDefined()
      const bundle = {
        'assets/App.js': createChunk('const _style_0 = {};'),
        'assets/pages/index/index.js': createChunk('const _style_0 = {};\nconst _style_1 = {};\nfunction render(){return createElementVNode("view", { class: "wtu-a wtu-b wtu-c" })}\nconst index = _export_sfc(_sfc_main, [["render", render], ["styles", [_style_0, _style_1]], ["__file", "pages/index/index.uvue"]]);'),
        'assets/pages/index/index.js.map': createAsset(JSON.stringify({
          sourcesContent: [
            '<style scoped>\n.wtu-a {\n  @apply bg-[#102938];\n}\n.wtu-b {\n  @apply text-[#f7fbff];\n}\n.wtu-c {\n  @apply w-[173px];\n}\n</style>',
          ],
        })),
        'import/app-service.ets': createAsset(''),
        'uni_modules/oh-package.json5': createAsset('{}'),
      }

      await getGenerateBundleHandler(placeholderPlugin)?.({} as any, bundle as any, false)

      expect(generateCss).toHaveBeenCalledWith(
        path.resolve(process.cwd(), 'uni-app-x-harmony-apply.css'),
        [
          '.wtu-a {\n  @apply bg-[#102938];\n}',
          '.wtu-b {\n  @apply text-[#f7fbff];\n}',
          '.wtu-c {\n  @apply w-[173px];\n}',
        ].join('\n'),
        expect.objectContaining({
          disableSourceScan: true,
          sourceCandidates: [],
          transient: true,
        }),
      )
      expect(bundle['assets/pages/index/index.js'].code).toContain('"wtu-a":{"":{"backgroundColor":"rgba(16,41,56,1)"}}')
      expect(bundle['assets/pages/index/index.js'].code).toContain('"wtu-b":{"":{"color":"rgba(247,251,255,1)"}}')
      expect(bundle['assets/pages/index/index.js'].code).toContain('"wtu-c":{"":{"width":173}}')
    }
    finally {
      if (originalPlatform === undefined) {
        delete process.env.UNI_UTS_PLATFORM
      }
      else {
        process.env.UNI_UTS_PLATFORM = originalPlatform
      }
    }
  })

  it('records uvue apply sources before harmony target is known and hydrates in bundle hook', async () => {
    const originalPlatform = process.env.UNI_UTS_PLATFORM
    delete process.env.UNI_UTS_PLATFORM
    try {
      const generateCss = vi.fn(async () => '.wtu-a { background-color: rgba(16,41,56,1); }')
      const plugins = createUniAppXPlugins({
        appType: 'uni-app-x',
        customAttributesEntities: [],
        disabledDefaultTemplateHandler: false,
        mainCssChunkMatcher: vi.fn(() => false),
        runtimeState: { readyPromise: Promise.resolve() },
        styleHandler: vi.fn(),
        generateCss,
        jsHandler: vi.fn(async (code: string) => ({ code })),
        ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
        getResolvedConfig: () => ({ command: 'build', build: { outDir: 'unpackage/dist/dev/.app-harmony', watch: false } } as ResolvedConfig),
      })
      const nvuePlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:nvue')
      const placeholderPlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:style-placeholder')

      await getTransformHandler(nvuePlugin)?.call({} as any, '<template><view class="wtu-a" /></template>\n<style scoped>\n.wtu-a {\n  @apply bg-[#102938];\n}\n</style>', '/project/pages/index/index.uvue')

      const bundle = {
        'assets/App.js': createChunk('const _style_0 = {};'),
        'assets/pages/index/index.js': createChunk('const _style_0 = {};\nfunction render(){return createElementVNode("view", { class: "wtu-a" })}\nconst index = _export_sfc(_sfc_main, [["render", render], ["styles", [_style_0]], ["__file", "pages/index/index.uvue"]]);'),
      }

      await getGenerateBundleHandler(placeholderPlugin)?.({} as any, bundle as any, false)

      expect(generateCss).toHaveBeenCalledWith(
        path.resolve(process.cwd(), 'uni-app-x-harmony-apply.css'),
        '.wtu-a {\n  @apply bg-[#102938];\n}',
        expect.objectContaining({
          disableSourceScan: true,
          sourceCandidates: [],
          transient: true,
        }),
      )
      expect(bundle['assets/pages/index/index.js'].code).toContain('"wtu-a":{"":{"backgroundColor":"rgba(16,41,56,1)"}}')
    }
    finally {
      if (originalPlatform === undefined) {
        delete process.env.UNI_UTS_PLATFORM
      }
      else {
        process.env.UNI_UTS_PLATFORM = originalPlatform
      }
    }
  })

  it('detects harmony target from build outDir before harmony marker assets exist', async () => {
    const originalPlatform = process.env.UNI_UTS_PLATFORM
    delete process.env.UNI_UTS_PLATFORM
    try {
      const plugins = createUniAppXPlugins({
        appType: 'uni-app-x',
        customAttributesEntities: [],
        disabledDefaultTemplateHandler: false,
        mainCssChunkMatcher: vi.fn(() => true),
        runtimeState: { readyPromise: Promise.resolve() },
        styleHandler: vi.fn(),
        generateCss: vi.fn(),
        jsHandler: vi.fn(),
        ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
        getResolvedConfig: () => ({ command: 'build', build: { outDir: 'unpackage/dist/dev/.app-harmony', watch: false } } as ResolvedConfig),
      })
      const placeholderPlugin = plugins.find((p): p is Plugin => p.name === 'weapp-tailwindcss:uni-app-x:style-placeholder')
      expect(placeholderPlugin).toBeDefined()
      const bundle = {
        'assets/App.js': createChunk('const _style_0 = {"flex":{"":{"display":"flex"}}};'),
        'assets/pages/index/index.js': createChunk('const _style_0 = {};\nfunction render(){return createElementVNode("view", { class: "flex" })}\nconst index = _export_sfc(_sfc_main, [["render", render], ["styles", [_style_0]], ["__file", "pages/index/index.uvue"]]);'),
      }

      await getGenerateBundleHandler(placeholderPlugin)?.({} as any, bundle as any, false)

      expect(bundle['assets/pages/index/index.js'].code).toContain('"flex":{"":{"display":"flex"}}')
    }
    finally {
      if (originalPlatform === undefined) {
        delete process.env.UNI_UTS_PLATFORM
      }
      else {
        process.env.UNI_UTS_PLATFORM = originalPlatform
      }
    }
  })

  it('hydrates harmony chunk styles from recorded css sources when css assets are absent', () => {
    const bundle = {
      'assets/App.js': createChunk('const _style_0 = {};'),
      'assets/pages/index/index.js': createChunk('const _style_0 = {};\nfunction render(){return createElementVNode("view", { class: "wtu-a wtu-b wtu-c" })}\nconst index = _export_sfc(_sfc_main, [["render", render], ["styles", [_style_0]], ["__file", "pages/index/index.uvue"]]);'),
      'assets/pages/index/index.js.map': createAsset(JSON.stringify({
        sourcesContent: [
          '<style scoped>\n.wtu-a {\n  @apply bg-[#102938];\n}\n.wtu-b {\n  @apply text-[#f7fbff];\n}\n.wtu-c {\n  @apply w-[173px];\n}\n</style>',
        ],
      })),
    }

    const changed = injectUniAppXHarmonyBundleStyles(bundle, {
      cssSources: [
        '.bg-_b_h102938_B { background-color: rgba(16,41,56,1); } .text-_b_hf7fbff_B { color: rgba(247,251,255,1); } .w-_b173px_B { width: 173px; }',
      ],
    })

    expect(changed).toBe(true)
    expect(bundle['assets/pages/index/index.js'].code).toContain('"wtu-a":{"":{"backgroundColor":"rgba(16,41,56,1)"}}')
    expect(bundle['assets/pages/index/index.js'].code).toContain('"wtu-b":{"":{"color":"rgba(247,251,255,1)"}}')
    expect(bundle['assets/pages/index/index.js'].code).toContain('"wtu-c":{"":{"width":173}}')
  })

  it('hydrates harmony global styles from bundle css assets without app or main file names', () => {
    const bundle = {
      'assets/App.js': createChunk('const _style_0 = {};'),
      'assets/pages/index/index.js': createChunk('const _style_0 = {};\nfunction render(){return createElementVNode("view", { class: "page-global" })}\nconst index = _export_sfc(_sfc_main, [["render", render], ["styles", [_style_0]], ["__file", "pages/index/index.uvue"]]);', {
        isEntry: true,
        viteMetadata: {
          importedCss: new Set(['global/theme.wxss']),
        },
      }),
      'global/theme.wxss': createAsset('.page-global { color: #123456; }'),
    }

    const changed = injectUniAppXHarmonyBundleStyles(bundle)

    expect(changed).toBe(true)
    expect(bundle['assets/pages/index/index.js'].code).toContain('"page-global":{"":{"color":"#123456"}}')
  })

  it('does not guess harmony global style assets from output file names', () => {
    const bundle = {
      'assets/App.js': createChunk('const _style_0 = {};'),
      'assets/pages/index/index.js': createChunk('const _style_0 = {};\nfunction render(){return createElementVNode("view", { class: "page-global page-derived page-derived-css" })}\nconst index = _export_sfc(_sfc_main, [["render", render], ["styles", [_style_0]], ["__file", "pages/index/index.uvue"]]);', {
        isEntry: true,
        viteMetadata: {
          importedCss: new Set<string>(),
        },
      }),
      'global/theme.wxss': createAsset('.page-global { color: #123456; }'),
      'pages/index/index.wxss': createAsset('.page-derived { color: #654321; }'),
      'pages/index/index.css': createAsset('.page-derived-css { color: #abcdef; }'),
    }

    const changed = injectUniAppXHarmonyBundleStyles(bundle)

    expect(changed).toBe(false)
    expect(bundle['assets/pages/index/index.js'].code).not.toContain('"page-global":{"":{"color":"#123456"}}')
    expect(bundle['assets/pages/index/index.js'].code).not.toContain('"page-derived":{"":{"color":"#654321"}}')
    expect(bundle['assets/pages/index/index.js'].code).not.toContain('"page-derived-css":{"":{"color":"#abcdef"}}')
  })

  it('hydrates harmony css assets only for chunks linked by bundle metadata', () => {
    const bundle = {
      'assets/App.js': createChunk('const _style_0 = {};'),
      'assets/pages/index/index.js': createChunk('const _style_0 = {};\nfunction render(){return createElementVNode("view", { class: "page-linked page-other" })}\nconst index = _export_sfc(_sfc_main, [["render", render], ["styles", [_style_0]], ["__file", "pages/index/index.uvue"]]);', {
        viteMetadata: {
          importedCss: new Set(['chunks/page-linked.wxss']),
        },
      }),
      'assets/pages/about/index.js': createChunk('const _style_0 = {};\nfunction render(){return createElementVNode("view", { class: "page-linked page-other" })}\nconst about = _export_sfc(_sfc_main, [["render", render], ["styles", [_style_0]], ["__file", "pages/about/index.uvue"]]);'),
      'chunks/page-linked.wxss': createAsset('.page-linked { color: #123456; }'),
      'chunks/page-other.wxss': createAsset('.page-other { color: #654321; }'),
    }

    const changed = injectUniAppXHarmonyBundleStyles(bundle)

    expect(changed).toBe(true)
    expect(bundle['assets/pages/index/index.js'].code).toContain('"page-linked":{"":{"color":"#123456"}}')
    expect(bundle['assets/pages/index/index.js'].code).not.toContain('"page-other":{"":{"color":"#654321"}}')
    expect(bundle['assets/pages/about/index.js'].code).not.toContain('"page-linked":{"":{"color":"#123456"}}')
  })

  it('hydrates harmony local styles even when App style is empty', () => {
    const bundle = {
      'assets/App.js': createChunk('const _style_0 = {};'),
      'assets/pages/index/index.js': createChunk('const _style_0 = {};\nconst _style_1 = {};\nfunction render(){return createElementVNode("view", { class: "wtu-a wtu-b wtu-c" })}\nconst index = _export_sfc(_sfc_main, [["render", render], ["styles", [_style_0, _style_1]], ["__file", "pages/index/index.uvue"]]);'),
      'assets/pages/index/index.js.map': createAsset(JSON.stringify({
        sourcesContent: [
          '<style scoped>\n.wtu-a {\n  @apply bg-[#102938];\n}\n.wtu-b {\n  @apply text-[#f7fbff];\n}\n.wtu-c {\n  @apply w-[173px];\n}\n</style>',
        ],
      })),
    }

    const changed = injectUniAppXHarmonyBundleStyles(bundle, {
      cssSources: [
        '.bg-_b_h102938_B { background-color: rgba(16,41,56,1); } .text-_b_hf7fbff_B { color: rgba(247,251,255,1); } .w-_b173px_B { width: 173px; }',
      ],
    })

    expect(changed).toBe(true)
    expect(bundle['assets/pages/index/index.js'].code).toContain('"wtu-a":{"":{"backgroundColor":"rgba(16,41,56,1)"}}')
    expect(bundle['assets/pages/index/index.js'].code).toContain('"wtu-b":{"":{"color":"rgba(247,251,255,1)"}}')
    expect(bundle['assets/pages/index/index.js'].code).toContain('"wtu-c":{"":{"width":173}}')
  })

  it('collects harmony apply style sources from sourcemaps and uvue assets', () => {
    const bundle = {
      'assets/App.js': createChunk('const _style_0 = {};'),
      'assets/pages/index/index.js': createChunk('const _style_0 = {};'),
      'assets/pages/index/index.js.map': createAsset(JSON.stringify({
        sourcesContent: [
          '<style scoped>\n.wtu-a {\n  @apply bg-[#102938];\n}\n</style>',
        ],
      })),
      'pages/index/index.uvue': createAsset('<template />\n<style scoped>\n.wtu-b {\n  @apply text-[#f7fbff];\n}\n</style>'),
    }

    const sources = collectUniAppXHarmonyApplyStyleSources(bundle)

    expect(sources).toContain('.wtu-a {\n  @apply bg-[#102938];\n}')
    expect(sources).toContain('.wtu-b {\n  @apply text-[#f7fbff];\n}')
  })

  it('collects harmony apply style sources from chunk maps before sourcemap assets are emitted', () => {
    const bundle = {
      'assets/App.js': createChunk('const _style_0 = {};'),
      'assets/pages/index/index.js': createChunk('const _style_0 = {};', {
        map: {
          sourcesContent: [
            '<style scoped>\n.wtu-a {\n  @apply bg-[#102938];\n}\n</style>',
          ],
        },
      }),
    }

    const sources = collectUniAppXHarmonyApplyStyleSources(bundle)

    expect(sources).toContain('.wtu-a {\n  @apply bg-[#102938];\n}')
  })

  it('collects harmony apply style sources from assets sourcemaps for non-assets chunks', () => {
    const bundle = {
      'assets/App.js': createChunk('const _style_0 = {};'),
      'pages/index/index.js': createChunk('const _style_0 = {};'),
      'assets/pages/index/index.js.map': createAsset(JSON.stringify({
        sourcesContent: [
          '<style scoped>\n.wtu-a {\n  @apply bg-[#102938];\n}\n</style>',
        ],
      })),
    }

    const sources = collectUniAppXHarmonyApplyStyleSources(bundle)

    expect(sources).toContain('.wtu-a {\n  @apply bg-[#102938];\n}')
  })

  it('creates Tailwind v4 generator source for harmony apply styles', () => {
    const source = createUniAppXHarmonyApplyGeneratorSource([
      '.wtu-a {\n  @apply bg-[#102938];\n}',
    ], ['w-[173px]', 'bg-[#102938]', 'bg-[#102938]'])

    expect(source).toBe('.wtu-a {\n  @apply bg-[#102938];\n}')
  })

  it('injects uni-app-x style placeholder from sibling wxss fallback', () => {
    const code = 'const GenPagesIndexIndexStyles = []'
    const next = injectUniAppXStylePlaceholder(
      'pages/index/index.uvue.ts',
      code,
      file => file === 'pages/index/index.wxss'
        ? '.content { display: flex; width: 173px; }'
        : undefined,
    )

    expect(next).toContain('const GenPagesIndexIndexStyles = [_uM([')
    expect(next).toContain('"content"')
    expect(next).toContain('"display", "flex"')
    expect(next).toContain('"width", 173')
  })

  it('hydrates harmony chunk styles from escaped arbitrary utility selectors', () => {
    const bundle = {
      'assets/App.js': createChunk('const _style_0 = {};'),
      'assets/pages/index/index.js': createChunk('const _style_0 = {};\nfunction render(){return createElementVNode("view", { class: "wtu-a wtu-b wtu-c" })}\nconst index = _export_sfc(_sfc_main, [["render", render], ["styles", [_style_0]], ["__file", "pages/index/index.uvue"]]);'),
      'assets/pages/index/index.js.map': createAsset(JSON.stringify({
        sourcesContent: [
          '<style scoped>\n.wtu-a {\n  @apply bg-[#102938];\n}\n.wtu-b {\n  @apply text-[#f7fbff];\n}\n.wtu-c {\n  @apply w-[173px];\n}\n</style>',
        ],
      })),
    }

    const changed = injectUniAppXHarmonyBundleStyles(bundle, {
      cssSources: [
        '.bg-\\[\\#102938\\] { background-color: rgba(16,41,56,1); } .text-\\[\\#f7fbff\\] { color: rgba(247,251,255,1); } .w-\\[173px\\] { width: 173px; }',
      ],
    })

    expect(changed).toBe(true)
    expect(bundle['assets/pages/index/index.js'].code).toContain('"wtu-a":{"":{"backgroundColor":"rgba(16,41,56,1)"}}')
    expect(bundle['assets/pages/index/index.js'].code).toContain('"wtu-b":{"":{"color":"rgba(247,251,255,1)"}}')
    expect(bundle['assets/pages/index/index.js'].code).toContain('"wtu-c":{"":{"width":173}}')
  })

  it('preserves length units for harmony vdom line-height styles', () => {
    const bundle = {
      'assets/App.js': createChunk('const _style_0 = {};'),
      'assets/pages/index/index.js': createChunk('const _style_0 = {};\nfunction render(){return createElementVNode("text", { class: "leading-_b26px_B" }, "issue-1125-vdom-leading-26px")}\nconst index = _export_sfc(_sfc_main, [["render", render], ["styles", [_style_0]], ["__file", "pages/index/index.uvue"]]);'),
    }

    const changed = injectUniAppXHarmonyBundleStyles(bundle, {
      cssSources: [
        '.leading-_b26px_B { --tw-leading: 26px; line-height: 26px; }',
      ],
    })

    expect(changed).toBe(true)
    expect(bundle['assets/pages/index/index.js'].code).toContain('"leading-_b26px_B":{"":{"-TwLeading":26,"lineHeight":"26px"}}')
    expect(bundle['assets/pages/index/index.js'].code).not.toContain('leading-[26px]')
  })

  it('hydrates harmony chunk styles from uni-app-x style export css sources', () => {
    const bundle = {
      'assets/App.js': createChunk('const _style_0 = {};'),
      'assets/pages/index/index.js': createChunk('const _style_0 = {};\nfunction render(){return createElementVNode("view", { class: "wtu-a wtu-b wtu-c" })}\nconst index = _export_sfc(_sfc_main, [["render", render], ["styles", [_style_0]], ["__file", "pages/index/index.uvue"]]);'),
      'assets/pages/index/index.js.map': createAsset(JSON.stringify({
        sourcesContent: [
          '<style scoped>\n.wtu-a {\n  @apply bg-[#102938];\n}\n.wtu-b {\n  @apply text-[#f7fbff];\n}\n.wtu-c {\n  @apply w-[173px];\n}\n</style>',
        ],
      })),
    }

    const changed = injectUniAppXHarmonyBundleStyles(bundle, {
      cssSources: [
        'export default {"bg-_b_h102938_B":{"":{"backgroundColor":"rgba(16,41,56,1)"}},"text-_b_hf7fbff_B":{"":{"color":"rgba(247,251,255,1)"}},"w-_b173px_B":{"":{"width":173}}}',
      ],
    })

    expect(changed).toBe(true)
    expect(bundle['assets/pages/index/index.js'].code).toContain('"wtu-a":{"":{"backgroundColor":"rgba(16,41,56,1)"}}')
    expect(bundle['assets/pages/index/index.js'].code).toContain('"wtu-b":{"":{"color":"rgba(247,251,255,1)"}}')
    expect(bundle['assets/pages/index/index.js'].code).toContain('"wtu-c":{"":{"width":173}}')
  })

  it('hydrates harmony chunk styles from scoped apply css selectors', () => {
    const bundle = {
      'assets/App.js': createChunk('const _style_0 = {};'),
      'assets/pages/index/index.js': createChunk('const _style_0 = {};\nfunction render(){return createElementVNode("view", { class: "wtu-a" })}\nconst index = _export_sfc(_sfc_main, [["render", render], ["styles", [_style_0]], ["__file", "pages/index/index.uvue"]]);'),
      'assets/pages/index/index.js.map': createAsset(JSON.stringify({
        sourcesContent: [
          '<template><view class="wtu-a" /></template>\n<style scoped>\n.wtu-a {\n  @apply bg-[#102938];\n}\n</style>',
        ],
      })),
    }

    const changed = injectUniAppXHarmonyBundleStyles(bundle, {
      cssSources: [
        '.bg-\\[\\#102938\\] { background-color: rgba(16,41,56,1); } .wtu-a.data-v-abc { background-color: rgba(16,41,56,1); }',
      ],
    })

    expect(changed).toBe(true)
    expect(bundle['assets/pages/index/index.js'].code).toContain('"wtu-a":{"":{"backgroundColor":"rgba(16,41,56,1)"}}')
  })

  it('hydrates harmony chunk styles from chunk maps before sourcemap assets are emitted', () => {
    const bundle = {
      'assets/App.js': createChunk('const _style_0 = {};'),
      'assets/pages/index/index.js': createChunk('const _style_0 = {};\nfunction render(){return createElementVNode("view", { class: "wtu-a" })}\nconst index = _export_sfc(_sfc_main, [["render", render], ["styles", [_style_0]], ["__file", "pages/index/index.uvue"]]);', {
        map: {
          sourcesContent: [
            '<template><view class="wtu-a" /></template>\n<style scoped>\n.wtu-a {\n  @apply bg-[#102938];\n}\n</style>',
          ],
        },
      }),
    }

    const changed = injectUniAppXHarmonyBundleStyles(bundle, {
      cssSources: [
        '.bg-\\[\\#102938\\] { background-color: rgba(16,41,56,1); }',
      ],
    })

    expect(changed).toBe(true)
    expect(bundle['assets/pages/index/index.js'].code).toContain('"wtu-a":{"":{"backgroundColor":"rgba(16,41,56,1)"}}')
  })

  it('hydrates harmony chunk styles from assets sourcemaps for non-assets chunks', () => {
    const bundle = {
      'assets/App.js': createChunk('const _style_0 = {};'),
      'pages/index/index.js': createChunk('const _style_0 = {};\nfunction render(){return createElementVNode("view", { class: "wtu-a" })}\nconst index = _export_sfc(_sfc_main, [["render", render], ["styles", [_style_0]], ["__file", "pages/index/index.uvue"]]);'),
      'assets/pages/index/index.js.map': createAsset(JSON.stringify({
        sourcesContent: [
          '<template><view class="wtu-a" /></template>\n<style scoped>\n.wtu-a {\n  @apply bg-[#102938];\n}\n</style>',
        ],
      })),
    }

    const changed = injectUniAppXHarmonyBundleStyles(bundle, {
      cssSources: [
        '.bg-\\[\\#102938\\] { background-color: rgba(16,41,56,1); }',
      ],
    })

    expect(changed).toBe(true)
    expect(bundle['pages/index/index.js'].code).toContain('"wtu-a":{"":{"backgroundColor":"rgba(16,41,56,1)"}}')
  })
})

describe('createUniAppXAssetTask', () => {
  it('processes js assets with uni-app-x options', async () => {
    const asset = createAsset('const a = 1')
    const runtimeSet = new Set(['alpha'])
    const jsHandler = vi.fn(() => ({
      code: 'processed',
      linked: {
        '/project/dist/linked.js': {
          code: 'linked',
        },
      },
    }))
    const applyLinkedResults = vi.fn()
    const createHandlerOptions = vi.fn((filename: string, extra?: CreateJsHandlerOptions) => ({
      filename,
      ...extra,
    }))
    const onUpdate = vi.fn()
    const task = createUniAppXAssetTask(
      'assets/app.js',
      asset,
      '/project/dist',
      {
        cache: createCache(),
        createHandlerOptions,
        debug: vi.fn(),
        jsHandler,
        onUpdate,
        runtimeSet,
        applyLinkedResults,
      },
    )

    await task()

    expect(jsHandler).toHaveBeenCalledWith(
      'const a = 1',
      runtimeSet,
      expect.objectContaining({
        // toAbsoluteOutputPath 使用 path.resolve，Windows 下会带盘符
        filename: path.resolve('/project/dist', 'assets/app.js'),
        uniAppX: true,
      }),
    )
    expect(asset.source).toBe('processed')
    expect(applyLinkedResults).toHaveBeenCalledWith(
      expect.objectContaining({
        // linked 结果中的路径由 jsHandler mock 直接返回，保持原样
        '/project/dist/linked.js': { code: 'linked' },
      }),
    )
    expect(onUpdate).toHaveBeenCalledWith('assets/app.js', 'const a = 1', 'processed')
  })

  it('forwards disabled uni-app-x object options as a boolean to js handler', async () => {
    const asset = createAsset('const a = 1')
    const runtimeSet = new Set(['alpha'])
    const jsHandler = vi.fn(() => ({
      code: 'processed',
    }))
    const createHandlerOptions = vi.fn((filename: string, extra?: CreateJsHandlerOptions) => ({
      filename,
      ...extra,
    }))
    const task = createUniAppXAssetTask(
      'assets/app.js',
      asset,
      '/project/dist',
      {
        cache: createCache(),
        createHandlerOptions,
        debug: vi.fn(),
        jsHandler,
        onUpdate: vi.fn(),
        runtimeSet,
        applyLinkedResults: vi.fn(),
        uniAppX: {
          enabled: false,
        },
      },
    )

    await task()

    expect(jsHandler).toHaveBeenCalledWith(
      'const a = 1',
      runtimeSet,
      expect.objectContaining({
        uniAppX: false,
      }),
    )
  })

  it('injects uni-app-x generated style placeholders from style assets', async () => {
    const asset = createAsset('_cE("view", _uM({ class: "bg-_b_h102938_B w-_b173px_B text-xs" }))\n/*GenPagesIndexIndexStyles*/')
    const runtimeSet = new Set(['alpha'])
    const jsHandler = vi.fn((source: string) => ({
      code: source,
    }))
    const task = createUniAppXAssetTask(
      'pages/index/index.uvue.ts',
      asset,
      '/project/dist',
      {
        cache: createCache(),
        createHandlerOptions: vi.fn((filename: string, extra?: CreateJsHandlerOptions) => ({
          filename,
          ...extra,
        })),
        debug: vi.fn(),
        getCssSources: () => ['.text-xs{font-size:24rpx}'],
        getAssetSource: vi.fn((file: string) => {
          if (file === 'App.uvue.ts') {
            return 'const GenAppStyles = [_uM([["bg-_b_h102938_B", _pS(_uM([["backgroundColor", "rgba(16,41,56,1)"]]))], ["w-_b173px_B", _pS(_uM([["width", 173]]))]])]'
          }
          if (file === 'pages/index/index.uvue') {
            return 'export default {"wtu-a":{"":{"background-color":"rgba(16, 41, 56, 1)"}}}'
          }
        }),
        jsHandler,
        onUpdate: vi.fn(),
        runtimeSet,
        applyLinkedResults: vi.fn(),
      },
    )

    await task()

    expect(asset.source).toContain('const GenPagesIndexIndexStyles = [_uM([["bg-_b_h102938_B", _pS(_uM([["backgroundColor", "rgba(16,41,56,1)"]]))], ["w-_b173px_B", _pS(_uM([["width", 173]]))]]),')
    expect(asset.source).toContain('["text-xs", _pS(_uM([["fontSize", "24rpx"]]))]')
    expect(asset.source).not.toContain('/*GenPagesIndexIndexStyles*/')
  })
})
