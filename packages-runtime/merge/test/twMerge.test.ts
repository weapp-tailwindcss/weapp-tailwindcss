import { escape as escapeClassName } from '@weapp-tailwindcss/escape'
import { describe, expect, it } from 'vitest'
import {
  create,
  extendTailwindMerge,
  tailwindMergeVersion,
  twMerge,
} from '@/index'

describe('merge behavior reference', () => {
  const merge = twMerge
  const esc = (value: string) => escapeClassName(value)

  it('honours last conflicting class wins', () => {
    expect(merge('p-5 p-2 p-4')).toBe('p-4')
    expect(merge('w-[10rpx]', 'w-[24rpx]')).toBe(esc('w-[24rpx]'))
  })

  it('keeps simple class lists unchanged', () => {
    expect(merge('w-full rounded-full bg-success p-1')).toBe('w-full rounded-full bg-success p-1')
  })

  it('allows refinements without conflicts', () => {
    expect(merge('p-3 px-5')).toBe('p-3 px-5')
    expect(merge('inset-x-4 right-4')).toBe('inset-x-4 right-4')
    expect(merge('p-[12rpx]', 'px-5')).toBe(esc('p-[12rpx] px-5'))
    expect(merge('inset-x-[12rpx]', 'right-[6rpx]')).toBe(esc('inset-x-[12rpx] right-[6rpx]'))
  })

  it('resolves non-trivial conflicts', () => {
    expect(merge('inset-x-px -inset-1')).toBe('-inset-1')
    expect(merge('bottom-auto inset-y-6')).toBe('inset-y-6')
    expect(merge('inline block')).toBe('block')
    expect(merge('inset-x-[12rpx]', '-inset-[1rpx]')).toBe(esc('-inset-[1rpx]'))
    expect(merge('bottom-auto inset-y-[24rpx]')).toBe(esc('inset-y-[24rpx]'))
  })

  it('supports modifiers and stacked modifiers', () => {
    expect(merge('p-2 hover:p-4')).toBe(esc('p-2 hover:p-4'))
    expect(merge('hover:p-2 hover:p-4')).toBe(esc('hover:p-4'))
    expect(merge('hover:focus:p-2 focus:hover:p-4')).toBe(esc('focus:hover:p-4'))
    expect(merge('hover:w-[10rpx]', 'hover:w-[16rpx]')).toBe(esc('hover:w-[16rpx]'))
    expect(merge('hover:focus:w-[12rpx]', 'focus:hover:w-[16rpx]')).toBe(esc('focus:hover:w-[16rpx]'))
  })

  it('supports arbitrary values including mini-program units', () => {
    expect(merge('bg-black bg-(--my-color) bg-[color:var(--mystery-var)]')).toBe(
      esc('bg-[color:var(--mystery-var)]'),
    )
    expect(merge('grid-cols-[1fr,auto] grid-cols-2')).toBe('grid-cols-2')
    expect(merge('text-[length:32rpx]', 'text-[length:24rpx]')).toBe(esc('text-[length:24rpx]'))
  })

  it('supports arbitrary properties', () => {
    expect(merge('[mask-type:luminance] [mask-type:alpha]')).toBe(esc('[mask-type:alpha]'))
    expect(merge('[--scroll-offset:56px] lg:[--scroll-offset:44px]')).toBe(
      esc('[--scroll-offset:56px] lg:[--scroll-offset:44px]'),
    )
    expect(merge('[padding:20rpx]', '[padding:24rpx]')).toBe(esc('[padding:24rpx]'))
    expect(merge('[padding:20rpx]', 'p-8')).toBe(esc('[padding:20rpx] p-8'))
  })

  it('supports arbitrary variants', () => {
    expect(merge('[&:nth-child(3)]:py-0 [&:nth-child(3)]:py-4')).toBe(esc('[&:nth-child(3)]:py-4'))
    expect(
      merge('dark:hover:[&:nth-child(3)]:py-0 hover:dark:[&:nth-child(3)]:py-4'),
    ).toBe(esc('hover:dark:[&:nth-child(3)]:py-4'))
    expect(merge('[&_view]:p-[12rpx]', '[&_view]:p-[16rpx]')).toBe(esc('[&_view]:p-[16rpx]'))
    expect(merge('[&_view]:p-[12rpx]', 'focus:[&_view]:p-4')).toBe(
      esc('[&_view]:p-[12rpx] focus:[&_view]:p-4'),
    )
  })

  it('supports important modifiers', () => {
    expect(merge('p-3! p-4! p-5')).toBe(esc('p-4! p-5'))
    expect(merge('right-2! -inset-x-1!')).toBe(esc('-inset-x-1!'))
    expect(merge('w-[12rpx]!', 'w-[24rpx]!', 'w-[10rpx]')).toBe(esc('w-[24rpx]! w-[10rpx]'))
  })

  it('supports postfix modifiers', () => {
    expect(merge('text-sm leading-6 text-lg/7')).toBe(esc('text-lg/7'))
    expect(merge('text-sm leading-6 text-[length:28rpx]/7')).toBe(esc('text-[length:28rpx]/7'))
  })

  it('preserves non-tailwind classes', () => {
    expect(merge('p-5 p-2 my-non-tailwind-class p-4')).toBe('my-non-tailwind-class p-4')
    expect(merge('p-[12rpx]', 'mina-card', 'p-[16rpx]')).toBe(`mina-card ${esc('p-[16rpx]')}`)
  })

  it('supports custom colors out of the box', () => {
    expect(merge('text-red text-secret-sauce')).toBe('text-secret-sauce')
    expect(merge('text-[#123456]', 'text-[#654321]')).toBe(esc('text-[#654321]'))
  })

  it('keeps arbitrary rpx font sizes alongside custom text colors', () => {
    expect(merge('text-[28rpx] text-surface-700')).toBe(esc('text-[28rpx] text-surface-700'))
  })

  it('treats numeric text utilities as conflicting with custom text colors', () => {
    expect(merge('text-32 text-surface-700')).toBe('text-surface-700')
  })

  it('supports numeric font sizes via extended class groups', () => {
    const customMerge = extendTailwindMerge({
      extend: {
        classGroups: {
          'font-size': [{ text: ['20', '22', '24', '26', '28', '30', '32', '36', '40', '48', '52'] }],
        },
      },
    })

    expect(customMerge('text-32 text-surface-700')).toBe('text-32 text-surface-700')
  })

  it('supports multiple arguments', () => {
    expect(merge('some-class', 'another-class yet-another-class', 'so-many-classes')).toBe(
      'some-class another-class yet-another-class so-many-classes',
    )
    expect(merge('some-class', 'w-[12rpx]', 'w-[24rpx]')).toBe(`some-class ${esc('w-[24rpx]')}`)
  })

  it('supports conditional classes', () => {
    const disabled = Boolean(0)
    const enabled = Boolean(1)
    expect(merge('some-class', undefined, null, false, 0)).toBe('some-class')
    expect(
      merge('my-class', disabled ? 'not-this' : undefined, null, enabled ? 'but-this' : undefined),
    ).toBe('my-class but-this')
    expect(
      merge('foo', disabled ? 'w-[12rpx]' : undefined, null, enabled ? 'w-[16rpx]' : undefined),
    ).toBe(`foo ${esc('w-[16rpx]')}`)
  })

  it('supports arrays and nested arrays', () => {
    expect(merge('some-class', [undefined, ['another-class', false]], ['third-class'])).toBe(
      'some-class another-class third-class',
    )
    expect(merge('hi', true && ['hello', ['hey', false]], false && ['bye'])).toBe('hi hello hey')
    expect(merge('hi', ['w-[12rpx]', ['w-[24rpx]']])).toBe(`hi ${esc('w-[24rpx]')}`)
  })

  it('treats rpx arbitrary values as lengths for color-like utilities', () => {
    expect(merge('text-red', 'text-[80rpx]')).toBe(esc('text-red text-[80rpx]'))
    expect(merge('border-red-500', 'border-[10rpx]')).toBe(esc('border-red-500 border-[10rpx]'))
    expect(merge('bg-red-500', 'bg-[6rpx]')).toBe(esc('bg-red-500 bg-[6rpx]'))
    expect(merge('outline-red-500', 'outline-[4rpx]')).toBe(esc('outline-red-500 outline-[4rpx]'))
    expect(merge('ring-red-500', 'ring-[12rpx]')).toBe(esc('ring-red-500 ring-[12rpx]'))
  })

  it('handles multiple rpx overrides per prefix', () => {
    expect(merge('text-red', 'text-[20rpx]', 'text-[5rpx]', 'text-[12rpx]')).toBe(
      esc('text-red text-[12rpx]'),
    )
    expect(merge('border-[2rpx]', 'border-red-500', 'border-[10rpx]', 'border-[1rpx]')).toBe(
      esc('border-red-500 border-[1rpx]'),
    )
    expect(merge('bg-[2rpx]', 'bg-[6rpx]', 'bg-red-500', 'bg-[4rpx]')).toBe(esc('bg-red-500 bg-[4rpx]'))
    expect(merge('outline-[3rpx]', 'outline-[1rpx]', 'outline-[8rpx]')).toBe(esc('outline-[8rpx]'))
    expect(merge('ring-[2rpx]', 'ring-[4rpx]', 'ring-[1rpx]', 'ring-red-500')).toBe(
      esc('ring-[1rpx] ring-red-500'),
    )
  })

  it('supports numeric-leading variants like 2xl: in miniprogram', () => {
    // 场景 1: 转义类名输入（小程序运行时常态）
    expect(merge('_2xl_cp-2 _2xl_cp-4')).toBe('_2xl_cp-4')

    // 场景 2: 原始类名输入且数字变体不在首位
    expect(merge('p-1 2xl:p-2 2xl:p-4')).toBe(`p-1 ${esc('2xl:p-4')}`)
  })

  it('supports whitespace-separated numeric-leading variants', () => {
    expect(merge('_2xl_cp-2\t_2xl_cp-4')).toBe('_2xl_cp-4')
    expect(merge('_2xl_cp-2\n_2xl_cp-4')).toBe('_2xl_cp-4')
  })
})

describe('runtime metadata', () => {
  it('exposes tailwind-merge v3 as the current runtime', () => {
    expect(tailwindMergeVersion).toBe(3)
  })

  it('supports opting out of escaping through the factory', () => {
    const { twMerge: passthrough } = create({ escape: false, unescape: false })

    expect(passthrough('text-_b_hececec_B')).toBe('text-_b_hececec_B')
  })
})
