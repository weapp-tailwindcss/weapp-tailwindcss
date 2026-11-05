import { describe, expect, it } from 'vitest'
import {
  cn,
  cnBase,
  createTV,
  create as createVariants,
  defaultConfig,
  tv,
} from '@/index'

describe('variants runtime', () => {
  it('escapes tv output by default', () => {
    const button = tv({
      base: 'text-[#ececec]',
      variants: {
        tone: {
          accent: 'bg-[#ECECEC]',
        },
      },
    })

    expect(button()).toBe('text-_b_hececec_B')
    expect(button({ tone: 'accent' })).toBe('text-_b_hececec_B bg-_b_hECECEC_B')
  })

  it('deduplicates escaped classes', () => {
    const button = tv({
      base: 'text-_b_hececec_B',
      variants: {
        tone: {
          accent: 'text-[#ececec]',
        },
      },
    })

    expect(button({ tone: 'accent' })).toBe('text-_b_hececec_B')
  })

  it('escapes rpx units and color literals inside tv output', () => {
    const stack = tv({
      base: 'text-[24rpx] bg-[#0f0]',
      variants: {
        tone: {
          danger: 'text-[#FF0000] text-[32rpx]',
        },
      },
    })

    const baseOutput = stack()?.split(' ')
    expect(new Set(baseOutput)).toEqual(new Set(['text-_b24rpx_B', 'bg-_b_h0f0_B']))

    const variantOutput = stack({ tone: 'danger' })?.split(' ')
    expect(new Set(variantOutput)).toEqual(new Set([
      'text-_b32rpx_B',
      'bg-_b_h0f0_B',
      'text-_b_hFF0000_B',
    ]))
  })

  it('supports custom transformers through create', () => {
    const { tv: rawTv } = createVariants({ escape: false })
    const badge = rawTv({ base: 'text-[#ececec]' })

    expect(badge()).toBe('text-[#ececec]')
  })

  it('returns base classes from create().tv for simple class lists', () => {
    const { tv: runtimeTv } = createVariants()
    const test = runtimeTv({
      base: 'w-full rounded-full bg-success p-1',
    })

    expect(test()).toBe('w-full rounded-full bg-success p-1')
  })

  it('returns simple class lists from cn unchanged', () => {
    const aggregate = cn('w-full rounded-full bg-success p-1')

    expect(aggregate()).toBe('w-full rounded-full bg-success p-1')
  })

  it('respects twMergeConfig for numeric text sizes in cn', () => {
    const aggregate = cn('text-32', 'text-surface-700')

    expect(
      aggregate({
        twMergeConfig: {
          extend: {
            classGroups: {
              'font-size': [{ text: ['32'] }],
            },
          },
        },
      }),
    ).toBe('text-32 text-surface-700')
  })

  it('respects twMergeConfig for numeric text sizes in tv', () => {
    const badge = tv(
      { base: 'text-32 text-surface-700' },
      {
        twMergeConfig: {
          extend: {
            classGroups: {
              'font-size': [{ text: ['32'] }],
            },
          },
        },
      },
    )

    expect(badge()).toBe('text-32 text-surface-700')
  })

  it('supports default twMergeConfig via create', () => {
    const runtime = createVariants({
      twMergeConfig: {
        extend: {
          classGroups: {
            'font-size': [{ text: ['32'] }],
          },
        },
      },
    })

    expect(runtime.cn('text-32', 'text-surface-700')()).toBe('text-32 text-surface-700')

    const badge = runtime.tv({ base: 'text-32 text-surface-700' })
    expect(badge()).toBe('text-32 text-surface-700')
  })

  it('accepts boolean escape/unescape options', () => {
    const { tv: rawTv } = createVariants({ escape: true, unescape: true })
    const badge = rawTv({ base: 'text-[#ececec]' })

    expect(badge()).toBe('text-_b_hececec_B')
  })

  it('respects disabled escape/unescape options in runtime factory', () => {
    const runtime = createVariants({ escape: false, unescape: false })
    const badge = runtime.tv({
      base: 'text-[#ECECEC]',
      variants: {
        tone: {
          accent: 'text-[#101010]',
        },
      },
    })

    // Should bypass escape/unescape while still merging conflicting classes.
    expect(badge({ tone: 'accent' })).toBe('text-[#101010]')

    const aggregate = runtime.cn('text-[#ECECEC]', 'text-[#101010]')
    expect(aggregate()).toBe('text-[#101010]')
    expect(aggregate({ twMerge: false })).toBe('text-[#ECECEC] text-[#101010]')

    const mergedTv = runtime.tv({
      base: 'text-[#101010]',
      variants: {
        tone: {
          accent: 'text-[#ECECEC]',
        },
      },
    })
    expect(mergedTv({ tone: 'accent' })).toBe('text-[#ECECEC]')
  })

  it('wraps cn aggregation with merge + escaping', () => {
    const aggregate = cn('text-[#ececec]', 'text-[#ECECEC]')

    expect(aggregate()).toBe('text-_b_hECECEC_B')
    expect(aggregate({ twMerge: false })).toBe('text-_b_hececec_B text-_b_hECECEC_B')
  })

  it('escapes cnBase results', () => {
    expect(cnBase('text-[#ececec]', 'bg-[#101010]')).toBe('text-_b_hececec_B bg-_b_h101010_B')
  })

  it('re-exports default config unchanged', () => {
    expect(defaultConfig.twMerge).toBe(true)
  })

  it('creates isolated tv instances via createTV', () => {
    const makeTv = createTV({
      twMerge: true,
    })
    const button = makeTv({
      base: 'text-[#ececec]',
    })

    expect(button()).toBe('text-_b_hececec_B')
  })

  it('returns empty strings from empty cn helpers', () => {
    const aggregate = cn()
    expect(aggregate()).toBe('')
    expect(cnBase()).toBe('')
  })

  it('aggregates rpx units and hex colors via cn helpers', () => {
    const aggregate = cn('text-[16rpx]', 'bg-[#ff0000]', 'text-[#00FF00]')

    expect(aggregate()).toBe('text-_b16rpx_B bg-_b_hff0000_B text-_b_h00FF00_B')
    expect(cnBase('border-[2rpx]', 'text-[#123456]')).toBe('border-_b2rpx_B text-_b_h123456_B')
  })

  it('preserves tailwind-variants metadata when wrapping components', () => {
    const badge = tv({
      base: 'text-[#ececec]',
      variants: {
        size: {
          sm: 'text-sm',
        },
      },
      defaultVariants: {
        size: 'sm',
      },
    })

    expect(badge.variantKeys).toEqual(['size'])
    expect(badge.defaultVariants).toEqual({ size: 'sm' })
  })

  it('wraps slot functions so per-slot output is escaped and merged', () => {
    const alert = tv({
      slots: {
        base: 'text-[#101010]',
        icon: 'text-[#202020]',
      },
      variants: {
        tone: {
          accent: {
            base: 'text-[#ECECEC]',
            icon: 'text-[#ECECEC]',
          },
        },
      },
    })

    const slots = alert({ tone: 'accent' })
    expect(typeof slots.base).toBe('function')
    expect(slots.base()).toBe('text-_b_hECECEC_B')
    expect(slots.icon()).toBe('text-_b_hECECEC_B')
    expect(slots.icon({ class: 'text-[#303030]' })).toBe('text-_b_h303030_B')
  })

  it('merges config overrides from createTV invocations', () => {
    const makeTv = createTV({ twMerge: false })
    const badge = makeTv({
      base: 'text-[#101010]',
      variants: {
        tone: {
          accent: 'text-[#ECECEC]',
        },
      },
    })

    expect(badge({ tone: 'accent' })).toBe('text-_b_h101010_B text-_b_hECECEC_B')

    const mergedBadge = makeTv(
      {
        base: 'text-[#101010]',
        variants: {
          tone: {
            accent: 'text-[#ECECEC]',
          },
        },
      },
      { twMerge: true },
    )
    expect(mergedBadge({ tone: 'accent' })).toBe('text-_b_hECECEC_B')
  })
})
