import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import { createProcessOwnershipTracker } from '../scripts/demo-e2e-workflow/process-ownership'
import * as table from '../scripts/demo-e2e-workflow/process-table'

const root = { pid: 100, parent: 1, group: 100, started: '2026-10-04T12:00:10Z' }
const routes = ['process-table', 'observer'] as const

function createTracker(route: typeof routes[number]) {
  const child = Object.assign(new EventEmitter(), { pid: root.pid, exitCode: null, signalCode: null }) as ChildProcess
  const direct = vi.spyOn(table, 'readProcessTable').mockResolvedValue([root])
  const directSubset = vi.spyOn(table, 'readProcessSubset').mockResolvedValue([root])
  const observed = vi.fn().mockResolvedValue([root])
  const observedSubset = vi.fn().mockResolvedValue([root])
  const tracker = createProcessOwnershipTracker(child, new Promise<void>(() => {}), {
    ...(route === 'observer' ? { observer: { table: observed, subset: observedSubset } } : {}),
  })
  return { tracker, direct, directSubset, observed, observedSubset, probe: route === 'observer' ? observed : direct }
}

afterEach(() => vi.restoreAllMocks())

it.each(routes)('%s 默认总预算精确为 5000ms，并逐毫秒扣除首次查询前的同步耗时', async (route) => {
  for (const elapsed of [0, 1]) {
    const { tracker, probe } = createTracker(route)
    // 首次读取建立绝对截止，后续读取都停在已经过 elapsed 毫秒的同一时刻。
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000 + elapsed).mockReturnValueOnce(1000)
    try {
      expect([...(await tracker.capture()).keys()]).toEqual([root.pid])
      expect(probe).toHaveBeenCalledExactlyOnceWith(5000 - elapsed, expect.any(AbortSignal))
    }
    finally {
      clock.mockRestore()
      vi.restoreAllMocks()
    }
  }
})

it.each(routes)('%s 显式清理截止只传递原 2000ms 的剩余值，不能重开 5000ms', async (route) => {
  for (const elapsed of [0, 1]) {
    const { tracker, probe } = createTracker(route)
    // 模拟调用方在 1000ms 固定 3000ms 截止；capture 不得重新领取默认预算。
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000 + elapsed)
    try {
      expect([...(await tracker.capture(3000)).keys()]).toEqual([root.pid])
      expect(probe).toHaveBeenCalledExactlyOnceWith(2000 - elapsed, expect.any(AbortSignal))
    }
    finally {
      clock.mockRestore()
      vi.restoreAllMocks()
    }
  }
})

it.each(routes)('%s 首次查询前默认预算只剩 1ms 或已经耗尽时不启动任何探针', async (route) => {
  for (const elapsed of [4999, 5000]) {
    const { tracker, direct, directSubset, observed, observedSubset } = createTracker(route)
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000 + elapsed).mockReturnValueOnce(1000)
    try {
      await expect(tracker.capture()).rejects.toThrow('进程归属扫描预算已耗尽，禁止继续调度。')
      expect(tracker.current.size).toBe(0)
      for (const probe of [direct, directSubset, observed, observedSubset]) {
        expect(probe).not.toHaveBeenCalled()
      }
    }
    finally {
      clock.mockRestore()
      vi.restoreAllMocks()
    }
  }
})
