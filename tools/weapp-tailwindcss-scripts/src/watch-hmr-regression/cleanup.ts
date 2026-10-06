import type { WatchCaseMetrics } from './types'
import { promises as fs } from 'node:fs'
import process from 'node:process'
import { writeFilePreserveEol } from './text'

export class WatchHmrPartialMetricsError extends Error {
  readonly metrics: WatchCaseMetrics

  constructor(message: string, metrics: WatchCaseMetrics, options?: ErrorOptions) {
    super(message, options)
    this.name = 'WatchHmrPartialMetricsError'
    this.metrics = metrics
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

/** 按领取范围逐项收尾，单项失败不阻断剩余源码与资源，主失败始终保留。 */
export function createWatchCaseCleanup(label: string, sources: ReadonlyMap<string, string> = new Map()) {
  let failure: { error: unknown } | undefined
  let successMessage: string | undefined
  return {
    recordFailure<T>(error: T): T {
      failure = { error }
      return error
    },
    recordSuccess(message: string) {
      successMessage = message
    },
    async finish(resources: {
      stopMonitor?: () => Promise<void>
      stopSession?: () => Promise<void>
    } = {}) {
      const cleanupErrors: Error[] = []
      const attempt = async (stage: string, task: () => Promise<void>) => {
        try {
          await task()
        }
        catch (error) {
          cleanupErrors.push(new Error(`${stage}：${errorMessage(error)}`, { cause: error }))
        }
      }
      for (const [sourcePath, original] of sources) {
        await attempt(`恢复源码 ${sourcePath} 失败`, async () => {
          let current: string | undefined
          try {
            current = await fs.readFile(sourcePath, 'utf8')
          }
          catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
              throw error
            }
          }
          if (current !== original) {
            await writeFilePreserveEol(sourcePath, original, original, { normalizeEol: false })
            if (await fs.readFile(sourcePath, 'utf8') !== original) {
              throw new Error('恢复后的源码与原始内容不一致')
            }
          }
        })
      }
      if (resources.stopMonitor) {
        await attempt('停止输出完整性监控失败', resources.stopMonitor)
      }
      if (resources.stopSession) {
        await attempt('停止 watch session 失败', resources.stopSession)
      }
      if (cleanupErrors.length === 0) {
        if (!failure && successMessage) {
          process.stdout.write(successMessage)
        }
        return
      }

      const errors = [...(failure ? [failure.error] : []), ...cleanupErrors]
      // CLI 打印顶层 stack；完整失败文本必须在 message 中可见，cause 另保留原始对象。
      const aggregate = new AggregateError(errors, `[${label}] watch/HMR 收尾失败：\n${errors.map(errorMessage).join('\n')}`, failure ? { cause: failure.error } : undefined)
      if (failure?.error instanceof WatchHmrPartialMetricsError) {
        throw new WatchHmrPartialMetricsError(aggregate.message, failure.error.metrics, { cause: aggregate })
      }
      throw aggregate
    },
  }
}
