import type { ProcessIdentity } from '../../../../scripts/demo-e2e-workflow/process-table'
import { prepareWorkflowProcessObserver } from '../../../../scripts/demo-e2e-workflow/process-observer'
import { createWatchIdentityQueries } from './identity-queries'

export interface WatchIdentitySource {
  observer: {
    table: (timeoutMs: number, signal?: AbortSignal) => Promise<ProcessIdentity[]>
    subset: (group: number | undefined, pids: readonly number[], timeoutMs: number, signal?: AbortSignal) => Promise<ProcessIdentity[]>
  }
  beginStop: (deadline: number) => void
  queryDeadline?: (phaseEnd: number) => number
  ensureRunning: () => void
  close: () => Promise<void>
}

/** 业务与独立身份宿主共用原停止截止，任一失败都必须保留。 */
export async function stopWithWatchIdentity(source: WatchIdentitySource | undefined, duration: number, stopTarget: (started: number) => Promise<void>) {
  const started = Date.now()
  const failures: unknown[] = []
  try {
    source?.beginStop(started + duration)
  }
  catch (error) {
    failures.push(error)
  }
  try {
    await stopTarget(started)
  }
  catch (error) {
    failures.push(error)
  }
  try {
    await source?.close()
  }
  catch (error) {
    if (!failures.includes(error)) {
      failures.push(error)
    }
  }
  if (failures.length === 1) {
    throw failures[0]
  }
  if (failures.length) {
    throw new AggregateError(failures, 'Watch 业务进程与身份采集器收尾失败。')
  }
}

/** 身份宿主独立预热和回收；不共享内存采集器，也不使用准备阶段的业务身份。 */
export async function prepareWatchIdentitySource(prepare = prepareWorkflowProcessObserver): Promise<WatchIdentitySource | undefined> {
  const observer = await prepare()
  if (!observer) {
    return undefined
  }
  if (!observer.constrainShutdown || !observer.assertHealthy) {
    const error = new Error('Watch 身份采集器缺少绝对截止回收或健康确认能力，禁止启动业务。')
    try {
      await observer.close()
    }
    catch (closeError) {
      throw new AggregateError([error, closeError], 'Watch 身份准备失败且回收未确认。')
    }
    throw error
  }
  const queries = createWatchIdentityQueries(observer.diagnostics)
  let deadline: number | undefined
  let fence: ReturnType<typeof setTimeout> | undefined
  let closing: Promise<void> | undefined
  const close = () => {
    clearTimeout(fence)
    closing ??= (async () => {
      const failures: unknown[] = []
      try {
        await queries.drain()
      }
      catch (error) {
        failures.push(error)
      }
      if (queries.pendingCount > 0) {
        failures.push(new Error('Watch 身份请求尚未落定，取消回收未确认，不能声明宿主已关闭。'))
      }
      // 排空失败也必须领取原宿主的有界回收；同一截止不允许再次领取清理预算。
      try {
        await observer.close(deadline === undefined ? undefined : { deadline })
      }
      catch (error) {
        if (!failures.includes(error)) {
          failures.push(error)
        }
      }
      if (failures.length === 1) {
        throw failures[0]
      }
      if (failures.length) {
        throw new AggregateError(failures, 'Watch 身份查询与宿主收尾失败。')
      }
    })()
    return closing
  }
  const assertQueryAllowed = () => {
    if (closing || (deadline !== undefined && Date.now() >= deadline - 1000)) {
      throw new Error('Watch 身份采集器已进入回收期，禁止继续查询。')
    }
    observer.assertHealthy!()
  }
  return {
    observer: {
      table: async (timeoutMs, signal) => {
        assertQueryAllowed()
        return queries.run(timeoutMs, signal, (budget, requestSignal) => observer.table(budget, requestSignal))
      },
      subset: async (_group, pids, timeoutMs, signal) => {
        assertQueryAllowed()
        return queries.run(timeoutMs, signal, (budget, requestSignal) => observer.subset(pids, budget, requestSignal))
      },
    },
    ensureRunning: assertQueryAllowed,
    queryDeadline: queries.queryDeadline,
    beginStop(until) {
      deadline = Math.min(deadline ?? Number.POSITIVE_INFINITY, until)
      observer.constrainShutdown!(deadline)
      queries.beginStop(deadline)
      clearTimeout(fence)
      if (!closing) {
        // 最后一秒只取消、排空和回收；close 保留全部失败，由同一停止调用方领取。
        fence = setTimeout(() => {
          void close().catch(() => {})
        }, Math.max(0, deadline - Date.now() - 1000))
      }
    },
    close,
  }
}
