import type { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { PassThrough } from 'node:stream'
import { execa } from 'execa'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryProbeAbortedError, MemoryProbeCleanupError, runMemoryProbe } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/memory/probe'
import { createMemorySampler } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/memory/sampler'

function errorTree(error: unknown): unknown[] {
  if (!(error instanceof Error)) {
    return [error]
  }
  return [
    error,
    ...(error instanceof AggregateError ? error.errors.flatMap(errorTree) : []),
    ...('cause' in error ? errorTree(error.cause) : []),
  ]
}

function createChild(mode: 'emit' | 'throw', killError: Error, pid: number | undefined = 42) {
  const child = Object.assign(new EventEmitter(), {
    pid,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn((_signal: string): boolean => false),
  })
  child.kill.mockImplementation(() => {
    if (mode === 'throw') {
      throw killError
    }
    // Node 的 ChildProcess.kill 在 EPERM 时同步发出 error 并返回 false。
    child.emit('error', killError)
    return false
  })
  return child
}

afterEach(() => vi.useRealTimers())

describe('memory probe kill failure channels', () => {
  it.each(['emit', 'throw'] as const)('preserves the abort reason and kill error from %s', async (mode) => {
    const reason = new Error('original cancellation')
    const killError = Object.assign(new Error('kill denied'), { code: 'EPERM' })
    const child = createChild(mode, killError)
    const controller = new AbortController()
    const probe = runMemoryProbe('fixture', [], {
      signal: controller.signal,
      timeoutMs: 1000,
      spawnProcess: (() => child) as unknown as typeof spawn,
    }).catch(error => error)

    controller.abort(reason)
    child.emit('close', null)
    const error = await probe
    expect(error).toBeInstanceOf(MemoryProbeCleanupError)
    const chain = errorTree(error)
    expect(chain).toContain(killError)
    expect(chain).toContain(reason)
    expect(chain.some(item => item instanceof MemoryProbeAbortedError && item.cause === reason)).toBe(true)
    expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
  })

  it('keeps a failed kill terminal after the original deadline and prevents sampler retries', async () => {
    vi.useFakeTimers()
    const killError = Object.assign(new Error('kill denied'), { code: 'EPERM' })
    const child = createChild('emit', killError)
    const sample = { at: Date.now(), rssMb: 1, maxProcessRssMb: 1, processCount: 1 }
    const probe = vi.fn((_signal: AbortSignal) => Promise.resolve(sample))
    probe.mockImplementationOnce(signal => runMemoryProbe('fixture', [], {
      signal,
      timeoutMs: 1000,
      spawnProcess: (() => child) as unknown as typeof spawn,
    }).then(() => sample))
    const onUnavailable = vi.fn()
    const sampler = createMemorySampler({ probe, onSample: vi.fn(), onUnavailable })
    try {
      await vi.advanceTimersByTimeAsync(1000)
      child.emit('close', null)
      await vi.advanceTimersByTimeAsync(5000)
      const reported = onUnavailable.mock.calls[0]?.[0]
      const error = await sampler.stop().catch(error => error)
      expect(error).toBeInstanceOf(MemoryProbeCleanupError)
      expect(error).toBe(reported)
      expect(errorTree(error)).toContain(killError)
      expect(errorTree(error).some(item => item instanceof Error && item.message.includes('exceeded 1000ms deadline'))).toBe(true)
      expect(probe).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
    }
    finally {
      child.emit('close', null)
      await sampler.stop().catch(() => {})
    }
  })

  it('accepts close after a false kill result without inventing a kill error', async () => {
    const child = createChild('emit', new Error('unused'))
    child.kill.mockImplementation(() => false)
    const controller = new AbortController()
    const reason = new Error('original cancellation')
    const probe = runMemoryProbe('fixture', [], {
      signal: controller.signal,
      timeoutMs: 1000,
      spawnProcess: (() => child) as unknown as typeof spawn,
    }).catch(error => error)
    controller.abort(reason)
    child.emit('close', null)
    const error = await probe
    expect(error).toBeInstanceOf(MemoryProbeAbortedError)
    expect(error.cause).toBe(reason)
  })

  it('preserves an ordinary spawn error object without calling it a cleanup failure', async () => {
    const child = createChild('emit', new Error('unused'))
    const spawnError = Object.assign(new Error('spawn ENOENT'), { syscall: 'spawn fixture', code: 'ENOENT' })
    const probe = runMemoryProbe('fixture', [], {
      signal: new AbortController().signal,
      timeoutMs: 1000,
      spawnProcess: (() => child) as unknown as typeof spawn,
    }).catch(error => error)
    child.emit('error', spawnError)
    child.emit('close', -2)
    expect(await probe).toBe(spawnError)
    expect(child.kill).not.toHaveBeenCalled()
  })

  it.each([0, undefined])('does not signal an unsuccessful spawn with pid %s', async (pid) => {
    const child = createChild('emit', new Error('unused'))
    child.pid = pid
    const controller = new AbortController()
    const reason = new Error('cancelled before spawn result')
    const probe = runMemoryProbe('fixture', [], {
      signal: controller.signal,
      timeoutMs: 1000,
      spawnProcess: (() => child) as unknown as typeof spawn,
    }).catch(error => error)
    controller.abort(reason)
    child.emit('error', Object.assign(new Error('spawn ENOENT'), { syscall: 'spawn fixture', code: 'ENOENT' }))
    child.emit('close', -2)
    expect(child.kill).not.toHaveBeenCalled()
    const error = await probe
    expect(error).toBeInstanceOf(MemoryProbeAbortedError)
    expect(error.cause).toBe(reason)
  })

  it('does not misclassify an asynchronous spawn error after immediate cancellation', async () => {
    const missing = path.join(os.tmpdir(), `weapp-memory-missing-${randomUUID()}`)
    const moduleUrl = new URL('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/memory/probe.ts', import.meta.url).href
    // 用独立进程组隔离回归；缺失 PID 的旧 kill 行为不得伤及测试运行器。
    const source = `
      import { strict as assert } from 'node:assert';
      import { runMemoryProbe, MemoryProbeAbortedError } from ${JSON.stringify(moduleUrl)};
      const controller = new AbortController();
      const reason = new Error('cancelled before spawn result');
      const probe = runMemoryProbe(process.argv[1], [], { signal: controller.signal, timeoutMs: 1000 }).catch(error => error);
      controller.abort(reason);
      const error = await probe;
      assert(error instanceof MemoryProbeAbortedError);
      assert.equal(error.cause, reason);
      process.stdout.write('cancelled-without-process');
    `
    const result = await execa(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source, missing], {
      detached: process.platform !== 'win32',
      timeout: 5000,
      reject: false,
    })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('cancelled-without-process')
  })
})
