import { PROCESS_OBSERVER_HOST_STARTUP_MS, PROCESS_OBSERVER_PREPARE_MS } from '../../../scripts/demo-e2e-workflow/process-observer/transport'

// 对应现有协议：观察器启动与预热、首次身份采集；这里不改变生产阶段预算。
export const localCommandStartupMs = PROCESS_OBSERVER_HOST_STARTUP_MS + PROCESS_OBSERVER_PREPARE_MS + 5000
// 两次身份采集、taskkill 与 close、进程树合作与清理、观察器 EOF 与回收。
const localCommandCleanupMs = 2 * 5000 + 5000 + 1000 + 1000 + 10_000 + 2 * 1000
// 保留 Vitest 原有 5 秒用于 fixture 文件操作和断言，协议阶段各自仍有截止时间。
export const localTestCleanupMs = 5000 + 2 * localCommandCleanupMs
export function localIntegrationTimeout(commandCount: number, actionMs: number) {
  return 5000 + commandCount * (localCommandStartupMs + localCommandCleanupMs) + actionMs
}

async function pause(timeoutMs: number, signal: AbortSignal) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort!: () => void
  try {
    await new Promise<void>((resolve, reject) => {
      abort = () => reject(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
      signal.throwIfAborted()
      timer = setTimeout(resolve, timeoutMs)
    })
  }
  finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}

/** 测试超时也拥有已接收任务；排空完成前不能还原 mock 或删除进程工作目录。 */
export function createLocalTestScope(testSignal: AbortSignal) {
  const controller = new AbortController()
  const signal = AbortSignal.any([testSignal, controller.signal])
  const pending = new Set<Promise<unknown>>()
  const interrupted = new Set<Promise<unknown>>()
  let closing: Promise<void> | undefined
  const captureInterrupted = () => {
    for (const task of pending) {
      interrupted.add(task)
    }
  }
  signal.addEventListener('abort', captureInterrupted, { once: true })
  return {
    signal,
    run<T>(action: (signal: AbortSignal) => Promise<T>, parentSignal?: AbortSignal): Promise<T> {
      if (signal.aborted) {
        return Promise.reject(signal.reason)
      }
      const combined = parentSignal ? AbortSignal.any([signal, parentSignal]) : signal
      const task = Promise.resolve().then(async () => {
        combined.throwIfAborted()
        const value = await action(combined)
        combined.throwIfAborted()
        return value
      })
      pending.add(task)
      // 只安装拒绝处理器，不替调用者消费结果；收尾仍保留取消时未完成的失败。
      void task.then(() => pending.delete(task), () => pending.delete(task))
      return task
    },
    close() {
      closing ??= (async () => {
        controller.abort(new Error('本轮测试结束，取消并排空已接收的本地命令。'))
        captureInterrupted()
        try {
          const results = await Promise.allSettled(interrupted)
          const errors = results.flatMap(result => result.status === 'rejected' && result.reason !== signal.reason ? [result.reason] : [])
          if (errors.length === 1) {
            throw errors[0]
          }
          if (errors.length) {
            throw new AggregateError(errors, '本地命令测试收尾失败。')
          }
        }
        finally {
          signal.removeEventListener('abort', captureInterrupted)
        }
      })()
      return closing
    },
  }
}

/** PID 标记必须等待同一次命令的准备协议；命令退出、取消或预算耗尽均立即失败。 */
export async function waitForLocalFixture<T>(read: () => Promise<T>, command: Promise<unknown>, signal: AbortSignal, timeoutMs = localCommandStartupMs) {
  const controller = new AbortController()
  const combined = AbortSignal.any([signal, controller.signal])
  const deadline = Date.now() + timeoutMs
  const poll = (async () => {
    let lastError: unknown
    while (true) {
      combined.throwIfAborted()
      if (Date.now() >= deadline) {
        throw new Error(`本地合成进程标记未就绪，预算=${timeoutMs}ms。`, { cause: lastError })
      }
      try {
        const value = await read()
        combined.throwIfAborted()
        if (Date.now() >= deadline) {
          throw new Error(`本地合成进程标记超过截止时间，预算=${timeoutMs}ms。`)
        }
        return value
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error
        }
        lastError = error
      }
      await pause(Math.min(25, Math.max(0, deadline - Date.now())), combined)
    }
  })()
  try {
    return await Promise.race([
      poll,
      command.then(() => { throw new Error('本地合成进程在写入标记前退出。') }),
    ])
  }
  finally {
    controller.abort()
    await poll.catch(() => {})
  }
}
