import { escape as escapeClassName } from '@weapp-tailwindcss/escape'
import { describe, expect, it } from 'vitest'
import { cn } from '@/index'

describe('cn', () => {
  it('组合条件值和嵌套数组', () => {
    expect(cn('foo', undefined, ['bar', { baz: true, nope: false }])).toBe('foo bar baz')
  })

  it('按 Tailwind 冲突规则保留最后一个类名', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('处理小程序 rpx 任意值和 modifier', () => {
    expect(cn('w-[10rpx]', 'w-[24rpx]')).toBe(escapeClassName('w-[24rpx]'))
    expect(cn('hover:p-2', 'hover:p-4')).toBe(escapeClassName('hover:p-4'))
  })

  it('把 text/border/bg/outline/ring 的 rpx 任意值当作长度，不与颜色互斥', () => {
    expect(cn('text-red', 'text-[80rpx]')).toBe(escapeClassName('text-red text-[80rpx]'))
    expect(cn('border-red-500', 'border-[10rpx]')).toBe(escapeClassName('border-red-500 border-[10rpx]'))
    expect(cn('bg-red-500', 'bg-[6rpx]')).toBe(escapeClassName('bg-red-500 bg-[6rpx]'))
    expect(cn('outline-red-500', 'outline-[4rpx]')).toBe(escapeClassName('outline-red-500 outline-[4rpx]'))
    expect(cn('ring-red-500', 'ring-[12rpx]')).toBe(escapeClassName('ring-red-500 ring-[12rpx]'))
  })

  it('同一前缀多次 rpx 只保留最后一次长度，颜色仍在', () => {
    expect(cn('text-red', 'text-[20rpx]', 'text-[5rpx]', 'text-[12rpx]')).toBe(
      escapeClassName('text-red text-[12rpx]'),
    )
    expect(cn('hover:text-[24rpx]', 'hover:text-[12rpx]')).toBe(
      escapeClassName('hover:text-[12rpx]'),
    )
  })

  it('保留非 Tailwind 类名', () => {
    expect(cn('custom-card', 'p-4', 'p-2')).toBe('custom-card p-2')
  })

  it('同一输入重复调用结果稳定', () => {
    const first = cn('p-4', 'p-2', 'hover:p-4')
    const second = cn('p-4', 'p-2', 'hover:p-4')
    expect(first).toBe(second)
    expect(first).toBe(escapeClassName('p-2 hover:p-4'))
  })
})
