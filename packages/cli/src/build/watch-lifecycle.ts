import process from 'node:process'

/** 统一管理等待与停止，停止只唤醒循环，由调用方等待在途构建及清理完成。 */
export function createWatchLifecycle() {
  let stopped = false
  let wake: (() => void) | undefined
  const stop = () => {
    stopped = true
    wake?.()
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  return {
    get stopped() { return stopped },
    wake() { wake?.() },
    async wait(interval?: number) {
      if (stopped) {
        return
      }
      await new Promise<void>((resolve) => {
        const timer = interval === undefined ? undefined : setTimeout(() => wake?.(), interval)
        wake = () => {
          clearTimeout(timer)
          wake = undefined
          resolve()
        }
      })
    },
    dispose() {
      process.removeListener('SIGINT', stop)
      process.removeListener('SIGTERM', stop)
    },
  }
}

export type WatchLifecycle = ReturnType<typeof createWatchLifecycle>
