import { once } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNativeCaptureBudget, NATIVE_CAPTURE_TIMEOUT } from './react-native/capture-budget'
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

  it('只扣除当前 runtime 阶段实际宿主采集时间，编译仍使用墙钟预算', () => {
    const state = { ...defaults, now: 135_001, reportTimeout: 120_000, runCompletedAt: 1, hostCaptureElapsed: 130_000 }
    expect(evaluateNativeWait(state).timedOut).toBe(false)
    expect(evaluateNativeWait({ ...state, now: 250_001 }).timedOut).toBe(true)
    expect(evaluateNativeWait({ ...defaults, now: 1_800_001, hostCaptureElapsed: 130_000 }).timedOut).toBe(true)
    expect(evaluateNativeWait({ ...state, hostCaptureElapsed: 0 }).timedOut).toBe(true)
  })

  it('宿主采集按区间记账，重叠请求不能双倍抵扣或延长单例 deadline', async () => {
    vi.useFakeTimers()
    const budget = createNativeCaptureBudget(2)
    let release!: () => void
    const first = budget.capture(() => new Promise<void>((resolve) => {
      release = resolve
    }))
    await vi.advanceTimersByTimeAsync(4_000)
    expect(budget.elapsed()).toBe(4_000)
    await expect(budget.capture(async () => {})).rejects.toThrow(/already pending/)
    expect(budget.elapsed()).toBe(4_000)
    release()
    await first
    await vi.advanceTimersByTimeAsync(5_000)
    expect(budget.elapsed()).toBe(4_000)
    await budget.capture(async () => {})
    await expect(budget.capture(async () => {})).rejects.toThrow(/registered case budget/)
    expect(budget.elapsed()).toBe(4_000)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('采集卡死按既有 10 秒上限中止，之后无进展不能继续增加抵扣', async () => {
    vi.useFakeTimers()
    const budget = createNativeCaptureBudget(1)
    let signal!: AbortSignal
    const hanging = budget.capture(async (input) => {
      signal = input
      await new Promise(() => {})
    })
    const failure = expect(hanging).rejects.toThrow(/host capture.*10000ms/)
    await vi.advanceTimersByTimeAsync(NATIVE_CAPTURE_TIMEOUT)
    await failure
    expect(signal.aborted).toBe(true)
    expect(budget.elapsed()).toBe(10_000)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(budget.elapsed()).toBe(10_000)
    expect(evaluateNativeWait({ ...defaults, now: 130_001, runCompletedAt: 1, reportTimeout: 120_000, hostCaptureElapsed: budget.elapsed() }).timedOut).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([100, NATIVE_CAPTURE_TIMEOUT + 1])('同步启动耗时 %dms 仍占用原绝对截止时间', async (prelude) => {
    vi.useFakeTimers()
    const budget = createNativeCaptureBudget(1)
    let signal!: AbortSignal
    let release!: () => void
    const result = budget.capture((input) => {
      signal = input
      vi.advanceTimersByTime(prelude)
      return new Promise<void>((resolve) => {
        release = resolve
      })
    }).catch(error => error)
    try {
      await vi.advanceTimersByTimeAsync(Math.max(0, NATIVE_CAPTURE_TIMEOUT - prelude))
      expect(signal.aborted).toBe(true)
      expect(await result).toEqual(new Error('Native semantic host capture exceeded 10000ms'))
      expect(budget.pending()).toBe(true)
      expect(budget.elapsed()).toBe(NATIVE_CAPTURE_TIMEOUT)
    }
    finally {
      release()
      await result
      await budget.drain()
    }
    expect(budget.pending()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('deadline 取消真实所属截图子进程，退出后不能再写入迟到产物', async () => {
    vi.useFakeTimers()
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rn-capture-cancel-'))
    const output = path.join(directory, 'late.png')
    let child: ReturnType<typeof execa> | undefined
    try {
      const budget = createNativeCaptureBudget(1)
      const captured = budget.capture(async (cancelSignal) => {
        child = execa(process.execPath, ['-e', 'process.stdout.write("ready"); setTimeout(() => require("node:fs").writeFileSync(process.argv[1], "late"), 30000)', output], { cancelSignal, forceKillAfterDelay: 100 })
        await child
      })
      const failure = expect(captured).rejects.toThrow(/host capture.*10000ms/)
      if (!child?.stdout) {
        throw new Error('Missing owned screenshot process')
      }
      const closed = child.catch(error => error as { isCanceled?: boolean })
      await once(child.stdout, 'data')
      await vi.advanceTimersByTimeAsync(NATIVE_CAPTURE_TIMEOUT)
      await failure
      expect((await closed).isCanceled).toBe(true)
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
      await expect(fs.stat(output)).rejects.toMatchObject({ code: 'ENOENT' })
      expect(budget.elapsed()).toBe(10_000)
    }
    finally {
      if (child?.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL')
      }
      await fs.rm(directory, { recursive: true, force: true })
    }
  })

  it.each(['resolve', 'reject'] as const)('预算先失败后仍锁定实际操作；迟到 %s 必须完成收尾才释放', async (outcome) => {
    vi.useFakeTimers()
    const budget = createNativeCaptureBudget(2)
    let release!: () => void
    const late = new Error('late screenshot cleanup failed')
    const capturing = budget.capture(async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      if (outcome === 'reject') {
        throw late
      }
    })
    const failed = expect(capturing).rejects.toThrow(/host capture.*10000ms/)
    await vi.advanceTimersByTimeAsync(10_000)
    await failed
    expect(budget.pending()).toBe(true)
    await expect(budget.capture(async () => {})).rejects.toThrow(/already pending/)
    const drain = budget.drain(100)
    const drained = outcome === 'reject' ? expect(drain).rejects.toBe(late) : expect(drain).resolves.toBeUndefined()
    await vi.advanceTimersByTimeAsync(50)
    expect(budget.pending()).toBe(true)
    release()
    await drained
    expect(budget.pending()).toBe(false)
    expect(budget.elapsed()).toBe(10_000)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('不合作的截图有独立有限收尾预算，超时不能释放锁或抹掉后续失败', async () => {
    vi.useFakeTimers()
    const budget = createNativeCaptureBudget(2)
    let reject!: (error: Error) => void
    const capturing = budget.capture(() => new Promise<void>((_resolve, fail) => {
      reject = fail
    }))
    const failed = expect(capturing).rejects.toThrow(/host capture.*10000ms/)
    await vi.advanceTimersByTimeAsync(10_000)
    await failed
    const drained = expect(budget.drain(100)).rejects.toThrow(/cleanup.*100ms/)
    await vi.advanceTimersByTimeAsync(100)
    await drained
    expect(budget.pending()).toBe(true)
    const late = new Error('late native failure')
    reject(late)
    await expect(budget.drain(100)).rejects.toBe(late)
    expect(budget.pending()).toBe(false)
    expect(budget.elapsed()).toBe(10_000)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('操作刚完成时的重入不能覆盖前一次记账，同步异常也释放锁', async () => {
    const budget = createNativeCaptureBudget(3)
    let release!: () => void
    const operation = new Promise<void>((resolve) => {
      release = resolve
    })
    const first = budget.capture(() => operation)
    const reentrant = operation.then(() => expect(budget.capture(async () => {})).rejects.toThrow(/already pending/))
    release()
    await Promise.all([first, reentrant])
    const failure = new Error('synchronous capture failure')
    await expect(budget.capture(() => {
      throw failure
    })).rejects.toBe(failure)
    expect(budget.pending()).toBe(false)
    expect(Number.isFinite(budget.elapsed())).toBe(true)
    await budget.drain()
  })

  it('事件循环迟到的成功回调也不能越过单例 deadline', async () => {
    let now = 0
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now)
    try {
      const budget = createNativeCaptureBudget(1)
      await expect(budget.capture(async () => {
        now = 10_001
      })).rejects.toThrow(/host capture.*10000ms/)
      expect(budget.elapsed()).toBe(10_000)
    }
    finally { clock.mockRestore() }
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
