import { describe, expect, it, vi } from 'vitest'
import { wrapRuntimeAggregator } from '@/create-runtime'
import { resolveTransformers } from '@/transformers'

describe('运行时转换与缓存契约', () => {
  it('自定义映射不能被默认反转义探针跳过', () => {
    const aggregate = wrapRuntimeAggregator(value => value, resolveTransformers({
      escape: false,
      unescape: { map: { '@': 'AT' } },
    }))
    expect(aggregate('AT')).toBe('@')
  })

  it('未知 transformer 必须运行，并保持 prepare/restore 顺序', () => {
    const steps: string[] = []
    const aggregate = wrapRuntimeAggregator(
      value => { steps.push('merge'); return value },
      {
        unescape: value => { steps.push('unescape'); return value.toLowerCase() },
        escape: value => { steps.push('escape'); return value.toUpperCase() },
      },
      value => { steps.push('prepare'); return { value, metadata: 'context' } },
      (value, metadata) => { steps.push('restore'); expect(metadata).toBe('context'); return value },
    )
    expect(aggregate('Abc')).toBe('ABC')
    expect(steps).toEqual(['unescape', 'prepare', 'merge', 'restore', 'escape'])
    expect(aggregate('Abc')).toBe('ABC')
    expect(steps).toHaveLength(5)
  })

  it('命中更新 LRU 顺序并按 256 条上限淘汰冷项', () => {
    const merge = vi.fn((value: string) => value)
    const aggregate = wrapRuntimeAggregator(merge, resolveTransformers())
    aggregate('hot')
    for (let index = 0; index < 255; index++) {
      aggregate(`cold-${index}`)
    }
    aggregate('hot')
    aggregate('overflow')
    aggregate('hot')
    expect(merge).toHaveBeenCalledTimes(257)
    aggregate('cold-0')
    expect(merge).toHaveBeenCalledTimes(258)
  })

  it('实例不共享结果，失败调用也不进入缓存', () => {
    let fail = true
    const aggregate = wrapRuntimeAggregator((value) => {
      if (fail) {
        fail = false
        throw new Error('retry')
      }
      return value
    }, resolveTransformers())
    expect(() => aggregate('foo')).toThrow('retry')
    expect(aggregate('foo')).toBe('foo')
    const second = wrapRuntimeAggregator(() => 'bar', resolveTransformers())
    expect(second('foo')).toBe('bar')
  })
})
