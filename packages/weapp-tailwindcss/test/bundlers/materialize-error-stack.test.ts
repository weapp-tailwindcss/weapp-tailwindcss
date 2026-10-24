import { describe, expect, it, vi } from 'vitest'
import { materializeErrorStack } from '@/bundlers/shared/materialize-error-stack'

describe('关闭边界的错误诊断', () => {
  it('cause 访问失败仍固定聚合错误中的其余诊断，并保留原始错误', () => {
    const readStack = vi.fn(() => 'nested stack')
    const nested = Object.defineProperty(new Error('nested'), 'stack', { get: readStack })
    const failure = new AggregateError([nested], 'cleanup')
    Object.defineProperty(failure, 'cause', {
      get() {
        throw new Error('custom cause getter')
      },
    })

    expect(() => materializeErrorStack(failure)).not.toThrow()
    expect(readStack).toHaveBeenCalledTimes(1)
    expect(failure.errors[0]).toBe(nested)
  })

  it('stack 访问失败仍处理 cause，循环关系只访问一次', () => {
    const failure = new Error('cleanup')
    const readStack = vi.fn(() => {
      throw new Error('custom stack getter')
    })
    const readCauseStack = vi.fn(() => 'cause stack')
    const cause = Object.defineProperty(new Error('cause', { cause: failure }), 'stack', { get: readCauseStack })
    Object.defineProperties(failure, {
      stack: { get: readStack },
      cause: { value: cause },
    })

    expect(() => materializeErrorStack(failure)).not.toThrow()
    expect(readStack).toHaveBeenCalledTimes(1)
    expect(readCauseStack).toHaveBeenCalledTimes(1)
  })
})
