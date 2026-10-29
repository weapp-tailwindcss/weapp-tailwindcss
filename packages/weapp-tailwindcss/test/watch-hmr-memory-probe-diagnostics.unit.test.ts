import type { spawn } from 'node:child_process'
import type { MemoryProbeFailure } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/memory/probe-diagnostics'
import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { formatWatchFailure } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/error-report'
import { MemoryProbeCleanupError, runMemoryProbe } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/memory/probe'

function fixture(options: { maxBuffer?: number } = {}) {
  const controller = new AbortController()
  const child = Object.assign(new EventEmitter(), {
    pid: 42,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    killed: false,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn((_signal: string) => false),
  })
  child.kill.mockImplementation(() => {
    child.killed = true
    return true
  })
  const args = ['-Ao', 'pid=,ppid=,pgid=,lstart=,stat=']
  const probe = runMemoryProbe('ps', args, {
    signal: controller.signal,
    timeoutMs: 1000,
    ...options,
    diagnosticContext: { query: 'posix-topology', rootPid: 71 },
    spawnProcess: (() => child) as unknown as typeof spawn,
  }).then(() => { throw new Error('fixture expected probe rejection') }, error => error as MemoryProbeFailure)
  return { child, controller, args, probe }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(10_000)
})
afterEach(() => vi.useRealTimers())

it('未确认 close 时保留实际查询、所属 PID、原截止、kill 返回与未观察到的退出状态', async () => {
  const { child, args, probe } = fixture()
  child.emit('spawn')
  await vi.advanceTimersByTimeAsync(2000)
  const error = await probe
  expect(error).toBeInstanceOf(MemoryProbeCleanupError)
  expect(error.message).toContain('close was not confirmed')
  expect(error.probeDiagnostics).toMatchObject({
    command: 'ps',
    args,
    pid: 42,
    context: { query: 'posix-topology', rootPid: 71 },
    startedAt: 10_000,
    expiresAt: 11_000,
    timeoutMs: 1000,
    closeTimeoutMs: 1000,
    exitCode: null,
    signalCode: null,
    killed: true,
    stdout: { readableEnded: false, destroyed: false, closed: false },
  })
  expect(error.probeDiagnostics?.events.map(item => item.event)).toEqual([
    'spawn-requested', 'spawn-returned', 'spawn', 'deadline', 'termination-requested', 'kill-returned', 'close-timeout',
  ])
  expect(error.probeDiagnostics?.events.find(item => item.event === 'kill-returned')?.detail).toEqual({ signal: 'SIGKILL', result: true })
  expect((error.cause as MemoryProbeFailure).probeDiagnostics?.observedAt).toBe(11_000)
  expect(error.probeDiagnostics?.observedAt).toBe(12_000)
  expect(vi.getTimerCount()).toBe(0)
  child.emit('close', null, 'SIGKILL')
})

it('exit 已到但管道未闭合仍保持失败，不把 exitCode 或 kill=false 当作 close', async () => {
  const { child, probe } = fixture()
  child.exitCode = 0
  child.emit('exit', 0, null)
  child.kill.mockReturnValue(false)
  await vi.advanceTimersByTimeAsync(2000)
  const error = await probe
  expect(error).toBeInstanceOf(MemoryProbeCleanupError)
  expect(error.probeDiagnostics).toMatchObject({ exitCode: 0, signalCode: null, stdout: { closed: false }, stderr: { closed: false } })
  expect(error.probeDiagnostics?.events).toContainEqual(expect.objectContaining({ event: 'exit', detail: { code: 0, signal: null } }))
  expect(error.probeDiagnostics?.events).toContainEqual(expect.objectContaining({ event: 'kill-returned', detail: { signal: 'SIGKILL', result: false } }))
  expect(error.probeClose).toBeUndefined()
  child.emit('close', 0, null)
})

it('迟到的真实 close 作为独立结果保留，不覆盖首败快照、原因或原拒绝对象', async () => {
  const { child, probe } = fixture()
  await vi.advanceTimersByTimeAsync(2000)
  const error = await probe
  const first = error.probeDiagnostics
  const cause = error.cause
  const message = error.message
  for (let index = 0; index < 40; index++) {
    child.stdout.emit('error', new Error(`late pipe error ${index}`))
  }
  child.signalCode = 'SIGKILL'
  child.stdout.destroy()
  child.stderr.destroy()
  await vi.advanceTimersByTimeAsync(50)
  child.emit('exit', null, 'SIGKILL')
  child.emit('close', null, 'SIGKILL')
  expect(await probe).toBe(error)
  expect(error.message).toBe(message)
  expect(error.cause).toBe(cause)
  expect(error.probeDiagnostics).toBe(first)
  expect(Object.isFrozen(first)).toBe(true)
  expect(Object.isFrozen(first?.events)).toBe(true)
  expect(first?.events.some(item => item.event === 'close')).toBe(false)
  expect(error.probeClose).toMatchObject({ pid: 42, signalCode: 'SIGKILL', stdout: { destroyed: true }, stderr: { destroyed: true }, observedAt: 12_050 })
  expect(error.probeClose?.omittedEvents).toBeGreaterThan(0)
  expect(error.probeClose?.events.at(-1)).toMatchObject({ event: 'close', detail: { code: null, signal: 'SIGKILL' } })
  expect(child.listenerCount('spawn')).toBe(0)
  expect(child.listenerCount('exit')).toBe(0)
  expect(child.stdout.listenerCount('error')).toBe(0)
  expect(child.stderr.listenerCount('error')).toBe(0)
})

it('CLI 失败日志穿过 AggregateError 与 cause 保留首因时间和迟到 close 的实际证据', async () => {
  const { child, probe } = fixture()
  await vi.advanceTimersByTimeAsync(2000)
  const error = await probe
  await vi.advanceTimersByTimeAsync(50)
  child.signalCode = 'SIGKILL'
  child.emit('close', null, 'SIGKILL')
  const report = formatWatchFailure(new AggregateError([
    new Error('watch session cleanup failed', { cause: error }),
  ], 'watch-HMR cleanup failed'))

  expect(report).toContain('AggregateError: watch-HMR cleanup failed')
  expect(report).toContain('watch session cleanup failed')
  expect(report).toContain('memory probe exceeded 1000ms deadline')
  expect(report).toContain('probeDiagnostics:')
  expect(report).toContain('observedAt: 11000')
  expect(report).toContain('probeClose:')
  expect(report).toContain('observedAt: 12050')
  expect(report).toContain("query: 'posix-topology'")
  expect(report).toContain("event: 'close'")
  expect(report).toContain("signal: 'SIGKILL'")
})

it('同步 spawn 错误保留同一错误对象和调用身份，不启动终止或额外探针', async () => {
  const error = Object.assign(new Error('spawn denied'), { code: 'EPERM' }) as MemoryProbeFailure
  const spawnProcess = vi.fn(() => { throw error })
  await expect(runMemoryProbe('ps', ['-p', '71'], {
    signal: new AbortController().signal,
    timeoutMs: 1000,
    diagnosticContext: { query: 'posix-memory', rootPid: 71 },
    spawnProcess: spawnProcess as unknown as typeof spawn,
  })).rejects.toBe(error)
  expect(spawnProcess).toHaveBeenCalledOnce()
  expect(error.probeDiagnostics).toMatchObject({ command: 'ps', args: ['-p', '71'], pid: null, context: { query: 'posix-memory', rootPid: 71 } })
  expect(error.probeDiagnostics?.events.map(item => item.event)).toEqual(['spawn-requested', 'spawn-threw'])
  expect(vi.getTimerCount()).toBe(0)
})

it('截止后及时 close 仍拒绝迟到样本，同时提供 kill 返回与实际 close 的独立证据', async () => {
  const { child, probe } = fixture()
  await vi.advanceTimersByTimeAsync(1000)
  child.signalCode = 'SIGKILL'
  child.emit('exit', null, 'SIGKILL')
  await vi.advanceTimersByTimeAsync(100)
  child.emit('close', null, 'SIGKILL')
  const error = await probe
  expect(error.message).toContain('exceeded 1000ms deadline')
  expect(error.probeDiagnostics?.observedAt).toBe(11_000)
  expect(error.probeDiagnostics?.events.some(item => item.event === 'close')).toBe(false)
  expect(error.probeClose?.observedAt).toBe(11_100)
  expect(error.probeClose?.events).toContainEqual(expect.objectContaining({ event: 'kill-returned', detail: { signal: 'SIGKILL', result: true } }))
  expect(error.probeClose?.events.at(-1)).toMatchObject({ event: 'close', detail: { code: null, signal: 'SIGKILL' } })
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['abort', 'stdout', 'stderr', 'overflow', 'child-error'] as const)('%s 首错即时冻结，及时 close 不能把首败时间改成收尾时间', async (kind) => {
  const { child, controller, probe } = fixture({ maxBuffer: 1 })
  const reason = new Error(`first ${kind}`)
  await vi.advanceTimersByTimeAsync(100)
  if (kind === 'abort') {
    controller.abort(reason)
  }
  else if (kind === 'overflow') {
    child.stdout.emit('data', Buffer.from('xx'))
  }
  else if (kind === 'child-error') {
    child.emit('error', reason)
  }
  else {
    child[kind].emit('error', reason)
  }
  await vi.advanceTimersByTimeAsync(100)
  child.emit('close', null, null)
  const error = await probe
  expect(error.probeDiagnostics?.observedAt).toBe(10_100)
  expect(error.probeClose?.observedAt).toBe(10_200)
  expect(error.probeDiagnostics?.events.some(item => item.event === 'close')).toBe(false)
  expect(error.probeClose?.events.at(-1)).toMatchObject({ event: 'close', detail: { code: null, signal: null } })
  if (kind === 'abort') {
    expect(error.cause).toBe(reason)
  }
  else if (kind === 'overflow') {
    expect(error.message).toContain('buffer limit')
    expect(error.probeDiagnostics?.events).toContainEqual(expect.objectContaining({ event: 'buffer-limit', detail: { bytes: 2, maxBuffer: 1 } }))
  }
  else {
    expect(error).toBe(reason)
  }
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['emit', 'throw'] as const)('同步 kill %s 保留首因和 kill 错误快照，close 另存实际返回结果', async (mode) => {
  const { child, controller, probe } = fixture()
  const reason = new Error('original abort')
  const killError = Object.assign(new Error('kill denied'), { syscall: 'kill', code: 'EPERM' }) as MemoryProbeFailure
  child.kill.mockImplementation(() => {
    if (mode === 'throw') {
      throw killError
    }
    child.emit('error', killError)
    return false
  })
  await vi.advanceTimersByTimeAsync(100)
  controller.abort(reason)
  await vi.advanceTimersByTimeAsync(100)
  child.emit('close', null, null)
  const error = await probe
  expect(error).toBeInstanceOf(MemoryProbeCleanupError)
  const cause = error.cause as AggregateError
  expect(cause.errors[0]).toMatchObject({ cause: reason, probeDiagnostics: { observedAt: 10_100 } })
  expect(cause.errors[1]).toBe(killError)
  expect(killError.probeDiagnostics?.observedAt).toBe(10_100)
  expect(error.probeDiagnostics?.observedAt).toBe(10_100)
  expect(error.probeClose?.observedAt).toBe(10_200)
  expect(error.probeClose?.events.at(-1)).toMatchObject({ event: 'close', detail: { code: null, signal: null } })
  if (mode === 'emit') {
    expect(error.probeClose?.events).toContainEqual(expect.objectContaining({ event: 'kill-returned', detail: { signal: 'SIGKILL', result: false } }))
  }
  else {
    expect(error.probeClose?.events.some(item => item.event === 'kill-returned')).toBe(false)
  }
  expect(vi.getTimerCount()).toBe(0)
})
