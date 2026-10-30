export interface ViteBuildEvent {
  code: string
  error?: unknown
}

export interface ViteBuildWatcher {
  close: () => Promise<void> | void
  on: (event: 'event', listener: (event: ViteBuildEvent) => void) => void
  off: (event: 'event', listener: (event: ViteBuildEvent) => void) => void
}

/** 取消只结束事件等待；已发出的启动与关闭仍由本会话完整等待。 */
export function createViteWatchSession(signal: AbortSignal) {
  let watcher: ViteBuildWatcher | undefined
  let starting: Promise<ViteBuildWatcher> | undefined
  let closing: Promise<void> | undefined
  let closeRequested = false
  const closedError = new Error('本轮 Vite watcher 已开始关闭，不能再次等待构建')
  const waiting = new Set<(error: unknown) => void>()
  const reason = () => signal.aborted ? signal.reason : closedError

  const close = () => {
    if (closing) {
      return closing
    }
    closeRequested = true
    for (const cancel of [...waiting]) {
      cancel(reason())
    }
    closing = (async () => {
      try {
        await starting
      }
      catch {
        // 启动失败由 start 返回；尚未取得 watcher 时没有可关闭的句柄。
      }
      if (watcher) {
        await watcher.close()
      }
    })().finally(() => signal.removeEventListener('abort', onAbort))
    return closing
  }
  const onAbort = () => {
    // 自动收尾的错误仍由 finally/afterEach 等待同一个 close Promise 传播。
    void close().catch(() => {})
  }
  signal.addEventListener('abort', onAbort, { once: true })
  if (signal.aborted) {
    onAbort()
  }

  return {
    async start(open: () => Promise<ViteBuildWatcher>) {
      signal.throwIfAborted()
      if (closeRequested || starting) {
        throw closedError
      }
      // 先登记 Promise，再调用构建器，取消时不能遗失迟到的 watcher。
      starting = Promise.resolve().then(() => {
        signal.throwIfAborted()
        if (closeRequested) {
          throw closedError
        }
        return open()
      }).then((created) => {
        watcher = created
        return created
      })
      await starting
      signal.throwIfAborted()
      if (closeRequested) {
        throw closedError
      }
    },
    waitForEnd() {
      const pending = new Promise<void>((resolve, reject) => {
        if (signal.aborted || closeRequested) {
          reject(reason())
          return
        }
        const current = watcher
        if (!current) {
          reject(new Error('必须先启动本轮 Vite watcher'))
          return
        }
        const cleanup = () => {
          current.off('event', onEvent)
          waiting.delete(cancel)
        }
        const cancel = (error: unknown) => {
          cleanup()
          reject(error)
        }
        const onEvent = (event: ViteBuildEvent) => {
          if (event.code === 'ERROR') {
            cancel(event.error instanceof Error ? event.error : new Error(String(event.error)))
          }
          else if (event.code === 'END') {
            cleanup()
            resolve()
          }
        }
        waiting.add(cancel)
        current.on('event', onEvent)
      })
      // 调用方可能仍在等待本轮文件写入；提前保留拒绝处理，随后 await 仍取得原错误。
      void pending.catch(() => {})
      return pending
    },
    close,
  }
}

/** 测试超时后先等待原操作与准确归属的关闭，再允许删除夹具。 */
export async function joinViteWatchCleanup(
  operations: readonly Promise<unknown>[],
  closes: readonly (() => Promise<void>)[],
  cleanup: () => Promise<void>,
) {
  // 测试体已负责报告原操作失败；这里必须等到其 finally 真正完成。
  await Promise.allSettled(operations)
  const results = await Promise.allSettled(closes.map(close => close()))
  const errors = results.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
  if (errors.length) {
    throw new AggregateError(errors, 'Vite watcher 关闭失败，保留夹具供检查')
  }
  await cleanup()
}
