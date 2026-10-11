import type { ChildProcess, spawn } from 'node:child_process'
import type { MemoryUsageSample, WatchCaseMetrics } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { summarizeHmrMemoryReport, summarizeMemoryDebugSamples, summarizeMemorySamples } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/memory-report'
import { MemoryProbeCleanupError, runMemoryProbe } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/memory/probe'
import { createWindowsProcessTreeMemoryScript, sampleProcessTreeMemory } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/memory/process-tree'
import { createMemorySampler } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/memory/sampler'
import { assertMemoryBudget } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/runner'

const sample: MemoryUsageSample = { at: 10, rssMb: 640, maxProcessRssMb: 512, processCount: 2 }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function createProbeChild() {
  const child = new EventEmitter() as ChildProcess
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.kill = vi.fn(() => true)
  return child
}

afterEach(() => vi.useRealTimers())

describe('asynchronous memory probe ownership', () => {
  it('keeps the event loop active until the held probe closes', async () => {
    const child = createProbeChild()
    const spawnProcess = vi.fn(() => child)
    const probe = runMemoryProbe('probe', [], { signal: new AbortController().signal, timeoutMs: 1000, spawnProcess: spawnProcess as unknown as typeof spawn })
    let completed = false
    void probe.then(() => {
      completed = true
    })
    child.stdout!.emit('data', Buffer.from('actual data'))
    await Promise.resolve()
    expect(completed).toBe(false)
    expect(spawnProcess).toHaveBeenCalledWith('probe', [], expect.objectContaining({ shell: false, windowsHide: true }))
    child.emit('close', 0)
    await expect(probe).resolves.toBe('actual data')
  })

  it('uses an absolute deadline and waits for the held child close after kill', async () => {
    vi.useFakeTimers()
    const child = createProbeChild()
    const controller = new AbortController()
    const probe = runMemoryProbe('probe', [], { signal: controller.signal, timeoutMs: 5000, spawnProcess: (() => child) as unknown as typeof spawn })
    const assertion = expect(probe).rejects.toThrow('exceeded 5000ms deadline')
    await vi.advanceTimersByTimeAsync(4999)
    expect(child.kill).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
    child.emit('close', null)
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })

  it('treats unconfirmed close as a cleanup error, not a lost telemetry sample', async () => {
    vi.useFakeTimers()
    const child = createProbeChild()
    const controller = new AbortController()
    const probe = runMemoryProbe('probe', [], { signal: controller.signal, timeoutMs: 5000, closeTimeoutMs: 100, spawnProcess: (() => child) as unknown as typeof spawn })
    const assertion = expect(probe).rejects.toBeInstanceOf(MemoryProbeCleanupError)
    controller.abort()
    await vi.advanceTimersByTimeAsync(100)
    await assertion
    expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
    expect(vi.getTimerCount()).toBe(0)
    expect(() => child.stdout!.emit('error', new Error('late pipe error'))).not.toThrow()
    child.emit('close', null)
    expect(child.stdout!.listenerCount('error')).toBe(0)
  })

  it('preserves a kill failure after close instead of suppressing it', async () => {
    const child = createProbeChild()
    child.kill = vi.fn(() => {
      throw new Error('access denied')
    })
    const controller = new AbortController()
    const probe = runMemoryProbe('probe', [], { signal: controller.signal, timeoutMs: 5000, spawnProcess: (() => child) as unknown as typeof spawn })
    const assertion = expect(probe).rejects.toThrow('memory probe kill failed')
    controller.abort()
    child.emit('error', new Error('later error'))
    child.emit('close', null)
    await assertion
  })

  it('rejects a late close even when the timer callback has not executed', async () => {
    vi.useFakeTimers()
    const child = createProbeChild()
    const probe = runMemoryProbe('probe', [], { signal: new AbortController().signal, timeoutMs: 5000, spawnProcess: (() => child) as unknown as typeof spawn })
    const assertion = expect(probe).rejects.toThrow('deadline')
    vi.setSystemTime(Date.now() + 5001)
    child.emit('close', 0)
    await assertion
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['stdout', 'stderr'] as const)('contains %s stream errors and reaps the held probe', async (stream) => {
    const child = createProbeChild()
    const probe = runMemoryProbe('probe', [], { signal: new AbortController().signal, timeoutMs: 5000, spawnProcess: (() => child) as unknown as typeof spawn })
    const assertion = expect(probe).rejects.toThrow('pipe failure')
    child[stream]!.emit('error', new Error('pipe failure'))
    expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
    child.emit('close', null)
    await assertion
  })

  it('cancels and closes a real probe without leaving its process alive', async () => {
    let held: ChildProcess | undefined
    const { spawn: spawnProcess } = await import('node:child_process')
    const controller = new AbortController()
    const probe = runMemoryProbe(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      signal: controller.signal,
      timeoutMs: 5000,
      spawnProcess: ((...args: Parameters<typeof spawnProcess>) => {
        held = spawnProcess(...args)
        return held
      }) as typeof spawnProcess,
    })
    const assertion = expect(probe).rejects.toThrow('memory probe aborted')
    try {
      controller.abort()
      await assertion
      expect(held?.exitCode != null || held?.signalCode != null).toBe(true)
    }
    finally {
      if (held && held.exitCode == null && held.signalCode == null) {
        held.kill('SIGKILL')
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('real probe fallback close was not confirmed')), 1000)
          held!.once('close', () => {
            clearTimeout(timer)
            resolve()
          })
        })
      }
    }
  })

  it('does not create a process when already cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    const spawnProcess = vi.fn()
    await expect(runMemoryProbe('probe', [], { signal: controller.signal, timeoutMs: 5000, spawnProcess: spawnProcess as unknown as typeof spawn })).rejects.toThrow('aborted')
    expect(spawnProcess).not.toHaveBeenCalled()
  })
})

describe('single flight memory sampling', () => {
  it('waits for each probe and only then starts the next interval', async () => {
    vi.useFakeTimers()
    const first = deferred<MemoryUsageSample>()
    const probe = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(sample)
    const onSample = vi.fn()
    const sampler = createMemorySampler({ probe, onSample, onUnavailable: vi.fn() })
    await vi.advanceTimersByTimeAsync(5000)
    expect(probe).toHaveBeenCalledTimes(1)
    first.resolve(sample)
    await vi.advanceTimersByTimeAsync(999)
    expect(onSample).toHaveBeenCalledExactlyOnceWith(sample)
    expect(probe).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(probe).toHaveBeenCalledTimes(2)
    await sampler.stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('waits for disposal, discards late data and never schedules after stop', async () => {
    vi.useFakeTimers()
    const closing = deferred<MemoryUsageSample>()
    const probe = vi.fn((_signal: AbortSignal) => closing.promise)
    const onSample = vi.fn()
    const onUnavailable = vi.fn()
    const sampler = createMemorySampler({ probe, onSample, onUnavailable })
    await vi.advanceTimersByTimeAsync(0)
    let stopped = false
    const stopping = sampler.stop().then(() => {
      stopped = true
    })
    expect(probe.mock.calls[0]![0].aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(5000)
    expect(stopped).toBe(false)
    closing.resolve(sample)
    await stopping
    await vi.advanceTimersByTimeAsync(5000)
    expect(probe).toHaveBeenCalledTimes(1)
    expect(onSample).not.toHaveBeenCalled()
    expect(onUnavailable).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reports unavailable samples and retries without inserting zero metrics', async () => {
    vi.useFakeTimers()
    const error = new Error('CIM unavailable')
    const probe = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(sample)
    const onSample = vi.fn()
    const onUnavailable = vi.fn()
    const sampler = createMemorySampler({ probe, onSample, onUnavailable })
    await vi.advanceTimersByTimeAsync(0)
    expect(onUnavailable).toHaveBeenCalledExactlyOnceWith(error)
    expect(onSample).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(onSample).toHaveBeenCalledExactlyOnceWith(sample)
    await sampler.stop()
  })

  it('rejects stop and prevents retries if held probe cleanup failed', async () => {
    vi.useFakeTimers()
    const error = new MemoryProbeCleanupError('unconfirmed close')
    const probe = vi.fn().mockRejectedValue(error)
    const sampler = createMemorySampler({ probe, onSample: vi.fn(), onUnavailable: vi.fn() })
    await vi.advanceTimersByTimeAsync(5000)
    expect(probe).toHaveBeenCalledTimes(1)
    await expect(sampler.stop()).rejects.toBe(error)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('memory telemetry contract', () => {
  it('reports availability and refuses configured budgets without measured samples', () => {
    const unavailable = summarizeMemorySamples([])
    expect(unavailable.availability).toBe('unavailable')
    expect(summarizeMemorySamples([sample])).toMatchObject({ availability: 'available', peakRssMb: 640, peakProcessCount: 2 })
    const metrics = { label: 'unit/memory', project: 'unit', memorySummary: unavailable, memoryDebugSummary: summarizeMemoryDebugSamples([]) } as WatchCaseMetrics
    expect(summarizeHmrMemoryReport([metrics]).byProject['unit']?.availability).toBe('unavailable')
    expect(() => assertMemoryBudget(metrics, {} as never)).not.toThrow()
    expect(() => assertMemoryBudget(metrics, { maxMemoryRssMb: 1024 } as never)).toThrow('cannot be verified')
    expect(() => assertMemoryBudget(metrics, { maxMemoryRssDeltaMb: 512 } as never)).toThrow('cannot be verified')
  })

  it('requests only the four memory fields and avoids the case insensitive PowerShell PID constant', () => {
    const script = createWindowsProcessTreeMemoryScript(42, String.raw`C:\repo\watch`)
    expect(script).toContain('Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,WorkingSetSize,CommandLine')
    expect(script).not.toMatch(/\$pid\s*=/i)
  })

  it('collects actual process tree memory through the current platform probe', async () => {
    if (process.platform === 'win32') {
      const script = '$ErrorActionPreference="Stop"; @(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,WorkingSetSize,CommandLine).Count'
      await runMemoryProbe('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { signal: new AbortController().signal, timeoutMs: 15000 })
    }
    const measured = await sampleProcessTreeMemory(process.pid, new AbortController().signal)
    expect(measured.processCount).toBeGreaterThan(0)
    expect(measured.rssMb).toBeGreaterThan(0)
  })

  it.skipIf(process.platform !== 'win32')('executes the Windows traversal with a child row without assigning $PID', async () => {
    const fixture = `function Get-CimInstance { param($ClassName, $Property); @([pscustomobject]@{ ProcessId=42; ParentProcessId=1; WorkingSetSize=536870912; CommandLine='root' }, [pscustomobject]@{ ProcessId=43; ParentProcessId=42; WorkingSetSize=134217728; CommandLine='child' }) }; `
    const script = fixture + createWindowsProcessTreeMemoryScript(42, String.raw`C:\repo\watch`)
    const output = await runMemoryProbe('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { signal: new AbortController().signal, timeoutMs: 15000 })
    expect(JSON.parse(output)).toMatchObject({ rssMb: 640, maxProcessRssMb: 512, processCount: 2 })
  })
})
