import { beforeEach, describe, expect, it, vi } from 'vitest'

const styleHandlerFactory = vi.fn(() => vi.fn())
const jsHandlerFactory = vi.fn(() => vi.fn())
const templateHandlerFactory = vi.fn(() => vi.fn())

vi.mock('@weapp-tailwindcss/postcss/transform', async (importOriginal) => ({
  ...await importOriginal<typeof import('@weapp-tailwindcss/postcss/transform')>(),
  createStyleHandler: styleHandlerFactory,
}))

vi.mock('@/js', () => ({
  createJsHandler: jsHandlerFactory,
}))

vi.mock('@/wxml', () => ({
  createTemplateHandler: templateHandlerFactory,
}))

type InternalUserDefinedOptions = import('@/types').InternalUserDefinedOptions
type Px2rpxOption = InternalUserDefinedOptions['px2rpx']
type UnitsToPxOption = InternalUserDefinedOptions['unitsToPx']
type UnitConversionOption = InternalUserDefinedOptions['unitConversion']

const customAttributesEntities: import('@/types').ICustomAttributesEntities = [
  ['view', ['class']],
]

function createContext(
  px2rpx?: Px2rpxOption,
  unitsToPx?: UnitsToPxOption,
  unitConversion?: UnitConversionOption,
): InternalUserDefinedOptions {
  return {
    cssPreflight: {},
    cssPreflightRange: 'all' as const,
    escapeMap: { '&': '_amp' },
    cssChildCombinatorReplaceValue: 'view + view',
    injectAdditionalCssVarScope: true,
    cssSelectorReplacement: { root: '.app', universal: false },
    rem2rpx: false,
    postcssOptions: {},
    cssOptions: {
      tailwindcssV4GradientFallback: false,
    },
    cssRemoveProperty: true,
    cssRemoveActivePseudoClass: false,
    cssRemoveHoverPseudoClass: false,
    cssPresetEnv: { stage: 0 },
    autoprefixer: false,
    uniAppX: true,
    px2rpx,
    unitsToPx,
    unitConversion,
    arbitraryValues: { allowDoubleQuotes: true },
    jsPreserveClass: vi.fn(),
    babelParserOptions: { sourceType: 'module' },
    ignoreCallExpressionIdentifiers: [/^tw/],
    ignoreTaggedTemplateExpressionIdentifiers: ['twMerge'],
    inlineWxs: true,
    disabledDefaultTemplateHandler: true,
  } as unknown as InternalUserDefinedOptions
}

describe('createHandlersFromContext', () => {
  beforeEach(() => {
    styleHandlerFactory.mockClear()
    jsHandlerFactory.mockClear()
    templateHandlerFactory.mockClear()
  })

  it('builds style, js and template handlers with the expected context', async () => {
    const { createHandlersFromContext } = await import('@/context/handlers')

    const styleHandler = vi.fn()
    const jsHandler = vi.fn()
    const templateHandler = vi.fn()

    styleHandlerFactory.mockReturnValueOnce(styleHandler)
    jsHandlerFactory.mockReturnValueOnce(jsHandler)
    templateHandlerFactory.mockReturnValueOnce(templateHandler)

    const ctx = createContext({ selectorBlackList: ['van-'] })

    const result = createHandlersFromContext(
      ctx,
      customAttributesEntities,
      true,
    )

    expect(styleHandlerFactory).toHaveBeenCalledWith(expect.objectContaining({
      cssCalc: true,
      platform: ctx.platform,
      px2rpx: ctx.px2rpx,
      unitsToPx: ctx.unitsToPx,
      cssPresetEnv: ctx.cssPresetEnv,
      autoprefixer: false,
      injectAdditionalCssVarScope: true,
      uniAppXUnsupported: 'warn',
    }))

    expect(jsHandlerFactory).toHaveBeenCalledWith(expect.objectContaining({
      escapeMap: ctx.escapeMap,
      arbitraryValues: ctx.arbitraryValues,
      experimentalJsFastPath: undefined,
    }))

    expect(templateHandlerFactory).toHaveBeenCalledWith(expect.objectContaining({
      customAttributesEntities,
      jsHandler,
      inlineWxs: ctx.inlineWxs,
    }))

    expect(result).toEqual({
      styleHandler,
      jsHandler,
      templateHandler,
    })
  })

  it.each([
    ['disabled', false, false],
    ['enabled', true, true],
    ['oxc', 'oxc', 'oxc'],
  ] as const)('preserves an explicitly %s JS fast path', async (_label, experimentalJsFastPath, expected) => {
    const { createHandlersFromContext } = await import('@/context/handlers')
    const ctx = createContext()
    ctx.experimentalJsFastPath = experimentalJsFastPath

    createHandlersFromContext(ctx, customAttributesEntities, true)

    expect(jsHandlerFactory).toHaveBeenCalledWith(expect.objectContaining({
      experimentalJsFastPath: expected,
    }))
  })

  it.each([
    ['enabled', true],
    ['disabled', false],
    ['omitted', undefined],
  ] as const)('forwards px2rpx when %s', async (_label, px2rpx) => {
    const { createHandlersFromContext } = await import('@/context/handlers')

    const styleHandler = vi.fn()
    styleHandlerFactory.mockReturnValueOnce(styleHandler)
    jsHandlerFactory.mockReturnValueOnce(vi.fn())
    templateHandlerFactory.mockReturnValueOnce(vi.fn())

    createHandlersFromContext(
      createContext(px2rpx),
      customAttributesEntities,
      true,
    )

    expect(styleHandlerFactory).toHaveBeenCalledWith(expect.objectContaining({
      px2rpx,
    }))
  })

  it.each([
    ['enabled', true],
    ['disabled', false],
    ['omitted', undefined],
  ] as const)('forwards unitsToPx when %s', async (_label, unitsToPx) => {
    const { createHandlersFromContext } = await import('@/context/handlers')

    const styleHandler = vi.fn()
    styleHandlerFactory.mockReturnValueOnce(styleHandler)
    jsHandlerFactory.mockReturnValueOnce(vi.fn())
    templateHandlerFactory.mockReturnValueOnce(vi.fn())

    createHandlersFromContext(
      createContext(undefined, unitsToPx),
      customAttributesEntities,
      true,
    )

    expect(styleHandlerFactory).toHaveBeenCalledWith(expect.objectContaining({
      unitsToPx,
    }))
  })

  it('forwards unitConversion to the style handler', async () => {
    const { createHandlersFromContext } = await import('@/context/handlers')
    const unitConversion: UnitConversionOption = {
      platforms: {
        weapp: {
          rules: [
            { from: 'px', to: 'rpx', factor: 2 },
          ],
        },
      },
    }

    styleHandlerFactory.mockReturnValueOnce(vi.fn())
    jsHandlerFactory.mockReturnValueOnce(vi.fn())
    templateHandlerFactory.mockReturnValueOnce(vi.fn())

    createHandlersFromContext(
      createContext(undefined, undefined, unitConversion),
      customAttributesEntities,
      true,
    )

    expect(styleHandlerFactory).toHaveBeenCalledWith(expect.objectContaining({
      unitConversion,
    }))
  })

  it('forwards Tailwind major version to the style handler', async () => {
    const { createHandlersFromContext } = await import('@/context/handlers')

    styleHandlerFactory.mockReturnValueOnce(vi.fn())
    jsHandlerFactory.mockReturnValueOnce(vi.fn())
    templateHandlerFactory.mockReturnValueOnce(vi.fn())

    createHandlersFromContext(
      createContext(),
      customAttributesEntities,
      true,
      4,
    )

    expect(styleHandlerFactory).toHaveBeenCalledWith(expect.objectContaining({
      majorVersion: 4,
    }))
  })

  it('forwards injectAdditionalCssVarScope from cssOptions', async () => {
    const { createHandlersFromContext } = await import('@/context/handlers')
    const ctx = {
      ...createContext(),
      injectAdditionalCssVarScope: false,
      cssOptions: {
        injectAdditionalCssVarScope: true,
      },
    } as unknown as InternalUserDefinedOptions

    styleHandlerFactory.mockReturnValueOnce(vi.fn())
    jsHandlerFactory.mockReturnValueOnce(vi.fn())
    templateHandlerFactory.mockReturnValueOnce(vi.fn())

    createHandlersFromContext(ctx, customAttributesEntities, true)

    expect(styleHandlerFactory).toHaveBeenCalledWith(expect.objectContaining({
      injectAdditionalCssVarScope: true,
    }))
  })
})

describe('resolveStyleOptionsFromContext', () => {
  it('extracts shared style options without handler-only fields', async () => {
    const { resolveStyleOptionsFromContext } = await import('@/context/style-options')
    const ctx = createContext(true, false, {
      rules: [
        { from: 'px', to: 'rpx', factor: 2 },
      ],
    })

    const styleOptions = resolveStyleOptionsFromContext(ctx)

    expect(styleOptions).toEqual(expect.objectContaining({
      cssPreflight: ctx.cssPreflight,
      cssPreflightRange: ctx.cssPreflightRange,
      cssChildCombinatorReplaceValue: ctx.cssChildCombinatorReplaceValue,
      cssSelectorReplacement: ctx.cssSelectorReplacement,
      rem2rpx: ctx.rem2rpx,
      px2rpx: ctx.px2rpx,
      unitsToPx: ctx.unitsToPx,
      unitConversion: ctx.unitConversion,
      cssOptions: expect.objectContaining({
        ...ctx.cssOptions,
        cssPreflight: ctx.cssPreflight,
        cssPreflightRange: ctx.cssPreflightRange,
        cssChildCombinatorReplaceValue: ctx.cssChildCombinatorReplaceValue,
        cssSelectorReplacement: ctx.cssSelectorReplacement,
        rem2rpx: ctx.rem2rpx,
        px2rpx: ctx.px2rpx,
        unitsToPx: ctx.unitsToPx,
        unitConversion: ctx.unitConversion,
        cssRemoveProperty: ctx.cssRemoveProperty,
        cssRemoveActivePseudoClass: ctx.cssRemoveActivePseudoClass,
        cssRemoveHoverPseudoClass: ctx.cssRemoveHoverPseudoClass,
        cssPresetEnv: ctx.cssPresetEnv,
        autoprefixer: ctx.autoprefixer,
        cssCalc: ctx.cssCalc,
      }),
      cssRemoveProperty: ctx.cssRemoveProperty,
      cssRemoveActivePseudoClass: ctx.cssRemoveActivePseudoClass,
      cssRemoveHoverPseudoClass: ctx.cssRemoveHoverPseudoClass,
      cssPresetEnv: ctx.cssPresetEnv,
      autoprefixer: ctx.autoprefixer,
      cssCalc: ctx.cssCalc,
      postcssOptions: ctx.postcssOptions,
      uniAppX: false,
      platform: ctx.platform,
    }))
    expect(styleOptions).not.toHaveProperty('escapeMap')
    expect(styleOptions).not.toHaveProperty('injectAdditionalCssVarScope')
    expect(styleOptions.majorVersion).toBeUndefined()
    expect(resolveStyleOptionsFromContext(ctx, 4).majorVersion).toBe(4)
  })

  it('prefers cssOptions over top-level CSS options', async () => {
    const { resolveStyleOptionsFromContext } = await import('@/context/style-options')
    const ctx = {
      ...createContext(),
      cssRemoveProperty: true,
      rem2rpx: false,
      cssOptions: {
        cssRemoveProperty: false,
        rem2rpx: true,
        tailwindcssV4GradientFallback: false,
      },
      tailwindcssV4GradientFallback: true,
    } as unknown as InternalUserDefinedOptions

    const styleOptions = resolveStyleOptionsFromContext(ctx)
    expect(styleOptions.cssRemoveProperty).toBe(false)
    expect(styleOptions.rem2rpx).toBe(true)
    expect(styleOptions.tailwindcssV4GradientFallback).toBe(false)
  })

  it('keeps top-level Tailwind CSS v4 gradient fallback compatibility', async () => {
    const { resolveStyleOptionsFromContext } = await import('@/context/style-options')
    const ctx = {
      ...createContext(),
      cssOptions: undefined,
      tailwindcssV4GradientFallback: true,
    } as unknown as InternalUserDefinedOptions

    expect(resolveStyleOptionsFromContext(ctx).tailwindcssV4GradientFallback).toBe(true)
  })

  it('does not synthesize cssOptions when compatibility fields are used directly', async () => {
    const { resolveStyleOptionsFromContext } = await import('@/context/style-options')
    const ctx = {
      ...createContext(),
      cssOptions: undefined,
      cssRemoveProperty: false,
      rem2rpx: true,
    } as unknown as InternalUserDefinedOptions

    const styleOptions = resolveStyleOptionsFromContext(ctx)

    expect(styleOptions.cssRemoveProperty).toBe(false)
    expect(styleOptions.rem2rpx).toBe(true)
    expect(styleOptions).not.toHaveProperty('cssOptions')
  })

  it('disables rem2rpx for uni-app x web output without changing native or generic web output', async () => {
    const { resolveStyleOptionsFromContext } = await import('@/context/style-options')
    const createRem2rpxContext = (
      appType: InternalUserDefinedOptions['appType'],
      target: 'web' | 'weapp',
    ) => ({
      ...createContext(),
      appType,
      cssOptions: undefined,
      generator: { target },
      rem2rpx: true,
    }) as unknown as InternalUserDefinedOptions

    const uniAppXWeb = resolveStyleOptionsFromContext(createRem2rpxContext('uni-app-x', 'web'), 4)
    const uniAppXNative = resolveStyleOptionsFromContext(createRem2rpxContext('uni-app-x', 'weapp'), 4)
    const genericWeb = resolveStyleOptionsFromContext(createRem2rpxContext('native', 'web'), 4)

    expect(uniAppXWeb.rem2rpx).toBe(false)
    expect(uniAppXWeb).not.toHaveProperty('cssOptions')
    expect(uniAppXNative.rem2rpx).toBe(true)
    expect(genericWeb.rem2rpx).toBe(true)
  })

  it('enables uni-app x native style options only for native app branches', async () => {
    const { resolveStyleOptionsFromContext } = await import('@/context/style-options')
    const originalUniUtsPlatform = process.env.UNI_UTS_PLATFORM
    const ctx = {
      ...createContext(),
      appType: 'uni-app-x',
      uniAppX: true,
    } as unknown as InternalUserDefinedOptions

    process.env.UNI_UTS_PLATFORM = 'app-android'
    try {
      const styleOptions = resolveStyleOptionsFromContext(ctx, 4)

      expect(styleOptions).toEqual(expect.objectContaining({
        platform: 'app-android',
        uniAppX: true,
      }))
    }
    finally {
      if (originalUniUtsPlatform === undefined) {
        delete process.env.UNI_UTS_PLATFORM
      }
      else {
        process.env.UNI_UTS_PLATFORM = originalUniUtsPlatform
      }
    }
  })
})

describe('resolveRuntimePackageReplacements', () => {
  it('uses default runtime package replacements when enabled', async () => {
    const { DEFAULT_RUNTIME_PACKAGE_REPLACEMENTS } = await import('@/constants')
    const { resolveRuntimePackageReplacements } = await import('@/context/runtime-package-replacements')

    expect(resolveRuntimePackageReplacements(true)).toEqual(DEFAULT_RUNTIME_PACKAGE_REPLACEMENTS)
  })

  it('normalizes custom runtime package replacements', async () => {
    const { resolveRuntimePackageReplacements } = await import('@/context/runtime-package-replacements')

    expect(resolveRuntimePackageReplacements({
      'tailwind-merge': '@scope/tw-merge',
      'class-variance-authority': '',
      '': '@scope/ignored',
    })).toEqual({
      'tailwind-merge': '@scope/tw-merge',
    })
  })

  it('returns undefined when runtime package replacements are empty', async () => {
    const { resolveRuntimePackageReplacements } = await import('@/context/runtime-package-replacements')

    expect(resolveRuntimePackageReplacements(false)).toBeUndefined()
    expect(resolveRuntimePackageReplacements(undefined)).toBeUndefined()
    expect(resolveRuntimePackageReplacements({})).toBeUndefined()
  })
})
