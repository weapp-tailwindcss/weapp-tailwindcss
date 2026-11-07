import { afterEach, describe, expect, it, vi } from 'vitest'
import { waitFor } from '../scripts/wait-for.mjs'

afterEach(() => {
  vi.useRealTimers()
})

describe('基准轮询的观察与等待预算', () => {
  it.each([0, -1])('预算 %ims 时仍观察一次已经完成的状态', async (timeoutMs) => {
    vi.useFakeTimers()
    const check = vi.fn(async () => true)
    expect(await waitFor(check, timeoutMs)).toBe(true)
    expect(check).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('零预算的未完成状态不额外等待或重试', async () => {
    vi.useFakeTimers()
    const check = vi.fn(async () => false)
    expect(await waitFor(check, 0)).toBe(false)
    expect(check).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('零预算仍传播当前生产者状态异常', async () => {
    const failure = new Error('生产者已经退出')
    await expect(waitFor(() => {
      throw failure
    }, 0)).rejects.toBe(failure)
  })

  it('首次探针耗尽预算后不追加等待', async () => {
    vi.useFakeTimers()
    const check = vi.fn(async () => {
      await vi.advanceTimersByTimeAsync(100)
      return false
    })
    expect(await waitFor(check, 100, 10)).toBe(false)
    expect(check).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('只在单调时钟预算内重试，不受系统日期跳变影响', async () => {
    vi.useFakeTimers()
    const check = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const result = waitFor(check, 100, 10)
    vi.setSystemTime(Date.now() + 1000000)
    await vi.advanceTimersByTimeAsync(10)
    expect(await result).toBe(true)
    expect(check).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('最后一次等待不超出剩余预算，过期后不追加探针', async () => {
    vi.useFakeTimers()
    const check = vi.fn(async () => false)
    const result = waitFor(check, 15, 10)
    await vi.advanceTimersByTimeAsync(15)
    expect(await result).toBe(false)
    expect(check).toHaveBeenCalledTimes(2)
    expect(performance.now()).toBe(15)
    expect(vi.getTimerCount()).toBe(0)
  })
})
