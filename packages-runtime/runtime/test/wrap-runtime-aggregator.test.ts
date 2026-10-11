import { describe, expect, it, vi } from 'vitest'
import { wrapRuntimeAggregator } from '@/create-runtime'

describe('wrapRuntimeAggregator', () => {
  it('空输入直接返回空串且不进引擎', () => {
    const inner = vi.fn((value: string) => value)
    const escape = vi.fn((value: string) => value)
    const unescape = vi.fn((value: string) => value)
    const run = wrapRuntimeAggregator(inner, { escape, unescape })

    expect(run('')).toBe('')
    expect(run(false, undefined, null)).toBe('')
    expect(inner).not.toHaveBeenCalled()
  })

  it('同一输入第二次命中缓存，不再调用引擎', () => {
    const inner = vi.fn((value: string) => value)
    const run = wrapRuntimeAggregator(inner, {
      escape: value => value,
      unescape: value => value,
    })

    expect(run('p-4', 'p-2')).toBe('p-4 p-2')
    expect(run('p-4', 'p-2')).toBe('p-4 p-2')
    expect(inner).toHaveBeenCalledTimes(1)
    expect(inner).toHaveBeenCalledWith('p-4 p-2')
  })

  it('自定义 escape 不能根据默认字符表跳过', () => {
    const escape = vi.fn((value: string) => `esc:${value}`)
    const run = wrapRuntimeAggregator(value => value, {
      escape,
      unescape: value => value,
    })

    expect(run('flex items-center')).toBe('esc:flex esc:items-center')
    expect(escape.mock.calls.map(([value]) => value)).toEqual(['flex', 'items-center'])
  })

  it('含 modifier 或任意值时仍 escape', () => {
    const escape = vi.fn((value: string) => `esc:${value}`)
    const run = wrapRuntimeAggregator(value => value, {
      escape,
      unescape: value => value,
    })

    expect(run('hover:p-2')).toBe('esc:hover:p-2')
    expect(escape).toHaveBeenCalledWith('hover:p-2')
    expect(run('w-[10rpx]')).toBe('esc:w-[10rpx]')
  })

  it('自定义 unescape 对普通和已转义输入都执行', () => {
    const unescape = vi.fn((value: string) => value.replaceAll('_c', ':'))
    const inner = vi.fn((value: string) => value)
    const run = wrapRuntimeAggregator(inner, {
      escape: value => value,
      unescape,
    })

    run('flex')
    expect(unescape).toHaveBeenCalledWith('flex')

    run('hover_cp-2')
    expect(unescape).toHaveBeenCalledWith('hover_cp-2')
    expect(inner).toHaveBeenCalledWith('hover:p-2')
  })
})
