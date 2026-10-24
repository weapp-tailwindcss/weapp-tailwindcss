import type { InternalUserDefinedOptions, TailwindcssRuntimeLike } from '@/types'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createTailwindcssRuntime = vi.fn()
const findNearestPackageRoot = vi.fn()
const isMpx = vi.fn(() => false)
const logger = {
  debug: vi.fn(),
  warn: vi.fn(),
}

vi.mock('@weapp-tailwindcss/logger', () => ({
  logger,
}))

vi.mock('@/tailwindcss/runtime-factory', () => ({
  createTailwindcssRuntime,
}))

vi.mock('@/utils/package-root', () => ({
  findNearestPackageRoot,
}))

vi.mock('@/shared/mpx', () => ({
  isMpx,
}))

async function loadModule() {
  return import('@/tailwindcss/v4/runtime-factory')
}

describe('tailwindcss/v4/runtime helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    findNearestPackageRoot.mockReturnValue(undefined)
    isMpx.mockReturnValue(false)
  })

  afterEach(() => {
    vi.doUnmock('@/utils')
  })

  it('guesses basedir from absolute css entries', async () => {
    // 真实的 findNearestPackageRoot 内部使用 path.resolve，返回平台原生路径
    findNearestPackageRoot.mockReturnValue(path.normalize('/packages/app'))
    const { guessBasedirFromEntries } = await loadModule()

    const base = guessBasedirFromEntries(['/packages/app/src/app.css'])

    expect(base).toBe(path.normalize('/packages/app'))
  })

  it('returns undefined when css entries are missing or relative', async () => {
    const { guessBasedirFromEntries } = await loadModule()

    expect(guessBasedirFromEntries()).toBeUndefined()
    expect(guessBasedirFromEntries(['relative/app.css'])).toBeUndefined()
    expect(guessBasedirFromEntries([123 as any])).toBeUndefined()
    expect(guessBasedirFromEntries(['   '])).toBeUndefined()
  })

  it('continues when resolved base path is empty', async () => {
    const isAbsoluteSpy = vi.spyOn(path, 'isAbsolute').mockImplementation(() => true)
    const dirnameSpy = vi.spyOn(path, 'dirname').mockImplementation(() => '')
    findNearestPackageRoot.mockReturnValue(undefined)

    const { guessBasedirFromEntries } = await loadModule()
    expect(guessBasedirFromEntries(['mock'])).toBeUndefined()

    isAbsoluteSpy.mockRestore()
    dirnameSpy.mockRestore()
  })
  it('skips returning when resolved base is falsy', async () => {
    findNearestPackageRoot.mockReturnValue('')
    const { guessBasedirFromEntries } = await loadModule()

    expect(guessBasedirFromEntries(['/abs/path.css'])).toBeUndefined()
  })

  it('normalizes css entries relative to anchor', async () => {
    const { normalizeCssEntries } = await loadModule()
    const anchor = '/workspace/project'

    const normalized = normalizeCssEntries([' ./src/app.css ', '/abs/global.css'], anchor)

    expect(normalized).toEqual([
      path.normalize(path.resolve(anchor, './src/app.css')),
      path.normalize('/abs/global.css'),
    ])
  })

  it('ignores non-css entries for Tailwind v4 runtime css roots', async () => {
    const { guessBasedirFromEntries, normalizeCssEntries } = await loadModule()
    const anchor = '/workspace/project'

    expect(normalizeCssEntries(['./src/app.scss', './src/app.less', './src/app.css'], anchor)).toEqual([
      path.normalize(path.resolve(anchor, './src/app.css')),
    ])
    expect(normalizeCssEntries(['./src/app.scss', './src/app.less'], anchor)).toBeUndefined()
    expect(guessBasedirFromEntries(['/workspace/project/src/app.scss'])).toBeUndefined()
  })

  it('returns undefined when no valid css entries exist after normalization', async () => {
    const { normalizeCssEntries } = await loadModule()
    const anchor = '/workspace/project'

    expect(normalizeCssEntries(['   ', 123 as any], anchor)).toBeUndefined()
    expect(normalizeCssEntries([], anchor)).toBeUndefined()
  })

  it('groups css entries by preferred base and workspace root', async () => {
    findNearestPackageRoot.mockImplementation((dir: string) => {
      if (dir.includes('pkg-a')) {
        return '/repo/packages/pkg-a'
      }
      if (dir.includes('pkg-b')) {
        return '/repo/packages/pkg-b'
      }
      return undefined
    })
    const { groupCssEntriesByBase } = await loadModule()

    const entries = [
      '/repo/packages/pkg-a/src/app.css',
      '/repo/packages/pkg-b/src/app.css',
    ]
    const groups = groupCssEntriesByBase(entries, {
      preferredBaseDir: '/repo/packages/pkg-a',
      workspaceRoot: '/repo',
    })

    expect([...groups.keys()].sort()).toEqual([
      path.normalize('/repo'),
      path.normalize('/repo/packages/pkg-a'),
    ])
  })

  it('groups css entries under normalized directory when no package root is found', async () => {
    findNearestPackageRoot.mockReturnValue(undefined)
    const { groupCssEntriesByBase } = await loadModule()

    const entries = ['/repo/random/src/app.css']
    const groups = groupCssEntriesByBase(entries)

    const normalizedBase = path.normalize('/repo/random/src')
    expect([...groups.keys()]).toEqual([normalizedBase])
    expect(groups.get(normalizedBase)).toEqual(entries)
  })

  it('falls back to package root when no workspace hints are provided', async () => {
    findNearestPackageRoot.mockReturnValue('/repo/packages/pkg-c')
    const { groupCssEntriesByBase } = await loadModule()

    const entries = ['/repo/packages/pkg-c/src/app.css']
    const groups = groupCssEntriesByBase(entries)

    expect([...groups.keys()]).toEqual([path.normalize('/repo/packages/pkg-c')])
  })

  it('handles empty normalized path segments when checking sub paths', async () => {
    const originalNormalize = path.normalize
    const normalizeSpy = vi.spyOn(path, 'normalize')
    normalizeSpy.mockImplementation((value: string) => originalNormalize(value))
    normalizeSpy.mockImplementationOnce((value: string) => originalNormalize(value)) // preferredBaseDir
    normalizeSpy.mockImplementationOnce(() => '') // normalizedDir

    const { groupCssEntriesByBase } = await loadModule()
    const groups = groupCssEntriesByBase(['/repo/misc/app.css'], {
      preferredBaseDir: '/repo/misc',
    })

    expect([...groups.keys()]).toEqual([''])
    normalizeSpy.mockRestore()
  })

  it('collects multiple entries under the same base', async () => {
    findNearestPackageRoot.mockReturnValue('/repo/packages/pkg-d')
    const { groupCssEntriesByBase } = await loadModule()

    const entries = [
      '/repo/packages/pkg-d/src/app.css',
      '/repo/packages/pkg-d/src/extra.css',
    ]
    const groups = groupCssEntriesByBase(entries)

    expect(groups.get(path.normalize('/repo/packages/pkg-d'))).toEqual(entries)
  })

  it('creates runtime with v4 defaults and mpx cache dir', async () => {
    isMpx.mockReturnValue(true)
    createTailwindcssRuntime.mockImplementation(options => ({
      ...options,
      majorVersion: 4,
      packageInfo: { version: '4.0.0' },
    }))

    const { createTailwindcssRuntimeForBase } = await loadModule()
    const baseDir = '/workspace/app'
    const cssEntries = [`${baseDir}/src/app.css`]
    const factoryOptions = {
      tailwindcss: {},
      tailwindcssRuntimeOptions: {
        tailwindcss: { resolve: { paths: ['/custom'] } },
      },
      supportCustomLengthUnits: false,
      appType: 'mpx',
    } as unknown as InternalUserDefinedOptions

    const runtime = createTailwindcssRuntimeForBase(baseDir, cssEntries, factoryOptions)

    expect(createTailwindcssRuntime).toHaveBeenCalledTimes(1)
    const [callA] = createTailwindcssRuntime.mock.calls.map(call => call[0])
    expect(callA.basedir).toBe(baseDir)
    expect(callA.cacheDir).toBeUndefined()
    expect(callA.tailwindcss?.version).toBeUndefined()
    expect(callA.tailwindcss?.v4?.base).toBeUndefined()
    expect(callA.tailwindcss?.v4?.cssEntries).toEqual(cssEntries)
    expect(runtime.majorVersion).toBe(4)
  })

  it('passes bare arbitrary value options to v4 engine options', async () => {
    createTailwindcssRuntime.mockImplementation(options => ({
      ...options,
      majorVersion: 4,
      packageInfo: { version: '4.0.0' },
    }))

    const { createTailwindcssRuntimeForBase } = await loadModule()
    const baseDir = '/workspace/app'
    const cssEntries = [`${baseDir}/src/app.css`]

    createTailwindcssRuntimeForBase(baseDir, cssEntries, {
      tailwindcss: { version: 4 },
      tailwindcssRuntimeOptions: undefined,
      supportCustomLengthUnits: true,
      appType: 'taro',
      bareArbitraryValues: {
        units: ['%', 'px', 'rem'],
      },
    } as unknown as InternalUserDefinedOptions)

    const [callA] = createTailwindcssRuntime.mock.calls.map(call => call[0])
    expect(callA.tailwindcss?.v4?.bareArbitraryValues).toEqual({
      units: ['%', 'px', 'rem'],
    })
  })

  it('uses tailwindcss package for v4 when no package is configured', async () => {
    createTailwindcssRuntime.mockImplementation(options => ({
      packageInfo: { name: options.tailwindcss?.packageName } as any,
      majorVersion: 4,
      options,
      getClassSet: vi.fn(async () => new Set()),
      extract: vi.fn(async () => undefined as any),
    }))
    const { createTailwindcssRuntimeForBase } = await loadModule()

    createTailwindcssRuntimeForBase('/workspace/app', ['/workspace/app/src/app.css'], {
      tailwindcss: { version: 4 },
      tailwindcssRuntimeOptions: undefined,
      supportCustomLengthUnits: true,
      appType: 'taro',
    } as unknown as InternalUserDefinedOptions)

    expect(createTailwindcssRuntime).toHaveBeenCalledTimes(1)
    const packageNames = createTailwindcssRuntime.mock.calls.map(call => call[0].tailwindcss?.packageName)
    expect(packageNames).toEqual(['tailwindcss'])
  })

  it('keeps the explicit Tailwind v4 setting when creating the runtime', async () => {
    createTailwindcssRuntime.mockImplementation(options => options)
    const { createTailwindcssRuntimeForBase } = await loadModule()

    const runtime = createTailwindcssRuntimeForBase(process.cwd(), ['/workspace/app/src/app.css'], {
      tailwindcss: { version: 4 },
      tailwindcssRuntimeOptions: undefined,
      supportCustomLengthUnits: true,
      appType: 'taro',
    } as unknown as InternalUserDefinedOptions) as any

    expect(createTailwindcssRuntime).toHaveBeenCalledTimes(1)
    expect(runtime.tailwindcss?.packageName).toBe('tailwindcss')
    expect(runtime.tailwindcss?.version).toBe(4)
  })

  it('does not fallback to @tailwindcss/postcss when tailwindcss package is incompatible', async () => {
    const tailwindcssError = 'Configured tailwindcss.version=4, but resolved package "tailwindcss" is version 3.4.19. Update the configuration or resolve the correct package.'
    createTailwindcssRuntime.mockImplementation((options) => {
      if (options.tailwindcss?.packageName === 'tailwindcss') {
        throw new Error(tailwindcssError)
      }
      return {
        packageInfo: { name: options.tailwindcss?.packageName } as any,
        majorVersion: 4,
        options,
        getClassSet: vi.fn(async () => new Set()),
        extract: vi.fn(async () => undefined as any),
      }
    })
    const { createTailwindcssRuntimeForBase } = await loadModule()

    expect(() => createTailwindcssRuntimeForBase('/workspace/app', ['/workspace/app/src/app.css'], {
      tailwindcss: { version: 4 },
      tailwindcssRuntimeOptions: undefined,
      supportCustomLengthUnits: true,
      appType: 'taro',
    } as unknown as InternalUserDefinedOptions)).toThrow(tailwindcssError)

    expect(createTailwindcssRuntime).toHaveBeenCalledTimes(1)
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('rethrows non-version mismatch errors from the tailwindcss package candidate', async () => {
    createTailwindcssRuntime.mockImplementation((options) => {
      if (options.tailwindcss?.packageName === 'tailwindcss') {
        throw new Error('tailwind package load failed')
      }
      return options
    })
    const { createTailwindcssRuntimeForBase } = await loadModule()

    expect(() => createTailwindcssRuntimeForBase('/workspace/app', ['/workspace/app/src/app.css'], {
      tailwindcss: { version: 4 },
      tailwindcssRuntimeOptions: undefined,
      supportCustomLengthUnits: true,
      appType: 'taro',
    } as unknown as InternalUserDefinedOptions)).toThrow('tailwind package load failed')
    expect(createTailwindcssRuntime).toHaveBeenCalledTimes(1)
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('throws the tailwindcss version mismatch without trying @tailwindcss/postcss', async () => {
    const tailwindcssError = 'Configured tailwindcss.version=4, but resolved package "tailwindcss" is version 3.4.19. Update the configuration or resolve the correct package.'
    createTailwindcssRuntime.mockImplementation(() => {
      throw new Error(tailwindcssError)
    })
    const { createTailwindcssRuntimeForBase } = await loadModule()

    expect(() => createTailwindcssRuntimeForBase('/workspace/app', ['/workspace/app/src/app.css'], {
      tailwindcss: { version: 4 },
      tailwindcssRuntimeOptions: undefined,
      supportCustomLengthUnits: true,
      appType: 'taro',
    } as unknown as InternalUserDefinedOptions)).toThrow(tailwindcssError)
    expect(createTailwindcssRuntime).toHaveBeenCalledTimes(1)
    expect(createTailwindcssRuntime.mock.calls[0][0].tailwindcss?.packageName).toBe('tailwindcss')
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('does not inject tailwindcss version when css entries are configured', async () => {
    createTailwindcssRuntime.mockImplementation(options => ({
      packageInfo: { name: options.tailwindcss?.packageName } as any,
      majorVersion: 4,
      options,
      getClassSet: vi.fn(async () => new Set()),
      extract: vi.fn(async () => undefined as any),
    }))
    const { createTailwindcssRuntimeForBase } = await loadModule()

    createTailwindcssRuntimeForBase('/workspace/app', ['/workspace/app/src/app.css'], {
      tailwindcss: {},
      tailwindcssRuntimeOptions: undefined,
      supportCustomLengthUnits: true,
      appType: 'taro',
    } as unknown as InternalUserDefinedOptions)

    const versions = createTailwindcssRuntime.mock.calls.map(call => call[0].tailwindcss?.version)
    expect(versions).toEqual([undefined])
  })

  it('does not create dual runtimes when only default v4 scaffolding exists', async () => {
    createTailwindcssRuntime.mockImplementation(options => ({
      packageInfo: { name: options.tailwindcss?.packageName } as any,
      majorVersion: 4,
      options,
      getClassSet: vi.fn(async () => new Set()),
      extract: vi.fn(async () => undefined as any),
    }))
    const { createTailwindcssRuntimeForBase } = await loadModule()

    createTailwindcssRuntimeForBase('/workspace/app', undefined, {
      tailwindcss: {},
      tailwindcssRuntimeOptions: undefined,
      supportCustomLengthUnits: true,
      appType: 'taro',
    } as unknown as InternalUserDefinedOptions)

    expect(createTailwindcssRuntime).toHaveBeenCalledTimes(1)
    expect(createTailwindcssRuntime.mock.calls[0][0].tailwindcss?.packageName).toBe('tailwindcss')
  })

  it('does not create extra runtime when packageName is already configured', async () => {
    createTailwindcssRuntime.mockImplementation(options => ({
      packageInfo: { name: options.tailwindcss?.packageName } as any,
      majorVersion: 4,
      options,
      getClassSet: vi.fn(async () => new Set()),
      extract: vi.fn(async () => undefined as any),
    }))
    const { createTailwindcssRuntimeForBase } = await loadModule()

    createTailwindcssRuntimeForBase('/workspace/app', ['/workspace/app/src/app.css'], {
      tailwindcss: { version: 4, packageName: 'tailwindcss4' },
      tailwindcssRuntimeOptions: undefined,
      supportCustomLengthUnits: true,
      appType: 'taro',
    } as unknown as InternalUserDefinedOptions)

    expect(createTailwindcssRuntime).toHaveBeenCalledTimes(1)
    expect(createTailwindcssRuntime.mock.calls[0][0].tailwindcss?.packageName).toBe('tailwindcss4')
  })

  it('defaults supportCustomLengthUnits to true when unspecified', async () => {
    createTailwindcssRuntime.mockImplementation(options => options)
    const { createTailwindcssRuntimeForBase } = await loadModule()
    const runtime = createTailwindcssRuntimeForBase('/workspace/app', [], {
      tailwindcss: {},
      tailwindcssRuntimeOptions: undefined,
      supportCustomLengthUnits: undefined,
      appType: 'taro',
    } as unknown as InternalUserDefinedOptions) as any

    expect(runtime.supportCustomLengthUnits).toBe(true)
  })

  it('fills missing v4 config when user config disables it', async () => {
    createTailwindcssRuntime.mockImplementation(options => options)
    const { createTailwindcssRuntimeForBase } = await loadModule()

    const runtime = createTailwindcssRuntimeForBase('/workspace/app', undefined, {
      tailwindcss: { v4: undefined, version: 3 },
      tailwindcssRuntimeOptions: undefined,
      supportCustomLengthUnits: true,
      appType: 'taro',
    } as unknown as InternalUserDefinedOptions) as any

    expect(runtime.tailwindcss?.v4?.base).toBe('/workspace/app')
    expect(runtime.tailwindcss?.v4?.cssEntries).toEqual([])
  })


  it('does not infer v3 from the tailwindcss package name because it can also be v4', async () => {
    createTailwindcssRuntime.mockImplementation(options => options)
    const { createTailwindcssRuntimeForBase } = await loadModule()

    const runtime = createTailwindcssRuntimeForBase('/workspace/app', ['/workspace/app/src/app.css'], {
      tailwindcss: { packageName: 'tailwindcss' },
      tailwindcssRuntimeOptions: undefined,
      supportCustomLengthUnits: true,
      appType: 'taro',
    } as unknown as InternalUserDefinedOptions) as any

    expect(createTailwindcssRuntime).toHaveBeenCalledTimes(1)
    expect(runtime.tailwindcss?.packageName).toBe('tailwindcss')
    expect(runtime.tailwindcss?.version).toBeUndefined()
  })

  it('infers explicit v4 from a tailwindcss4 package name', async () => {
    createTailwindcssRuntime.mockImplementation(options => options)
    const { createTailwindcssRuntimeForBase } = await loadModule()

    const runtime = createTailwindcssRuntimeForBase('/workspace/app', undefined, {
      tailwindcss: { packageName: 'tailwindcss4' },
      tailwindcssRuntimeOptions: undefined,
      supportCustomLengthUnits: true,
      appType: 'taro',
    } as unknown as InternalUserDefinedOptions) as any

    expect(createTailwindcssRuntime).toHaveBeenCalledTimes(1)
    expect(runtime.tailwindcss?.packageName).toBe('tailwindcss4')
  })

  it('fills missing base on existing v4 config without css entries', async () => {
    createTailwindcssRuntime.mockImplementation(options => options)
    const { createTailwindcssRuntimeForBase } = await loadModule()

    const runtime = createTailwindcssRuntimeForBase('/workspace/app', undefined, {
      tailwindcss: { v4: {}, version: 3 },
      tailwindcssRuntimeOptions: undefined,
      supportCustomLengthUnits: true,
      appType: 'taro',
    } as unknown as InternalUserDefinedOptions) as any

    expect(runtime.tailwindcss?.v4?.base).toBe('/workspace/app')
    expect(runtime.tailwindcss?.v4?.cssEntries).toEqual([])
  })

  it('fills missing base when merged v4 config has no default base', async () => {
    vi.doMock('@/utils', () => ({
      defuOverrideArray: (user: any = {}, defaults: any) => ({
        ...defaults,
        ...user,
        v4: user.v4 ?? defaults.v4,
      }),
    }))
    createTailwindcssRuntime.mockImplementation(options => options)
    const { createTailwindcssRuntimeForBase } = await loadModule()

    const runtime = createTailwindcssRuntimeForBase('/workspace/app', undefined, {
      tailwindcss: { v4: {}, version: 3 },
      tailwindcssRuntimeOptions: undefined,
      supportCustomLengthUnits: true,
      appType: 'taro',
    } as unknown as InternalUserDefinedOptions) as any

    expect(runtime.tailwindcss?.v4?.base).toBe('/workspace/app')
    expect(runtime.tailwindcss?.v4?.cssEntries).toEqual([])
  })

  it('fills empty css entries when dynamic v4 entry input becomes empty after detection', async () => {
    vi.doMock('@/utils', () => ({
      defuOverrideArray: (user: any = {}, defaults: any) => ({
        ...defaults,
        ...user,
        v4: user.v4 ?? defaults.v4,
      }),
    }))
    createTailwindcssRuntime.mockImplementation(options => options)
    let lengthReads = 0
    const dynamicCssEntries = {
      get length() {
        lengthReads += 1
        return lengthReads === 1 ? 1 : 0
      },
    } as unknown as string[]
    const { createTailwindcssRuntimeForBase } = await loadModule()

    const runtime = createTailwindcssRuntimeForBase('/workspace/app', dynamicCssEntries, {
      tailwindcss: { v4: {}, version: 3 },
      tailwindcssRuntimeOptions: undefined,
      supportCustomLengthUnits: true,
      appType: 'taro',
    } as unknown as InternalUserDefinedOptions) as any

    expect(runtime.tailwindcss?.v4?.base).toBeUndefined()
    expect(runtime.tailwindcss?.v4?.cssEntries).toEqual([])
  })

  it('repairs null v4 configs', async () => {
    createTailwindcssRuntime.mockImplementation(options => options)
    const { createTailwindcssRuntimeForBase } = await loadModule()

    const runtime = createTailwindcssRuntimeForBase('/workspace/app', ['/workspace/app/src/app.css'], {
      tailwindcss: { v4: null as any, version: 3 },
      tailwindcssRuntimeOptions: undefined,
      supportCustomLengthUnits: true,
      appType: 'taro',
    } as unknown as InternalUserDefinedOptions) as any

    expect(runtime.tailwindcss?.v4?.base).toBeUndefined()
    expect(runtime.tailwindcss?.v4?.cssEntries).toEqual(['/workspace/app/src/app.css'])
  })

  it('preserves user-specified v4 base when css entries are provided', async () => {
    createTailwindcssRuntime.mockImplementation(options => options)
    const { createTailwindcssRuntimeForBase } = await loadModule()

    const runtime = createTailwindcssRuntimeForBase('/workspace/app', ['/workspace/app/src/app.css'], {
      tailwindcss: { v4: { base: '/custom/base' } },
      tailwindcssRuntimeOptions: undefined,
      supportCustomLengthUnits: true,
      appType: 'taro',
    } as unknown as InternalUserDefinedOptions) as any

    expect(runtime.tailwindcss?.v4?.base).toBe('/custom/base')
    expect(runtime.tailwindcss?.v4?.cssEntries).toEqual(['/workspace/app/src/app.css'])
  })

  it('preserves auto-detected v4 css sources when css entries are omitted', async () => {
    createTailwindcssRuntime.mockImplementation(options => options)
    const { createTailwindcssRuntimeForBase } = await loadModule()

    const cssSource = {
      file: '/workspace/app/src/main.css',
      base: '/workspace/app/src',
      css: '@import "tailwindcss";',
      dependencies: ['/workspace/app/src/tailwind.config.js'],
    }
    const runtime = createTailwindcssRuntimeForBase('/workspace/app', undefined, {
      tailwindcss: {
        v4: {
          cssSources: [cssSource],
        },
      },
      tailwindcssRuntimeOptions: undefined,
      supportCustomLengthUnits: true,
      appType: 'uni-app-vite',
    } as unknown as InternalUserDefinedOptions) as any

    expect(runtime.tailwindcss?.v4?.base).toBe('/workspace/app')
    expect(runtime.tailwindcss?.v4?.cssEntries).toEqual([])
    expect(runtime.tailwindcss?.v4?.cssSources).toEqual([cssSource])
  })

  it('uses tailwindcss package when auto-detected v4 css sources are present', async () => {
    createTailwindcssRuntime.mockImplementation(options => ({
      majorVersion: 4,
      packageName: options.tailwindcss.packageName,
      tailwindcss: options.tailwindcss,
    }))
    const { createTailwindcssRuntimeForBase } = await loadModule()

    const cssSource = {
      file: '/workspace/app/src/main.css',
      base: '/workspace/app/src',
      css: '@import "tailwindcss";',
    }
    const runtime = createTailwindcssRuntimeForBase('/workspace/app', undefined, {
      tailwindcss: {
        v4: {
          cssSources: [cssSource],
        },
      },
      tailwindcssRuntimeOptions: undefined,
      supportCustomLengthUnits: true,
      appType: 'uni-app-vite',
    } as unknown as InternalUserDefinedOptions) as any

    expect(createTailwindcssRuntime).toHaveBeenCalledWith(expect.objectContaining({
      tailwindcss: expect.objectContaining({
        packageName: 'tailwindcss',
        v4: expect.objectContaining({
          cssSources: [cssSource],
        }),
      }),
    }))
    expect(runtime.packageName).toBe('tailwindcss')
  })

  it('recreates v4 config when user explicitly disables it', async () => {
    createTailwindcssRuntime.mockImplementation(options => options)
    const { createTailwindcssRuntimeForBase } = await loadModule()

    const runtime = createTailwindcssRuntimeForBase('/workspace/app', undefined, {
      tailwindcss: { v4: false as any, version: 3 },
      tailwindcssRuntimeOptions: undefined,
      supportCustomLengthUnits: true,
      appType: 'taro',
    } as unknown as InternalUserDefinedOptions) as any

    expect(runtime.tailwindcss?.v4?.base).toBe('/workspace/app')
    expect(runtime.tailwindcss?.v4?.cssEntries).toEqual([])
  })

  it('preserves modern tailwindcssRuntimeOptions v4 base when css entries are provided', async () => {
    createTailwindcssRuntime.mockImplementation(options => options)
    const { createTailwindcssRuntimeForBase } = await loadModule()

    const runtime = createTailwindcssRuntimeForBase('/workspace/app', ['/workspace/app/src/app.css'], {
      tailwindcss: undefined,
      tailwindcssRuntimeOptions: {
        tailwindcss: {
          v4: { base: '/custom/base' },
        },
      } as any,
      supportCustomLengthUnits: true,
      appType: 'taro',
    } as unknown as InternalUserDefinedOptions) as any

    expect(runtime.tailwindcssRuntimeOptions?.tailwindcss?.v4?.base).toBe('/custom/base')
    expect(runtime.tailwindcssRuntimeOptions?.tailwindcss?.v4?.cssEntries).toEqual(['/workspace/app/src/app.css'])
  })

  it('returns early for invalid tailwindcssRuntimeOptions shapes', async () => {
    createTailwindcssRuntime.mockImplementation(options => options)
    const { createTailwindcssRuntimeForBase } = await loadModule()

    const primitive = createTailwindcssRuntimeForBase('/workspace/app', [], {
      tailwindcss: undefined,
      tailwindcssRuntimeOptions: 1 as any,
      supportCustomLengthUnits: true,
      appType: 'taro',
    } as unknown as InternalUserDefinedOptions) as any

    expect(primitive.tailwindcssRuntimeOptions).toBe(1)

    const withoutTailwind = createTailwindcssRuntimeForBase('/workspace/app', [], {
      tailwindcss: undefined,
      tailwindcssRuntimeOptions: {},
      supportCustomLengthUnits: true,
      appType: 'taro',
    } as unknown as InternalUserDefinedOptions) as any

    expect(withoutTailwind.tailwindcssRuntimeOptions).toEqual({})
  })

  it('merges multiple runtimes into a single runtime without exposing patch aggregation', async () => {
    const runtimeA: TailwindcssRuntimeLike = {
      packageInfo: { version: '4.0.0' } as any,
      majorVersion: 4,
      options: {} as any,
      getClassSet: vi.fn(async () => new Set(['a'])),
      getClassSetSync: vi.fn(() => new Set(['a'])),
      extract: vi.fn(async () => ({
        classList: ['a'],
        classSet: new Set(['a']),
        filename: 'a.css',
      })),
    }
    const runtimeB: TailwindcssRuntimeLike = {
      packageInfo: { version: '4.0.0' } as any,
      majorVersion: 4,
      options: {} as any,
      getClassSet: vi.fn(async () => new Set(['b'])),
      getClassSetSync: vi.fn(() => undefined),
      extract: vi.fn(async () => ({
        classList: ['b'],
        classSet: new Set(['b']),
        filename: 'b.css',
      })),
    }

    const { createMultiTailwindcssRuntime } = await loadModule()
    const merged = createMultiTailwindcssRuntime([runtimeA, runtimeB])

    expect([...await merged.getClassSet()]).toEqual(['a', 'b'])
    expect(merged.getClassSetSync?.()).toEqual(new Set(['a']))

    const extracted = await merged.extract({})
    expect(extracted.filename).toBe('a.css')
    expect(extracted.classList).toEqual(['a', 'b'])
    expect([...extracted.classSet]).toEqual(['a', 'b'])
    expect((merged as any)[Symbol.for('weapp-tailwindcss.runtimeSignatureRuntimes')]).toEqual([runtimeA, runtimeB])
  })

  it('returns the original runtime when only one is provided', async () => {
    const runtime: TailwindcssRuntimeLike = {
      packageInfo: { version: '4.0.0' } as any,
      majorVersion: 4,
      options: {} as any,
      getClassSet: vi.fn(async () => new Set(['only'])),
      extract: vi.fn(async () => ({
        classList: ['only'],
        classSet: new Set(['only']),
        filename: 'only.css',
      })),
    }

    const { createMultiTailwindcssRuntime } = await loadModule()
    const merged = createMultiTailwindcssRuntime([runtime])

    expect(merged).toBe(runtime)
  })

  it('skips falsy extract results when merging', async () => {
    const runtimeA: TailwindcssRuntimeLike = {
      packageInfo: { version: '4.0.0' } as any,
      majorVersion: 4,
      options: {} as any,
      getClassSet: vi.fn(async () => new Set()),
      extract: vi.fn(async () => undefined as any),
    }
    const runtimeB: TailwindcssRuntimeLike = {
      packageInfo: { version: '4.0.0' } as any,
      majorVersion: 4,
      options: {} as any,
      getClassSet: vi.fn(async () => new Set(['hit'])) as any,
      extract: vi.fn(async () => ({
        classList: ['hit'],
        classSet: new Set(['hit']),
      })),
    }

    const { createMultiTailwindcssRuntime } = await loadModule()
    const merged = createMultiTailwindcssRuntime([runtimeA, runtimeB])

    const extracted = await merged.extract({})
    expect(extracted.classList).toEqual(['hit'])
    expect([...extracted.classSet]).toEqual(['hit'])
  })

  it('merges classSet-only extract results', async () => {
    const runtimeA: TailwindcssRuntimeLike = {
      packageInfo: { version: '4.0.0' } as any,
      majorVersion: 4,
      options: {} as any,
      getClassSet: vi.fn(async () => new Set()),
      extract: vi.fn(async () => ({
        classSet: new Set(['only-set']),
      })),
    }
    const runtimeB: TailwindcssRuntimeLike = {
      packageInfo: { version: '4.0.0' } as any,
      majorVersion: 4,
      options: {} as any,
      getClassSet: vi.fn(async () => new Set()),
      extract: vi.fn(async () => ({
        classSet: new Set(['another']),
      })),
    }

    const { createMultiTailwindcssRuntime } = await loadModule()
    const merged = createMultiTailwindcssRuntime([runtimeA, runtimeB])

    const extracted = await merged.extract({})
    expect(extracted.classList).toEqual([])
    expect([...extracted.classSet].sort()).toEqual(['another', 'only-set'])
  })

  it('merges classList-only extract results', async () => {
    const runtimeA: TailwindcssRuntimeLike = {
      packageInfo: { version: '4.0.0' } as any,
      majorVersion: 4,
      options: {} as any,
      getClassSet: vi.fn(async () => new Set()),
      extract: vi.fn(async () => ({
        classList: ['only-list'],
      })),
    }
    const runtimeB: TailwindcssRuntimeLike = {
      packageInfo: { version: '4.0.0' } as any,
      majorVersion: 4,
      options: {} as any,
      getClassSet: vi.fn(async () => new Set()),
      extract: vi.fn(async () => ({
        classList: ['extra'],
      })),
    }

    const { createMultiTailwindcssRuntime } = await loadModule()
    const merged = createMultiTailwindcssRuntime([runtimeA, runtimeB])

    const extracted = await merged.extract({})
    expect(extracted.classList).toEqual(['only-list', 'extra'])
    expect([...extracted.classSet].sort()).toEqual(['extra', 'only-list'])
  })

  it('deduplicates repeated class names when merging class lists', async () => {
    const runtimeA: TailwindcssRuntimeLike = {
      packageInfo: { version: '4.0.0' } as any,
      majorVersion: 4,
      options: {} as any,
      getClassSet: vi.fn(async () => new Set()),
      extract: vi.fn(async () => ({
        classList: ['dup'],
        classSet: new Set(['dup']),
      })),
    }
    const runtimeB: TailwindcssRuntimeLike = {
      packageInfo: { version: '4.0.0' } as any,
      majorVersion: 4,
      options: {} as any,
      getClassSet: vi.fn(async () => new Set()),
      extract: vi.fn(async () => ({
        classList: ['dup'],
        classSet: new Set(['dup']),
      })),
    }

    const { createMultiTailwindcssRuntime } = await loadModule()
    const merged = createMultiTailwindcssRuntime([runtimeA, runtimeB])

    const extracted = await merged.extract({})
    expect(extracted.classList).toEqual(['dup'])
    expect([...extracted.classSet]).toEqual(['dup'])
  })

  it('returns undefined when only one css entry group exists', async () => {
    const { tryCreateMultiTailwindcssRuntime } = await loadModule()

    const groups = new Map<string, string[]>([['/base', ['/base/app.css']]])
    const result = tryCreateMultiTailwindcssRuntime(groups, {
      tailwindcss: {},
      tailwindcssRuntimeOptions: undefined,
      supportCustomLengthUnits: true,
      appType: 'taro',
    } as unknown as InternalUserDefinedOptions)

    expect(result).toBeUndefined()
    expect(createTailwindcssRuntime).not.toHaveBeenCalled()
  })

  it('creates multiple runtimes when multiple css entry groups exist', async () => {
    createTailwindcssRuntime.mockImplementation(options => ({
      packageInfo: { version: '4.0.0' } as any,
      majorVersion: 4,
      options,
      getClassSet: vi.fn(async () => new Set([options.basedir as string])),
      extract: vi.fn(async () => ({
        classList: [options.basedir as string],
        classSet: new Set([options.basedir as string]),
      })),
    }))
    const { tryCreateMultiTailwindcssRuntime } = await loadModule()

    const groups = new Map<string, string[]>([
      ['/base/a', ['/base/a/app.css']],
      ['/base/b', ['/base/b/app.css']],
    ])

    const merged = tryCreateMultiTailwindcssRuntime(groups, {
      tailwindcss: {},
      tailwindcssRuntimeOptions: undefined,
      supportCustomLengthUnits: true,
      appType: 'taro',
    } as unknown as InternalUserDefinedOptions)

    expect(merged).toBeDefined()
    expect(createTailwindcssRuntime).toHaveBeenCalledTimes(2)
    expect(logger.debug).toHaveBeenCalled()

    const classSet = await merged!.getClassSet()
    expect([...classSet].sort()).toEqual(['/base/a', '/base/b'])
  })
})
