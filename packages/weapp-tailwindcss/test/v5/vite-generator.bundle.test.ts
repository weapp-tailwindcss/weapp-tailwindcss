import type { OutputAsset, OutputChunk } from 'rollup'
import type { Plugin, ResolvedConfig } from 'vite'
import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createJsHandler } from '@/js'
import { replaceWxml } from '@/wxml'
import {
  createContext,
  createRollupAsset,
  createRollupChunk,
  getCurrentContext,
  resetVitePluginTestContext,
  setCurrentContext,
} from '../bundlers/vite-plugin.testkit'

const TEST_TIMEOUT_MS = 30000
const VIRTUAL_VITE_ROOT = '/virtual/weapp-tailwindcss-vite-test'
const createdDirs: string[] = []

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

function getOutputOptionsHandler(plugin: Plugin) {
  const hook = plugin.outputOptions as any
  return typeof hook === 'object' ? hook.handler : hook
}

function getHandleHotUpdateHandler(plugin: Plugin) {
  const hook = plugin.handleHotUpdate as any
  return typeof hook === 'object' ? hook.handler : hook
}

async function resolvePostPlugin() {
  const WeappTailwindcss = await loadWeappTailwindcssPlugin()
  const plugins = WeappTailwindcss()
  const sourcePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:source-candidates') as Plugin
  const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
  expect(sourcePlugin).toBeTruthy()
  expect(postPlugin).toBeTruthy()

  await (postPlugin.configResolved as any)?.call(postPlugin, {
    command: 'serve',
    root: VIRTUAL_VITE_ROOT,
    css: { postcss: { plugins: [] } },
    build: { outDir: 'dist' },
  } as ResolvedConfig)

  return {
    postPlugin,
    sourcePlugin,
  }
}

describe('v5 vite generator bundle', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doUnmock('@/bundlers/vite/incremental-runtime-class-set')
    vi.doUnmock('@/generator')
    resetVitePluginTestContext()
    vi.restoreAllMocks()
  })

  afterEach(async () => {
    await Promise.all(
      createdDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })),
    )
  })

  it('does not generate v4 utilities from vendor merge runtime config', async () => {
    const generateMock = vi.fn(async ({ candidates }: { candidates: Set<string> }) => ({
      css: [...candidates].sort().map(candidate => `.${candidate}{display:block}`).join('\n'),
      rawCss: [...candidates].sort().map(candidate => `.${candidate}{display:block}`).join('\n'),
      target: 'weapp',
      classSet: new Set(candidates),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
          projectRoot: process.cwd(),
          base: process.cwd(),
          baseFallbacks: [],
          css: '@import "tailwindcss";',
          dependencies: [],
        })),
      }
    })

    setCurrentContext(createContext({
      tailwindRuntime: {
        getClassSet: vi.fn(async () => new Set<string>()),
        getClassSetSync: vi.fn(() => new Set<string>()),
        extract: vi.fn(async () => ({ classSet: new Set<string>() })),
        majorVersion: 4,
        options: {
          projectRoot: process.cwd(),
          tailwind: {
            v4: {
              base: process.cwd(),
              css: '@import "tailwindcss";',
            },
          },
        },
      },
    }))

    const { postPlugin, sourcePlugin } = await resolvePostPlugin()
    const transform = getTransformHandler(sourcePlugin)
    await transform?.call(sourcePlugin, 'export const className = "bg-[#123456]"', '/project/pages/index/index.ts')
    const vendorChunk = createRollupChunk('const mergeConfig = { sr: ["sr-only", "not-sr-only"], position: ["sticky"], display: ["inline-table"] }')
    vendorChunk.isEntry = false
    vendorChunk.fileName = 'common/vendor.js'
    vendorChunk.moduleIds = ['/project/node_modules/@weapp-tailwindcss/merge/dist/index.mjs']
    vendorChunk.modules = {
      '/project/node_modules/@weapp-tailwindcss/merge/dist/index.mjs': {
        code: null,
        originalLength: 100,
        removedExports: [],
        renderedExports: [],
        renderedLength: 100,
      },
    }

    const bundle = {
      'common/vendor.js': vendorChunk,
      'pages/index/index.js': {
        ...createRollupChunk('const className = "bg-[#123456]"'),
        fileName: 'pages/index/index.js',
      } as OutputChunk,
      'app.css': {
        ...createRollupAsset('/*! weapp-tailwindcss generator-placeholder */'),
        fileName: 'app.css',
      },
    }

    const generateBundle = getGenerateBundleHandler(postPlugin)
    await generateBundle?.call(postPlugin, {} as any, bundle)

    const candidates = generateMock.mock.calls.at(-1)?.[0]?.candidates as Set<string>
    expect(candidates.has('bg-[#123456]')).toBe(true)
    expect(candidates.has('sr-only')).toBe(false)
    expect(candidates.has('not-sr-only')).toBe(false)
    expect(candidates.has('sticky')).toBe(false)
    expect(candidates.has('inline-table')).toBe(false)
    expect((bundle['app.css'] as OutputAsset).source).toContain('bg-[#123456]')
    expect((bundle['app.css'] as OutputAsset).source).not.toContain('sr-only')
  }, TEST_TIMEOUT_MS)

  it('transforms generated Tailwind candidates in JS string literals and template strings only', async () => {
    const generatedCandidates = new Set([
      'bg-[#123456]',
      'text-[17px]',
      'w-[calc(100%_-_12px)]',
      'hover:bg-red-500',
      'mt-[22rpx]',
      'px-[8px]',
      'py-[4px]',
    ])
    const generateMock = vi.fn(async ({ candidates }: { candidates: Set<string> }) => ({
      css: [...generatedCandidates]
        .map(candidate => `.${replaceWxml(candidate)}{}`)
        .join('\n'),
      rawCss: [...generatedCandidates]
        .map(candidate => `.${candidate.replaceAll(':', '\\:')}{}`)
        .join('\n'),
      target: 'weapp',
      classSet: new Set([...candidates].filter(candidate => generatedCandidates.has(candidate))),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => new Set<string>()),
        reset: vi.fn(async () => undefined),
      }),
    }))
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
          validateCandidates: vi.fn(async (candidates: Set<string>) => (
            new Set([...candidates].filter(candidate => generatedCandidates.has(candidate)))
          )),
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
          projectRoot: process.cwd(),
          base: process.cwd(),
          baseFallbacks: [],
          css: '@import "tailwindcss";',
          dependencies: [],
        })),
      }
    })

    const jsHandler = createJsHandler({
      escapeMap: MappingChars2String,
      jsArbitraryValueFallback: false,
      tailwindcssMajorVersion: 4,
    })
    setCurrentContext(createContext({
      jsHandler,
      tailwindRuntime: {
        getClassSet: vi.fn(async () => new Set<string>()),
        getClassSetSync: vi.fn(() => new Set<string>()),
        extract: vi.fn(async () => ({ classSet: new Set<string>() })),
        majorVersion: 4,
        options: {
          projectRoot: process.cwd(),
        },
      },
    }))

    const source = [
      'export const literal = "bg-[#123456] text-[17px] bg-[#654321]"',
      'export const noExpressionTemplate = `w-[calc(100%_-_12px)] hover:bg-red-500 shadow-blue-100`',
      'export const withExpressionTemplate = `mt-[22rpx] ${active ? "px-[8px]" : "py-[4px]"} rounded-[999px]`',
      'export const array = ["bg-[#123456]", `text-[17px]`, "at App.vue:4"]',
      'export const object = { ok: "hover:bg-red-500", business: "biz-token-[alpha]" }',
    ].join('\n')

    const { postPlugin, sourcePlugin } = await resolvePostPlugin()
    const transform = getTransformHandler(sourcePlugin)
    await transform?.call(sourcePlugin, source, '/project/src/pages/index.ts')

    const bundle = {
      'pages/index/index.js': {
        ...createRollupChunk(source.replaceAll('export const', 'const')),
        fileName: 'pages/index/index.js',
      } as OutputChunk,
      'app.css': {
        ...createRollupAsset('/*! weapp-tailwindcss generator-placeholder */'),
        fileName: 'app.css',
      },
    }

    const generateBundle = getGenerateBundleHandler(postPlugin)
    await generateBundle?.call(postPlugin, {} as any, bundle)

    const candidates = generateMock.mock.calls.at(-1)?.[0]?.candidates as Set<string>
    expect(candidates.has('bg-[#123456]')).toBe(true)
    expect(candidates.has('text-[17px]')).toBe(true)
    expect(candidates.has('w-[calc(100%_-_12px)]')).toBe(true)
    expect(candidates.has('hover:bg-red-500')).toBe(true)
    expect(candidates.has('mt-[22rpx]')).toBe(true)
    expect(candidates.has('px-[8px]')).toBe(true)
    expect(candidates.has('py-[4px]')).toBe(true)

    const code = (bundle['pages/index/index.js'] as OutputChunk).code
    expect(code).toContain(replaceWxml('bg-[#123456]'))
    expect(code).toContain(replaceWxml('text-[17px]'))
    expect(code).toContain(replaceWxml('w-[calc(100%_-_12px)]'))
    expect(code).toContain(replaceWxml('hover:bg-red-500'))
    expect(code).toContain(replaceWxml('mt-[22rpx]'))
    expect(code).toContain(replaceWxml('px-[8px]'))
    expect(code).toContain(replaceWxml('py-[4px]'))
    expect(code).toContain('bg-[#654321]')
    expect(code).toContain('shadow-blue-100')
    expect(code).toContain('rounded-[999px]')
    expect(code).toContain('at App.vue:4')
    expect(code).toContain('biz-token-[alpha]')
  }, TEST_TIMEOUT_MS)

  it('can force generator output for tailwind v4 main css without relying on the tailwind banner', async () => {
    const runtimeSet = new Set(['w-[100px]'])
    const rawTailwindCss = '.w-\\[100px\\]{width:100px}'
    const userCss = '\n.card:hover{color:red}'
    const weappCss = '.w-_b100px_B{width:100px}'
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => runtimeSet),
        reset: vi.fn(async () => undefined),
      }),
    }))
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
          projectRoot: process.cwd(),
          base: process.cwd(),
          baseFallbacks: [],
          css: '@import "tailwindcss";',
          dependencies: [],
        })),
      }
    })

    const styleHandler = vi.fn(async (code: string) => ({ css: `user:${code}` }))
    setCurrentContext(createContext({
      generator: {
        target: 'weapp',
        styleOptions: {
          cssChildCombinatorReplaceValue: 'view',
        },
      },
      styleHandler,
      tailwindRuntime: {
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
        options: {
          projectRoot: process.cwd(),
        },
      },
    }))

    const { postPlugin, sourcePlugin } = await resolvePostPlugin()
    const transform = getTransformHandler(sourcePlugin)
    await transform?.call(sourcePlugin, 'export const className = "w-[100px]"', '/project/src/pages/index.tsx')
    const bundle = {
      'app.js': {
        code: 'const className = "w-[100px]"',
        fileName: 'app.js',
        type: 'chunk',
      } as OutputChunk,
      'app.css': {
        ...createRollupAsset(`${rawTailwindCss}${userCss}`),
        fileName: 'app.css',
      },
    }

    const generateBundle = getGenerateBundleHandler(postPlugin)
    await generateBundle?.call(postPlugin, {} as any, bundle)

    expect((bundle['app.css'] as OutputAsset).source).toBe(`${weappCss}\nuser:${userCss}`)
    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({
      candidates: expect.any(Set),
      target: 'weapp',
      styleOptions: expect.objectContaining({
        cssChildCombinatorReplaceValue: 'view',
        isMainChunk: true,
      }),
    }))
    const candidates = generateMock.mock.calls[0]?.[0]?.candidates as Set<string>
    expect(candidates.has('w-[100px]')).toBe(true)
    const userCssCall = styleHandler.mock.calls.find(([code]) => code === userCss)
    expect(userCssCall).toBeTruthy()
    expect(userCssCall?.[1]).toMatchObject({
      isMainChunk: false,
      majorVersion: 4,
    })
  }, TEST_TIMEOUT_MS)

  it('uses generator css as the source of truth when forced output does not match vite css prefix', async () => {
    const runtimeSet = new Set(['w-[100px]', 'text-red-500'])
    const viteCss = '.w-\\[100px\\]{width:100px}'
    const rawTailwindCss = `${viteCss}.text-red-500{color:red}`
    const weappCss = '.w-_b100px_B{width:100px}.text-red-500{color:red}'
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => runtimeSet),
        reset: vi.fn(async () => undefined),
      }),
    }))
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
          projectRoot: process.cwd(),
          base: process.cwd(),
          baseFallbacks: [],
          css: '@import "tailwindcss";',
          dependencies: [],
        })),
      }
    })

    setCurrentContext(createContext({
      tailwindRuntime: {
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
        options: {
          projectRoot: process.cwd(),
        },
      },
    }))

    const { postPlugin, sourcePlugin } = await resolvePostPlugin()
    const currentContext = getCurrentContext()
    const transform = getTransformHandler(sourcePlugin)
    await transform?.call(sourcePlugin, 'export const className = "w-[100px] text-red-500"', '/project/src/pages/index.tsx')
    const bundle = {
      'app.js': {
        code: 'const className = "w-[100px] text-red-500"',
        fileName: 'app.js',
        type: 'chunk',
      } as OutputChunk,
      'app.css': {
        ...createRollupAsset(viteCss),
        fileName: 'app.css',
      },
    }

    const generateBundle = getGenerateBundleHandler(postPlugin)
    await generateBundle?.call(postPlugin, {} as any, bundle)

    expect((bundle['app.css'] as OutputAsset).source).toBe(`${weappCss}\ncss:${viteCss}`)
    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({
      candidates: expect.any(Set),
      target: 'weapp',
    }))
    const candidates = generateMock.mock.calls[0]?.[0]?.candidates as Set<string>
    expect(candidates.has('w-[100px]')).toBe(true)
    expect(candidates.has('text-red-500')).toBe(true)
    expect(currentContext.styleHandler).toHaveBeenCalledWith(viteCss, expect.objectContaining({
      isMainChunk: false,
      majorVersion: 4,
    }))
  }, TEST_TIMEOUT_MS)

  it('can emit web css without mini-program post processing for multi-target apps', async () => {
    const runtimeSet = new Set(['hover:bg-blue-500'])
    const rawTailwindCss = '.hover\\:bg-blue-500:hover{color:blue}'
    const userCss = '\n.card:hover{color:red}'
    const generateMock = vi.fn(async () => ({
      css: rawTailwindCss,
      rawCss: rawTailwindCss,
      target: 'web',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => runtimeSet),
        reset: vi.fn(async () => undefined),
      }),
    }))
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
          projectRoot: process.cwd(),
          base: process.cwd(),
          baseFallbacks: [],
          css: '@import "tailwindcss";',
          dependencies: [],
        })),
      }
    })

    setCurrentContext(createContext({
      generator: {
        target: 'web',
      },
      tailwindRuntime: {
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
        options: {
          projectRoot: process.cwd(),
        },
      },
    }))

    const { postPlugin } = await resolvePostPlugin()
    const currentContext = getCurrentContext()
    const bundle = {
      'app.css': {
        ...createRollupAsset(`${rawTailwindCss}${userCss}`),
        fileName: 'app.css',
      },
    }

    const generateBundle = getGenerateBundleHandler(postPlugin)
    await generateBundle?.call(postPlugin, {} as any, bundle)

    expect((bundle['app.css'] as OutputAsset).source).toBe(`${rawTailwindCss}${userCss}`)
    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({
      candidates: new Set(),
      scanSources: true,
      target: 'web',
    }))
    expect(currentContext.styleHandler).not.toHaveBeenCalled()
  }, TEST_TIMEOUT_MS)

  it('does not feed compiled Tailwind v4 web css back through the post processor', async () => {
    const runtimeSet = new Set(['bg-gradient-to-br', 'from-emerald-200', 'to-cyan-200'])
    const generatedCss = '.bg-gradient-to-br{background-image:linear-gradient(to bottom right,var(--tw-gradient-stops))}.from-emerald-200{--tw-gradient-from:#a7f3d0}.to-cyan-200{--tw-gradient-to:#a5f3fc}'
    const compiledViteCss = `@layer theme, base, components, utilities;
@theme default {
  --color-emerald-200: oklch(90.5% 0.093 164.15);
}
.bg-gradient-to-br{
  --tw-gradient-position: to bottom right in oklab;
  background-image: linear-gradient(var(--tw-gradient-stops));
}`
    const generateMock = vi.fn(async () => ({
      css: generatedCss,
      rawCss: generatedCss,
      target: 'web',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => runtimeSet),
        reset: vi.fn(async () => undefined),
      }),
    }))
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
          projectRoot: process.cwd(),
          base: process.cwd(),
          baseFallbacks: [],
          css: '@layer theme, base, components, utilities;\n@import "tailwindcss/theme.css" layer(theme);\n@import "tailwindcss/utilities.css" layer(utilities) source(none);',
          dependencies: [],
        })),
      }
    })

    setCurrentContext(createContext({
      generator: {
        target: 'web',
      },
      styleHandler: vi.fn(async () => {
        throw new Error('web target should not post-process compiled css')
      }),
      tailwindRuntime: {
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
        options: {
          projectRoot: process.cwd(),
        },
      },
    }))

    const { postPlugin, sourcePlugin } = await resolvePostPlugin()
    const transform = getTransformHandler(sourcePlugin)
    await transform?.call(
      sourcePlugin,
      'export const className = "bg-gradient-to-br from-emerald-200 to-cyan-200"',
      '/project/src/features.ts',
    )
    const bundle = {
      'app.css': {
        ...createRollupAsset(compiledViteCss),
        fileName: 'app.css',
      },
    }

    const generateBundle = getGenerateBundleHandler(postPlugin)
    await generateBundle?.call(postPlugin, {} as any, bundle)

    expect((bundle['app.css'] as OutputAsset).source).toContain('.bg-gradient-to-br')
    expect((bundle['app.css'] as OutputAsset).source).toContain('background-image: linear-gradient(var(--tw-gradient-stops))')
    expect((bundle['app.css'] as OutputAsset).source).not.toContain('@layer theme')
    expect((bundle['app.css'] as OutputAsset).source).not.toContain('@theme default')
    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({
      candidates: runtimeSet,
      target: 'web',
    }))
    expect(getCurrentContext().styleHandler).not.toHaveBeenCalled()
  }, TEST_TIMEOUT_MS)

  it('uses generator mode for Tailwind v4 main css without changing existing registration', async () => {
    const runtimeSet = new Set(['w-[300.31rpx]', 'hover:bg-blue-500'])
    const rawTailwindCss = '.w-\\[300\\.31rpx\\]{width:300.31rpx}.hover\\:bg-blue-500:hover{color:blue}'
    const userCss = '\n.card:hover{color:red}'
    const weappCss = '.w-_b300_d31rpx_B{width:300.31rpx}'
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))
    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => runtimeSet),
        reset: vi.fn(async () => undefined),
      }),
    }))
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
          projectRoot: process.cwd(),
          base: process.cwd(),
          baseFallbacks: [],
          css: '@import "tailwindcss";',
          dependencies: [],
        })),
      }
    })

    const styleHandler = vi.fn(async (code: string) => ({ css: `user:${code}` }))
    setCurrentContext(createContext({
      generator: {
      },
      styleHandler,
      tailwindRuntime: {
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
      },
    }))

    const { postPlugin } = await resolvePostPlugin()
    const bundle = {
      'app.css': {
        ...createRollupAsset(`${rawTailwindCss}${userCss}`),
        fileName: 'app.css',
      },
    }

    const generateBundle = getGenerateBundleHandler(postPlugin)
    await generateBundle?.call(postPlugin, {} as any, bundle)

    expect((bundle['app.css'] as OutputAsset).source).toBe(`${weappCss}\nuser:${userCss}\nuser:.hover\\:bg-blue-500:hover{color:blue}${userCss}`)
    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({
      candidates: expect.any(Set),
      target: 'weapp',
      styleOptions: expect.objectContaining({
        isMainChunk: true,
        majorVersion: 4,
      }),
    }))
    expect(generateMock.mock.calls[0]?.[0]?.candidates).toEqual(runtimeSet)
    const userCssCall = styleHandler.mock.calls.find(([code]) => code === userCss)
    expect(userCssCall).toBeTruthy()
    expect(userCssCall?.[1]).toMatchObject({
      isMainChunk: false,
      majorVersion: 4,
    })
  }, TEST_TIMEOUT_MS)

  it('keeps v3 generator runtime candidates from JS hot updates when css asset is stale', async () => {
    const generatedCssByCandidate: Record<string, string> = {
      'bg-[red]': '.bg-_bred_B{background-color:red}',
      'bg-[#4268EA]': '.bg-_b_h4268EA_B{background-color:#4268EA}',
    }
    const generateMock = vi.fn(async ({ candidates }: { candidates: Set<string> }) => {
      const css = [...candidates]
        .map(candidate => generatedCssByCandidate[candidate])
        .filter((item): item is string => Boolean(item))
        .join('')
      return {
        css,
        rawCss: css,
        target: 'weapp',
        classSet: candidates,
        dependencies: [],
        sources: [],
        root: null,
        version: 3,
      }
    })
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
          validateCandidates: vi.fn(async (candidates: Set<string>) => (
            new Set([...candidates].filter(candidate => candidate === 'bg-[red]'))
          )),
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(),
      }
    })

    setCurrentContext(createContext({
      tailwindRuntime: {
        getClassSet: vi.fn(async () => new Set<string>()),
        getClassSetSync: vi.fn(() => new Set<string>()),
        extract: vi.fn(async () => ({ classSet: new Set<string>() })),
        majorVersion: 4,
      },
    }))

    const { postPlugin, sourcePlugin } = await resolvePostPlugin()
    const transform = getTransformHandler(sourcePlugin)
    const generateBundle = getGenerateBundleHandler(postPlugin)
    const createBundle = (candidate: string) => ({
      'pages/index/index.js': {
        ...createRollupChunk(`const cardsColor = ["${candidate} shadow-indigo-100"]`),
        fileName: 'pages/index/index.js',
      } as OutputChunk,
      'app.css': {
        ...createRollupAsset('/*! weapp-tailwindcss generator-placeholder */'),
        fileName: 'app.css',
      },
    })

    await transform?.call(sourcePlugin, 'export const className = "bg-[red]"', '/project/src/pages/index.ts')
    const firstBundle = createBundle('bg-[red]')
    await generateBundle?.call(postPlugin, {} as any, firstBundle)

    await transform?.call(sourcePlugin, 'export const className = "bg-[#4268EA]"', '/project/src/pages/index.ts')
    const secondBundle = createBundle('bg-[#4268EA]')
    await generateBundle?.call(postPlugin, {} as any, secondBundle)

    const secondCandidates = generateMock.mock.calls.at(-1)?.[0]?.candidates as Set<string>
    expect(secondCandidates.has('bg-[#4268EA]')).toBe(true)
    expect((secondBundle['app.css'] as OutputAsset).source).toContain('bg-_b_h4268EA_B')
  }, TEST_TIMEOUT_MS)

  it('collects v4 generator candidates from source modules instead of bundle products or sourcemaps', async () => {
    const runtimeSet = new Set(['text-red-500'])
    const rawTailwindCss = '.bg-\\[\\#112233\\]{background-color:#112233}.text-red-500{color:red}'
    const weappCss = '.bg-_b_h112233_B{background-color:#112233}.text-red-500{color:red}'
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: new Set(['bg-[#112233]', 'text-red-500']),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => runtimeSet),
        reset: vi.fn(async () => undefined),
      }),
    }))
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
          projectRoot: process.cwd(),
          base: process.cwd(),
          baseFallbacks: [],
          css: '@import "tailwindcss";',
          dependencies: [],
        })),
      }
    })

    setCurrentContext(createContext({
      tailwindRuntime: {
        getClassSet: vi.fn(async () => new Set(['text-red-500'])),
        getClassSetSync: vi.fn(() => new Set(['text-red-500'])),
        extract: vi.fn(async () => ({ classSet: new Set(['text-red-500']) })),
        majorVersion: 4,
      },
    }))

    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()
    const sourcePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:source-candidates') as Plugin
    const rewritePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:rewrite-css-imports') as Plugin
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
    const finalizerPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:css-finalizer') as Plugin
    expect(sourcePlugin).toBeTruthy()
    expect(rewritePlugin).toBeTruthy()
    expect(postPlugin).toBeTruthy()
    expect(finalizerPlugin).toBeTruthy()

    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'serve',
      root: VIRTUAL_VITE_ROOT,
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
    } as ResolvedConfig)

    const transform = getTransformHandler(sourcePlugin)
    await transform?.call(sourcePlugin, 'export const className = "bg-[#112233] text-red-500"', '/project/src/pages/index.tsx')

    const bundle = {
      'app.js': {
        ...createRollupChunk('const bundled = "bg-[#445566]"'),
        map: {
          version: 3,
          sources: ['../src/pages/index.tsx'],
          sourcesContent: ['export const className = "bg-[#778899]"'],
          names: [],
          mappings: '',
        },
        fileName: 'app.js',
      } as OutputChunk,
      'app.css': {
        ...createRollupAsset('/*! weapp-tailwindcss generator-placeholder */'),
        fileName: 'app.css',
      },
    }

    const generateBundle = getGenerateBundleHandler(postPlugin)
    await generateBundle?.call(postPlugin, {} as any, bundle)

    expect(generateMock).toHaveBeenCalled()
    const candidates = generateMock.mock.calls[0]?.[0]?.candidates as Set<string>
    expect(candidates.has('bg-[#112233]')).toBe(true)
    expect(candidates.has('text-red-500')).toBe(true)
    expect(candidates.has('bg-[#445566]')).toBe(false)
    expect(candidates.has('bg-[#778899]')).toBe(false)
  }, TEST_TIMEOUT_MS)

  it('regenerates v4 force css when source candidates change but css asset content stays unchanged', async () => {
    const runtimeSet = new Set<string>()
    const generatedCssByCandidate: Record<string, string> = {
      'bg-[#112233]': '.bg-_b_h112233_B{background-color:#112233}',
      'bg-[#445566]': '.bg-_b_h445566_B{background-color:#445566}',
    }
    const generateMock = vi.fn(async ({ candidates }: { candidates: Set<string> }) => {
      const css = [...candidates]
        .map(candidate => generatedCssByCandidate[candidate])
        .filter((item): item is string => Boolean(item))
        .join('')
      return {
        css,
        rawCss: css,
        target: 'weapp',
        classSet: candidates,
        dependencies: [],
        sources: [],
        root: null,
      }
    })

    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => runtimeSet),
        reset: vi.fn(async () => undefined),
      }),
    }))
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
          projectRoot: process.cwd(),
          base: process.cwd(),
          baseFallbacks: [],
          css: '@import "tailwindcss";',
          dependencies: [],
        })),
      }
    })

    setCurrentContext(createContext({
      tailwindRuntime: {
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
        options: {
          projectRoot: process.cwd(),
        },
      },
    }))

    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()
    const sourcePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:source-candidates') as Plugin
    const rewritePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:rewrite-css-imports') as Plugin
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
    expect(sourcePlugin).toBeTruthy()
    expect(rewritePlugin).toBeTruthy()
    expect(postPlugin).toBeTruthy()

    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'serve',
      root: VIRTUAL_VITE_ROOT,
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
    } as ResolvedConfig)

    const transform = getTransformHandler(sourcePlugin)
    const generateBundle = getGenerateBundleHandler(postPlugin)
    const createBundle = () => ({
      'app.js': {
        ...createRollupChunk('const bundled = ""'),
        fileName: 'app.js',
      } as OutputChunk,
      'app.css': {
        ...createRollupAsset('/*! weapp-tailwindcss generator-placeholder */'),
        fileName: 'app.css',
      },
    })

    await transform?.call(sourcePlugin, 'export const className = "bg-[#112233]"', '/project/src/pages/index.tsx')
    const firstBundle = createBundle()
    await generateBundle?.call(postPlugin, {} as any, firstBundle)
    expect((firstBundle['app.css'] as OutputAsset).source).toBe('.bg-_b_h112233_B{background-color:#112233}')

    await transform?.call(sourcePlugin, 'export const className = "bg-[#445566]"', '/project/src/pages/index.tsx')
    const secondBundle = createBundle()
    await generateBundle?.call(postPlugin, {} as any, secondBundle)
    expect((secondBundle['app.css'] as OutputAsset).source).toBe('.bg-_b_h445566_B{background-color:#445566}')
    expect(generateMock).toHaveBeenCalledTimes(2)
  }, TEST_TIMEOUT_MS)

  it('keeps v4 main css source order when build finalizer reprocesses a generated main asset', async () => {
    const runtimeSet = new Set(['flex'])
    const userCss = '.reset-button{padding:0}'
    const rawTailwindCss = '.flex{display:flex}'
    const generateMock = vi.fn(async () => ({
      css: '.flex{display:flex}',
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: runtimeSet,
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => runtimeSet),
        reset: vi.fn(async () => undefined),
      }),
    }))
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
          projectRoot: process.cwd(),
          base: process.cwd(),
          baseFallbacks: [],
          css: '@import "tailwindcss";',
          dependencies: [],
        })),
      }
    })

    setCurrentContext(createContext({
      mainCssChunkMatcher: vi.fn(file => file === 'app.css'),
      styleHandler: vi.fn(async (code: string) => ({ css: code })),
      tailwindRuntime: {
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
        options: {
          projectRoot: process.cwd(),
        },
      },
    }))

    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
    expect(postPlugin).toBeTruthy()

    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'build',
      root: VIRTUAL_VITE_ROOT,
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
    } as ResolvedConfig)

    const bundle = {
      'app.css': {
        ...createRollupAsset(`${userCss}\n/*! weapp-tailwindcss generator-placeholder */`),
        fileName: 'app.css',
      },
    }
    const generateBundle = getGenerateBundleHandler(postPlugin)
    await generateBundle?.call(postPlugin, {} as any, bundle)
    expect((bundle['app.css'] as OutputAsset).source).toBe(`${userCss}\n.flex{display:flex}`)

    const finalizer = plugins?.find((plugin: Plugin) =>
      plugin.name === 'weapp-tailwindcss:adaptor:css-finalizer')
    expect(finalizer).toBeTruthy()

    const finalizerGenerateBundle = getGenerateBundleHandler(finalizer as Plugin)
    await finalizerGenerateBundle?.call(finalizer, {} as any, bundle)
    expect((bundle['app.css'] as OutputAsset).source).toBe(`${userCss}\n.flex{display:flex}`)
    expect(generateMock).toHaveBeenCalledTimes(1)
  }, TEST_TIMEOUT_MS)

  it('replays v4 main css when watch rebuild only rewrites non-runtime js output', async () => {
    const runtimeSet = new Set<string>()
    const generateMock = vi.fn(async () => ({
      css: '.bg-_b_h112233_B{background-color:#112233}',
      rawCss: '.bg-\\[\\#112233\\]{background-color:#112233}',
      target: 'weapp',
      classSet: new Set(['bg-[#112233]']),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => runtimeSet),
        reset: vi.fn(async () => undefined),
      }),
    }))
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
          projectRoot: process.cwd(),
          base: process.cwd(),
          baseFallbacks: [],
          css: '@import "tailwindcss";',
          dependencies: [],
        })),
      }
    })

    setCurrentContext(createContext({
      mainCssChunkMatcher: vi.fn(file => file === 'app.css'),
      tailwindRuntime: {
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
        options: {
          projectRoot: process.cwd(),
          tailwindcss: {
            cwd: process.cwd(),
          },
        },
      },
    }))

    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()
    const sourcePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:source-candidates') as Plugin
    const rewritePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:rewrite-css-imports') as Plugin
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
    expect(sourcePlugin).toBeTruthy()
    expect(rewritePlugin).toBeTruthy()
    expect(postPlugin).toBeTruthy()

    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'build',
      root: VIRTUAL_VITE_ROOT,
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist', watch: {} },
    } as ResolvedConfig)

    const transform = getTransformHandler(sourcePlugin)
    await transform?.call(sourcePlugin, 'export const className = "bg-[#112233]"', '/project/src/pages/index.tsx')
    const generateBundle = getGenerateBundleHandler(postPlugin)
    const createBundle = (jsCode: string) => ({
      'app.js': {
        ...createRollupChunk(jsCode),
        fileName: 'app.js',
      } as OutputChunk,
      'app.css': {
        ...createRollupAsset('/*! weapp-tailwindcss generator-placeholder */'),
        fileName: 'app.css',
      },
    })

    const firstBundle = createBundle('const className = "bg-[#112233]"; const stamp = 1')
    await generateBundle?.call(postPlugin, {} as any, firstBundle)
    expect((firstBundle['app.css'] as OutputAsset).source).toBe('.bg-_b_h112233_B{background-color:#112233}')

    const secondBundle = createBundle('const className = "bg-[#112233]"; const stamp = 2')
    await generateBundle?.call(postPlugin, {} as any, secondBundle)
    expect((secondBundle['app.css'] as OutputAsset).source).toBe('.bg-_b_h112233_B{background-color:#112233}')
    expect(generateMock).toHaveBeenCalledTimes(1)
  }, TEST_TIMEOUT_MS)

  it('regenerates v4 main css when template candidates change but the css asset source is stable', async () => {
    const runtimeSet = new Set<string>()
    const generateMock = vi.fn(async ({ candidates }: { candidates: Set<string> }) => ({
      css: [...candidates].sort().map(candidate => `.${candidate}{display:block}`).join('\n'),
      rawCss: [...candidates].sort().map(candidate => `.${candidate}{display:block}`).join('\n'),
      target: 'weapp',
      classSet: new Set(candidates),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => runtimeSet),
        reset: vi.fn(async () => undefined),
      }),
    }))
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
          projectRoot: process.cwd(),
          base: process.cwd(),
          baseFallbacks: [],
          css: '@import "tailwindcss";',
          dependencies: [],
        })),
      }
    })

    setCurrentContext(createContext({
      mainCssChunkMatcher: vi.fn(file => file === 'app.css'),
      tailwindRuntime: {
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
        options: {
          projectRoot: process.cwd(),
          tailwindcss: {
            cwd: process.cwd(),
          },
        },
      },
    }))

    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()
    const sourcePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:source-candidates') as Plugin
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
    expect(sourcePlugin).toBeTruthy()
    expect(postPlugin).toBeTruthy()

    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'build',
      root: VIRTUAL_VITE_ROOT,
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist', watch: {} },
    } as ResolvedConfig)

    const transform = getTransformHandler(sourcePlugin)
    const generateBundle = getGenerateBundleHandler(postPlugin)
    const createBundle = (wxml: string) => ({
      'pages/index/index.wxml': {
        ...createRollupAsset(wxml),
        fileName: 'pages/index/index.wxml',
      },
      'app.css': {
        ...createRollupAsset('/*! weapp-tailwindcss generator-placeholder */'),
        fileName: 'app.css',
      },
    })

    await transform?.call(sourcePlugin, '<view class="bg-[#112233]"></view>', '/project/src/pages/index/index.vue')
    const firstBundle = createBundle('<view class="bg-[#112233]"></view>')
    await generateBundle?.call(postPlugin, {} as any, firstBundle)
    expect((firstBundle['app.css'] as OutputAsset).source).toBe('.bg-[#112233]{display:block}')

    await transform?.call(sourcePlugin, '<view class="bg-[#445566]"></view>', '/project/src/pages/index/index.vue')
    const secondBundle = createBundle('<view class="bg-[#445566]"></view>')
    await generateBundle?.call(postPlugin, {} as any, secondBundle)
    expect((secondBundle['app.css'] as OutputAsset).source).toBe('.bg-[#445566]{display:block}')
    expect(generateMock).toHaveBeenCalledTimes(2)
  }, TEST_TIMEOUT_MS)

  it('scans project source files for generator candidates without reading dist products or sourcemaps', async () => {
    const tempDir = await path.join(os.tmpdir(), `weapp-tw-source-scan-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    createdDirs.push(tempDir)
    await mkdir(path.join(tempDir, 'pages/index'), { recursive: true })
    await mkdir(path.join(tempDir, 'dist/pages/index'), { recursive: true })
    await writeFile(path.join(tempDir, 'pages/index/index.ts'), 'export const className = "bg-[#112233]"', 'utf8')
    await writeFile(path.join(tempDir, 'pages/index/index.wxml'), '<view class="text-[#223344]"></view>', 'utf8')
    await writeFile(path.join(tempDir, 'dist/pages/index/index.js'), 'const bundled = "bg-[#445566]"', 'utf8')
    await writeFile(
      path.join(tempDir, 'dist/pages/index/index.js.map'),
      JSON.stringify({
        version: 3,
        sources: ['../../pages/index/index.ts'],
        sourcesContent: ['export const className = "bg-[#778899]"'],
        mappings: '',
      }),
      'utf8',
    )

    const runtimeSet = new Set<string>()
    const generateMock = vi.fn(async () => ({
      css: '.ok{}',
      rawCss: '.ok{}',
      target: 'weapp',
      classSet: new Set<string>(),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => runtimeSet),
        reset: vi.fn(async () => undefined),
      }),
    }))
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
          projectRoot: tempDir,
          base: tempDir,
          baseFallbacks: [],
          css: '@import "tailwindcss";',
          dependencies: [],
        })),
      }
    })

    setCurrentContext(createContext({
      tailwindRuntime: {
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
        options: {
          projectRoot: tempDir,
          tailwindcss: {
            cwd: tempDir,
          },
        },
      },
    }))

    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()
    const sourcePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:source-candidates') as Plugin
    const rewritePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:rewrite-css-imports') as Plugin
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
    expect(sourcePlugin).toBeTruthy()
    expect(rewritePlugin).toBeTruthy()
    expect(postPlugin).toBeTruthy()

    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'build',
      root: tempDir,
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
    } as ResolvedConfig)
    await (sourcePlugin.buildStart as any)?.call(sourcePlugin)

    const bundle = {
      'app.css': {
        ...createRollupAsset('/*! weapp-tailwindcss generator-placeholder */'),
        fileName: 'app.css',
      },
    }
    const generateBundle = getGenerateBundleHandler(postPlugin)
    await generateBundle?.call(postPlugin, {} as any, bundle)

    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({
      candidates: expect.any(Set),
    }))
    const candidates = generateMock.mock.calls[0]?.[0]?.candidates as Set<string>
    expect(candidates.has('bg-[#112233]')).toBe(true)
    expect(candidates.has('text-[#223344]')).toBe(true)
    expect(candidates.has('bg-[#445566]')).toBe(false)
    expect(candidates.has('bg-[#778899]')).toBe(false)
  }, TEST_TIMEOUT_MS)

  it('collects generator candidates from source css @apply without scanning css selectors', async () => {
    const tempDir = await path.join(os.tmpdir(), `weapp-tw-source-apply-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    createdDirs.push(tempDir)
    await mkdir(tempDir, { recursive: true })
    await writeFile(
      path.join(tempDir, 'app.css'),
      [
        '@import "tailwindcss";',
        '@config "./tailwind.config.js";',
        '.tw-watch-style-fixture { @apply font-bold text-center min-w-0 bg-[#123456] px-[12px]; }',
      ].join('\n'),
      'utf8',
    )

    const runtimeSet = new Set<string>()
    const createGeneratorMock = vi.fn(() => ({
      generate: generateMock,
    }))
    const generateMock = vi.fn(async () => ({
      css: '.ok{}',
      rawCss: '.ok{}',
      target: 'weapp',
      classSet: new Set<string>(),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => runtimeSet),
        reset: vi.fn(async () => undefined),
      }),
    }))
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: createGeneratorMock,
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
          projectRoot: tempDir,
          base: tempDir,
          baseFallbacks: [],
          css: '@import "tailwindcss";',
          dependencies: [],
        })),
      }
    })

    setCurrentContext(createContext({
      tailwindRuntime: {
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
        options: {
          projectRoot: tempDir,
          tailwindcss: {
            cwd: tempDir,
            v4: {
              cssEntries: [path.join(tempDir, 'app.css')],
            },
          },
        },
      },
    }))

    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()
    const sourcePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:source-candidates') as Plugin
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
    expect(sourcePlugin).toBeTruthy()
    expect(postPlugin).toBeTruthy()

    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'build',
      root: tempDir,
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
    } as ResolvedConfig)
    await (sourcePlugin.buildStart as any)?.call(sourcePlugin)

    const bundle = {
      'dist/app.css': {
        ...createRollupAsset([
          '/*! weapp-tailwindcss generator-placeholder */',
          '@config "./tailwind.config.js";',
          '.tw-watch-style-fixture { @apply font-bold text-center min-w-0 bg-[#123456] px-[12px]; }',
        ].join('\n')),
        fileName: 'dist/app.css',
      },
    }
    const generateBundle = getGenerateBundleHandler(postPlugin)
    await generateBundle?.call(postPlugin, {} as any, bundle)

    const candidates = generateMock.mock.calls[0]?.[0]?.candidates as Set<string>
    expect(candidates.has('font-bold')).toBe(true)
    expect(candidates.has('text-center')).toBe(true)
    expect(candidates.has('min-w-0')).toBe(true)
    expect(candidates.has('bg-[#123456]')).toBe(true)
    expect(candidates.has('px-[12px]')).toBe(true)
    expect(candidates.has('tw-watch-style-fixture')).toBe(false)
    expect(createGeneratorMock).toHaveBeenCalledWith(expect.objectContaining({
      base: tempDir,
      css: expect.stringContaining('.tw-watch-style-fixture { @apply font-bold text-center min-w-0 bg-[#123456] px-[12px]; }'),
    }))
    expect(createGeneratorMock.mock.calls[0]?.[0]?.css).toContain(`@config "${path.join(tempDir, 'tailwind.config.js')}"`)
    expect(createGeneratorMock.mock.calls[0]?.[0]?.css).not.toContain('generator-placeholder')
  }, TEST_TIMEOUT_MS)

  it('keeps v4 source candidates across build-watch rebuilds and syncs changed source files', async () => {
    const tempDir = await path.join(os.tmpdir(), `weapp-tw-source-watch-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    createdDirs.push(tempDir)
    await mkdir(path.join(tempDir, 'src/pages/index'), { recursive: true })
    await mkdir(path.join(tempDir, 'src/components'), { recursive: true })
    const sourceFile = path.join(tempDir, 'src/pages/index/index.tsx')
    const unrelatedFile = path.join(tempDir, 'src/components/card.tsx')
    await writeFile(sourceFile, 'export const className = "bg-[#112233]"', 'utf8')
    await writeFile(unrelatedFile, 'export const className = "text-[#111111]"', 'utf8')

    const runtimeSet = new Set<string>()
    const rawTailwindCss = [
      '.bg-\\[\\#112233\\]{background-color:#112233}',
      '.bg-\\[\\#445566\\]{background-color:#445566}',
      '.text-\\[\\#111111\\]{color:#111111}',
      '.text-\\[\\#999999\\]{color:#999999}',
    ].join('')
    const weappCss = [
      '.bg-_b_h112233_B{background-color:#112233}',
      '.bg-_b_h445566_B{background-color:#445566}',
      '.text-_b_h111111_B{color:#111111}',
      '.text-_b_h999999_B{color:#999999}',
    ].join('')
    const generateMock = vi.fn(async () => ({
      css: weappCss,
      rawCss: rawTailwindCss,
      target: 'weapp',
      classSet: new Set(['bg-[#112233]', 'bg-[#445566]', 'text-[#111111]', 'text-[#999999]']),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => runtimeSet),
        reset: vi.fn(async () => undefined),
      }),
    }))
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
          projectRoot: tempDir,
          base: tempDir,
          baseFallbacks: [],
          css: '@import "tailwindcss";',
          dependencies: [],
        })),
      }
    })

    setCurrentContext(createContext({
      tailwindRuntime: {
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
        options: {
          projectRoot: tempDir,
          tailwindcss: {
            cwd: tempDir,
          },
        },
      },
    }))

    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()
    const sourcePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:source-candidates') as Plugin
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
    expect(sourcePlugin).toBeTruthy()
    expect(postPlugin).toBeTruthy()

    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'build',
      root: tempDir,
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist', watch: {} },
    } as ResolvedConfig)

    const transform = getTransformHandler(sourcePlugin)
    const generateBundle = getGenerateBundleHandler(postPlugin)
    await transform?.call(sourcePlugin, await readFile(sourceFile, 'utf8'), sourceFile)
    await (sourcePlugin.buildStart as any)?.call(sourcePlugin)

    await writeFile(unrelatedFile, 'export const className = "text-[#999999]"', 'utf8')
    await writeFile(sourceFile, 'export const className = "bg-[#445566]"', 'utf8')
    await (sourcePlugin.watchChange as any)?.call(sourcePlugin, sourceFile, { event: 'update' })
    await (sourcePlugin.buildStart as any)?.call(sourcePlugin)

    const bundle = {
      'app.css': {
        ...createRollupAsset('/*! weapp-tailwindcss generator-placeholder */'),
        fileName: 'app.css',
      },
    }

    await generateBundle?.call(postPlugin, {} as any, bundle)
    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({
      candidates: expect.any(Set),
    }))
    const candidates = generateMock.mock.calls[0]?.[0]?.candidates as Set<string>
    expect(candidates.has('bg-[#112233]')).toBe(false)
    expect(candidates.has('bg-[#445566]')).toBe(true)
    expect(candidates.has('text-[#111111]')).toBe(true)
    expect(candidates.has('text-[#999999]')).toBe(false)
  }, TEST_TIMEOUT_MS)

  it('keeps changed v4 source candidates when generator css narrows candidates by @source entries', async () => {
    const tempDir = await path.join(os.tmpdir(), `weapp-tw-source-watch-entry-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    createdDirs.push(tempDir)
    await mkdir(path.join(tempDir, 'src/pages/index'), { recursive: true })
    const sourceFile = path.join(tempDir, 'src/pages/index/index.vue')
    const cssFile = path.join(tempDir, 'src/main.css')
    const cssSource = [
      '@import "tailwindcss" source(none);',
      '@source "../src/**/*.{vue,js,ts,jsx,tsx,html}";',
    ].join('\n')
    await writeFile(cssFile, cssSource, 'utf8')
    await writeFile(sourceFile, '<view class="bg-[#112233]"></view>', 'utf8')

    const runtimeSet = new Set<string>()
    const generateMock = vi.fn(async ({ candidates }: { candidates: Set<string> }) => {
      const css = [...candidates].map(candidate => `.${candidate}{}`).join('')
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

    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => runtimeSet),
        reset: vi.fn(async () => undefined),
      }),
    }))
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
        })),
        resolveTailwindV4Source: vi.fn(async (options: any) => ({
          projectRoot: tempDir,
          base: options.base ?? tempDir,
          baseFallbacks: [],
          css: options.css ?? (options.cssEntries?.[0] === cssFile ? cssSource : ''),
          dependencies: options.cssEntries ?? [],
        })),
        resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
          projectRoot: tempDir,
          base: tempDir,
          baseFallbacks: [],
          cssEntries: [cssFile],
        })),
      }
    })

    setCurrentContext(createContext({
      tailwindRuntime: {
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
        options: {
          projectRoot: tempDir,
          tailwindcss: {
            cwd: tempDir,
            v4: {
              cssEntries: [cssFile],
            },
          },
        },
      },
    }))

    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()
    const sourcePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:source-candidates') as Plugin
    const rewritePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:rewrite-css-imports') as Plugin
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
    expect(sourcePlugin).toBeTruthy()
    expect(rewritePlugin).toBeTruthy()
    expect(postPlugin).toBeTruthy()

    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'build',
      root: tempDir,
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist', watch: {} },
    } as ResolvedConfig)

    const generateBundle = getGenerateBundleHandler(postPlugin)
    await (sourcePlugin.buildStart as any)?.call(sourcePlugin)

    await generateBundle?.call(postPlugin, {} as any, {
      'app.css': {
        ...createRollupAsset('@import "tailwindcss";'),
        fileName: 'app.css',
      },
    })

    await writeFile(sourceFile, '<view class="bg-[#445566] text-[23.000053px]"></view>', 'utf8')
    await (sourcePlugin.watchChange as any)?.call(sourcePlugin, sourceFile, { event: 'update' })
    await (sourcePlugin.buildStart as any)?.call(sourcePlugin)

    const cssTransform = getTransformHandler(rewritePlugin)
    await cssTransform?.call(
      rewritePlugin,
      cssSource,
      cssFile,
    )

    const bundle = {
      'app.css': {
        ...createRollupAsset('/*! weapp-tailwindcss generator-placeholder */'),
        fileName: 'app.css',
      },
    }

    await generateBundle?.call(postPlugin, {} as any, bundle)

    expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({
      candidates: expect.any(Set),
    }))
    const candidates = generateMock.mock.calls.at(-1)?.[0]?.candidates as Set<string>
    expect(candidates.has('bg-[#445566]')).toBe(true)
    expect(candidates.has('text-[23.000053px]')).toBe(true)
    expect(candidates.has('bg-[#112233]')).toBe(false)
  }, TEST_TIMEOUT_MS)

  it('keeps Taro Vite v4 css entries isolated across main and subpackage outputs', async () => {
    const tempDir = await path.join(os.tmpdir(), `weapp-tw-taro-vite-v4-subpackage-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    createdDirs.push(tempDir)
    const appCss = path.join(tempDir, 'src/app.css')
    const pageCss = path.join(tempDir, 'src/pages/index/index.css')
    const subNormalCss = path.join(tempDir, 'src/sub-normal/pages/index.css')
    const subIndependentCss = path.join(tempDir, 'src/sub-independent/pages/index.css')
    const appPage = path.join(tempDir, 'src/pages/index/index.tsx')
    const subNormalPage = path.join(tempDir, 'src/sub-normal/pages/index.tsx')
    const subIndependentPage = path.join(tempDir, 'src/sub-independent/pages/index.tsx')
    await mkdir(path.dirname(pageCss), { recursive: true })
    await mkdir(path.dirname(subNormalCss), { recursive: true })
    await mkdir(path.dirname(subIndependentCss), { recursive: true })
    await writeFile(appCss, [
      '@import "tailwindcss" source(none);',
      '@source "./pages/**/*.{ts,tsx}";',
      '@source not "./sub-normal/**/*";',
      '@source not "./sub-independent/**/*";',
    ].join('\n'), 'utf8')
    await writeFile(pageCss, '.page-local{display:block}', 'utf8')
    await writeFile(subNormalCss, [
      '@import "tailwindcss" source(none);',
      '@source "./**/*.{ts,tsx}";',
    ].join('\n'), 'utf8')
    await writeFile(subIndependentCss, [
      '@import "tailwindcss" source(none);',
      '@source "./**/*.{ts,tsx}";',
    ].join('\n'), 'utf8')
    await writeFile(appPage, 'export default "vite-main-only"', 'utf8')
    await writeFile(subNormalPage, 'export default "vite-normal-only"', 'utf8')
    await writeFile(subIndependentPage, 'export default "vite-independent-only"', 'utf8')

    const generateMock = vi.fn(async ({ candidates }: { candidates: Set<string> }) => {
      const css = [...candidates].sort().map(candidate => `.${candidate}{display:block}`).join('\n')
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
    const tokensBySource = new Map<string, Set<string>>([
      [appPage, new Set(['vite-main-only'])],
      [subNormalPage, new Set(['vite-normal-only'])],
      [subIndependentPage, new Set(['vite-independent-only'])],
    ])
    const collectCandidates = (entries: Array<{ base?: string, pattern?: string, negated?: boolean }> | undefined) => {
      if (!entries?.length) {
        return new Set([...tokensBySource.values()].flatMap(tokens => [...tokens]))
      }
      const included = new Set<string>()
      for (const [file, tokens] of tokensBySource) {
        const fileKey = file.split(path.sep).join('/')
        const include = entries.some((entry) => {
          const base = path.resolve(entry.base ?? tempDir).split(path.sep).join('/')
          return !entry.negated && fileKey.startsWith(base)
        })
        const exclude = entries.some((entry) => {
          const base = path.resolve(entry.base ?? tempDir).split(path.sep).join('/')
          return entry.negated && fileKey.startsWith(base)
        })
        if (include && !exclude) {
          for (const token of tokens) {
            included.add(token)
          }
        }
      }
      return included
    }

    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => collectCandidates(undefined)),
        reset: vi.fn(async () => undefined),
      }),
    }))
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
        })),
        resolveTailwindV4Source: vi.fn(async (options: any) => ({
          projectRoot: tempDir,
          base: options.base ?? tempDir,
          baseFallbacks: [],
          css: options.css,
          dependencies: options.cssEntries ?? [],
        })),
      }
    })

    setCurrentContext(createContext({
      appType: 'taro',
      tailwindcssBasedir: tempDir,
      cssEntries: [appCss, subNormalCss, subIndependentCss],
      tailwindcss: {
        version: 4,
        packageName: 'tailwindcss',
        v4: {
          cssEntries: [appCss, subNormalCss, subIndependentCss],
        },
      },
      tailwindRuntime: {
        getClassSet: vi.fn(async () => collectCandidates(undefined)),
        getClassSetSync: vi.fn(() => collectCandidates(undefined)),
        extract: vi.fn(async () => ({ classSet: collectCandidates(undefined) })),
        collectContentTokens: vi.fn(async entries => ({
          candidates: collectCandidates(entries),
          sourcesByToken: new Map([...tokensBySource].flatMap(([file, tokens]) =>
            [...tokens].map(token => [token, new Set([file])] as const),
          )),
        })),
        majorVersion: 4,
        options: {
          projectRoot: tempDir,
          tailwindcss: {
            cwd: tempDir,
            v4: {
              cssEntries: [appCss, subNormalCss, subIndependentCss],
            },
          },
        },
      },
    } as any))

    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()
    const sourcePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:source-candidates') as Plugin
    const rewritePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:rewrite-css-imports') as Plugin
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
    expect(sourcePlugin).toBeTruthy()
    expect(rewritePlugin).toBeTruthy()
    expect(postPlugin).toBeTruthy()

    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'build',
      root: tempDir,
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
    } as ResolvedConfig)

    await (sourcePlugin.buildStart as any)?.call(sourcePlugin)
    const cssTransform = getTransformHandler(rewritePlugin)
    await cssTransform?.call(rewritePlugin, await readFile(appCss, 'utf8'), appCss)
    await cssTransform?.call(rewritePlugin, await readFile(subNormalCss, 'utf8'), subNormalCss)
    await cssTransform?.call(rewritePlugin, await readFile(subIndependentCss, 'utf8'), subIndependentCss)

    const bundle = {
      'app.css': {
        ...createRollupAsset('/*! weapp-tailwindcss generator-placeholder */'),
        fileName: 'app.css',
        originalFileNames: [appCss],
      } as OutputAsset,
      'pages/index/index.css': {
        ...createRollupAsset(await readFile(pageCss, 'utf8')),
        fileName: 'pages/index/index.css',
        originalFileNames: [pageCss],
      } as OutputAsset,
      'sub-normal/pages/index.css': {
        ...createRollupAsset('/*! weapp-tailwindcss generator-placeholder */'),
        fileName: 'sub-normal/pages/index.css',
        originalFileNames: [subNormalCss],
      } as OutputAsset,
      'sub-independent/pages/index.css': {
        ...createRollupAsset('/*! weapp-tailwindcss generator-placeholder */'),
        fileName: 'sub-independent/pages/index.css',
        originalFileNames: [subIndependentCss],
      } as OutputAsset,
      'app.js': {
        ...createRollupChunk(''),
        fileName: 'app.js',
        isEntry: true,
        moduleIds: [appPage],
      } as OutputChunk,
      'sub-normal/pages/index.js': {
        ...createRollupChunk(''),
        fileName: 'sub-normal/pages/index.js',
        isEntry: true,
        moduleIds: [subNormalPage],
      } as OutputChunk,
      'sub-independent/pages/index.js': {
        ...createRollupChunk(''),
        fileName: 'sub-independent/pages/index.js',
        isEntry: true,
        moduleIds: [subIndependentPage],
      } as OutputChunk,
    }

    const generateBundle = getGenerateBundleHandler(postPlugin)
    await generateBundle?.call(postPlugin, {} as any, bundle)

    const generatedCandidateSets = generateMock.mock.calls.map(call => [...call[0].candidates])
    expect(generateMock).toHaveBeenCalledTimes(3)
    expect(generatedCandidateSets).toContainEqual(['vite-main-only'])
    expect(generatedCandidateSets).toContainEqual(['vite-normal-only'])
    expect(generatedCandidateSets).toContainEqual(['vite-independent-only'])
    expect((bundle['app.css'] as OutputAsset).source).toContain('.vite-main-only')
    expect((bundle['app.css'] as OutputAsset).source).not.toContain('.vite-normal-only')
    expect((bundle['app.css'] as OutputAsset).source).not.toContain('.vite-independent-only')
    expect((bundle['pages/index/index.css'] as OutputAsset).source).toContain('.page-local{display:block}')
    expect((bundle['pages/index/index.css'] as OutputAsset).source).not.toContain('.vite-main-only')
    expect((bundle['pages/index/index.css'] as OutputAsset).source).not.toContain('.vite-normal-only')
    expect((bundle['pages/index/index.css'] as OutputAsset).source).not.toContain('.vite-independent-only')
    expect((bundle['sub-normal/pages/index.css'] as OutputAsset).source).toContain('.vite-normal-only')
    expect((bundle['sub-normal/pages/index.css'] as OutputAsset).source).not.toContain('.vite-main-only')
    expect((bundle['sub-normal/pages/index.css'] as OutputAsset).source).not.toContain('.vite-independent-only')
    expect((bundle['sub-independent/pages/index.css'] as OutputAsset).source).toContain('.vite-independent-only')
    expect((bundle['sub-independent/pages/index.css'] as OutputAsset).source).not.toContain('.vite-main-only')
    expect((bundle['sub-independent/pages/index.css'] as OutputAsset).source).not.toContain('.vite-normal-only')
  }, TEST_TIMEOUT_MS)

  it('invalidates generated css modules when v4 dev hmr adds arbitrary value candidates', async () => {
    const tempDir = await path.join(os.tmpdir(), `weapp-tw-vite-dev-hmr-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    createdDirs.push(tempDir)
    await mkdir(path.join(tempDir, 'src/pages/index'), { recursive: true })
    const sourceFile = path.join(tempDir, 'src/pages/index/index.vue')
    const cssFile = path.join(tempDir, 'src/App.vue?vue&type=style&index=0&lang.css')
    await writeFile(sourceFile, '<template><view class="text-slate-800"></view></template>', 'utf8')

    const runtimeSet = new Set<string>()
    const generateMock = vi.fn(async ({ candidates, target }: { candidates: Set<string>, target: string }) => ({
      css: [...candidates].sort().map(candidate => `.${candidate}{}`).join('\n'),
      incrementalCss: [...candidates].sort().map(candidate => `.${candidate}{}`).join('\n'),
      rawCss: [...candidates].sort().map(candidate => `.${candidate}{}`).join('\n'),
      target,
      classSet: new Set(candidates),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => runtimeSet),
        reset: vi.fn(async () => undefined),
      }),
    }))
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
          projectRoot: tempDir,
          base: tempDir,
          baseFallbacks: [],
          css: '@import "tailwindcss";',
          dependencies: [],
        })),
      }
    })

    setCurrentContext(createContext({
      generator: {
        target: 'web',
      },
      tailwindRuntime: {
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
        options: {
          projectRoot: tempDir,
          tailwindcss: {
            cwd: tempDir,
          },
        },
      },
    }))

    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()
    const sourcePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:source-candidates') as Plugin
    const rewritePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:rewrite-css-imports') as Plugin
    const serveGenerationPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:generate:serve') as Plugin
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
    expect(sourcePlugin).toBeTruthy()
    expect(rewritePlugin).toBeTruthy()
    expect(serveGenerationPlugin).toBeTruthy()
    expect(postPlugin).toBeTruthy()

    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'serve',
      root: tempDir,
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
    } as ResolvedConfig)

    await (sourcePlugin.buildStart as any)?.call(sourcePlugin)
    const cssTransform = getTransformHandler(rewritePlugin)
    await cssTransform?.call(
      rewritePlugin,
      '@import "tailwindcss";',
      cssFile,
    )
    expect(generateMock).not.toHaveBeenCalled()
    const serveTransform = getTransformHandler(serveGenerationPlugin)
    await serveTransform?.call(serveGenerationPlugin, '@import "tailwindcss";', cssFile)
    expect(generateMock.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({
      candidates: expect.any(Set),
    }))
    const firstCandidates = generateMock.mock.calls.at(-1)?.[0]?.candidates as Set<string>
    expect(firstCandidates.has('text-slate-800')).toBe(true)
    expect(firstCandidates.has('bg-[red]')).toBe(false)

    await writeFile(sourceFile, '<template><view class="bg-[red] text-[blue]"></view></template>', 'utf8')
    const cssModule = { id: cssFile }
    const vueMainModule = { id: path.join(tempDir, 'src/App.vue') }
    const pageModule = { id: sourceFile }
    const invalidateModule = vi.fn()
    const hotModules = await getHandleHotUpdateHandler(sourcePlugin)?.call(sourcePlugin, {
      file: sourceFile,
      modules: [pageModule],
      server: {
        moduleGraph: {
          getModuleById: vi.fn((id: string) => id === cssFile ? cssModule : undefined),
          getModulesByFile: vi.fn(() => new Set([vueMainModule])),
          invalidateModule,
        },
      },
    })

    expect(invalidateModule).toHaveBeenCalledWith(cssModule)
    expect(invalidateModule).not.toHaveBeenCalledWith(vueMainModule)
    expect(hotModules).toEqual([pageModule, vueMainModule, cssModule])

    await cssTransform?.call(
      rewritePlugin,
      '@import "tailwindcss";',
      cssFile,
    )
    generateMock.mockClear()
    const secondResult = await serveTransform?.call(serveGenerationPlugin, '@import "tailwindcss";', cssFile)
    const secondCandidates = generateMock.mock.calls.at(-1)?.[0]?.candidates as Set<string>
    expect(secondCandidates.has('bg-[red]')).toBe(true)
    expect(secondCandidates.has('text-[blue]')).toBe(true)
    expect(secondCandidates.has('text-slate-800')).toBe(false)
    const secondCss = String((secondResult as any)?.code)
    expect(secondCss).toContain('.text-slate-800{}')
    expect(secondCss).toContain('.bg-[red]{}')
    expect(secondCss).toContain('.text-[blue]{}')
  }, TEST_TIMEOUT_MS)

  it('appends incremental css for weapp target dev hmr by default', async () => {
    const tempDir = await path.join(os.tmpdir(), `weapp-tw-vite-dev-hmr-weapp-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    createdDirs.push(tempDir)
    await mkdir(path.join(tempDir, 'src/pages/index'), { recursive: true })
    const sourceFile = path.join(tempDir, 'src/pages/index/index.vue')
    const cssFile = path.join(tempDir, 'src/app.css')
    await writeFile(sourceFile, '<template><view class="text-slate-800"></view></template>', 'utf8')

    const runtimeSet = new Set<string>()
    const generateMock = vi.fn(async ({ candidates, target }: { candidates: Set<string>, target: string }) => ({
      css: [...candidates].sort().map(candidate => `.${candidate}{--test-probe:1}`).join('\n'),
      incrementalCss: [...candidates].sort().map(candidate => `.${candidate}{--test-probe:1}`).join('\n'),
      rawCss: [...candidates].sort().map(candidate => `.${candidate}{--test-probe:1}`).join('\n'),
      target,
      classSet: new Set(candidates),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => runtimeSet),
        reset: vi.fn(async () => undefined),
      }),
    }))
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
          projectRoot: tempDir,
          base: tempDir,
          baseFallbacks: [],
          css: '@tailwind utilities;',
          dependencies: [],
        })),
      }
    })

    setCurrentContext(createContext({
      generator: {
        target: 'weapp',
      },
      tailwindRuntime: {
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
        options: {
          projectRoot: tempDir,
          tailwindcss: {
            cwd: tempDir,
          },
        },
      },
    }))

    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()
    const sourcePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:source-candidates') as Plugin
    const serveGenerationPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:generate:serve') as Plugin
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
    expect(sourcePlugin).toBeTruthy()
    expect(serveGenerationPlugin).toBeTruthy()
    expect(postPlugin).toBeTruthy()

    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'serve',
      root: tempDir,
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
    } as ResolvedConfig)
    await (sourcePlugin.buildStart as any)?.call(sourcePlugin)

    const serveTransform = getTransformHandler(serveGenerationPlugin)
    const firstResult = await serveTransform?.call(serveGenerationPlugin, '@tailwind utilities;', cssFile)
    expect(String((firstResult as any)?.code)).toContain('.text-slate-800')

    await writeFile(sourceFile, '<template><view class="bg-red-500"></view></template>', 'utf8')
    const cssModule = { id: cssFile }
    await getHandleHotUpdateHandler(sourcePlugin)?.call(sourcePlugin, {
      file: sourceFile,
      modules: [{ id: sourceFile, isSelfAccepting: true }],
      server: {
        moduleGraph: {
          getModuleById: vi.fn((id: string) => id === cssFile ? cssModule : undefined),
          getModulesByFile: vi.fn(() => undefined),
          invalidateModule: vi.fn(),
        },
      },
    })

    generateMock.mockClear()
    const secondResult = await serveTransform?.call(serveGenerationPlugin, '@tailwind utilities;', cssFile)
    const secondCandidates = generateMock.mock.calls.at(-1)?.[0]?.candidates as Set<string>
    expect(generateMock.mock.calls.at(-1)?.[0]?.scanSources).toBe(false)
    expect([...secondCandidates]).toEqual(['bg-red-500'])
    const secondCss = String((secondResult as any)?.code)
    expect(secondCss).toContain('.text-slate-800')
    expect(secondCss).toContain('.bg-red-500')
  }, TEST_TIMEOUT_MS)

  it('falls back to full weapp target dev hmr generation when user layer css cannot append incrementally', async () => {
    const tempDir = await path.join(os.tmpdir(), `weapp-tw-vite-dev-hmr-weapp-layer-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    createdDirs.push(tempDir)
    await mkdir(path.join(tempDir, 'src/pages/index'), { recursive: true })
    await mkdir(path.join(tempDir, 'src/pages/about'), { recursive: true })
    const sourceFile = path.join(tempDir, 'src/pages/index/index.vue')
    const retainedSourceFile = path.join(tempDir, 'src/pages/about/index.vue')
    const cssFile = path.join(tempDir, 'src/app.css')
    await writeFile(sourceFile, '<template><view class="text-slate-800"></view></template>', 'utf8')
    await writeFile(retainedSourceFile, '<template><view class="p-4"></view></template>', 'utf8')

    const runtimeSet = new Set<string>()
    const generateMock = vi.fn(async ({ candidates, target }: { candidates: Set<string>, target: string }) => ({
      css: [...candidates].sort().map(candidate => `.${candidate}{--test-probe:1}`).join('\n'),
      incrementalCss: [...candidates].sort().map(candidate => `.${candidate}{--test-probe:1}`).join('\n'),
      rawCss: [...candidates].sort().map(candidate => `.${candidate}{--test-probe:1}`).join('\n'),
      target,
      classSet: new Set(candidates),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => runtimeSet),
        reset: vi.fn(async () => undefined),
      }),
    }))
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
          projectRoot: tempDir,
          base: tempDir,
          baseFallbacks: [],
          css: '@tailwind utilities;',
          dependencies: [],
        })),
      }
    })

    setCurrentContext(createContext({
      generator: {
        target: 'weapp',
      },
      tailwindRuntime: {
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
        options: {
          projectRoot: tempDir,
          tailwindcss: {
            cwd: tempDir,
          },
        },
      },
    }))

    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()
    const sourcePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:source-candidates') as Plugin
    const serveGenerationPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:generate:serve') as Plugin
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
    expect(sourcePlugin).toBeTruthy()
    expect(serveGenerationPlugin).toBeTruthy()
    expect(postPlugin).toBeTruthy()

    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'serve',
      root: tempDir,
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
    } as ResolvedConfig)
    await (sourcePlugin.buildStart as any)?.call(sourcePlugin)

    const serveTransform = getTransformHandler(serveGenerationPlugin)
    await serveTransform?.call(serveGenerationPlugin, [
      '@tailwind utilities;',
      '@layer components { .card { @apply p-4; } }',
    ].join('\n'), cssFile)

    await writeFile(sourceFile, '<template><view class="bg-red-500"></view></template>', 'utf8')
    const cssModule = { id: cssFile }
    await getHandleHotUpdateHandler(sourcePlugin)?.call(sourcePlugin, {
      file: sourceFile,
      modules: [{ id: sourceFile, isSelfAccepting: true }],
      server: {
        moduleGraph: {
          getModuleById: vi.fn((id: string) => id === cssFile ? cssModule : undefined),
          getModulesByFile: vi.fn(() => undefined),
          invalidateModule: vi.fn(),
        },
      },
    })

    generateMock.mockClear()
    const secondResult = await serveTransform?.call(serveGenerationPlugin, [
      '@tailwind utilities;',
      '@layer components { .card { @apply p-4; } }',
    ].join('\n'), cssFile)
    const secondCandidates = generateMock.mock.calls.at(-1)?.[0]?.candidates as Set<string>
    expect([...secondCandidates].sort()).toEqual(['bg-red-500', 'p-4'])
    const secondCss = String((secondResult as any)?.code)
    expect(secondCss).not.toContain('.text-slate-800')
    expect(secondCss).toContain('.bg-red-500')
    expect(secondCss).toContain('.p-4')
  }, TEST_TIMEOUT_MS)

  it('fully regenerates weapp target dev hmr css when preserveDeletedCss is disabled', async () => {
    const tempDir = await path.join(os.tmpdir(), `weapp-tw-vite-dev-hmr-weapp-precise-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    createdDirs.push(tempDir)
    await mkdir(path.join(tempDir, 'src/pages/index'), { recursive: true })
    const sourceFile = path.join(tempDir, 'src/pages/index/index.vue')
    const cssFile = path.join(tempDir, 'src/app.css')
    await writeFile(sourceFile, '<template><view class="text-slate-800"></view></template>', 'utf8')

    const runtimeSet = new Set<string>()
    const generateMock = vi.fn(async ({ candidates, target }: { candidates: Set<string>, target: string }) => ({
      css: [...candidates].sort().map(candidate => `.${candidate}{--test-probe:1}`).join('\n'),
      incrementalCss: [...candidates].sort().map(candidate => `.${candidate}{--test-probe:1}`).join('\n'),
      rawCss: [...candidates].sort().map(candidate => `.${candidate}{--test-probe:1}`).join('\n'),
      target,
      classSet: new Set(candidates),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => runtimeSet),
        reset: vi.fn(async () => undefined),
      }),
    }))
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
          projectRoot: tempDir,
          base: tempDir,
          baseFallbacks: [],
          css: '@tailwind utilities;',
          dependencies: [],
        })),
      }
    })

    setCurrentContext(createContext({
      generator: {
        target: 'weapp',
        hmr: {
          preserveDeletedCss: false,
        },
      },
      tailwindRuntime: {
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
        options: {
          projectRoot: tempDir,
          tailwindcss: {
            cwd: tempDir,
          },
        },
      },
    }))

    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss({
      generator: {
        target: 'weapp',
        hmr: {
          preserveDeletedCss: false,
        },
      },
    })
    const sourcePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:source-candidates') as Plugin
    const serveGenerationPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:generate:serve') as Plugin
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
    expect(sourcePlugin).toBeTruthy()
    expect(serveGenerationPlugin).toBeTruthy()
    expect(postPlugin).toBeTruthy()

    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'serve',
      root: tempDir,
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
    } as ResolvedConfig)
    await (sourcePlugin.buildStart as any)?.call(sourcePlugin)

    const serveTransform = getTransformHandler(serveGenerationPlugin)
    await serveTransform?.call(serveGenerationPlugin, '@tailwind utilities;', cssFile)

    await writeFile(sourceFile, '<template><view class="bg-red-500"></view></template>', 'utf8')
    const cssModule = { id: cssFile }
    await getHandleHotUpdateHandler(sourcePlugin)?.call(sourcePlugin, {
      file: sourceFile,
      modules: [{ id: sourceFile, isSelfAccepting: true }],
      server: {
        moduleGraph: {
          getModuleById: vi.fn((id: string) => id === cssFile ? cssModule : undefined),
          getModulesByFile: vi.fn(() => undefined),
          invalidateModule: vi.fn(),
        },
      },
    })

    generateMock.mockClear()
    const secondResult = await serveTransform?.call(serveGenerationPlugin, '@tailwind utilities;', cssFile)
    const secondCandidates = generateMock.mock.calls.at(-1)?.[0]?.candidates as Set<string>
    expect([...secondCandidates]).toEqual(['bg-red-500'])
    const secondCss = String((secondResult as any)?.code)
    expect(secondCss).not.toContain('.text-slate-800')
    expect(secondCss).toContain('.bg-red-500')
  }, TEST_TIMEOUT_MS)

  it('honors Tailwind v4 @config content negation when scanning vite source candidates', async () => {
    const tempDir = await path.join(os.tmpdir(), `weapp-tw-vite-v4-config-not-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    createdDirs.push(tempDir)
    const cssEntry = path.join(tempDir, 'src/app.css')
    const pageFile = path.join(tempDir, 'src/pages/index.tsx')
    const ignoredFile = path.join(tempDir, 'src/apis/client.ts')
    const configFile = path.join(tempDir, 'tailwind.config.js')
    await mkdir(path.dirname(cssEntry), { recursive: true })
    await mkdir(path.dirname(pageFile), { recursive: true })
    await mkdir(path.dirname(ignoredFile), { recursive: true })
    await writeFile(configFile, 'module.exports = { content: ["./src/**/*.{ts,tsx}", "!./src/apis/**"] }', 'utf8')
    await writeFile(cssEntry, [
      '@import "tailwindcss" source(none);',
      '@config "../tailwind.config.js";',
    ].join('\n'), 'utf8')
    await writeFile(pageFile, 'export const className = "bg-[#112233]"', 'utf8')
    await writeFile(ignoredFile, 'export const className = "text-[77rpx]"', 'utf8')

    const runtimeSet = new Set<string>()
    const generateMock = vi.fn(async () => ({
      css: '.bg-_b_h112233_B{background-color:#112233}',
      rawCss: '.bg-\\[\\#112233\\]{background-color:#112233}',
      target: 'weapp',
      classSet: new Set(['bg-[#112233]']),
      dependencies: [],
      sources: [],
      root: null,
      version: 3,
    }))

    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => runtimeSet),
        reset: vi.fn(async () => undefined),
      }),
    }))
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
          validateCandidates: vi.fn(async (candidates: Set<string>) => candidates),
        })),
      }
    })

    setCurrentContext(createContext({
      cssEntries: [cssEntry],
      tailwindcss: {
        version: 4,
        packageName: 'tailwindcss',
        v4: {
          cssEntries: [cssEntry],
        },
      },
      tailwindRuntime: {
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
      },
    }))

    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()
    const sourcePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:source-candidates') as Plugin
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin

    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'build',
      root: tempDir,
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
    } as ResolvedConfig)
    await (sourcePlugin.buildStart as any)?.call(sourcePlugin)

    const transform = getTransformHandler(sourcePlugin)
    await transform?.call(sourcePlugin, await readFile(ignoredFile, 'utf8'), ignoredFile)

    const generateBundle = getGenerateBundleHandler(postPlugin)
    await generateBundle?.call(postPlugin, {} as any, {
      'app.css': {
        ...createRollupAsset(await readFile(cssEntry, 'utf8')),
        fileName: 'app.css',
      },
    })

    const candidates = generateMock.mock.calls[0]?.[0]?.candidates as Set<string>
    expect(candidates.has('bg-[#112233]')).toBe(true)
    expect(candidates.has('text-[77rpx]')).toBe(false)
  }, TEST_TIMEOUT_MS)

  it('honors Tailwind v4 @source not when scanning vite source candidates', async () => {
    const tempDir = await path.join(os.tmpdir(), `weapp-tw-vite-v4-not-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    createdDirs.push(tempDir)
    const cssEntry = path.join(tempDir, 'src/app.css')
    const pageFile = path.join(tempDir, 'src/pages/index.tsx')
    const ignoredFile = path.join(tempDir, 'src/apis/client.ts')
    await mkdir(path.dirname(cssEntry), { recursive: true })
    await mkdir(path.dirname(pageFile), { recursive: true })
    await mkdir(path.dirname(ignoredFile), { recursive: true })
    await writeFile(cssEntry, [
      '@import "tailwindcss" source("../src");',
      '@source not "./apis/**";',
    ].join('\n'), 'utf8')
    await writeFile(pageFile, 'export const className = "bg-[#112233]"', 'utf8')
    await writeFile(ignoredFile, 'export const className = "text-[77rpx]"', 'utf8')

    const runtimeSet = new Set<string>()
    const generateMock = vi.fn(async () => ({
      css: '.bg-_b_h112233_B{background-color:#112233}',
      rawCss: '.bg-\\[\\#112233\\]{background-color:#112233}',
      target: 'weapp',
      classSet: new Set(['bg-[#112233]']),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => runtimeSet),
        reset: vi.fn(async () => undefined),
      }),
    }))
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
        })),
        resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
          projectRoot: tempDir,
          base: tempDir,
          baseFallbacks: [],
          cssEntries: [cssEntry],
          packageName: 'tailwindcss',
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
          projectRoot: tempDir,
          base: path.dirname(cssEntry),
          baseFallbacks: [],
          css: await readFile(cssEntry, 'utf8'),
          dependencies: [cssEntry],
        })),
      }
    })

    setCurrentContext(createContext({
      cssEntries: [cssEntry],
      tailwindcss: {
        version: 4,
        packageName: 'tailwindcss',
        v4: {
          cssEntries: [cssEntry],
        },
      },
      tailwindRuntime: {
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
      },
    }))

    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss()
    const sourcePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:source-candidates') as Plugin
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin

    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'build',
      root: tempDir,
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
    } as ResolvedConfig)
    await (sourcePlugin.buildStart as any)?.call(sourcePlugin)

    const transform = getTransformHandler(sourcePlugin)
    await transform?.call(sourcePlugin, await readFile(ignoredFile, 'utf8'), ignoredFile)

    const generateBundle = getGenerateBundleHandler(postPlugin)
    await generateBundle?.call(postPlugin, {} as any, {
      'app.css': {
        ...createRollupAsset('/*! weapp-tailwindcss generator-placeholder */'),
        fileName: 'app.css',
      },
    })

    const candidates = generateMock.mock.calls[0]?.[0]?.candidates as Set<string>
    expect(candidates.has('bg-[#112233]')).toBe(true)
    expect(candidates.has('text-[77rpx]')).toBe(false)
  }, TEST_TIMEOUT_MS)

  it('adds Tailwind v4 @source inline candidates to vite generator source candidates', async () => {
    const tempDir = await path.join(os.tmpdir(), `weapp-tw-vite-v4-inline-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    createdDirs.push(tempDir)
    const cssEntry = path.join(tempDir, 'src/app.css')
    await mkdir(path.dirname(cssEntry), { recursive: true })
    await writeFile(cssEntry, [
      '@import "tailwindcss" source(none);',
      '@source inline("underline w-{1..2}");',
      '@source not inline("w-2");',
    ].join('\n'), 'utf8')

    const runtimeSet = new Set<string>()
    const generateMock = vi.fn(async () => ({
      css: '.ok{}',
      rawCss: '.ok{}',
      target: 'weapp',
      classSet: new Set(['underline', 'w-1']),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => runtimeSet),
        reset: vi.fn(async () => undefined),
      }),
    }))
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
        })),
        resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
          projectRoot: tempDir,
          base: tempDir,
          baseFallbacks: [],
          cssEntries: [cssEntry],
          packageName: 'tailwindcss',
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
          projectRoot: tempDir,
          base: path.dirname(cssEntry),
          baseFallbacks: [],
          css: await readFile(cssEntry, 'utf8'),
          dependencies: [cssEntry],
        })),
      }
    })

    setCurrentContext(createContext({
      cssEntries: [cssEntry],
      tailwindcss: {
        version: 4,
        packageName: 'tailwindcss',
        v4: {
          cssEntries: [cssEntry],
        },
      },
      tailwindRuntime: {
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
      },
    }))

    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss({
      cssEntries: [cssEntry],
      tailwindcss: {
        version: 4,
        packageName: 'tailwindcss',
        v4: {
          cssEntries: [cssEntry],
        },
      },
    })
    const sourcePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:source-candidates') as Plugin
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
    const finalizerPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:css-finalizer') as Plugin

    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'build',
      root: tempDir,
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
    } as ResolvedConfig)
    await (finalizerPlugin.configResolved as any)?.call(finalizerPlugin, {
      command: 'build',
      root: tempDir,
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
    } as ResolvedConfig)
    await (sourcePlugin.buildStart as any)?.call(sourcePlugin)

    const generateBundle = getGenerateBundleHandler(finalizerPlugin)
    await generateBundle?.call(finalizerPlugin, {} as any, {
      'app.css': {
        ...createRollupAsset(await readFile(cssEntry, 'utf8')),
        fileName: 'app.css',
      },
    })

    const candidates = generateMock.mock.calls[0]?.[0]?.candidates as Set<string>
    expect(candidates.has('underline')).toBe(true)
    expect(candidates.has('w-1')).toBe(true)
    expect(candidates.has('w-2')).toBe(false)
  }, TEST_TIMEOUT_MS)

  it('does not scan the Vite root when Tailwind v4 css explicitly uses source(none)', async () => {
    const tempDir = await path.join(os.tmpdir(), `weapp-tw-vite-v4-source-none-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    createdDirs.push(tempDir)
    const cssEntry = path.join(tempDir, 'src/app.css')
    await mkdir(path.dirname(cssEntry), { recursive: true })
    await writeFile(cssEntry, '@import "tailwindcss" source(none);', 'utf8')

    const scannedRoots: string[] = []
    vi.doMock('@/bundlers/vite/source-candidates', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/bundlers/vite/source-candidates')>()
      const collector = actual.createSourceCandidateCollector()
      return {
        ...actual,
        createSourceCandidateCollector: vi.fn(() => ({
          ...collector,
          scanRoot: vi.fn(async (options) => {
            scannedRoots.push(options.root)
            await collector.scanRoot(options)
          }),
        })),
      }
    })
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
          projectRoot: tempDir,
          base: tempDir,
          baseFallbacks: [],
          cssEntries: [cssEntry],
          packageName: 'tailwindcss',
        })),
      }
    })

    setCurrentContext(createContext({
      cssEntries: [cssEntry],
      tailwindcss: {
        version: 4,
        packageName: 'tailwindcss',
        v4: {
          cssEntries: [cssEntry],
        },
      },
      tailwindRuntime: {
        getClassSet: vi.fn(async () => new Set<string>()),
        getClassSetSync: vi.fn(() => new Set<string>()),
        extract: vi.fn(async () => ({ classSet: new Set<string>() })),
        majorVersion: 4,
      },
    }))

    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss({
      cssEntries: [cssEntry],
      tailwindcss: {
        version: 4,
        packageName: 'tailwindcss',
        v4: {
          cssEntries: [cssEntry],
        },
      },
    })
    const sourcePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:source-candidates') as Plugin
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin

    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'build',
      root: tempDir,
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist', watch: {} },
    } as ResolvedConfig)
    await (sourcePlugin.buildStart as any)?.call(sourcePlugin)
    await (sourcePlugin.buildStart as any)?.call(sourcePlugin)

    expect(scannedRoots).toHaveLength(0)
  }, TEST_TIMEOUT_MS)

  it('rescans v4 source candidates in build-watch when @source inline changes', async () => {
    const tempDir = await path.join(os.tmpdir(), `weapp-tw-vite-v4-inline-watch-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    createdDirs.push(tempDir)
    const cssEntry = path.join(tempDir, 'src/app.css')
    await mkdir(path.dirname(cssEntry), { recursive: true })
    await writeFile(cssEntry, [
      '@import "tailwindcss" source(none);',
      '@source inline("w-1");',
    ].join('\n'), 'utf8')

    const runtimeSet = new Set<string>()
    const generateMock = vi.fn(async () => ({
      css: '.ok{}',
      rawCss: '.ok{}',
      target: 'weapp',
      classSet: new Set(['w-1', 'w-2']),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => runtimeSet),
        reset: vi.fn(async () => undefined),
      }),
    }))
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
        })),
        resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
          projectRoot: tempDir,
          base: tempDir,
          baseFallbacks: [],
          cssEntries: [cssEntry],
          packageName: 'tailwindcss',
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
          projectRoot: tempDir,
          base: path.dirname(cssEntry),
          baseFallbacks: [],
          css: await readFile(cssEntry, 'utf8'),
          dependencies: [cssEntry],
        })),
      }
    })

    setCurrentContext(createContext({
      cssEntries: [cssEntry],
      tailwindcss: {
        version: 4,
        packageName: 'tailwindcss',
        v4: {
          cssEntries: [cssEntry],
        },
      },
      tailwindRuntime: {
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
      },
    }))

    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss({
      cssEntries: [cssEntry],
      tailwindcss: {
        version: 4,
        packageName: 'tailwindcss',
        v4: {
          cssEntries: [cssEntry],
        },
      },
    })
    const sourcePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:source-candidates') as Plugin
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin

    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'build',
      root: tempDir,
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist', watch: {} },
    } as ResolvedConfig)
    await (sourcePlugin.buildStart as any)?.call(sourcePlugin)

    await writeFile(cssEntry, [
      '@import "tailwindcss" source(none);',
      '@source inline("w-2");',
    ].join('\n'), 'utf8')
    await (sourcePlugin.watchChange as any)?.call(sourcePlugin, cssEntry, { event: 'update' })
    await (sourcePlugin.buildStart as any)?.call(sourcePlugin)

    const generateBundle = getGenerateBundleHandler(postPlugin)
    await generateBundle?.call(postPlugin, {} as any, {
      'app.css': {
        ...createRollupAsset('/*! weapp-tailwindcss generator-placeholder */'),
        fileName: 'app.css',
      },
    })

    expect(generateMock).toHaveBeenCalled()
  }, TEST_TIMEOUT_MS)

  it('reuses v4 source candidate scan on unchanged build-watch css roots', async () => {
    const tempDir = await path.join(os.tmpdir(), `weapp-tw-vite-v4-watch-reuse-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    createdDirs.push(tempDir)
    const cssEntry = path.join(tempDir, 'src/app.css')
    const pageFile = path.join(tempDir, 'src/pages/index.tsx')
    await mkdir(path.dirname(cssEntry), { recursive: true })
    await mkdir(path.dirname(pageFile), { recursive: true })
    await writeFile(cssEntry, [
      '@import "tailwindcss" source(none);',
      '@source "./pages/**/*.{ts,tsx}";',
    ].join('\n'), 'utf8')
    await writeFile(pageFile, 'export const className = "w-1"', 'utf8')

    const scannedRoots: string[] = []
    const scannedEntries: Array<Array<{ base: string, negated: boolean, pattern: string }> | undefined> = []
    const runtimeSet = new Set<string>()
    const generateMock = vi.fn(async () => ({
      css: '.ok{}',
      rawCss: '.ok{}',
      target: 'weapp',
      classSet: new Set(['w-1', 'w-2']),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => runtimeSet),
        reset: vi.fn(async () => undefined),
      }),
    }))
    vi.doMock('@/bundlers/vite/source-candidates', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/bundlers/vite/source-candidates')>()
      const collector = actual.createSourceCandidateCollector()
      return {
        ...actual,
        createSourceCandidateCollector: vi.fn(() => ({
          ...collector,
          scanRoot: vi.fn(async (options) => {
            scannedRoots.push(options.root)
            scannedEntries.push(options.entries)
            await collector.scanRoot(options)
          }),
        })),
      }
    })
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      const cssSource = [
        '@import "tailwindcss" source(none);',
        '@source "./pages/**/*.{ts,tsx}";',
      ].join('\n')
      const resolveSourceOptionsMock = vi.fn(() => ({
        projectRoot: tempDir,
        base: tempDir,
        baseFallbacks: [],
        cssSources: [{
          file: cssEntry,
          css: cssSource,
          base: path.dirname(cssEntry),
        }],
        packageName: 'tailwindcss',
      }))
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
        })),
        resolveTailwindV4SourceOptionsFromRuntime: resolveSourceOptionsMock,
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => {
          return {
            projectRoot: tempDir,
            base: tempDir,
            baseFallbacks: [],
            css: cssSource,
            dependencies: [cssEntry],
          }
        }),
      }
    })

    setCurrentContext(createContext({
      tailwindcss: {
        version: 4,
        packageName: 'tailwindcss',
      },
      tailwindRuntime: {
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
      },
    }))

    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const createPlugins = () => WeappTailwindcss({
      tailwindcss: {
        version: 4,
        packageName: 'tailwindcss',
      },
    })
    const plugins = createPlugins()
    const rewritePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:rewrite-css-imports') as Plugin
    const sourcePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:source-candidates') as Plugin
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin

    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'build',
      root: tempDir,
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist', watch: {} },
    } as ResolvedConfig)
    await getTransformHandler(rewritePlugin)?.call(rewritePlugin, await readFile(cssEntry, 'utf8'), cssEntry)
    await (sourcePlugin.buildStart as any)?.call(sourcePlugin)
    expect(scannedRoots).toHaveLength(1)
    expect(scannedRoots[0]).toBe(tempDir)
    expect(scannedEntries[0]).toEqual([
      {
        base: path.join(path.dirname(cssEntry), 'pages'),
        negated: false,
        pattern: '**/*.{ts,tsx}',
      },
    ])

    const generatorModule = await import('@/generator')
    const resolveSourceOptionsCalls = vi.mocked(generatorModule.resolveTailwindV4SourceOptionsFromRuntime).mock.calls.length
    await getTransformHandler(sourcePlugin)?.call(sourcePlugin, await readFile(cssEntry, 'utf8'), cssEntry)
    await (sourcePlugin.buildStart as any)?.call(sourcePlugin)
    expect(generatorModule.resolveTailwindV4SourceOptionsFromRuntime).toHaveBeenCalledTimes(resolveSourceOptionsCalls)
    expect(scannedRoots).toHaveLength(1)

    await writeFile(pageFile, 'export const className = "w-2"', 'utf8')
    await (sourcePlugin.watchChange as any)?.call(sourcePlugin, pageFile, { event: 'update' })
    await (sourcePlugin.buildStart as any)?.call(sourcePlugin)
    expect(scannedRoots).toHaveLength(1)

    const generateBundle = getGenerateBundleHandler(postPlugin)
    await generateBundle?.call(postPlugin, {} as any, {
      'app.css': {
        ...createRollupAsset('/*! weapp-tailwindcss generator-placeholder */'),
        fileName: 'app.css',
      },
    })

    expect(generateMock).toHaveBeenCalled()

    const secondPlugins = createPlugins()
    const secondSourcePlugin = secondPlugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:source-candidates') as Plugin
    const secondPostPlugin = secondPlugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin
    await (secondPostPlugin.configResolved as any)?.call(secondPostPlugin, {
      command: 'build',
      root: tempDir,
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist', watch: {} },
    } as ResolvedConfig)
    await (secondSourcePlugin.buildStart as any)?.call(secondSourcePlugin)
    expect(scannedRoots).toHaveLength(1)
  }, TEST_TIMEOUT_MS)

  it('lets Tailwind v4 @source not inline remove vite candidates discovered from files', async () => {
    const tempDir = await path.join(os.tmpdir(), `weapp-tw-vite-v4-inline-not-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    createdDirs.push(tempDir)
    const cssEntry = path.join(tempDir, 'src/app.css')
    const pageFile = path.join(tempDir, 'src/pages/index.tsx')
    await mkdir(path.dirname(cssEntry), { recursive: true })
    await mkdir(path.dirname(pageFile), { recursive: true })
    await writeFile(cssEntry, [
      '@import "tailwindcss" source("../src");',
      '@source not inline("underline");',
    ].join('\n'), 'utf8')
    await writeFile(pageFile, 'export const className = "underline w-1"', 'utf8')

    const runtimeSet = new Set<string>()
    const generateMock = vi.fn(async () => ({
      css: '.ok{}',
      rawCss: '.ok{}',
      target: 'weapp',
      classSet: new Set(['w-1']),
      dependencies: [],
      sources: [],
      root: null,
    }))

    vi.doMock('@/bundlers/vite/incremental-runtime-class-set', () => ({
      createBundleRuntimeClassSetManager: () => ({
        sync: vi.fn(async () => runtimeSet),
        reset: vi.fn(async () => undefined),
      }),
    }))
    vi.doMock('@/generator', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/generator')>()
      return {
        ...actual,
        createWeappTailwindcssGenerator: vi.fn(() => ({
          generate: generateMock,
        })),
        resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
          projectRoot: tempDir,
          base: tempDir,
          baseFallbacks: [],
          cssEntries: [cssEntry],
          packageName: 'tailwindcss',
        })),
        resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
          projectRoot: tempDir,
          base: path.dirname(cssEntry),
          baseFallbacks: [],
          css: await readFile(cssEntry, 'utf8'),
          dependencies: [cssEntry],
        })),
      }
    })

    setCurrentContext(createContext({
      cssEntries: [cssEntry],
      tailwindcss: {
        version: 4,
        packageName: 'tailwindcss',
        v4: {
          cssEntries: [cssEntry],
        },
      },
      tailwindRuntime: {
        getClassSet: vi.fn(async () => runtimeSet),
        getClassSetSync: vi.fn(() => runtimeSet),
        extract: vi.fn(async () => ({ classSet: runtimeSet })),
        majorVersion: 4,
      },
    }))

    const WeappTailwindcss = await loadWeappTailwindcssPlugin()
    const plugins = WeappTailwindcss({
      cssEntries: [cssEntry],
      tailwindcss: {
        version: 4,
        packageName: 'tailwindcss',
        v4: {
          cssEntries: [cssEntry],
        },
      },
    })
    const sourcePlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:source-candidates') as Plugin
    const postPlugin = plugins?.find(plugin => plugin.name === 'weapp-tailwindcss:adaptor:post') as Plugin

    await (postPlugin.configResolved as any)?.call(postPlugin, {
      command: 'build',
      root: tempDir,
      css: { postcss: { plugins: [] } },
      build: { outDir: 'dist' },
    } as ResolvedConfig)
    await (sourcePlugin.buildStart as any)?.call(sourcePlugin)

    const generateBundle = getGenerateBundleHandler(postPlugin)
    await generateBundle?.call(postPlugin, {} as any, {
      'app.css': {
        ...createRollupAsset('/*! weapp-tailwindcss generator-placeholder */'),
        fileName: 'app.css',
      },
    })

    const candidates = generateMock.mock.calls[0]?.[0]?.candidates as Set<string>
    expect(candidates.has('underline')).toBe(false)
    expect(candidates.has('w-1')).toBe(true)
  }, TEST_TIMEOUT_MS)
})
