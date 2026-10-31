import type { WorkflowProcessObserver } from '../../../scripts/demo-e2e-workflow/process-observer'
import type { ProcessIdentity } from '../../../scripts/demo-e2e-workflow/process-table'
import { afterEach, expect, it, vi } from 'vitest'
import { prepareWatchIdentitySource } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/process-identity'

afterEach(() => vi.useRealTimers())

it.each([false, true])('在途请求不响应取消时，排空截止仍调用原宿主回收并保留所有失败，close失败=%s', async (closeFails) => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-30T00:00:00Z'))
  const closeError = new Error('collector-close-unconfirmed')
  let finish!: (rows: ProcessIdentity[]) => void
  let querySignal: AbortSignal | undefined
  const observer = {
    table: vi.fn((_budget: number, signal?: AbortSignal) => {
      querySignal = signal
      return new Promise<ProcessIdentity[]>((resolve) => {
        finish = resolve
      })
    }),
    subset: vi.fn(async () => []),
    memory: vi.fn(),
    close: vi.fn(async (_options?: { deadline?: number }) => {
      if (closeFails) {
        throw closeError
      }
    }),
    constrainShutdown: vi.fn(),
    assertHealthy: vi.fn(),
  } satisfies WorkflowProcessObserver
  const source = (await prepareWatchIdentitySource(async () => observer))!
  const started = Date.now()
  source.beginStop(started + 3000)
  const pending = source.observer.table(5000).catch(error => error)
  await vi.advanceTimersByTimeAsync(0)
  const closing = source.close()
  expect(source.close()).toBe(closing)
  const stopped = closing.catch(error => error)
  await vi.advanceTimersByTimeAsync(1999)
  expect(querySignal?.aborted).toBe(false)
  expect(observer.close).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(querySignal?.aborted).toBe(true)
  expect(observer.close).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1000)
  const failure = await stopped
  expect(failure).toBeInstanceOf(AggregateError)
  expect(failure.errors.map(String).join('；')).toContain('取消或排空未在停止截止前确认')
  expect(failure.errors.map(String).join('；')).toContain('取消回收未确认')
  if (closeFails) {
    expect(failure.errors).toContain(closeError)
  }
  expect(observer.close).toHaveBeenCalledExactlyOnceWith({ deadline: started + 3000 })
  expect(observer.constrainShutdown).toHaveBeenCalledExactlyOnceWith(started + 3000)
  expect(Date.now()).toBe(started + 3000)
  expect(vi.getTimerCount()).toBe(0)
  // 迟到结果仍属于已取消请求，不能因兜底关闭已返回而转为成功。
  finish([{ pid: 99, parent: 1, group: 0, started: 'reused' }])
  expect(await pending).toBeInstanceOf(Error)
  expect(source.close()).toBe(closing)
  expect(observer.close).toHaveBeenCalledOnce()
})
