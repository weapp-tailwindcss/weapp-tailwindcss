import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NATIVE_CAPTURE_DRAIN_TIMEOUT } from './react-native/capture-budget'
import { createNativeStartupOwner, NATIVE_STARTUP_TIMEOUT } from './react-native/startup-owner'

type Owner = ReturnType<typeof createNativeStartupOwner>
const owners: Owner[] = []

function owner(options: Parameters<typeof createNativeStartupOwner>[0] = {}) {
  const result = createNativeStartupOwner(options)
  owners.push(result)
  return result
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
})

afterEach(() => {
  owners.splice(0).forEach(current => current.release())
  vi.useRealTimers()
})

describe('React Native startup owner', () => {
  it('全部阶段复用绝对三十分钟期限与同一信号，成功核验后才关闭 timer', async () => {
    const current = owner()
    const firstSignal = await current.run('environment', async signal => signal)
    await vi.advanceTimersByTimeAsync(60_000)
    const nextSignal = await current.run('static', async signal => signal)
    expect(current.deadline).toBe(NATIVE_STARTUP_TIMEOUT)
    expect(nextSignal).toBe(firstSignal)
    expect(current.signal).toBe(firstSignal)
    expect(vi.getTimerCount()).toBe(1)
    current.complete()
    current.complete()
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(NATIVE_STARTUP_TIMEOUT)
    expect(firstSignal.aborted).toBe(false)
    await expect(current.run('late', async () => undefined)).rejects.toThrow('already completed')
    await expect(current.drain()).resolves.toBeUndefined()
  })

  it('继承的绝对期限不因准备消耗或后续阶段而重置', async () => {
    const current = owner({ deadline: 100 })
    await current.run('prepare', async () => {
      await vi.advanceTimersByTimeAsync(80)
    })
    const work = deferred<void>()
    const result = current.run('cli', async () => work.promise).catch(error => error)
    await vi.advanceTimersByTimeAsync(20)
    expect(await result).toEqual(expect.objectContaining({ message: expect.stringContaining('deadline exceeded') }))
    expect(current.signal.aborted).toBe(true)
    expect(current.pending()).toBe(true)
    work.resolve()
    await expect(current.drain()).rejects.toThrow('deadline exceeded')
    expect(current.pending()).toBe(false)
  })

  it('禁止把绝对期限扩大到原始三十分钟之外', () => {
    expect(() => createNativeStartupOwner({ deadline: NATIVE_STARTUP_TIMEOUT + 1 })).toThrow('original 30 minute')
    expect(() => createNativeStartupOwner({ deadline: Number.NaN })).toThrow('original 30 minute')
  })

  it('进入阶段前已经到期时不调用操作或进度回调', async () => {
    const onStage = vi.fn(async (_stage: string, _status: string) => {})
    const current = owner({ deadline: 0, onStage })
    const operation = vi.fn(async () => {})
    await expect(current.run('expired', operation)).rejects.toThrow('deadline exceeded')
    expect(operation).not.toHaveBeenCalled()
    expect(onStage).not.toHaveBeenCalled()
    expect(current.pending()).toBe(false)
    expect(() => current.complete()).toThrow('deadline exceeded')
  })

  it('到期同 tick 的同步完成也不能被接受为成功', async () => {
    const onStage = vi.fn(async (_stage: string, _status: string) => {})
    const current = owner({ deadline: 100, onStage })
    await expect(current.run('same-tick', async () => {
      vi.setSystemTime(100)
      return 'late'
    })).rejects.toThrow('deadline exceeded')
    expect(onStage.mock.calls.map(call => call[1])).toEqual(['started', 'failed'])
    expect(() => current.complete()).toThrow('deadline exceeded')
  })

  it('忽略取消的操作保持真实 pending，迟到成功不能抹去五秒收尾失败', async () => {
    const current = owner({ deadline: 100 })
    const work = deferred<string>()
    const result = current.run('ignored-signal', async () => work.promise).catch(error => error)
    await vi.advanceTimersByTimeAsync(100)
    const deadlineFailure = await result
    expect(current.pending()).toBe(true)
    const draining = current.drain().catch(error => error)
    await vi.advanceTimersByTimeAsync(NATIVE_CAPTURE_DRAIN_TIMEOUT)
    const cleanupFailure = await draining
    expect(cleanupFailure).toBeInstanceOf(AggregateError)
    expect(cleanupFailure.errors).toContain(deadlineFailure)
    expect(current.pending()).toBe(true)
    work.resolve('late success')
    await vi.advanceTimersByTimeAsync(0)
    await expect(current.drain()).rejects.toBeInstanceOf(AggregateError)
    expect(current.pending()).toBe(false)
    expect(() => current.complete()).toThrow('deadline exceeded')
    await expect(current.drain()).rejects.toEqual(cleanupFailure)
  })

  it('真实结束恰好落在五秒收尾期限时仍保留收尾失败', async () => {
    const current = owner({ deadline: 100 })
    const work = deferred<void>()
    const result = current.run('cleanup-same-tick', async () => work.promise).catch(error => error)
    await vi.advanceTimersByTimeAsync(100)
    const failure = await result
    setTimeout(() => work.resolve(), NATIVE_CAPTURE_DRAIN_TIMEOUT)
    const draining = current.drain().catch(error => error)
    await vi.advanceTimersByTimeAsync(NATIVE_CAPTURE_DRAIN_TIMEOUT)
    const drained = await draining
    expect(drained).toBeInstanceOf(AggregateError)
    expect(drained.errors).toContain(failure)
    expect(drained.errors.some((error: Error) => error.message.includes('cleanup exceeded'))).toBe(true)
    expect(current.pending()).toBe(false)
    await expect(current.drain()).rejects.toEqual(drained)
  })

  it('取消后的迟到拒绝由 drain 保留，不产生未处理拒绝或恢复成功', async () => {
    const current = owner({ deadline: 100 })
    const work = deferred<void>()
    const result = current.run('late-failure', async () => work.promise).catch(error => error)
    await vi.advanceTimersByTimeAsync(100)
    const failure = await result
    const late = new Error('late subprocess failure')
    work.reject(late)
    const drained = await current.drain().catch(error => error)
    expect(drained).toBeInstanceOf(AggregateError)
    expect(drained.errors).toEqual([failure, late])
    expect(current.pending()).toBe(false)
  })

  it('父取消使用原始原因，真实操作结束前不会清除 pending', async () => {
    const parent = new AbortController()
    const current = owner({ parentSignal: parent.signal })
    const work = deferred<void>()
    const result = current.run('parent', async () => work.promise).catch(error => error)
    await vi.advanceTimersByTimeAsync(0)
    const reason = new Error('parent abort')
    parent.abort(reason)
    expect(await result).toBe(reason)
    expect(current.signal.reason).toBe(reason)
    expect(current.pending()).toBe(true)
    work.resolve()
    await expect(current.drain()).rejects.toBe(reason)
    expect(current.pending()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('父信号预先取消时不启动操作', async () => {
    const parent = new AbortController()
    const reason = new Error('already aborted')
    parent.abort(reason)
    const current = owner({ parentSignal: parent.signal })
    const operation = vi.fn(async () => {})
    await expect(current.run('pre-aborted', operation)).rejects.toBe(reason)
    expect(operation).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('进度写入前后同样占用期限，阻塞的 completed 写入仍属于 pending', async () => {
    const progress = deferred<void>()
    const statuses: string[] = []
    const current = owner({ deadline: 100, onStage: async (_stage, status) => {
      statuses.push(status)
      if (status === 'completed') {
        await progress.promise
      }
    } })
    const result = current.run('progress', async () => 'result').catch(error => error)
    await vi.advanceTimersByTimeAsync(100)
    expect(await result).toEqual(expect.objectContaining({ message: expect.stringContaining('deadline exceeded') }))
    expect(current.pending()).toBe(true)
    progress.resolve()
    await expect(current.drain()).rejects.toThrow('deadline exceeded')
    expect(statuses).toEqual(['started', 'completed', 'failed'])
    expect(current.pending()).toBe(false)
  })

  it('started 进度迟到结束后不再启动实际操作', async () => {
    const progress = deferred<void>()
    const current = owner({ deadline: 100, onStage: async (_stage, status) => {
      if (status === 'started') {
        await progress.promise
      }
    } })
    const operation = vi.fn(async () => {})
    const result = current.run('before-operation', operation).catch(error => error)
    await vi.advanceTimersByTimeAsync(100)
    await result
    progress.resolve()
    await expect(current.drain()).rejects.toThrow('deadline exceeded')
    expect(operation).not.toHaveBeenCalled()
  })

  it('操作失败与失败进度写入失败都必须保留', async () => {
    const failure = new Error('native command failed')
    const progressFailure = new Error('diagnostic write failed')
    const current = owner({ onStage: async (_stage, status) => {
      if (status === 'failed') {
        throw progressFailure
      }
    } })
    await expect(current.run('failure', async () => {
      throw failure
    })).rejects.toBe(failure)
    const drained = await current.drain().catch(error => error)
    expect(drained).toBeInstanceOf(AggregateError)
    expect(drained.errors[0]).toBe(failure)
    expect(drained.errors[1].errors).toEqual([failure, progressFailure])
  })

  it('并发阶段及仍在途的 complete 都不能绕过当前操作', async () => {
    const current = owner()
    const work = deferred<void>()
    const first = current.run('first', async () => work.promise)
    await expect(current.run('second', async () => {})).rejects.toThrow('already pending')
    expect(() => current.complete()).toThrow('operation is pending')
    work.resolve()
    await first
    current.complete()
  })

  it('release 只释放资源，遗漏 complete 时取消操作并保留失败', async () => {
    const current = owner()
    const work = deferred<void>()
    const result = current.run('release', async () => work.promise).catch(error => error)
    await vi.advanceTimersByTimeAsync(0)
    current.release()
    const failure = await result
    expect(failure.message).toContain('released before completion')
    expect(current.pending()).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    work.resolve()
    await expect(current.drain()).rejects.toBe(failure)
    current.release()
  })
})
