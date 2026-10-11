import { setTimeout as delay } from 'node:timers/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeWatchResources, createWatchControl, runWatchOperation } from '../src/watch-lifecycle/control.mjs'
import { joinWatchMeasurement } from './helpers/watch-measurement.mjs'

afterEach(() => vi.useRealTimers())

describe('watcher 取消与清理契约', () => {
  it('取消待完成构建后保留阶段、构建数和原因，等待关闭才拒绝', async () => {
    const controller = new AbortController()
    const control = createWatchControl('webpack', controller.signal)
    control.notify()
    control.setPhase('theme.cjs:blue')
    control.css = '.theme{color:#123456}'
    let completeClose
    const closing = new Promise((resolve) => {
      completeClose = resolve
    })
    const close = vi.fn(() => closing)
    const pending = runWatchOperation(control, () => control.nextBuild(1), close)
    let settled = false
    const result = pending.catch(error => error).finally(() => {
      settled = true
    })
    const timeout = new Error('outer test timeout')
    controller.abort(timeout)
    await Promise.resolve()
    expect(close).toHaveBeenCalledOnce()
    expect(settled).toBe(false)
    completeClose()
    const error = await result
    expect(error.cause).toBe(timeout)
    expect(error.watchState).toEqual({ kind: 'webpack', phase: 'theme.cjs:blue', completed: 1, colors: ['#123456'] })
    expect(error.message).toContain('after build 1')
    expect(() => control.assertActive()).toThrow('cancelled')
  })

  it('保持每次构建 15 秒预算，并清除超时监听', async () => {
    vi.useFakeTimers()
    const control = createWatchControl('vite')
    control.setPhase('view.html')
    const result = control.nextBuild(0).catch(error => error)
    await vi.advanceTimersByTimeAsync(14_999)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect((await result).message).toContain('timed out at view.html after build 0')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('取消早于启动时不运行测量，仍执行已取得资源的关闭', async () => {
    const controller = new AbortController()
    controller.abort(new Error('cancelled before startup'))
    const action = vi.fn()
    const close = vi.fn()
    await expect(runWatchOperation(createWatchControl('vite', controller.signal), action, close)).rejects.toThrow('cancelled at startup')
    expect(action).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledOnce()
  })

  it('构建失败不被 watcher 关闭失败覆盖，compiler 仍收到关闭请求', async () => {
    const primary = new Error('compile failed')
    const cleanup = new Error('watch close failed')
    const compilerClose = vi.fn()
    const control = createWatchControl('webpack')
    control.notify(primary)
    const error = await runWatchOperation(control, () => control.nextBuild(0), () => closeWatchResources([
      () => Promise.reject(cleanup),
      compilerClose,
    ])).catch(error => error)
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.errors[0].cause).toBe(primary)
    expect(error.errors[1].cause).toBe(cleanup)
    expect(error.cause).toBe(error.errors[0])
    expect(compilerClose).toHaveBeenCalledOnce()
  })

  it('只有关闭失败时也拒绝完成', async () => {
    const cleanup = new Error('close failed')
    const error = await runWatchOperation(createWatchControl('vite'), async () => 'done', () => Promise.reject(cleanup)).catch(error => error)
    expect(error.cause).toBe(cleanup)
    expect(error.message).toContain('cleanup failed')
  })

  it('取消发生于启动中时，等待晚到资源取得后关闭', async () => {
    const controller = new AbortController()
    const control = createWatchControl('vite', controller.signal)
    let finishStartup
    const startup = new Promise((resolve) => {
      finishStartup = resolve
    })
    const close = vi.fn()
    let watcher
    const pending = runWatchOperation(control, async () => {
      watcher = await startup
      await control.nextBuild(0)
    }, () => watcher?.close())
    const result = pending.catch(error => error)
    controller.abort(new Error('startup timeout'))
    expect(close).not.toHaveBeenCalled()
    finishStartup({ close })
    expect((await result).message).toContain('cancelled at startup after build 0')
    expect(close).toHaveBeenCalledOnce()
  })

  it('测量结束后在关闭期间取消，仍等待关闭并拒绝成功结果', async () => {
    const controller = new AbortController()
    const control = createWatchControl('webpack', controller.signal)
    control.notify()
    let finishClose
    const closing = new Promise((resolve) => {
      finishClose = resolve
    })
    const close = vi.fn(() => closing)
    const result = runWatchOperation(control, async () => 'report', close).catch(error => error)
    await Promise.resolve()
    expect(close).toHaveBeenCalledOnce()
    controller.abort(new Error('cleanup timeout'))
    finishClose()
    expect((await result).message).toContain('cancelled at startup after build 1')
  })
})

describe('真实 Vitest 超时边界', () => {
  let closed = false
  let joined = false
  let cancellation
  it.fails('超时后收尾钩子等待关闭，并输出带阶段的取消异常', { timeout: 30 }, async (context) => {
    const control = createWatchControl('synthetic', context.signal)
    control.setPhase('pending rebuild')
    const pending = runWatchOperation(control, () => control.nextBuild(0), async () => {
      await delay(20)
      closed = true
    })
    const outcome = pending.catch(error => error)
    context.onTestFinished(async () => {
      cancellation = { error: await outcome, aborted: context.signal.aborted, reason: context.signal.reason }
      joined = closed
    })
    await joinWatchMeasurement(context, pending)
  })

  it('下一项开始前 watcher 已关闭，不遗留后台测量', () => {
    expect(closed).toBe(true)
    expect(joined).toBe(true)
    expect(cancellation.aborted).toBe(true)
    expect(cancellation.reason.message).toContain('Test timed out in 30ms')
    expect(cancellation.error.cause).toMatchObject({ name: cancellation.reason.name, message: cancellation.reason.message })
    expect(cancellation.error.watchState).toEqual({ kind: 'synthetic', phase: 'pending rebuild', completed: 0, colors: [] })
    expect(cancellation.error.message).toContain('cancelled at pending rebuild after build 0')
  })
})
