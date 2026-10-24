import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'

interface ProcessEvent {
  atMs: number
  code: number | null
  signal: NodeJS.Signals | null
}

interface ScreenshotDiagnostic {
  index: number
  output: string
  device: string
  startedAt: string
  status: 'pending' | 'succeeded' | 'failed'
  elapsedMs: number
  pid?: number
  spawnedAtMs?: number
  exit?: ProcessEvent
  stdioClosed?: ProcessEvent
  subprocessSettled?: { atMs: number, status: 'succeeded' | 'failed' }
  cancelled?: { atMs: number, reason: string }
  stat?: { startedAtMs: number, settledAtMs?: number, size?: number, error?: string }
  settledAtMs?: number
  error?: string
  eventLoop: {
    intervalMs: number
    samples: number
    maxDelayMs: number
    meanDelayMs: number | null
    pendingDelayMs: number
    stopped: boolean
  }
}

/** 只观察截图期间的调度延迟；心跳不承担超时或成功判定，也不等待额外一轮采样。 */
function observeEventLoop(elapsed: () => number, record: ScreenshotDiagnostic) {
  const state = record.eventLoop
  let expected = elapsed() + state.intervalMs
  let total = 0
  let timer: ReturnType<typeof setTimeout>
  const sample = () => {
    const now = elapsed()
    const delay = Math.max(0, now - expected)
    state.samples++
    state.maxDelayMs = Math.max(state.maxDelayMs, delay)
    total += delay
    state.meanDelayMs = total / state.samples
    expected = now + state.intervalMs
    timer = setTimeout(sample, state.intervalMs)
    timer.unref()
  }
  timer = setTimeout(sample, state.intervalMs)
  timer.unref()
  return {
    snapshot() {
      if (!state.stopped) {
        state.pendingDelayMs = Math.max(0, elapsed() - expected)
      }
    },
    stop() {
      this.snapshot()
      clearTimeout(timer)
      state.stopped = true
    },
  }
}

/** 截图关键路径只记录内存；复用原命令和 stat，全部诊断在采集 owner 排空后统一落盘。 */
export function createIosScreenshotDiagnostics(artifacts: string, runId: string) {
  const records: Array<{ record: ScreenshotDiagnostic, snapshot: () => void }> = []

  return {
    async capture(output: string, device: string, cancelSignal?: AbortSignal) {
      const started = performance.now()
      const elapsed = () => Math.max(0, performance.now() - started)
      const record: ScreenshotDiagnostic = {
        index: records.length + 1,
        output,
        device,
        startedAt: new Date(performance.timeOrigin + started).toISOString(),
        status: 'pending',
        elapsedMs: 0,
        eventLoop: { intervalMs: 100, samples: 0, maxDelayMs: 0, meanDelayMs: null, pendingDelayMs: 0, stopped: false },
      }
      const eventLoop = observeEventLoop(elapsed, record)
      records.push({ record, snapshot() {
        record.elapsedMs = record.settledAtMs ?? elapsed()
        eventLoop.snapshot()
      } })
      const onAbort = () => {
        record.cancelled = { atMs: elapsed(), reason: String(cancelSignal?.reason) }
      }
      cancelSignal?.addEventListener('abort', onAbort, { once: true })
      if (cancelSignal?.aborted) {
        onAbort()
      }
      try {
        const command = execa('xcrun', ['simctl', 'io', device, 'screenshot', output], { ...(cancelSignal ? { cancelSignal } : {}), forceKillAfterDelay: 1_000 })
        if (command.pid !== undefined) {
          record.pid = command.pid
        }
        command.once('spawn', () => {
          record.spawnedAtMs = elapsed()
          if (command.pid !== undefined) {
            record.pid = command.pid
          }
        })
        command.once('exit', (code, signal) => {
          record.exit = { atMs: elapsed(), code, signal }
        })
        command.once('close', (code, signal) => {
          record.stdioClosed = { atMs: elapsed(), code, signal }
        })
        try {
          await command
          record.subprocessSettled = { atMs: elapsed(), status: 'succeeded' }
        }
        catch (error) {
          record.subprocessSettled = { atMs: elapsed(), status: 'failed' }
          throw error
        }
        cancelSignal?.throwIfAborted()
        const statRecord: NonNullable<ScreenshotDiagnostic['stat']> = record.stat = { startedAtMs: elapsed() }
        try {
          const stat = await fs.stat(output)
          statRecord.size = stat.size
        }
        catch (error) {
          statRecord.error = String(error)
          throw error
        }
        finally {
          statRecord.settledAtMs = elapsed()
        }
        if (statRecord.size! < 1024) {
          throw new Error(`ios screenshot is unexpectedly small: ${statRecord.size}`)
        }
        record.status = 'succeeded'
        return output
      }
      catch (error) {
        record.status = 'failed'
        record.error = String(error)
        throw error
      }
      finally {
        record.settledAtMs = record.elapsedMs = elapsed()
        eventLoop.stop()
        cancelSignal?.removeEventListener('abort', onAbort)
      }
    },
    async flush() {
      for (const item of records) {
        item.snapshot()
      }
      await fs.writeFile(path.join(artifacts, 'ios-screenshots.json'), `${JSON.stringify({
        schemaVersion: 1,
        runId,
        platform: 'ios',
        snapshotAt: new Date().toISOString(),
        hostPid: process.pid,
        command: ['xcrun', 'simctl', 'io', '<device>', 'screenshot', '<output>'],
        clock: 'performance.now',
        records: records.map(item => item.record),
      }, null, 2)}\n`, 'utf8')
    },
  }
}
