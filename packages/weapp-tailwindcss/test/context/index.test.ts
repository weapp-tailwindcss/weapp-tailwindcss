import { mkdtemp, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createHandlersFromContext = vi.fn(() => ({
  styleHandler: Symbol('style'),
  jsHandler: Symbol('js'),
  templateHandler: Symbol('template'),
}))

const createTailwindcssRuntimeFromContext = vi.fn()

vi.mock('@weapp-tailwindcss/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
  },
  pc: {
    cyanBright: (value: string) => value,
    underline: (value: string) => value,
    bold: (value: string) => value,
    green: (value: string) => value,
  },
}))

vi.mock('@/cache', () => ({
  initializeCache: vi.fn(() => Symbol('cache')),
}))

vi.mock('@/defaults', () => ({
  getDefaultOptions: () => ({
    customReplaceDictionary: {},
    logLevel: 'silent',
    cssCalc: undefined,
    customAttributes: {},
    cache: undefined,
  }),
  resolveDefaultCssPreflight: (cssPreflight: any, majorVersion?: number) => {
    if (cssPreflight === false) {
      return false
    }
    return {
      ...(majorVersion === 4
        ? {
            'box-sizing': 'border-box',
            margin: '0',
            padding: '0',
            border: '0 solid',
          }
        : {
            'box-sizing': 'border-box',
            'border-width': '0',
            'border-style': 'solid',
            'border-color': 'currentColor',
          }),
      ...(cssPreflight ?? {}),
    }
  },
}))

vi.mock('@/context/custom-attributes', () => ({
  toCustomAttributesEntities: vi.fn(() => []),
}))

vi.mock('@/context/handlers', () => ({
  createHandlersFromContext,
}))

vi.mock('@/context/tailwindcss', () => ({
  createTailwindcssRuntimeFromContext,
}))

describe('getCompilerContext', () => {
  beforeEach(() => {
    delete process.env.MPX_CLI_MODE
    delete process.env.MPX_CURRENT_TARGET_MODE
    vi.clearAllMocks()
    vi.resetModules()
    createHandlersFromContext.mockClear()
    createTailwindcssRuntimeFromContext.mockReset()
    const globalCacheHolder = globalThis as { __WEAPP_TW_COMPILER_CONTEXT_CACHE__?: Map<string, unknown> }
    globalCacheHolder.__WEAPP_TW_COMPILER_CONTEXT_CACHE__?.clear?.()
  })

  it('未指定 cssCalc 时保留自动策略所需的配置来源', async () => {
    createTailwindcssRuntimeFromContext.mockReturnValue({
      packageInfo: { version: '4.0.0' },
      majorVersion: 4,
    })

    const { getCompilerContext } = await import('@/context')
    const ctx = getCompilerContext()

    const forwardedCalcOptions = (createHandlersFromContext.mock.calls[0] as any)?.[2]

    expect(forwardedCalcOptions).toBeUndefined()
    expect(ctx.cssCalc).toBeUndefined()
  })

  it('uses Tailwind v4 preflight defaults when the runtime is v4', async () => {
    createTailwindcssRuntimeFromContext.mockReturnValue({
      packageInfo: { version: '4.1.0' },
      majorVersion: 4,
    })

    const { getCompilerContext } = await import('@/context')
    const ctx = getCompilerContext()

    expect(ctx.cssPreflight).toEqual({
      'box-sizing': 'border-box',
      margin: '0',
      padding: '0',
      border: '0 solid',
    })
    expect((createHandlersFromContext.mock.calls[0] as any)?.[0]?.cssPreflight).toEqual(ctx.cssPreflight)
  })

  it('merges user cssPreflight overrides on top of Tailwind v4 defaults', async () => {
    createTailwindcssRuntimeFromContext.mockReturnValue({
      packageInfo: { version: '4.1.0' },
      majorVersion: 4,
    })

    const { getCompilerContext } = await import('@/context')
    const ctx = getCompilerContext({
      cssPreflight: {
        margin: false,
        background: 'black',
      },
    })

    expect(ctx.cssPreflight).toEqual({
      'box-sizing': 'border-box',
      margin: false,
      padding: '0',
      border: '0 solid',
      background: 'black',
    })
  })

  it('uses lightweight border preflight for Tailwind v4 uni-app x output', async () => {
    createTailwindcssRuntimeFromContext.mockReturnValue({
      packageInfo: { version: '4.1.0' },
      majorVersion: 4,
    })

    const { getCompilerContext } = await import('@/context')
    const ctx = getCompilerContext({
      uniAppX: true,
    })

    expect(ctx.cssPreflight).toEqual({
      'box-sizing': 'border-box',
      margin: '0',
      padding: '0',
      border: false,
      'border-width': '0',
      'border-style': false,
    })
    expect((createHandlersFromContext.mock.calls[0] as any)?.[0]?.cssPreflight).toEqual(ctx.cssPreflight)
  })

  it('uses lightweight border preflight for uni-app x Web output when native app branch is disabled', async () => {
    createTailwindcssRuntimeFromContext.mockReturnValue({
      packageInfo: { version: '4.1.0' },
      majorVersion: 4,
    })

    const { getCompilerContext } = await import('@/context')
    const ctx = getCompilerContext({
      appType: 'uni-app-x',
      uniAppX: {
        enabled: false,
      },
    })

    expect(ctx.cssPreflight).toEqual({
      'box-sizing': 'border-box',
      margin: '0',
      padding: '0',
      border: false,
      'border-width': '0',
      'border-style': false,
    })
    expect((createHandlersFromContext.mock.calls[0] as any)?.[0]?.cssPreflight).toEqual(ctx.cssPreflight)
  })

  it('keeps explicit uni-app x border preflight overrides', async () => {
    createTailwindcssRuntimeFromContext.mockReturnValue({
      packageInfo: { version: '4.1.0' },
      majorVersion: 4,
    })

    const { getCompilerContext } = await import('@/context')
    const ctx = getCompilerContext({
      uniAppX: true,
      cssPreflight: {
        border: '0 solid',
        'border-style': 'solid',
      },
    })

    expect(ctx.cssPreflight).toMatchObject({
      border: '0 solid',
      'border-width': '0',
      'border-style': 'solid',
    })
  })

  it('keeps Tailwind v4 preflight defaults from runtime metadata', async () => {
    createTailwindcssRuntimeFromContext.mockReturnValue({
      packageInfo: { version: '4.2.4' },
      majorVersion: 4,
    })

    const { getCompilerContext } = await import('@/context')
    const ctx = getCompilerContext()

    expect(ctx.cssPreflight).toEqual({
      'box-sizing': 'border-box',
      border: '0 solid',
      margin: '0',
      padding: '0',
    })
  })

  it('keeps user provided arrays intact when no defaults defined', async () => {
    createTailwindcssRuntimeFromContext.mockReturnValue({
      packageInfo: { version: '4.1.0' },
      majorVersion: 4,
    })

    const { getCompilerContext } = await import('@/context')
    const ctx = getCompilerContext({
      cssCalc: ['--gap'],
    })

    const forwardedCalcOptions = (createHandlersFromContext.mock.calls[0] as any)?.[2]

    expect(forwardedCalcOptions).toEqual(['--gap'])
    expect(ctx.cssCalc).toEqual(['--gap'])
  })

  it('stores normalized custom attribute entities on the compiler context', async () => {
    createTailwindcssRuntimeFromContext.mockReturnValue({
      packageInfo: { version: '4.1.0' },
      majorVersion: 4,
    })
    const entities = [['*', [/^t-class(?:-.+)?$/]]]
    const { toCustomAttributesEntities } = await import('@/context/custom-attributes')
    vi.mocked(toCustomAttributesEntities).mockReturnValueOnce(entities as any)

    const { getCompilerContext } = await import('@/context')
    const ctx = getCompilerContext({
      customAttributes: {
        '*': [/^t-class(?:-.+)?$/],
      },
    })

    expect(ctx.customAttributesEntities).toBe(entities)
    expect((createHandlersFromContext.mock.calls[0] as any)?.[1]).toBe(entities)
  })

  it('keeps user objects intact when spacing is already covered', async () => {
    const includeCustomProperties = [/^--spacing$/]
    const originalOptions = {
      includeCustomProperties,
      precision: 5,
    }

    createTailwindcssRuntimeFromContext.mockReturnValue({
      packageInfo: { version: '4.1.0' },
      majorVersion: 4,
    })

    const { getCompilerContext } = await import('@/context')
    const ctx = getCompilerContext({
      cssCalc: originalOptions,
    })

    const forwardedCalcOptions = (createHandlersFromContext.mock.calls[0] as any)?.[2]

    expect(forwardedCalcOptions).toBe(originalOptions)
    expect(ctx.cssCalc).toBe(originalOptions)
    expect(includeCustomProperties).toHaveLength(1)
    expect(includeCustomProperties[0]).toBeInstanceOf(RegExp)
  })

  it('warns when tailwindcss v4 is used without cssEntries', async () => {
    createTailwindcssRuntimeFromContext.mockReturnValue({
      packageInfo: { version: '4.1.0', rootPath: '/workspace/tailwindcss' },
      majorVersion: 4,
    })

    const { getCompilerContext } = await import('@/context')
    const { logger } = await import('@weapp-tailwindcss/logger')

    getCompilerContext()

    const warn = vi.mocked(logger.warn)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('cssEntries')
    expect(warn.mock.calls[0][0]).toContain('绝对路径')
  })

  it('does not warn when cssEntries are provided for tailwindcss v4', async () => {
    createTailwindcssRuntimeFromContext.mockReturnValue({
      packageInfo: { version: '4.1.0', rootPath: '/workspace/tailwindcss' },
      majorVersion: 4,
    })

    const { getCompilerContext } = await import('@/context')
    const { logger } = await import('@weapp-tailwindcss/logger')

    getCompilerContext({
      cssEntries: ['/absolute/path/to/app.css'],
    })

    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('infers canonical style platform from Mpx wx environment', async () => {
    process.env.MPX_CURRENT_TARGET_MODE = 'wx'
    createTailwindcssRuntimeFromContext.mockReturnValue({
      packageInfo: { version: '4.1.0' },
      majorVersion: 4,
    })

    const { getCompilerContext } = await import('@/context')
    const ctx = getCompilerContext({
      appType: 'mpx',
    })

    expect(ctx.platform).toBe('mp-weixin')
  })

  it('canonicalizes explicit Mpx style platform without changing non-Mpx values', async () => {
    createTailwindcssRuntimeFromContext.mockReturnValue({
      packageInfo: { version: '4.1.0' },
      majorVersion: 4,
    })

    const { getCompilerContext } = await import('@/context')
    const mpxCtx = getCompilerContext({
      appType: 'mpx',
      cssOptions: {
        platform: 'wx',
      },
    })
    const taroCtx = getCompilerContext({
      appType: 'taro',
      cssOptions: {
        platform: 'weapp',
      },
    })

    expect(mpxCtx.platform).toBe('mp-weixin')
    expect(mpxCtx.cssOptions?.platform).toBe('mp-weixin')
    expect(taroCtx.platform).toBe('weapp')
    expect(taroCtx.cssOptions?.platform).toBe('weapp')
  })
})

describe('clearTailwindcssRuntimeCache', () => {
  it('skips missing and disabled runtimes', async () => {
    const { clearTailwindcssRuntimeCache } = await import('@/context')
    const clearCache = vi.fn()

    await expect(clearTailwindcssRuntimeCache(undefined)).resolves.toBeUndefined()
    await expect(clearTailwindcssRuntimeCache({
      clearCache,
      options: {
        cache: {
          enabled: false,
        },
      },
    } as never)).resolves.toBeUndefined()
    await expect(clearTailwindcssRuntimeCache({
      clearCache,
      options: {
        cache: null,
      },
    } as never)).resolves.toBeUndefined()

    expect(clearCache).not.toHaveBeenCalled()
  })

  it('clears runtime cache and removes configured cache paths', async () => {
    const { clearTailwindcssRuntimeCache } = await import('@/context')
    const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-clear-cache-'))
    const cacheFile = path.join(root, 'cache.json')
    const privateCacheFile = path.join(root, 'private.json')
    const cacheDir = path.join(root, 'dir')

    await import('node:fs/promises').then(async fs => Promise.all([
      fs.writeFile(cacheFile, '{}'),
      fs.writeFile(privateCacheFile, '{}'),
      fs.mkdir(cacheDir),
    ]))

    const clearCache = vi.fn(async () => {})
    await clearTailwindcssRuntimeCache({
      clearCache,
      options: {
        cache: {
          path: cacheFile,
          dir: cacheDir,
        },
      },
      cacheStore: {
        options: {
          path: privateCacheFile,
        },
      },
    } as never, {
      removeDirectory: true,
    })

    await expect(stat(cacheFile)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(privateCacheFile)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(cacheDir)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(clearCache).toHaveBeenCalledWith({ scope: 'all' })
  })

  it('continues when runtime clearCache throws', async () => {
    const { clearTailwindcssRuntimeCache } = await import('@/context')
    const { logger } = await import('@weapp-tailwindcss/logger')

    await expect(clearTailwindcssRuntimeCache({
      clearCache: vi.fn(async () => {
        throw new Error('clear failed')
      }),
      options: {
        cache: true,
      },
    } as never)).resolves.toBeUndefined()

    expect(logger.debug).toHaveBeenCalledWith(
      'failed to clear tailwindcss runtime cache via clearCache(): %O',
      expect.any(Error),
    )
  })
})
