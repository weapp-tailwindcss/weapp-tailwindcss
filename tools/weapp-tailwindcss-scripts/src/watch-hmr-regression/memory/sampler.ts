import type { MemoryUsageSample } from '../types'
import { MemoryProbeAbortedError, MemoryProbeCleanupError } from './probe'
import { MemorySourceError } from './source'

/** 上次采集落定后才调度下一次；停止时只取消活动探针并等待其自身资源回收。 */
export function createMemorySampler(options: {
  probe: (signal: AbortSignal) => Promise<MemoryUsageSample>
  onSample: (sample: MemoryUsageSample) => void
  onUnavailable: (error: Error) => void
  close?: () => Promise<void>
  intervalMs?: number
}) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let active: Promise<void> | undefined
  let stopped = false
  let terminalError: Error | undefined
  let stopping: Promise<void> | undefined
  const record = () => {
    if (stopped) {
      return
    }
    active = Promise.resolve().then(() => options.probe(controller.signal)).then((sample) => {
      if (!stopped) {
        options.onSample(sample)
      }
    }).catch((error: unknown) => {
      if (error instanceof MemoryProbeCleanupError || error instanceof MemorySourceError) {
        terminalError = error
        stopped = true
      }
      const intentionalAbort = controller.signal.aborted && (error === controller.signal.reason || (error instanceof MemoryProbeAbortedError && error.cause === controller.signal.reason))
      if (!intentionalAbort) {
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
    stop() {
      if (stopping) {
        return stopping
      }
      stopped = true
      clearTimeout(timer)
      controller.abort()
      stopping = (async () => {
        await active
        try {
          await options.close?.()
        }
        catch (error) {
          if (terminalError && error !== terminalError) {
            throw new AggregateError([terminalError, error], 'Watch 内存采样与收尾失败。')
          }
          throw error
        }
        if (terminalError) {
          throw terminalError
        }
      })()
      return stopping
    },
  }
}
