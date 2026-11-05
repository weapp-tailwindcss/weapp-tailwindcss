import type { TWMConfig } from '@/index'
import { escape as escapeClassName } from '@weapp-tailwindcss/escape'
import { describe, expect, it, vi } from 'vitest'
import { cn, cnBase, create, createTV, tv } from '@/index'

type MergeFn = (value: string) => string

const entrypoints: Array<[string, (merge: MergeFn) => string]> = [
  ['cn', merge => cn('p-2', 'p-4')({ twMerge: merge })],
  ['tv', merge => tv({ base: 'p-2 p-4' }, { twMerge: merge })()],
  ['create', merge => create({ twMerge: merge }).tv({ base: 'p-2 p-4' })()],
  ['create options', merge => create({ escape: false }, { twMerge: merge }).cn('p-2', 'p-4')()],
  ['createTV', merge => createTV({ twMerge: merge })({ base: 'p-2 p-4' })()],
]

describe('tailwind-variants v4 兼容', () => {
  it.each(entrypoints)('%s 使用自定义 merger，不追加默认冲突合并', (_name, run) => {
    const merge = vi.fn((value: string) => value)

    expect(run(merge)).toBe('p-2 p-4')
    expect(merge).toHaveBeenCalledWith('p-2 p-4')
  })

  it('单个类名也经过自定义 merger', () => {
    expect(cn('p-2')({ twMerge: () => 'p-4' })).toBe('p-4')
    expect(tv({ base: 'p-2' }, { twMerge: () => 'p-4' })()).toBe('p-4')
  })

  it('在自定义 merger 周围执行 unescape、rpx prepare/restore 和 escape', () => {
    const merge = vi.fn((value: string) => value)
    const input = 'hover:p-2 text-[24rpx] text-red'

    expect(cn(escapeClassName(input))({ twMerge: merge })).toBe(escapeClassName(input))
    expect(merge).toHaveBeenCalledWith('hover:p-2 text-[length:24rpx] text-red')
  })

  it('相同 merger 在不同 runtime 之间保留独立的转义选项', () => {
    const merge = (value: string) => value
    const escaped = create({ twMerge: merge })
    const raw = create({ escape: false, unescape: false }, { twMerge: merge })
    const input = 'hover:p-2 hover:p-4'

    expect(escaped.cn(input)()).toBe(escapeClassName(input))
    expect(raw.cn(input)()).toBe(input)
    expect(escaped.cn(input)()).toBe(escapeClassName(input))
  })

  it('保留空字符串返回值，不对空输入调用 merger', () => {
    const merge = vi.fn((value: string) => value)

    expect(cn()({ twMerge: merge })).toBe('')
    expect(cn(false, null, undefined)({ twMerge: merge })).toBe('')
    expect(cnBase()).toBe('')
    expect(tv({}, { twMerge: merge })()).toBe('')
    expect(tv({ slots: { root: '' } }, { twMerge: merge })().root()).toBe('')
    expect(merge).not.toHaveBeenCalled()
  })

  it('cnBase 始终只聚合和转义', () => {
    const runtime = create({ twMerge: () => 'p-8' })

    expect(runtime.cnBase('hover:p-2', 'hover:p-4')).toBe(escapeClassName('hover:p-2 hover:p-4'))
  })

  it('自定义 merger 优先于 twMergeConfig', () => {
    const config: TWMConfig = {
      twMerge: value => value,
      twMergeConfig: {
        extend: {
          classGroups: {
            'font-size': [{ text: ['32'] }],
          },
        },
      },
    }

    expect(cn('text-32', 'text-48', 'p-2', 'p-4')(config)).toBe('text-32 text-48 p-2 p-4')
  })

  it('调用配置覆盖 factory 和 runtime 的 merger，并支持重新启用或禁用默认合并', () => {
    const runtime = create({ twMerge: () => 'runtime' })
    const factory = runtime.createTV({ twMerge: () => 'factory' })
    const options = { base: 'p-2 p-4' }

    expect(runtime.tv(options)()).toBe('runtime')
    expect(factory(options)()).toBe('factory')
    expect(factory(options, { twMerge: () => 'call' })()).toBe('call')
    expect(factory(options, { twMerge: true })()).toBe('p-4')
    expect(factory(options, { twMerge: false })()).toBe('p-2 p-4')
    expect(runtime.cn('p-2', 'p-4')({ twMerge: true })).toBe('p-4')
    expect(runtime.cn('p-2', 'p-4')({ twMerge: false })).toBe('p-2 p-4')
  })

  it('对象 slot 与 slot 调用参数通过相同的自定义 merger 流程', () => {
    const merge = vi.fn((value: string) => value)
    const recipe = tv({
      slots: {
        root: 'hover:p-2',
        icon: 'text-[24rpx]',
      },
      variants: {
        size: {
          lg: { root: 'hover:p-4', icon: 'text-[32rpx]' },
        },
      },
    }, { twMerge: merge })
    const slots = recipe({ size: 'lg' })

    expect(slots.root()).toBe(escapeClassName('hover:p-2 hover:p-4'))
    expect(slots.icon({ class: 'text-red' })).toBe(escapeClassName('text-[24rpx] text-[32rpx] text-red'))
    expect(merge).toHaveBeenCalledWith('hover:p-2 hover:p-4')
    expect(merge).toHaveBeenCalledWith('text-[length:24rpx] text-[length:32rpx] text-red')
    expect(recipe.variantKeys).toEqual(['size'])
  })
})
