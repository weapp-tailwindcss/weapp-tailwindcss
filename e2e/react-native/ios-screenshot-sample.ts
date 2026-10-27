import type { ChildProcess } from 'node:child_process'
import type { NativeProcessIdentity } from '../native-command/identity'
import type { NativeProcessSampleResult } from '../native-command/sample'
import path from 'node:path'
import process from 'node:process'
import { captureNativeHostResources } from '../native-command/host'
import { readNativeProcessIdentity } from '../native-command/identity'
import { sampleNativeProcess } from '../native-command/sample'

export const IOS_SCREENSHOT_SAMPLE_AFTER_MS = 4_000
const drainTimeout = 5_000

export interface IosScreenshotSample {
  thresholdMs: number
  pid: number
  startedAtMs: number
  status: 'pending' | 'complete' | 'failed' | 'canceled' | 'identity-rejected' | 'unsupported-platform' | 'cleanup-timeout'
  resourcesAtThreshold?: ReturnType<typeof captureNativeHostResources>
  resourceError?: string
  identity?: NativeProcessIdentity
  result?: NativeProcessSampleResult
  error?: string
  settledAtMs?: number
}

interface SampleOptions {
  platform?: NodeJS.Platform
  identity?: typeof readNativeProcessIdentity
  sample?: typeof sampleNativeProcess
}

/** 一轮最多观察一个慢截图；采集与截图分别收尾，诊断不能延长截图的成功路径。 */
export function createIosScreenshotSampleOwner(directory: string, options: SampleOptions = {}) {
  let claimed = false
  const pending = new Map<Promise<void>, { controller: AbortController, record: IosScreenshotSample }>()
  return {
    observe(child: ChildProcess, index: number, elapsed: () => number, save: (sample: IosScreenshotSample) => void) {
      let spawnedPid: number | undefined
      let stopped = false
      const controller = new AbortController()
      const onSpawn = () => {
        spawnedPid = child.pid
      }
      const live = () => !stopped && spawnedPid !== undefined && Number.isSafeInteger(spawnedPid) && spawnedPid > 0
        && child.pid === spawnedPid && child.exitCode === null && child.signalCode === null
      const stop = () => {
        stopped = true
        clearTimeout(timer)
        controller.abort(new Error('Owned screenshot command has finished or was canceled'))
        child.off('spawn', onSpawn)
        child.off('exit', stop)
        child.off('close', stop)
        child.off('error', stop)
      }
      child.once('spawn', onSpawn)
      child.once('exit', stop)
      child.once('close', stop)
      child.once('error', stop)
      const timer = setTimeout(() => {
        if (claimed || !live()) {
          return
        }
        claimed = true
        const record: IosScreenshotSample = { thresholdMs: IOS_SCREENSHOT_SAMPLE_AFTER_MS, pid: spawnedPid!, startedAtMs: elapsed(), status: 'pending' }
        try {
          record.resourcesAtThreshold = captureNativeHostResources()
        }
        catch (error) {
          record.resourceError = String(error)
        }
        save(record)
        if ((options.platform ?? process.platform) !== 'darwin') {
          record.status = 'unsupported-platform'
          record.settledAtMs = elapsed()
          return
        }
        const work = (async () => {
          try {
            const identity = await (options.identity ?? readNativeProcessIdentity)(spawnedPid!, controller.signal)
            record.identity = identity
            // 异步身份读取期间退出或取消的结果不能再授权采样，防止 PID 被复用。
            if (!live() || controller.signal.aborted) {
              record.status = 'canceled'
              return
            }
            if (identity.pid !== spawnedPid || identity.parentPid !== process.pid || !identity.startedAt
              || !['xcrun', 'simctl'].includes(path.basename(identity.executable))) {
              record.status = 'identity-rejected'
              return
            }
            const file = path.join(directory, `ios-screenshot-${index}.sample.txt`)
            record.result = await (options.sample ?? sampleNativeProcess)(spawnedPid!, controller.signal, file)
            if (record.status !== 'cleanup-timeout') {
              record.status = controller.signal.aborted || record.result.status === 'canceled'
                ? 'canceled'
                : record.result.status === 'complete' ? 'complete' : 'failed'
            }
          }
          catch (error) {
            record.error = String(error)
            if (record.status !== 'cleanup-timeout') {
              record.status = controller.signal.aborted ? 'canceled' : 'failed'
            }
          }
          finally { record.settledAtMs = elapsed() }
        })()
        pending.set(work, { controller, record })
        void work.then(() => pending.delete(work))
      }, IOS_SCREENSHOT_SAMPLE_AFTER_MS)
      timer.unref()
      return stop
    },
    async drain() {
      const tasks = [...pending]
      if (!tasks.length) {
        return
      }
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          Promise.all(tasks.map(([task]) => task)),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              for (const [task, { controller, record }] of tasks) {
                if (pending.has(task)) {
                  record.status = 'cleanup-timeout'
                  controller.abort(new Error('Screenshot diagnostic cleanup exceeded 5000ms'))
                }
              }
              reject(new Error('Screenshot diagnostic cleanup exceeded 5000ms'))
            }, drainTimeout)
          }),
        ])
      }
      finally { clearTimeout(timer) }
    },
  }
}
