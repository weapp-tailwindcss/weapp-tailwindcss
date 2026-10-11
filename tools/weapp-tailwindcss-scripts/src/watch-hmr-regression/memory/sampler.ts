import type { MemoryUsageSample } from '../types'
import { MemoryProbeCleanupError } from './probe'

/** 上次采集落定后才调度下一次；停止时只取消活动探针并等待其自身资源回收。 */
export function createMemorySampler(options: {
  probe: (signal: AbortSignal) => Promise<MemoryUsageSample>
  onSample: (sample: MemoryUsageSample) => void
  onUnavailable: (error: Error) => void
  intervalMs?: number
}) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let active: Promise<void> | undefined
  let stopped = false
  let cleanupError: MemoryProbeCleanupError | undefined
  const record = () => {
    if (stopped) {
      return
    }
    active = Promise.resolve().then(() => options.probe(controller.signal)).then((sample) => {
      if (!stopped) {
        options.onSample(sample)
      }
    }).catch((error: unknown) => {
      if (error instanceof MemoryProbeCleanupError) {
        cleanupError = error
        stopped = true
      }
      if (!controller.signal.aborted || cleanupError) {
        options.onUnavailable(error instanceof Error ? error : new Error(String(error)))
      }
    }).finally(() => {
      active = undefined
      if (!stopped) {
        timer = setTimeout(record, options.intervalMs ?? 1000)
        timer.unref?.()
      }
    })
  }
  record()
  return {
    async stop() {
      stopped = true
      clearTimeout(timer)
      controller.abort()
      await active
      if (cleanupError) {
        throw cleanupError
      }
    },
  }
}
