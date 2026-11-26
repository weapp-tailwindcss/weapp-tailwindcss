import path from 'node:path'
import { vi } from 'vitest'
import { getCompilerContext } from '@/context'
import { TAILWIND_V4_CSS_PREFLIGHT } from '@/defaults'
import { normalizeWeappTailwindcssGeneratorOptions } from '@/generator'
import { generatorTargetEnvKeys } from '@/runtime-branch/generator-target-env'
import { defu } from '@/utils'

function withGeneratorTargetEnv(
  env: Partial<Record<typeof generatorTargetEnvKeys[number], string>>,
  callback: () => void,
) {
  const originalEnvValues = new Map<string, string | undefined>(
    generatorTargetEnvKeys.map(key => [key, process.env[key]]),
  )

  for (const key of generatorTargetEnvKeys) {
    if (env[key] === undefined) {
      delete process.env[key]
    }
    else {
      process.env[key] = env[key]
    }
  }

  try {
    callback()
  }
  finally {
    for (const [key, value] of originalEnvValues) {
      if (value === undefined) {
        delete process.env[key]
      }
      else {
        process.env[key] = value
      }
    }
  }
}

function sanitizeSnapshotOptions(options: ReturnType<typeof getCompilerContext>) {
  const clone = { ...options }
  const cwd = process.cwd()
  if (typeof clone.tailwindcssBasedir === 'string') {
    clone.tailwindcssBasedir = clone.tailwindcssBasedir.replace(cwd, '<cwd>')
  }
  clone.cache = '<cache>' as unknown as typeof clone.cache
  return clone
}

describe('get options', () => {
  it('default options', () => {
    const options = sanitizeSnapshotOptions(getCompilerContext({}))
    // @ts-ignore
    delete options.tailwindRuntime
    // @ts-ignore
    delete options.refreshTailwindcssRuntime
    // @ts-ignore
    delete options.tailwindRuntime
    expect(options).toMatchSnapshot()
  })

  it('default cache exposes lru compatible operations', () => {
    const { cache } = getCompilerContext({})
    expect(cache.instance).toMatchObject({
      get: expect.any(Function),
      has: expect.any(Function),
      set: expect.any(Function),
      delete: expect.any(Function),
    })
  })

  it('default matcher', () => {
    const { cssMatcher, jsMatcher, mainCssChunkMatcher, htmlMatcher } = getCompilerContext()
    expect(cssMatcher('a.css')).toBe(true)
    expect(jsMatcher('a.js')).toBe(true)
    expect(jsMatcher('node_modules/a.js')).toBe(false)
    expect(mainCssChunkMatcher('app.wxss', 'native')).toBe(false)
    expect(htmlMatcher('a.wxml')).toBe(true)
  })

  it('uses mainCssChunkMatcher as the public main css matcher', () => {
    const mainCssChunkMatcher = vi.fn((name: string, appType) => name === 'shell.acss' && appType === 'taro')
    const options = getCompilerContext({
      mainCssChunkMatcher,
    })

    expect(options.mainCssChunkMatcher('shell.acss', 'taro')).toBe(true)
    expect(mainCssChunkMatcher).toHaveBeenCalledWith('shell.acss', 'taro')
  })

  it('disables generator import fallback by default', () => {
    expect(normalizeWeappTailwindcssGeneratorOptions(undefined).importFallback).toBe(false)
    expect(normalizeWeappTailwindcssGeneratorOptions({}).importFallback).toBe(false)
    expect(normalizeWeappTailwindcssGeneratorOptions({ importFallback: true }).importFallback).toBe(true)
  })

  it('allows disabling Tailwind generation without disabling transform options', () => {
    const options = normalizeWeappTailwindcssGeneratorOptions(false)

    expect(options.enabled).toBe(false)
    expect(options.target).toBe('weapp')
    expect(options.importFallback).toBe(false)
    expect(options.hmr.preserveDeletedCss).toBe(true)
  })

  it('uses high-performance dev HMR css append mode by default', () => {
    expect(normalizeWeappTailwindcssGeneratorOptions(undefined).hmr.preserveDeletedCss).toBe(true)
    expect(normalizeWeappTailwindcssGeneratorOptions({}).hmr.preserveDeletedCss).toBe(true)
    expect(normalizeWeappTailwindcssGeneratorOptions({ hmr: { preserveDeletedCss: false } }).hmr.preserveDeletedCss).toBe(false)
  })

  it('keeps explicit web generator output official-compatible unless web compatibility is requested', () => {
    expect(normalizeWeappTailwindcssGeneratorOptions(undefined).webCompat).toBeUndefined()
    expect(normalizeWeappTailwindcssGeneratorOptions({}).webCompat).toBeUndefined()
    expect(normalizeWeappTailwindcssGeneratorOptions({ target: 'web' }).webCompat).toBeUndefined()
    expect(normalizeWeappTailwindcssGeneratorOptions({ webCompat: true }).webCompat).toBe(true)
    expect(normalizeWeappTailwindcssGeneratorOptions({ target: 'web', webCompat: false }).webCompat).toBe(false)
  })

  it('keeps uni-app H5 compatible when Web target is explicit', () => {
    withGeneratorTargetEnv({ UNI_PLATFORM: 'h5' }, () => {
      expect(normalizeWeappTailwindcssGeneratorOptions({ target: 'web' }, { appType: 'uni-app-vite' }).webCompat).toBe(true)
      expect(normalizeWeappTailwindcssGeneratorOptions({ target: 'web' }, { appType: 'uni-app-vite', platform: 'h5' }).webCompat).toBe(true)
      expect(normalizeWeappTailwindcssGeneratorOptions({ target: 'web', webCompat: false }, { appType: 'uni-app-vite' }).webCompat).toBe(false)
    })
  })

  it('keeps weapp as generator target without framework web env', () => {
    withGeneratorTargetEnv({}, () => {
      expect(normalizeWeappTailwindcssGeneratorOptions(undefined).target).toBe('weapp')
    })
  })

  it('keeps mini-program output on the weapp compatibility path', () => {
    withGeneratorTargetEnv({ UNI_PLATFORM: 'mp-weixin' }, () => {
      const options = normalizeWeappTailwindcssGeneratorOptions(undefined, { appType: 'uni-app-vite' })
      expect(options.target).toBe('weapp')
      expect(options.webCompat).toBeUndefined()
    })
  })

  it('infers web generator target from uni-app, uni-app x, Mpx and Taro H5 env with compatibility', () => {
    withGeneratorTargetEnv({ UNI_PLATFORM: 'h5' }, () => {
      expect(normalizeWeappTailwindcssGeneratorOptions(undefined).target).toBe('web')
      expect(normalizeWeappTailwindcssGeneratorOptions(undefined).webCompat).toBe(true)
    })

    withGeneratorTargetEnv({ UNI_UTS_PLATFORM: 'web' }, () => {
      expect(normalizeWeappTailwindcssGeneratorOptions({}).target).toBe('web')
      expect(normalizeWeappTailwindcssGeneratorOptions({}).webCompat).toBe(true)
    })

    withGeneratorTargetEnv({ UNI_UTS_PLATFORM: 'web-desktop' }, () => {
      expect(normalizeWeappTailwindcssGeneratorOptions({}).target).toBe('web')
    })

    withGeneratorTargetEnv({ MPX_CLI_MODE: 'web' }, () => {
      expect(normalizeWeappTailwindcssGeneratorOptions({}).target).toBe('web')
    })

    withGeneratorTargetEnv({ MPX_CURRENT_TARGET_MODE: 'web' }, () => {
      expect(normalizeWeappTailwindcssGeneratorOptions({}).target).toBe('web')
    })

    withGeneratorTargetEnv({ TARO_ENV: 'h5' }, () => {
      expect(normalizeWeappTailwindcssGeneratorOptions({}).target).toBe('web')
    })
  })

  it('infers web generator target from plain uni-app App WebView env with compatibility', () => {
    withGeneratorTargetEnv({ UNI_PLATFORM: 'app' }, () => {
      expect(normalizeWeappTailwindcssGeneratorOptions(undefined).target).toBe('web')
      expect(normalizeWeappTailwindcssGeneratorOptions(undefined).webCompat).toBe(true)
    })

    withGeneratorTargetEnv({ UNI_PLATFORM: 'app-plus' }, () => {
      expect(normalizeWeappTailwindcssGeneratorOptions({}).target).toBe('web')
      expect(normalizeWeappTailwindcssGeneratorOptions({}).webCompat).toBe(true)
    })
  })

  it('keeps uni-app vite App WebView on web generator target when HBuilderX exposes native uts platform', () => {
    withGeneratorTargetEnv({ UNI_PLATFORM: 'app-plus', UNI_UTS_PLATFORM: 'app-android' }, () => {
      const options = normalizeWeappTailwindcssGeneratorOptions({}, {
        appType: 'uni-app-vite',
        tailwindcssMajorVersion: 4,
      })

      expect(options.target).toBe('web')
      expect(options.branch).toMatchObject({
        platformFamily: 'web',
      })
      expect(options.webCompat).toBe(true)
    })

    withGeneratorTargetEnv({ UNI_PLATFORM: 'app', UNI_UTS_PLATFORM: 'app-ios' }, () => {
      const options = normalizeWeappTailwindcssGeneratorOptions({}, {
        appType: 'uni-app-vite',
        tailwindcssMajorVersion: 4,
      })

      expect(options.target).toBe('web')
      expect(options.branch).toMatchObject({
        platformFamily: 'web',
      })
    })
  })

  it('does not infer web generator target from uni-app x and Mpx non-web env', () => {
    withGeneratorTargetEnv({ UNI_UTS_PLATFORM: 'app-android' }, () => {
      expect(normalizeWeappTailwindcssGeneratorOptions({}).target).toBe('weapp')
    })

    withGeneratorTargetEnv({ UNI_PLATFORM: 'app', UNI_UTS_PLATFORM: 'app-ios' }, () => {
      expect(normalizeWeappTailwindcssGeneratorOptions({}).target).toBe('weapp')
    })

    withGeneratorTargetEnv({ UNI_PLATFORM: 'app', UNI_UTS_PLATFORM: 'app-harmony' }, () => {
      expect(normalizeWeappTailwindcssGeneratorOptions({}).target).toBe('weapp')
    })

    withGeneratorTargetEnv({ MPX_CLI_MODE: 'mp', MPX_CURRENT_TARGET_MODE: 'wx' }, () => {
      expect(normalizeWeappTailwindcssGeneratorOptions({}).target).toBe('weapp')
    })
  })

  it('resolves generator runtime branch from Tailwind version and platform context', () => {
    const miniProgramOptions = normalizeWeappTailwindcssGeneratorOptions({}, {
      tailwindcssMajorVersion: 4,
      uniUtsPlatform: 'mp-alipay',
    })
    expect(miniProgramOptions.branch).toMatchObject({
      tailwindcssVersion: 4,
      platformFamily: 'mini-program',
      platform: 'mp-alipay',
    })

    const nativeOptions = normalizeWeappTailwindcssGeneratorOptions({}, {
      appType: 'uni-app-x',
      tailwindcssMajorVersion: 4,
      uniAppX: true,
      uniUtsPlatform: 'app-ios',
    })
    expect(nativeOptions.branch).toMatchObject({
      tailwindcssVersion: 4,
      platformFamily: 'native-app',
      nativeAppPlatform: 'ios',
      platform: 'app-ios',
    })

    const webOptions = normalizeWeappTailwindcssGeneratorOptions({ target: 'web' }, {
      tailwindcssMajorVersion: 4,
      uniUtsPlatform: 'h5',
    })
    expect(webOptions.branch).toMatchObject({
      tailwindcssVersion: 4,
      platformFamily: 'web',
    })
  })

  it('keeps explicit generator target before env inference', () => {
    withGeneratorTargetEnv({ UNI_PLATFORM: 'h5', TARO_ENV: 'h5' }, () => {
      expect(normalizeWeappTailwindcssGeneratorOptions({ target: 'weapp' }).target).toBe('weapp')
    })
  })

  it('honors explicit generator target env overrides', () => {
    withGeneratorTargetEnv({ WEAPP_TW_TARGET: 'web' }, () => {
      expect(normalizeWeappTailwindcssGeneratorOptions({}).target).toBe('web')
    })

    withGeneratorTargetEnv({ UNI_PLATFORM: 'h5', WEAPP_TAILWINDCSS_TARGET: 'weapp' }, () => {
      expect(normalizeWeappTailwindcssGeneratorOptions({}).target).toBe('weapp')
    })
  })

  // it.skip('glob matcher', () => {
  //   const { cssMatcher, jsMatcher, mainCssChunkMatcher, htmlMatcher } = getCompilerContext({
  //     cssMatcher: '*.xxss',
  //     jsMatcher: '*.abcd',
  //     mainCssChunkMatcher: '*.main',
  //     htmlMatcher: ['*.wxmm', '*.plmm']
  //   })
  //   expect(cssMatcher('a.xxss')).toBe(true)
  //   expect(jsMatcher('a.abcd')).toBe(true)
  //   expect(mainCssChunkMatcher('app.main', 'native')).toBe(true)
  //   expect(htmlMatcher('a.wxmm')).toBe(true)
  //   expect(htmlMatcher('a.plmm')).toBe(true)
  // })

  it('cssPreflight false', () => {
    const config = getCompilerContext({
      cssPreflight: false,
    })
    expect(config.cssPreflight).toBe(false)
  })

  it('cssPreflight partial', () => {
    const cssPreflight = {
      'border-color': false,
      'box-sizing': 'content-box',
      'border-style': 0,
    }
    const config = getCompilerContext({
      cssPreflight,
    })
    expect(config.cssPreflight).toStrictEqual({
      border: '0 solid',
      'border-color': false,
      'border-style': 0,
      'box-sizing': 'content-box',
      margin: '0',
      padding: '0',
    })
  })

  it('uses Tailwind v4 cssPreflight defaults for tailwindcss v4 runtime', () => {
    const config = getCompilerContext({
      tailwindcss: {
        packageName: 'tailwindcss4',
      },
    })
    expect(config.tailwindRuntime.majorVersion).toBe(4)
    expect(config.cssPreflight).toStrictEqual(TAILWIND_V4_CSS_PREFLIGHT)
  })

  it('uses Tailwind v4 cssPreflight defaults for default runtime', () => {
    const config = getCompilerContext()
    expect(config.tailwindRuntime.majorVersion).toBe(4)
    expect(config.cssPreflight).toStrictEqual(TAILWIND_V4_CSS_PREFLIGHT)
  })

  it('disables implicit mini-program element preflight for uni-app vite by default', () => {
    const config = getCompilerContext({
      appType: 'uni-app-vite',
    })
    expect(config.tailwindRuntime.majorVersion).toBe(4)
    expect(config.cssPreflight).toStrictEqual(TAILWIND_V4_CSS_PREFLIGHT)
    expect(config.cssSelectorReplacement.root).toStrictEqual(['page', '.tw-root', 'wx-root-portal-content'])
  })

  it('keeps explicit mini-program element preflight for uni-app vite', () => {
    const config = getCompilerContext({
      appType: 'uni-app-vite',
      cssPreflight: {
        'box-sizing': 'border-box',
      },
    })
    expect(config.cssPreflight).toStrictEqual({
      ...TAILWIND_V4_CSS_PREFLIGHT,
      'box-sizing': 'border-box',
    })
  })

  it('keeps explicit root selector replacement for uni-app vite', () => {
    const config = getCompilerContext({
      appType: 'uni-app-vite',
      cssSelectorReplacement: {
        root: ['page', '.custom-root'],
      },
    })
    expect(config.cssSelectorReplacement.root).toStrictEqual(['page', '.custom-root'])
  })

  // it('supportCustomLengthUnits boolean', () => {
  //   const o0 = getCompilerContext()
  //   expect(o0.supportCustomLengthUnits).toEqual(defaultOptions.supportCustomLengthUnits)
  //   const o1 = getCompilerContext({
  //     supportCustomLengthUnits: true
  //   })
  //   expect(o1.supportCustomLengthUnits).toEqual(defaultOptions.supportCustomLengthUnits)
  //   const o2 = getCompilerContext({
  //     supportCustomLengthUnits: false
  //   })
  //   expect(o2.supportCustomLengthUnits).toEqual(false)
  //   const o0o = getCompilerContext({
  //     supportCustomLengthUnits: {
  //       units: ['upx', 'xxem']
  //     }
  //   })
  //   expect(typeof o0o.supportCustomLengthUnits === 'object').toBe(true)
  //   expect(o0o.supportCustomLengthUnits).toEqual({
  //     units: ['upx', 'xxem', 'rpx'],
  //     // @ts-ignore
  //     dangerousOptions: defaultOptions.supportCustomLengthUnits.dangerousOptions
  //   })
  // })

  it('arbitraryValues options', () => {
    let arbitraryValues: ReturnType<typeof getCompilerContext>['arbitraryValues'] = getCompilerContext().arbitraryValues
    expect(typeof arbitraryValues === 'object').toBe(true)
    expect(arbitraryValues.allowDoubleQuotes).toBeDefined()
    expect(arbitraryValues.allowDoubleQuotes).toBe(false)
    expect(arbitraryValues.bareArbitraryValues).toBe(false)
    arbitraryValues = getCompilerContext({
      arbitraryValues: {},
    }).arbitraryValues
    expect(typeof arbitraryValues === 'object').toBe(true)
    expect(arbitraryValues.allowDoubleQuotes).toBeDefined()
    expect(arbitraryValues.allowDoubleQuotes).toBe(false)
    expect(arbitraryValues.bareArbitraryValues).toBe(false)
    arbitraryValues = getCompilerContext({
      arbitraryValues: {
        allowDoubleQuotes: true,
        bareArbitraryValues: true,
      },
    }).arbitraryValues
    expect(typeof arbitraryValues === 'object').toBe(true)
    expect(arbitraryValues.allowDoubleQuotes).toBeDefined()
    expect(arbitraryValues.allowDoubleQuotes).toBe(true)
    expect(arbitraryValues.bareArbitraryValues).toBe(true)
  })

  it('customAttributes defu merge', () => {
    // const { customAttributes } = getCompilerContext()

    const customAttributes = {
      '*': [/[A-Za-z-]*[Cc]lass/],
    }
    const t = defu(customAttributes, {
      '*': ['class', 'hover-class'],
    })
    expect(t['*'].length).toBe(3)
  })

  it('mpx should have unique cache dir', () => {
    let config = getCompilerContext({

    })
    let cacheOptions = config.tailwindRuntime.options?.cache
    expect(cacheOptions?.enabled).toBe(true)
    // TailwindcssRuntime 内部可能将路径转为 posix 格式，统一用 path.normalize 比较
    const expectedDefaultCacheDir = path.join(process.cwd(), 'node_modules', '.cache', '@tailwindcss-mangle', 'engine')
    expect(path.normalize(String(cacheOptions?.dir))).toBe(path.normalize(expectedDefaultCacheDir))
    config = getCompilerContext({
      appType: 'mpx',
    })
    cacheOptions = config.tailwindRuntime.options?.cache
    expect(path.normalize(String(cacheOptions?.dir))).toBe(path.normalize(path.join(process.cwd(), 'node_modules', '.cache', '@tailwindcss-mangle', 'engine')))
  })

  describe('px2rpx options', () => {
    it('defaults to undefined', () => {
      expect(getCompilerContext().px2rpx).toBeUndefined()
    })

    it.each([
      ['enabled as boolean', true],
      ['disabled as boolean', false],
      ['custom options object', { selectorBlackList: ['van-'] }],
    ] as const)('preserves px2rpx when %s', (_label, px2rpx) => {
      const config = getCompilerContext({ px2rpx })
      expect(config.px2rpx).toEqual(px2rpx)
    })
  })

  // it('customAttributes map defu merge', () => {
  //   // const { customAttributes } = getCompilerContext()

  //   const customAttributes = new Map<string, RegExp[]>()
  //   customAttributes.set('*', [/[A-Za-z]?[A-Za-z-]*[Cc]lass/])

  //   const t = defu(customAttributes, {
  //     '*': ['class', 'hover-class']
  //   })
  //   expect(isMap(t)).toBe(true)
  //   expect(t.get('*')).toBe(3)
  //   //  expect(t['*']).toBe(2)
  //   // expect(t.get('*')).toBe(1)
  //   // expect(t['*']).toBe(2)
  // })
})
