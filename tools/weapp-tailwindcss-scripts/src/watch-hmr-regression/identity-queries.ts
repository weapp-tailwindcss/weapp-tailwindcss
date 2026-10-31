interface TrackedIdentityQuery {
  controller: AbortController
  deadline: number
  timer?: ReturnType<typeof setTimeout>
  settled: Promise<unknown>
}

/** 热身份宿主的查询与回收共用一次停止截止；取消结果仍须完整排空。 */
export function createWatchIdentityQueries(diagnostics?: () => unknown) {
  const pending = new Set<TrackedIdentityQuery>()
  const failures: unknown[] = []
  let accepting = true
  let queryCutoff = Number.POSITIVE_INFINITY
  let shutdownDeadline = Number.POSITIVE_INFINITY
  const failure = (message: string) => new Error(`${message}；diagnostics=${JSON.stringify(diagnostics?.())}。`)
  const remember = (error: unknown) => {
    if (!failures.includes(error)) {
      failures.push(error)
    }
  }
  const arm = (query: TrackedIdentityQuery) => {
    clearTimeout(query.timer)
    const remaining = query.deadline - Date.now()
    if (remaining <= 0) {
      query.controller.abort(failure('Watch 身份查询已到绝对截止，禁止接受迟到身份'))
    }
    else {
      query.timer = setTimeout(() => {
        query.controller.abort(failure('Watch 身份查询已到绝对截止，等待原宿主回收'))
      }, remaining)
    }
  }
  return {
    queryDeadline: (phaseEnd: number) => Math.min(phaseEnd, queryCutoff),
    beginStop(deadline: number) {
      shutdownDeadline = Math.min(shutdownDeadline, deadline)
      queryCutoff = Math.min(queryCutoff, shutdownDeadline - 1000)
      for (const query of pending) {
        query.deadline = Math.min(query.deadline, queryCutoff)
        arm(query)
      }
    },
    async run<T>(timeoutMs: number, signal: AbortSignal | undefined, read: (budgetMs: number, signal: AbortSignal) => Promise<T>) {
      signal?.throwIfAborted()
      if (!accepting || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || Date.now() >= queryCutoff) {
        throw failure('Watch 身份查询已进入回收期或预算耗尽，禁止继续调度')
      }
      const controller = new AbortController()
      const query: TrackedIdentityQuery = {
        controller,
        deadline: Math.min(Date.now() + timeoutMs, queryCutoff),
        settled: Promise.resolve(),
      }
      const abort = () => controller.abort(signal?.reason)
      signal?.addEventListener('abort', abort, { once: true })
      pending.add(query)
      arm(query)
      const result = Promise.resolve().then(async () => {
        controller.signal.throwIfAborted()
        const remaining = query.deadline - Date.now()
        if (remaining <= 0) {
          throw failure('Watch 身份请求在派发前已耗尽预算')
        }
        const value = await read(remaining, controller.signal)
        controller.signal.throwIfAborted()
        if (Date.now() >= query.deadline) {
          throw failure('Watch 身份响应超过收紧后的绝对截止，不能更新归属')
        }
        return value
      }).catch((error) => {
        remember(error)
        throw error
      }).finally(() => {
        clearTimeout(query.timer)
        signal?.removeEventListener('abort', abort)
        pending.delete(query)
      })
      query.settled = result
      // 返回原失败 Promise；这里只建立处理器，完整错误继续由请求与 drain 传播。
      void result.catch(() => {})
      return result
    },
    async drain() {
      accepting = false
      if (!Number.isFinite(queryCutoff) || Date.now() >= queryCutoff) {
        for (const query of pending) {
          query.controller.abort(failure('Watch 身份宿主提前收尾，取消尚未完成的查询'))
        }
      }
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const drained = Promise.allSettled([...pending].map(query => query.settled))
        if (Number.isFinite(shutdownDeadline)) {
          await Promise.race([
            drained,
            new Promise<never>((_resolve, reject) => {
              timer = setTimeout(() => reject(failure('Watch 身份查询取消或排空未在停止截止前确认')), Math.max(0, shutdownDeadline - Date.now()))
            }),
          ])
        }
        else {
          await drained
        }
      }
      catch (error) {
        remember(error)
      }
      finally {
        clearTimeout(timer)
      }
      if (failures.length === 1) {
        throw failures[0]
      }
      if (failures.length) {
        throw new AggregateError(failures, 'Watch 身份查询停止失败。')
      }
    },
    get pendingCount() { return pending.size },
  }
}
