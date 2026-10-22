import { runInNewContext } from 'node:vm'
import { tsImport } from 'tsx/esm/api'
import { afterEach, expect, it, vi } from 'vitest'
import { waitForFrameProgress } from './tailwind-capabilities/browser/frames'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function frames() {
  vi.useFakeTimers()
  const pending = new Map<number, FrameRequestCallback>()
  let next = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pending.set(++next, callback)
    return next
  })
  const cancel = vi.fn((id: number) => pending.delete(id))
  vi.stubGlobal('cancelAnimationFrame', cancel)
  return {
    pending,
    cancel,
    async tick(time: number) {
      for (const [id, callback] of [...pending]) {
        pending.delete(id)
        callback(time)
      }
      await Promise.resolve()
    },
  }
}

it('CI 相同时间戳不能冒充两帧，必须观察到严格前进', async () => {
  const frame = frames()
  const result = waitForFrameProgress()
  await frame.tick(46.832)
  await frame.tick(46.832)
  await frame.tick(63.5)
  await expect(result).resolves.toEqual([46.832, 63.5])
  expect(frame.pending.size).toBe(0)
  expect(vi.getTimerCount()).toBe(0)
})

it('两个样本都必须晚于上一状态下界', async () => {
  const frame = frames()
  const result = waitForFrameProgress({ after: 63.5 })
  for (const time of [46.832, 63.5, 80.1, 80.1, 96.8]) {
    await frame.tick(time)
  }
  await expect(result).resolves.toEqual([80.1, 96.8])
})

it.each(['没有回调', '时间戳持续停滞'])('%s 必须在原 5000ms 预算失败并取消挂起 rAF', async (mode) => {
  const frame = frames()
  let outcome: unknown
  void waitForFrameProgress().then(value => outcome = value, error => outcome = error)
  if (mode === '时间戳持续停滞') {
    await frame.tick(46.832)
    await frame.tick(46.832)
  }
  const lateCallback = [...frame.pending.values()][0]!
  await vi.advanceTimersByTimeAsync(5_000)
  expect(outcome).toBeInstanceOf(Error)
  expect(String(outcome)).toContain('5000ms')
  expect(frame.pending.size).toBe(0)
  expect(frame.cancel).toHaveBeenCalledOnce()
  lateCallback(96.8)
  expect(frame.pending.size).toBe(0)
  expect(vi.getTimerCount()).toBe(0)
})

it('identity 写入后文档变化，不能拼接另一个文档的帧', async () => {
  const frame = frames()
  await expect(waitForFrameProgress({ timeOrigin: performance.timeOrigin - 1 })).rejects.toThrow('文档已变化')
  expect(frame.pending.size).toBe(0)
  expect(vi.getTimerCount()).toBe(0)
})

it('真实 tsx 编译后的共享屏障可独立传入浏览器，不能依赖模块 helper', async () => {
  const loaded = await tsImport(new URL('./tailwind-capabilities/browser/frames.ts', import.meta.url).href, import.meta.url)
  const serialized = String(loaded.waitForFrameProgress)
  const callbacks: FrameRequestCallback[] = []
  const timers = new Set<() => void>()
  const result = runInNewContext(`(${serialized})({ after: 46.832 })`, {
    requestAnimationFrame: (callback: FrameRequestCallback) => callbacks.push(callback),
    cancelAnimationFrame: () => {},
    setTimeout: (callback: () => void) => {
      timers.add(callback)
      return callback
    },
    clearTimeout: (callback: () => void) => timers.delete(callback),
  })
  for (const time of [46.832, 63.5, 80.1]) {
    callbacks.shift()!(time)
  }
  await expect(result).resolves.toEqual([63.5, 80.1])
  expect(callbacks).toHaveLength(0)
  expect(timers.size).toBe(0)
  expect(serialized).not.toMatch(/\b__(?:name|defProp)\b/)
})
