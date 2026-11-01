import type { ChildProcess } from 'node:child_process'
import type { WorkflowProcessObserver } from '../../../scripts/demo-e2e-workflow/process-observer'
import type { ProcessIdentity } from '../../../scripts/demo-e2e-workflow/process-table'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import { createWatchProcessController, WEB_STOP_PHASES } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/process-controller'
import { prepareWatchIdentitySource, stopWithWatchIdentity } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/process-identity'

const platform = process.platform
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
function fixture() {
  const observer = {
    table: vi.fn(async (): Promise<ProcessIdentity[]> => []),
    subset: vi.fn(async (_pids: readonly number[], _timeoutMs: number): Promise<ProcessIdentity[]> => []),
    memory: vi.fn(),
    close: vi.fn(async (_options?: { deadline?: number }) => {}),
    constrainShutdown: vi.fn(),
    assertHealthy: vi.fn(),
  } satisfies WorkflowProcessObserver
  return observer
}
afterEach(() => {
  Object.defineProperty(process, 'platform', { value: platform })
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('POSIX 不建立身份宿主，保持原平台路径', async () => {
  expect(await prepareWatchIdentitySource(async () => undefined)).toBeUndefined()
})

it.each([false, true])('缺少绝对截止能力时拒绝领取并回收准备资源，关闭失败=%s', async (closeFails) => {
  const observer = fixture()
  const failure = new Error('close-failed')
  if (closeFails) {
    observer.close.mockRejectedValue(failure)
  }
  const error = await prepareWatchIdentitySource(async () => ({ ...observer, constrainShutdown: undefined })).catch(error => error)
  expect(String(error)).toContain(closeFails ? '回收未确认' : '绝对截止')
  expect(observer.close).toHaveBeenCalledOnce()
  if (closeFails) {
    expect(error.errors).toContain(failure)
  }
})

it.each([3000, 8000])('身份回收在原 %sms 的最后一秒开始，既有关闭单飞且不能查询', async (duration) => {
  vi.useFakeTimers()
  const observer = fixture()
  observer.close.mockImplementation(async () => sleep(999))
  const source = (await prepareWatchIdentitySource(async () => observer))!
  const start = Date.now()
  const stopping = stopWithWatchIdentity(source, duration, async () => sleep(duration))
  await vi.advanceTimersByTimeAsync(duration - 1001)
  expect(observer.close).not.toHaveBeenCalled()
  await source.observer.table(1)
  await vi.advanceTimersByTimeAsync(1)
  expect(observer.close).toHaveBeenCalledExactlyOnceWith({ deadline: start + duration })
  await expect(source.observer.table(1)).rejects.toThrow('回收期')
  await expect(source.observer.subset(undefined, [1], 1)).rejects.toThrow('回收期')
  const firstClose = source.close()
  expect(source.close()).toBe(firstClose)
  await vi.advanceTimersByTimeAsync(1000)
  await stopping
  expect(observer.table).toHaveBeenCalledOnce()
  expect(observer.subset).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('后续停止约束只能收紧已有关闭，不能延后最后一秒', async () => {
  vi.useFakeTimers()
  const observer = fixture()
  const source = (await prepareWatchIdentitySource(async () => observer))!
  const start = Date.now()
  source.beginStop(start + 8000)
  source.beginStop(start + 3000)
  source.beginStop(start + 9000)
  await vi.advanceTimersByTimeAsync(2000)
  await source.close()
  expect(observer.close).toHaveBeenCalledExactlyOnceWith({ deadline: start + 3000 })
  expect(observer.constrainShutdown.mock.calls.map(([until]) => until)).toEqual([start + 8000, start + 3000, start + 3000])
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['target', 'observer', 'both', 'begin'] as const)('保留 %s 收尾失败并继续其它资源收尾', async (kind) => {
  const observer = fixture()
  const targetError = new Error('target-failed')
  const hostError = new Error('host-failed')
  const beginError = new Error('begin-failed')
  if (kind === 'observer' || kind === 'both') {
    observer.close.mockRejectedValue(hostError)
  }
  const source = (await prepareWatchIdentitySource(async () => observer))!
  if (kind === 'begin') {
    observer.constrainShutdown.mockImplementation(() => {
      throw beginError
    })
  }
  const target = vi.fn(async () => {
    if (kind === 'target' || kind === 'both') {
      throw targetError
    }
  })
  const error = await stopWithWatchIdentity(source, 3000, target).catch(error => error)
  expect(target).toHaveBeenCalledOnce()
  expect(observer.close).toHaveBeenCalledOnce()
  if (kind === 'both') {
    expect(error.errors).toEqual([targetError, hostError])
  }
  else {
    expect(error).toBe(kind === 'target' ? targetError : kind === 'observer' ? hostError : beginError)
  }
})

it('Windows Web 热身份查询只在总3秒停止窗末尾预留一次宿主回收', async () => {
  vi.useFakeTimers()
  Object.defineProperty(process, 'platform', { value: 'win32' })
  const observer = fixture()
  const root = { pid: 100, parent: 1, group: 0, started: '2026-10-29T00:00:00Z' }
  const worker = { pid: 200, parent: 100, group: 0, started: '2026-10-29T00:00:01Z' }
  let rows = [root, worker]
  const prepare = vi.fn(async () => {
    await sleep(1800)
    return observer
  })
  const preparing = prepareWatchIdentitySource(prepare)
  await vi.advanceTimersByTimeAsync(1800)
  const source = (await preparing)!
  observer.table.mockImplementation(async () => rows)
  observer.subset.mockImplementation(async () => {
    await sleep(20)
    return rows
  })
  observer.close.mockImplementation(async () => sleep(50))
  const child = Object.assign(new EventEmitter(), { pid: 100, exitCode: null, signalCode: null, kill: vi.fn() }) as unknown as ChildProcess
  const controller = createWatchProcessController(child, { identitySource: source, phases: WEB_STOP_PHASES })
  await controller.capture()
  child.exitCode = 0
  child.emit('close', 0, null)
  rows = [worker]
  const kill = vi.spyOn(process, 'kill').mockImplementation((pid) => {
    rows = rows.filter(row => row.pid !== pid)
    return true
  })
  const start = Date.now()
  let completedAt = 0
  const stopping = controller.stop().then(() => {
    completedAt = Date.now()
  })
  expect(controller.stop()).toBe(controller.stop())
  await vi.advanceTimersByTimeAsync(3000)
  await stopping
  expect(completedAt - start).toBe(1570)
  expect(observer.subset.mock.calls.map(([, budget]) => budget)).toEqual([1500, 500])
  expect(observer.close).toHaveBeenCalledExactlyOnceWith({ deadline: start + 3000 })
  expect(prepare).toHaveBeenCalledOnce()
  expect(kill).toHaveBeenCalledExactlyOnceWith(200, 'SIGTERM')
  expect(vi.getTimerCount()).toBe(0)
})
