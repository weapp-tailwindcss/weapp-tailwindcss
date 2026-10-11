import type { IStyleHandlerOptions } from '@/types'
import { describe, expect, it } from 'vitest'
import { createOptionsResolver } from '@/options-resolver'

function createBaseOptions(): IStyleHandlerOptions {
  return {
    isMainChunk: false,
    cssInjectPreflight: () => [],
    cssSelectorReplacement: {
      universal: 'view',
    },
    cssPreflightRange: 'all',
  }
}

describe('options resolver', () => {
  it('returns base options for missing and empty overrides', () => {
    const baseOptions = createBaseOptions()
    const resolver = createOptionsResolver(baseOptions)
    const emptyOverride = {}

    expect(resolver.resolve()).toBe(baseOptions)
    expect(resolver.resolve(emptyOverride)).toBe(baseOptions)
    expect(resolver.resolve(emptyOverride)).toBe(baseOptions)
  })

  it('reuses cached merged options for fresh simple override literals', () => {
    const resolver = createOptionsResolver(createBaseOptions())

    const first = resolver.resolve({
      isMainChunk: true,
      majorVersion: 4,
    })
    const second = resolver.resolve({
      isMainChunk: true,
      majorVersion: 4,
    })

    expect(first).toBe(second)
    expect(first).toMatchObject({
      isMainChunk: true,
      majorVersion: 4,
    })
  })

  it('reuses cached merged options for simple postcss boolean and string overrides', () => {
    const resolver = createOptionsResolver(createBaseOptions())

    const first = resolver.resolve({
      rem2rpx: true,
      px2rpx: false,
      unitsToPx: false,
      unitConversion: false,
      platform: 'weapp',
      cssRemoveActivePseudoClass: true,
      cssCalc: false,
      cssChildCombinatorReplaceValue: 'view',
      injectAdditionalCssVarScope: true,
      cssPreflight: false,
      autoprefixer: false,
    })
    const second = resolver.resolve({
      rem2rpx: true,
      px2rpx: false,
      unitsToPx: false,
      unitConversion: false,
      platform: 'weapp',
      cssRemoveActivePseudoClass: true,
      cssCalc: false,
      cssChildCombinatorReplaceValue: 'view',
      injectAdditionalCssVarScope: true,
      cssPreflight: false,
      autoprefixer: false,
    })

    expect(first).toBe(second)
    expect(second).toMatchObject({
      rem2rpx: true,
      px2rpx: false,
      unitsToPx: false,
      unitConversion: false,
      platform: 'weapp',
      cssRemoveActivePseudoClass: true,
      cssCalc: false,
      cssChildCombinatorReplaceValue: 'view',
      injectAdditionalCssVarScope: true,
      cssPreflight: false,
      autoprefixer: false,
    })
  })

  it('normalizes cssOptions and keeps top-level compatibility', () => {
    const resolver = createOptionsResolver({
      ...createBaseOptions(),
      cssRemoveProperty: true,
      tailwindcssV4GradientFallback: true,
    })

    expect(resolver.resolve().tailwindcssV4GradientFallback).toBe(true)
    const resolvedNested = resolver.resolve({
      cssOptions: {
        cssRemoveActivePseudoClass: false,
        cssRemoveProperty: false,
        rem2rpx: true,
        cssChildCombinatorReplaceValue: 'view',
        tailwindcssV4GradientFallback: false,
      },
    })
    expect(resolvedNested).toMatchObject({
      cssRemoveActivePseudoClass: false,
      cssRemoveProperty: false,
      rem2rpx: true,
      cssChildCombinatorReplaceValue: 'view',
      tailwindcssV4GradientFallback: false,
    })
    expect(resolvedNested.cssOptions).toMatchObject({
      cssRemoveActivePseudoClass: false,
      cssRemoveProperty: false,
      rem2rpx: true,
      cssChildCombinatorReplaceValue: 'view',
      tailwindcssV4GradientFallback: false,
    })
    expect(resolver.resolve({
      tailwindcssV4GradientFallback: false,
    }).tailwindcssV4GradientFallback).toBe(false)
    expect(resolver.resolve({
      cssOptions: {
        tailwindcssV4GradientFallback: true,
      },
      tailwindcssV4GradientFallback: false,
    }).tailwindcssV4GradientFallback).toBe(true)
  })

  it('lets top-level compatibility overrides replace base cssOptions', () => {
    const resolver = createOptionsResolver({
      ...createBaseOptions(),
      cssOptions: {
        cssRemoveProperty: true,
        tailwindcssV4GradientFallback: true,
      },
    })

    const resolved = resolver.resolve({
      cssRemoveProperty: false,
      tailwindcssV4GradientFallback: false,
    })

    expect(resolved.cssRemoveProperty).toBe(false)
    expect(resolved.cssOptions?.cssRemoveProperty).toBe(false)
    expect(resolved.tailwindcssV4GradientFallback).toBe(false)
    expect(resolved.cssOptions?.tailwindcssV4GradientFallback).toBe(false)
  })

  it('keeps nested override references reactive to in-place mutations', () => {
    const resolver = createOptionsResolver(createBaseOptions())
    const override = {
      postcssOptions: {
        options: {
          map: false,
        },
      },
    } satisfies Partial<IStyleHandlerOptions>

    const first = resolver.resolve(override)
    override.postcssOptions.options.extra = 'value'
    const second = resolver.resolve(override)

    expect(first).not.toBe(second)
    expect(second.postcssOptions?.options).toMatchObject({
      map: false,
      extra: 'value',
    })
  })

  it('falls back to fingerprint cache when simple override keys use complex values', () => {
    const resolver = createOptionsResolver(createBaseOptions())
    const complexOverrides: Array<Partial<IStyleHandlerOptions>> = [
      { isMainChunk: 'true' as any },
      { majorVersion: '4' as any },
      { cssRemoveProperty: 'true' as any },
      { cssRemoveActivePseudoClass: 'true' as any },
      { cssRemoveHoverPseudoClass: 'true' as any },
      { uniAppX: 'true' as any },
      { cssPreflightRange: true as any },
      { injectAdditionalCssVarScope: 'true' as any },
      { rem2rpx: { rootValue: 16 } as any },
      { px2rpx: { unitPrecision: 5 } as any },
      { unitsToPx: { to: 'px' } as any },
      { unitConversion: { rules: [{ from: 'px', to: 'rpx', factor: 2 }] } },
      { platform: true as any },
      { cssCalc: { includeCustomProperties: ['--tw-space'] } },
      { cssChildCombinatorReplaceValue: ['view'] },
      { cssPreflight: { boxSizing: 'border-box' } },
      { autoprefixer: { add: true } as any },
      { postcssOptions: { plugins: [] } },
    ]

    for (const override of complexOverrides) {
      const first = resolver.resolve(override)
      const second = resolver.resolve({ ...override })
      expect(second).toBe(first)
    }
  })
})
