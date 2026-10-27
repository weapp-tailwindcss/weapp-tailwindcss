import type { ChildProcess } from 'node:child_process'
import type { ProcessIdentity } from '../../../scripts/demo-e2e-workflow/process-table'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import * as command from '../../../scripts/demo-e2e-workflow/process-command'
import { createWatchProcessController, WEB_STOP_PHASES } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/process-controller'

const platform = process.platform
const root = { pid: 100, parent: 1, group: 0, started: '2026-10-04T12:00:10Z' }
const workers = Array.from({ length: 8 }, (_, i) => ({ pid: 200 + i, parent: 100, group: 0, started: '2026-10-04T12:00:11Z' }))

function fixture(latencyMs: number, web = false) {
  Object.defineProperty(process, 'platform', { value: 'win32' })
  vi.useFakeTimers()
  let rows: ProcessIdentity[] = [root, ...workers]
  const child = Object.assign(new EventEmitter(), { pid: 100, exitCode: null as number | null, signalCode: null, kill: vi.fn(() => true) }) as unknown as ChildProcess
  const table = vi.fn(async () => rows)
  const subset = vi.fn(async (_group?: number, _pids?: readonly number[]) => {
    await new Promise(resolve => setTimeout(resolve, latencyMs))
    return rows
  })
  const kill = vi.spyOn(process, 'kill').mockImplementation((pid) => {
    rows = rows.filter(row => row.pid !== pid)
    return true
  })
  const taskkill = vi.spyOn(command, 'runProcessCommand').mockImplementation(async (_command, args) => {
    rows = rows.filter(row => row.pid !== Number(args[1]))
    return ''
  })
  const controller = createWatchProcessController(child, { observer: { table, subset }, ...(web ? { phases: WEB_STOP_PHASES } : {}) })
  const closeRoot = () => {
    child.exitCode = 0
    child.emit('close', 0, null)
    rows = rows.filter(row => row.pid !== root.pid).map(row => ({ ...row, parent: 1 }))
  }
  return {
    controller,
    table,
    subset,
    kill,
    taskkill,
    closeRoot,
    getRows: () => rows,
    setRows: (value: ProcessIdentity[]) => {
      rows = value
    },
  }
}

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: platform })
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it('confirms eight registered Windows descendants at the next phase entry before escalating', async () => {
  const f = fixture(600)
  await f.controller.capture()
  f.closeRoot()
  const start = Date.now()
  let completedAt: number | undefined
  const result = f.controller.stop().then(() => {
    completedAt = Date.now()
  }, error => error)
  await vi.advanceTimersByTimeAsync(8000)
  expect(await result).toBeUndefined()
  expect(completedAt! - start).toBe(3600)
  expect(f.kill.mock.calls).toEqual([...workers].reverse().map(row => [row.pid, 'SIGINT']))
  expect(f.taskkill).not.toHaveBeenCalled()
  expect(f.subset.mock.calls).toHaveLength(2)
  expect(f.subset.mock.calls[0]![1]).toEqual([root.pid, ...workers.map(row => row.pid)])
  expect(vi.getTimerCount()).toBe(0)
})

it('separately confirms Windows Web descendants within its unchanged 3000ms total stop window', async () => {
  const f = fixture(200, true)
  await f.controller.capture()
  f.closeRoot()
  const start = Date.now()
  let completedAt: number | undefined
  const result = f.controller.stop().then(() => {
    completedAt = Date.now()
  }, error => error)
  await vi.advanceTimersByTimeAsync(3000)
  expect(await result).toBeUndefined()
  expect(completedAt! - start).toBeLessThanOrEqual(3000)
  expect(f.kill.mock.calls).toEqual([...workers].reverse().map(row => [row.pid, 'SIGTERM']))
  expect(f.taskkill).not.toHaveBeenCalled()
})

it('gives healthy Web confirmation its next original phase window before escalating', async () => {
  const f = fixture(300, true)
  await f.controller.capture()
  f.closeRoot()
  const start = Date.now()
  let completedAt: number | undefined
  const result = f.controller.stop().then(() => {
    completedAt = Date.now()
  }, error => error)
  await vi.advanceTimersByTimeAsync(3000)
  expect(await result).toBeUndefined()
  expect(completedAt! - start).toBe(1800)
  expect(f.kill.mock.calls).toEqual([...workers].reverse().map(row => [row.pid, 'SIGTERM']))
  expect(f.subset).toHaveBeenCalledTimes(2)
  expect(vi.getTimerCount()).toBe(0)
})

it('keeps an actual first Web query failure terminal even with another phase remaining', async () => {
  const f = fixture(600, true)
  await f.controller.capture()
  f.closeRoot()
  const result = f.controller.stop().catch(error => error)
  await vi.advanceTimersByTimeAsync(3000)
  expect((await result).message).toContain('停止未确认')
  expect(f.subset).toHaveBeenCalledOnce()
  expect(f.kill).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('still rejects when final Web signal and confirmation cannot both fit before the original cutoff', async () => {
  const f = fixture(300, true)
  await f.controller.capture()
  f.closeRoot()
  f.kill.mockImplementation((pid, signal) => {
    if (signal === 'SIGKILL') {
      f.setRows(f.getRows().filter(row => row.pid !== pid))
    }
    return true
  })
  const result = f.controller.stop().catch(error => error)
  await vi.advanceTimersByTimeAsync(3000)
  expect((await result).message).toContain('停止未确认')
  expect(f.kill.mock.calls).toEqual(['SIGTERM', 'SIGKILL'].flatMap(signal => [...workers].reverse().map(row => [row.pid, signal])))
  expect(f.subset).toHaveBeenCalledTimes(3)
  expect(vi.getTimerCount()).toBe(0)
})

it('drains a pre-stop Windows capture and queries again before signaling any of its old identities', async () => {
  const f = fixture(0)
  await f.controller.capture()
  const oldRows = f.getRows().map(row => ({ ...row }))
  let resolveCapture!: (rows: ProcessIdentity[]) => void
  f.table.mockImplementationOnce(() => new Promise((resolve) => {
    resolveCapture = resolve
  }))
  const pending = f.controller.capture()
  f.closeRoot()
  f.setRows(workers.map(row => ({ ...row, parent: 1, started: '2026-10-04T12:00:20Z' })))
  const result = f.controller.stop().catch(error => error)
  resolveCapture(oldRows)
  await pending
  await vi.advanceTimersByTimeAsync(8000)
  expect(await result).toBeUndefined()
  expect(f.subset).toHaveBeenCalledOnce()
  expect(f.kill).not.toHaveBeenCalled()
  expect(f.taskkill).not.toHaveBeenCalled()
})

it('excludes reused, missing and zombie identities from a fresh Windows verification batch', async () => {
  const f = fixture(0)
  await f.controller.capture()
  f.closeRoot()
  f.subset.mockImplementation(async () => {
    if (f.subset.mock.calls.length === 1) {
      f.setRows(f.getRows().filter(row => row.pid !== 201).map(row => row.pid === 200
        ? { ...row, started: '2026-10-04T12:00:20Z' }
        : row.pid === 202 ? { ...row, zombie: true } : row))
    }
    return f.getRows()
  })
  const result = f.controller.stop().catch(error => error)
  await vi.advanceTimersByTimeAsync(8000)
  expect(await result).toBeUndefined()
  expect(f.kill.mock.calls.map(([pid]) => pid).sort()).toEqual([203, 204, 205, 206, 207])
})

it('checks the absolute deadline between synchronous Windows signals', async () => {
  const f = fixture(0)
  await f.controller.capture()
  f.closeRoot()
  f.kill.mockImplementation(() => {
    vi.setSystemTime(Date.now() + 8000)
    return true
  })
  const result = f.controller.stop().catch(error => error)
  await vi.advanceTimersByTimeAsync(8000)
  expect(await result).toBeInstanceOf(Error)
  expect(f.kill).toHaveBeenCalledOnce()
  expect(f.taskkill).not.toHaveBeenCalled()
})

it('preserves Windows signal failures even after a fresh query confirms that all descendants exited', async () => {
  const f = fixture(0)
  await f.controller.capture()
  f.closeRoot()
  const failure = Object.assign(new Error('fixture access denied'), { code: 'EPERM' })
  f.kill.mockImplementation(() => {
    f.setRows([])
    throw failure
  })
  const result = f.controller.stop().catch(error => error)
  await vi.advanceTimersByTimeAsync(8000)
  const error = await result
  expect(error === failure || error?.errors?.includes(failure)).toBe(true)
})

it('rejects a late Windows batch without signaling or dispatching another query', async () => {
  const f = fixture(2100)
  await f.controller.capture()
  f.closeRoot()
  const result = f.controller.stop().catch(error => error)
  await vi.advanceTimersByTimeAsync(8000)
  expect(await result).toBeInstanceOf(Error)
  expect(f.subset).toHaveBeenCalledOnce()
  expect(f.kill).not.toHaveBeenCalled()
  expect(f.taskkill).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('accepts ESRCH only after a fresh empty confirmation and never signals nonpositive PID values', async () => {
  const f = fixture(0)
  f.setRows([root, ...workers, { ...workers[0]!, pid: -1 }])
  await f.controller.capture()
  f.closeRoot()
  f.kill.mockImplementation((pid) => {
    f.setRows(f.getRows().filter(row => row.pid !== pid && row.pid > 0))
    throw Object.assign(new Error('fixture process already gone'), { code: 'ESRCH' })
  })
  const result = f.controller.stop().catch(error => error)
  await vi.advanceTimersByTimeAsync(8000)
  expect(await result).toBeUndefined()
  expect(f.kill.mock.calls.map(([pid]) => pid).every(pid => pid > 0)).toBe(true)
  expect(f.subset).toHaveBeenCalledTimes(2)
})

it('waits for a closed-root descendant to exit during the original grace before confirming at the next entry', async () => {
  const f = fixture(40)
  await f.controller.capture()
  f.closeRoot()
  f.kill.mockImplementation(() => {
    setTimeout(() => f.setRows([]), 2440)
    return true
  })
  const start = Date.now()
  let completedAt: number | undefined
  const result = f.controller.stop().then(() => {
    completedAt = Date.now()
  }, error => error)
  await vi.advanceTimersByTimeAsync(8000)
  expect(await result).toBeUndefined()
  expect(completedAt! - start).toBe(3040)
  expect(f.kill.mock.calls).toEqual([...workers].reverse().map(row => [row.pid, 'SIGINT']))
  expect(f.subset).toHaveBeenCalledTimes(2)
  expect(vi.getTimerCount()).toBe(0)
})

it('does not escalate against identities whose birth changed during the preceding grace', async () => {
  const f = fixture(0)
  await f.controller.capture()
  f.closeRoot()
  f.kill.mockImplementation(() => {
    setTimeout(() => f.setRows(f.getRows().map(row => ({ ...row, started: 'reused' }))), 100)
    return true
  })
  const result = f.controller.stop().catch(error => error)
  await vi.advanceTimersByTimeAsync(8000)
  expect(await result).toBeUndefined()
  expect(f.kill.mock.calls).toEqual([...workers].reverse().map(row => [row.pid, 'SIGINT']))
  expect(f.subset).toHaveBeenCalledTimes(2)
  expect(vi.getTimerCount()).toBe(0)
})

it('keeps root close mandatory even when later phase entries confirm an empty set', async () => {
  const f = fixture(0)
  await f.controller.capture()
  const result = f.controller.stop().catch(error => error)
  await vi.advanceTimersByTimeAsync(8000)
  expect((await result).message).toContain('close=false')
  expect(f.getRows()).toEqual([])
  expect(vi.getTimerCount()).toBe(0)
})
