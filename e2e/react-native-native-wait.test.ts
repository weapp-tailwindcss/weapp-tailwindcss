import { afterEach, describe, expect, it, vi } from 'vitest'
import { awaitNativeExitCompletion, canAcceptNativeReport, evaluateNativeWait } from './react-native/native-wait'

afterEach(() => vi.useRealTimers())

const defaults = {
  now: 0,
  recovered: false,
  recoveryDelay: 180_000,
  reportTimeout: 300_000,
  startedAt: 0,
  startupTimeout: 1_800_000,
}

describe('React Native runtime wait state', () => {
  it('晚到或提前到达的首屏报告不能绕过启动最终结果', () => {
    expect(canAcceptNativeReport(undefined, false, true)).toBe(false)
    expect(canAcceptNativeReport(1, false, true)).toBe(false)
    expect(canAcceptNativeReport(1, false, false)).toBe(false)
    expect(canAcceptNativeReport(0, false, true)).toBe(true)
    expect(canAcceptNativeReport(1, true, true)).toBe(true)
    expect(canAcceptNativeReport(1, true, false)).toBe(true)
  })

  it('退出码已可见但输出管道未关闭时不能越过剩余启动预算', async () => {
    vi.useFakeTimers()
    const waiting = awaitNativeExitCompletion(new Promise(() => {}), 100)
    const assertion = expect(waiting).rejects.toThrow('输出关闭超时')
    await vi.advanceTimersByTimeAsync(100)
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })

  it('正常输出关闭和失败均释放截止计时器，耗尽预算不会再等待', async () => {
    vi.useFakeTimers()
    await expect(awaitNativeExitCompletion(Promise.resolve(), 100)).resolves.toBeUndefined()
    await expect(awaitNativeExitCompletion(Promise.reject(new Error('output failed')), 100)).rejects.toThrow('output failed')
    await expect(awaitNativeExitCompletion(new Promise(() => {}), 0)).rejects.toThrow('预算已耗尽')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('uses separate native startup and runtime report timeouts', () => {
    expect(evaluateNativeWait({ ...defaults, now: 1_200_000 })).toMatchObject({
      phase: 'native build and launch',
      timedOut: false,
    })
    expect(evaluateNativeWait({ ...defaults, now: 1_000_001, recovered: true, runCompletedAt: 700_000 })).toMatchObject({
      phase: 'runtime report',
      timedOut: true,
    })
  })

  it('does not relaunch a runtime after Metro completed its bundle', () => {
    expect(evaluateNativeWait({
      ...defaults,
      bundleCompletedAt: 120_000,
      now: 399_999,
      runCompletedAt: 100_000,
    }).shouldRecover).toBe(false)
  })

  it('recovers once when no Metro bundle was produced', () => {
    expect(evaluateNativeWait({
      ...defaults,
      now: 280_000,
      runCompletedAt: 100_000,
    }).shouldRecover).toBe(true)
    expect(evaluateNativeWait({
      ...defaults,
      now: 280_000,
      recovered: true,
      runCompletedAt: 100_000,
    }).shouldRecover).toBe(false)
  })

  it('recovers once after a bundled runtime exhausts its report timeout', () => {
    expect(evaluateNativeWait({
      ...defaults,
      bundleCompletedAt: 120_000,
      now: 400_000,
      runCompletedAt: 100_000,
    })).toMatchObject({
      shouldRecover: true,
      timedOut: true,
    })
    expect(evaluateNativeWait({
      ...defaults,
      bundleCompletedAt: 120_000,
      now: 400_000,
      recovered: true,
      runCompletedAt: 100_000,
    })).toMatchObject({
      shouldRecover: false,
      timedOut: true,
    })
  })
})
