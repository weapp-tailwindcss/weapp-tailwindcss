import type { PreflightSession } from '../scripts/e2e-preflight/session'
import { EventEmitter } from 'node:events'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatWorkflowError } from '../scripts/e2e-preflight/cleanup'
import { runPreflightDaemon } from '../scripts/e2e-preflight/daemon'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

afterEach(() => vi.useRealTimers())

function fixture() {
  const probing = deferred<void>()
  const ready = deferred<void>()
  const session = {
    report: { runId: 'synthetic', status: 'ready', checks: [{ id: 'base', status: 'passed' }], createdAt: new Date().toISOString() },
    file: path.join(os.tmpdir(), 'synthetic-preflight', 'report.json'),
    dir: path.join(os.tmpdir(), 'synthetic-preflight'),
    cancel: vi.fn(async () => {}),
    save: vi.fn(async () => {}),
    probes: vi.fn(async () => { probing.resolve(undefined) }),
  }
  const signals = new EventEmitter()
  const release = vi.fn(async () => {})
  const close = vi.fn(async () => {})
  const onFinish = vi.fn<(callback: () => void) => void>()
  const options = {
    acquireLock: vi.fn(async () => release),
    serve: vi.fn(async () => ({ close, onFinish })),
    signals,
    interrupted: vi.fn(),
    write: vi.fn((message: string) => {
      if (message.includes('等待当前 AI 会话')) {
        ready.resolve(undefined)
      }
    }),
    warn: vi.fn(),
    shutdownPhaseMs: 20,
  }
  const run = () => runPreflightDaemon(session as unknown as PreflightSession, options)
  const finish = () => {
    session.report.status = 'finished'
    onFinish.mock.lastCall![0]()
  }
  return { session, signals, release, close, onFinish, options, run, probing, ready, finish }
}

describe('预检 daemon 停止生命周期', () => {
  it('保留原始失败和保存失败，并继续关闭服务、释放锁和移除信号监听', async () => {
    const { session, close, release, signals, run } = fixture()
    const primary = new Error('initial-probe-failed')
    const saveError = new Error('report-save-failed')
    const releaseError = new Error('lock-release-failed')
    session.probes.mockRejectedValue(primary)
    session.save.mockResolvedValueOnce(undefined).mockRejectedValue(saveError)
    release.mockRejectedValue(releaseError)
    const error = await run().catch(error => error)
    expect(close).toHaveBeenCalledOnce()
    expect(release).toHaveBeenCalledOnce()
    expect(signals.listenerCount('SIGINT')).toBe(0)
    expect(signals.listenerCount('SIGTERM')).toBe(0)
    expect(formatWorkflowError(error)).toContain(primary.message)
    expect(formatWorkflowError(error)).toContain(saveError.message)
    expect(formatWorkflowError(error)).toContain(releaseError.message)
    expect(session.save).toHaveBeenCalledTimes(2)
  })

  it('正常 finish 等待服务关闭和工具锁释放后才结算 daemon', async () => {
    const current = fixture()
    const closing = deferred<void>()
    current.close.mockReturnValue(closing.promise)
    const running = current.run()
    await current.ready.promise
    current.finish()
    await Promise.resolve()
    expect(current.release).not.toHaveBeenCalled()
    closing.resolve(undefined)
    await expect(running).resolves.toBeUndefined()
    expect(current.release).toHaveBeenCalledOnce()
    expect(current.session.save).toHaveBeenCalledOnce()
    expect(current.signals.listenerCount('SIGINT')).toBe(0)
  })

  it.each(['close', 'release'] as const)('%s 拒绝仍结算主流程并移除监听', async (phase) => {
    const current = fixture()
    const failure = new Error(`${phase}-failed`)
    current[phase].mockRejectedValue(failure)
    const running = current.run().catch(error => error)
    await current.ready.promise
    current.finish()
    const error = await running
    expect(formatWorkflowError(error)).toContain(failure.message)
    expect(current.close).toHaveBeenCalledOnce()
    if (phase === 'close') {
      expect(current.release).not.toHaveBeenCalled()
      expect(formatWorkflowError(error)).toContain('保留本轮工具锁')
    }
    else {
      expect(current.release).toHaveBeenCalledOnce()
    }
    expect(current.signals.listenerCount('SIGINT')).toBe(0)
    expect(current.signals.listenerCount('SIGTERM')).toBe(0)
  })

  it('并发信号、finish 和最终收尾只执行同一轮清理一次', async () => {
    const current = fixture()
    const closing = deferred<void>()
    current.close.mockReturnValue(closing.promise)
    const running = current.run().catch(error => error)
    await current.ready.promise
    current.signals.emit('SIGINT')
    current.signals.emit('SIGINT')
    current.signals.emit('SIGTERM')
    current.onFinish.mock.lastCall![0]()
    expect(current.signals.listenerCount('SIGINT')).toBe(1)
    expect(current.signals.listenerCount('SIGTERM')).toBe(1)
    closing.resolve(undefined)
    await running
    expect(current.session.cancel).toHaveBeenCalledOnce()
    expect(current.close).toHaveBeenCalledOnce()
    expect(current.release).toHaveBeenCalledOnce()
    expect(current.session.save).toHaveBeenCalledTimes(2)
    expect(current.signals.listenerCount('SIGINT')).toBe(0)
    expect(current.signals.listenerCount('SIGTERM')).toBe(0)
  })

  it('取消拒绝仍关闭服务，保留工具锁并传播失败', async () => {
    const current = fixture()
    const failure = new Error('cancel-failed')
    current.session.cancel.mockRejectedValue(failure)
    const running = current.run().catch(error => error)
    await current.ready.promise
    current.signals.emit('SIGINT')
    const error = await running
    expect(formatWorkflowError(error)).toContain(failure.message)
    expect(formatWorkflowError(error)).toContain('保留本轮工具锁')
    expect(current.close).toHaveBeenCalledOnce()
    expect(current.release).not.toHaveBeenCalled()
    expect(current.signals.listenerCount('SIGINT')).toBe(0)
    expect(current.signals.listenerCount('SIGTERM')).toBe(0)
  })

  it('卡住的探针和取消不能阻止主流程有界失败，保留锁并观察迟到拒绝', async () => {
    vi.useFakeTimers()
    const current = fixture()
    const probe = deferred<void>()
    const cancel = deferred<void>()
    current.session.probes.mockImplementation(() => {
      current.probing.resolve(undefined)
      return probe.promise
    })
    current.session.cancel.mockReturnValue(cancel.promise)
    const running = current.run().catch(error => error)
    await current.probing.promise
    current.signals.emit('SIGINT')
    await vi.advanceTimersByTimeAsync(100)
    const error = await running
    expect(formatWorkflowError(error)).toContain('取消探针 超过 20ms')
    expect(formatWorkflowError(error)).toContain('保留本轮工具锁')
    expect(current.close).toHaveBeenCalledOnce()
    expect(current.release).not.toHaveBeenCalled()
    expect(current.signals.listenerCount('SIGTERM')).toBe(0)
    probe.reject(new Error('late-probe-failed'))
    cancel.reject(new Error('late-cancel-failed'))
    await vi.advanceTimersByTimeAsync(0)
  })

  it.each(['close', 'release'] as const)('%s 不结算时有界失败，迟到拒绝仍被观察', async (phase) => {
    vi.useFakeTimers()
    const current = fixture()
    const pending = deferred<void>()
    current[phase].mockReturnValue(pending.promise)
    const running = current.run().catch(error => error)
    await current.ready.promise
    current.finish()
    await vi.advanceTimersByTimeAsync(100)
    const error = await running
    expect(formatWorkflowError(error)).toContain(phase === 'close' ? '关闭服务 超过 20ms' : '释放工具锁 超过 20ms')
    if (phase === 'close') {
      expect(current.release).not.toHaveBeenCalled()
      expect(formatWorkflowError(error)).toContain('保留本轮工具锁')
    }
    expect(current.signals.listenerCount('SIGINT')).toBe(0)
    pending.reject(new Error(`late-${phase}-failed`))
    await vi.advanceTimersByTimeAsync(0)
  })

  it('保存报告不结算时仍关闭服务、释放锁和结算主流程', async () => {
    vi.useFakeTimers()
    const current = fixture()
    const pending = deferred<void>()
    current.session.probes.mockRejectedValue(new Error('probe-failed'))
    current.session.save.mockResolvedValueOnce(undefined).mockReturnValue(pending.promise)
    const running = current.run().catch(error => error)
    await vi.advanceTimersByTimeAsync(100)
    expect(formatWorkflowError(await running)).toContain('保存报告 超过 20ms')
    expect(current.close).toHaveBeenCalledOnce()
    expect(current.release).toHaveBeenCalledOnce()
    pending.reject(new Error('late-save-failed'))
    await vi.advanceTimersByTimeAsync(0)
  })

  it('停止后才获得工具锁时仍登记并释放，不再创建服务或探针', async () => {
    const current = fixture()
    const lock = deferred<typeof current.release>()
    current.options.acquireLock.mockReturnValue(lock.promise)
    const running = current.run().catch(error => error)
    current.signals.emit('SIGINT')
    lock.resolve(current.release)
    expect(formatWorkflowError(await running)).toContain('预检已中断')
    expect(current.release).toHaveBeenCalledOnce()
    expect(current.options.serve).not.toHaveBeenCalled()
    expect(current.session.probes).not.toHaveBeenCalled()
  })

  it('停止后服务才返回时仍关闭并释放，不再启动探针', async () => {
    const current = fixture()
    const starting = deferred<{ close: typeof current.close, onFinish: typeof current.onFinish }>()
    const entered = deferred<void>()
    current.options.serve.mockImplementation(() => {
      entered.resolve(undefined)
      return starting.promise
    })
    const running = current.run().catch(error => error)
    await entered.promise
    current.signals.emit('SIGTERM')
    starting.resolve({ close: current.close, onFinish: current.onFinish })
    expect(formatWorkflowError(await running)).toContain('预检已中断')
    expect(current.close).toHaveBeenCalledOnce()
    expect(current.release).toHaveBeenCalledOnce()
    expect(current.session.probes).not.toHaveBeenCalled()
  })

  it('初始化失败仍保留原始异常并移除信号监听', async () => {
    const current = fixture()
    const primary = new Error('lock-acquire-failed')
    current.options.acquireLock.mockRejectedValue(primary)
    await expect(current.run()).rejects.toBe(primary)
    expect(current.signals.listenerCount('SIGINT')).toBe(0)
    expect(current.options.serve).not.toHaveBeenCalled()
  })
})
