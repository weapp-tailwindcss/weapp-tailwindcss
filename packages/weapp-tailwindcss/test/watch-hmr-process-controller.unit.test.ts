import type { ChildProcess } from 'node:child_process'
import type { ProcessIdentity } from '../../../scripts/demo-e2e-workflow/process-table'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as command from '../../../scripts/demo-e2e-workflow/process-command'
import { createWatchProcessController, WEB_STOP_PHASES } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/process-controller'

const platform = process.platform
const root = { pid: 100, parent: 1, group: 100, started: '2026-10-04T12:00:10Z' }
const worker = { pid: 200, parent: 100, group: 200, started: '2026-10-04T12:00:11Z' }
function fixture() {
  let rows: ProcessIdentity[] = [root, worker]
  const child = Object.assign(new EventEmitter(), { pid: 100, exitCode: null as number | null, signalCode: null, kill: vi.fn(() => true) }) as unknown as ChildProcess
  const close = () => {
    child.exitCode = 0
    child.emit('close', 0, null)
  }
  const table = vi.fn(async (_timeout?: number, _signal?: AbortSignal) => rows)
  const subset = vi.fn(async (_group?: number, _pids?: readonly number[], _timeout?: number, _signal?: AbortSignal) => rows)
  const controller = createWatchProcessController(child, { observer: { table, subset } })
  return { child, close, table, subset, controller, setRows: (value: ProcessIdentity[]) => {
    rows = value
  }, getRows: () => rows }
}
afterEach(() => {
  Object.defineProperty(process, 'platform', { value: platform })
  vi.useRealTimers()
  vi.restoreAllMocks()
})
describe('watch owned process shutdown', () => {
  it('waits for registered reparented descendants after root close and shares the final stop promise', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
    const f = fixture()
    expect((await f.controller.capture()).has(200)).toBe(true)
    f.close()
    f.setRows([{ ...worker, parent: 1 }])
    const kill = vi.spyOn(process, 'kill').mockImplementation((pid) => {
      f.setRows(f.getRows().filter(row => row.pid !== pid))
      return true
    })
    const stop = f.controller.stop()
    expect(f.controller.stop()).toBe(stop)
    await stop
    expect(kill).toHaveBeenCalledExactlyOnceWith(200, 'SIGINT')
    expect(f.controller.stop()).toBe(stop)
    await expect(f.controller.capture()).rejects.toThrow('不再接受')
  })
  it('does not report success when SIGKILL still leaves a registered descendant alive', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
    vi.useFakeTimers()
    const f = fixture()
    await f.controller.capture()
    f.close()
    f.setRows([{ ...worker, parent: 1 }])
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
    const error = f.controller.stop().catch(error => error)
    await vi.advanceTimersByTimeAsync(8000)
    expect((await error).message).toContain('停止未确认')
    expect(kill.mock.calls).toEqual([[200, 'SIGINT'], [200, 'SIGTERM'], [200, 'SIGKILL']])
    expect(vi.getTimerCount()).toBe(0)
  })
  it('does not signal a reused PID or an unrelated process with the same parent number', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
    const f = fixture()
    await f.controller.capture()
    f.close()
    f.setRows([{ ...worker, parent: 1, started: '2026-10-04T12:00:20Z' }, { ...worker, pid: 300, parent: 100 }])
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
    await f.controller.stop()
    expect(kill).not.toHaveBeenCalled()
  })
  it('keeps a failed identity query and never treats root close as an empty process set', async () => {
    vi.useFakeTimers()
    const f = fixture()
    await f.controller.capture()
    f.close()
    const failure = new Error('identity probe failed')
    f.subset.mockRejectedValue(failure)
    const error = f.controller.stop().catch(error => error)
    await vi.advanceTimersByTimeAsync(8000)
    const result = await error
    expect(result.errors).toContain(failure)
    expect(result.message).toContain('停止未确认')
    expect(f.subset).toHaveBeenCalledTimes(1)
  })
  it('tightens an in-flight query before the first phase deadline and leaves the original reap reserve', async () => {
    vi.useFakeTimers()
    const f = fixture()
    let abortedAt: number | undefined
    f.table.mockImplementation((_timeout?: number, signal?: AbortSignal) => new Promise((_resolve, reject) => {
      signal!.addEventListener('abort', () => {
        abortedAt = Date.now()
        setTimeout(() => reject(signal!.reason), 1000)
      }, { once: true })
    }))
    const start = Date.now()
    const capture = f.controller.capture().catch(error => error)
    const error = f.controller.stop().catch(error => error)
    await vi.advanceTimersByTimeAsync(8000)
    expect(abortedAt! - start).toBe(2000)
    expect(await capture).toBeInstanceOf(Error)
    expect(await error).toBeInstanceOf(Error)
    expect(f.table).toHaveBeenCalledOnce()
    expect(f.child.kill).toHaveBeenCalledWith('SIGKILL')
    expect(vi.getTimerCount()).toBe(0)
  })
  it('verifies each Windows PID again and invokes taskkill without recursive expansion', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    const f = fixture()
    await f.controller.capture()
    f.close()
    f.setRows([{ ...worker, parent: 1 }])
    const taskkill = vi.spyOn(command, 'runProcessCommand').mockImplementation(async () => {
      f.setRows([])
      return ''
    })
    await f.controller.stop()
    expect(taskkill).toHaveBeenCalledExactlyOnceWith('taskkill', ['/pid', '200', '/f'], expect.any(Number), expect.any(AbortSignal))
    expect(f.subset).toHaveBeenCalledWith(undefined, [200], expect.any(Number), expect.any(AbortSignal))
    expect(taskkill.mock.calls[0]![2]).toBeLessThanOrEqual(2000)
  })
  it('keeps the Web 3000ms total window and rejects unconfirmed descendants after its final kill', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
    vi.useFakeTimers()
    const f = fixture()
    const controller = createWatchProcessController(f.child, { phases: WEB_STOP_PHASES, observer: { table: f.table, subset: f.subset } })
    await controller.capture()
    f.close()
    f.setRows([{ ...worker, parent: 1 }])
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
    const start = Date.now()
    const error = controller.stop().catch(error => error)
    await vi.advanceTimersByTimeAsync(3000)
    expect(await error).toBeInstanceOf(Error)
    expect(Date.now() - start).toBe(3000)
    expect(kill.mock.calls).toEqual([[200, 'SIGTERM'], [200, 'SIGKILL']])
    expect(vi.getTimerCount()).toBe(0)
  })
})

it('a stalled per-PID verification cannot exceed the original stop deadline or schedule further probes', async () => {
  Object.defineProperty(process, 'platform', { value: 'linux' })
  vi.useFakeTimers()
  const f = fixture()
  await f.controller.capture()
  f.close()
  f.setRows([{ ...worker, parent: 1 }])
  let resolveLate!: (rows: ProcessIdentity[]) => void
  f.subset.mockImplementation(async (_group, pids) => {
    if (pids?.length === 1) {
      return new Promise((resolve) => {
        resolveLate = resolve
      })
    }
    return f.getRows()
  })
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
  const stop = f.controller.stop().catch(error => error)
  await vi.advanceTimersByTimeAsync(8000)
  expect(await stop).toBeInstanceOf(Error)
  expect(f.subset).toHaveBeenCalledTimes(2)
  resolveLate([worker])
  await Promise.resolve()
  expect(kill).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('a failed Windows termination probe prevents subsequent process queries', async () => {
  Object.defineProperty(process, 'platform', { value: 'win32' })
  vi.useFakeTimers()
  const f = fixture()
  await f.controller.capture()
  f.close()
  f.setRows([{ ...worker, parent: 1 }])
  const failure = new Error('taskkill close not confirmed')
  const taskkill = vi.spyOn(command, 'runProcessCommand').mockRejectedValue(failure)
  const stop = f.controller.stop().catch(error => error)
  await vi.advanceTimersByTimeAsync(8000)
  expect((await stop).errors).toContain(failure)
  expect(taskkill).toHaveBeenCalledOnce()
  expect(f.subset).toHaveBeenCalledTimes(2)
})

it('a caller cannot mutate the internal ownership snapshot', async () => {
  const f = fixture()
  const initial = await f.controller.capture()
  initial.clear()
  f.controller.snapshot().get(200)!.started = 'replaced'
  expect(f.controller.snapshot().get(200)).toEqual(worker)
})

it('rejects a verification result returned after its execution cancellation', async () => {
  Object.defineProperty(process, 'platform', { value: 'linux' })
  vi.useFakeTimers()
  const f = fixture()
  await f.controller.capture()
  f.close()
  f.setRows([{ ...worker, parent: 1 }])
  f.subset.mockImplementation(async (_group, pids) => {
    if (pids?.length === 1) {
      return new Promise(resolve => setTimeout(resolve, 2100, [worker]))
    }
    return f.getRows()
  })
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
  const stop = f.controller.stop().catch(error => error)
  await vi.advanceTimersByTimeAsync(8000)
  expect(await stop).toBeInstanceOf(Error)
  expect(kill).not.toHaveBeenCalled()
  expect(f.subset).toHaveBeenCalledTimes(2)
})

it('still requests final SIGKILL on its held live root when the last identity query exhausts the total budget', async () => {
  Object.defineProperty(process, 'platform', { value: 'linux' })
  vi.useFakeTimers()
  const f = fixture()
  f.setRows([root])
  await f.controller.capture()
  const start = Date.now()
  f.table.mockImplementation(async () => {
    if (Date.now() - start >= 5500) {
      return new Promise(() => {})
    }
    return [root]
  })
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
  const stop = f.controller.stop().catch(error => error)
  await vi.advanceTimersByTimeAsync(8000)
  expect(await stop).toBeInstanceOf(Error)
  expect(f.child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
  expect(kill.mock.calls).toEqual([[100, 'SIGINT'], [100, 'SIGTERM']])
  expect(vi.getTimerCount()).toBe(0)
})
