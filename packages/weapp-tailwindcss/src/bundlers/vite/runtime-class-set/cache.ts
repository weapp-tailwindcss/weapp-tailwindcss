interface RuntimeClassSetCacheOptions {
  refresh: () => Promise<void>
  collect: () => Promise<Set<string>>
}

/** 按失效版本串行刷新运行时，同版本请求共享任务，过期结果不进入缓存。 */
export function createRuntimeClassSetCache(options: RuntimeClassSetCacheOptions) {
  let revision = 0
  let preparedRevision = -1
  let value: Set<string> | undefined
  let pending: Promise<Set<string> | undefined> | undefined
  let queue: Promise<unknown> = Promise.resolve()
  let disposed = false

  function invalidate() {
    revision++
    value = undefined
    pending = undefined
  }

  function assertActive() {
    if (disposed) {
      throw new Error('Vite runtime class set cache has been disposed')
    }
  }

  function enqueue<T>(operation: () => Promise<T>) {
    const task = queue.then(operation)
    // 失败只传给本次调用者，不阻断后续刷新。
    queue = task.catch(() => {})
    return task
  }

  async function prepare(expectedRevision: number) {
    assertActive()
    if (expectedRevision !== revision || preparedRevision === expectedRevision) {
      return
    }
    await options.refresh()
    if (expectedRevision === revision) {
      preparedRevision = expectedRevision
    }
  }

  async function refresh() {
    do {
      const expectedRevision = revision
      await enqueue(() => prepare(expectedRevision))
    } while (preparedRevision !== revision)
  }

  async function get(): Promise<Set<string>> {
    while (true) {
      assertActive()
      if (value) {
        return value
      }
      const expectedRevision = revision
      pending ??= enqueue(async () => {
        await prepare(expectedRevision)
        if (expectedRevision !== revision) {
          return
        }
        const next = await options.collect()
        if (expectedRevision === revision && !disposed) {
          value = next
          return next
        }
      })
      const task = pending
      try {
        const next = await task
        if (next && expectedRevision === revision) {
          return next
        }
      }
      finally {
        if (pending === task) {
          pending = undefined
        }
      }
    }
  }

  return {
    get,
    refresh,
    invalidate,
    peek: () => value,
    revision: () => revision,
    remember(next: Set<string>, expectedRevision: number) {
      if (!disposed && expectedRevision === revision) {
        value = next
      }
    },
    dispose() {
      disposed = true
      invalidate()
    },
  }
}
