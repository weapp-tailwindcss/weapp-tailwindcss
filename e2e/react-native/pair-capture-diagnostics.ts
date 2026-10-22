import type { NativeCheckpoint, NativePairEvidence } from '../../examples/react-native-expo/src/compatibility/protocol'
import { writeFileSync } from 'node:fs'
import process from 'node:process'
import { NATIVE_CAPTURE_TIMEOUT } from './capture-budget'

type CaptureStage = 'write-pair' | 'capture-screenshot' | 'read-screenshot' | 'decode-screenshot' | 'assess-screenshot' | 'wait-for-next-frame' | 'write-receipt'

interface FrameDiagnostic {
  index: number
  startedAtMs: number
  capturedAtMs?: number
  readAtMs?: number
  decodedAtMs?: number
  assessmentReusedFromFrame?: number
  assessedAtMs?: number
  sha256?: string
  byteLength?: number
  consecutive?: number
  checkpoints?: NativeCheckpoint[]
}

/** 失败时同步保存采集进展；外层取消不必等待仍在途的截图子进程。诊断不参与支持判定。 */
export function createPairCaptureDiagnostics(pair: NativePairEvidence, filename: string, signal?: AbortSignal) {
  const started = performance.now()
  const frames: FrameDiagnostic[] = []
  let stage: CaptureStage = 'write-pair'
  let consecutive = 0
  let saved = false
  let persistenceError: unknown
  const elapsed = () => Math.max(0, performance.now() - started)

  function persist(error: unknown) {
    if (saved) {
      return
    }
    saved = true
    try {
      writeFileSync(filename, `${JSON.stringify({
        schemaVersion: 1,
        runId: pair.runId,
        revision: pair.revision,
        id: pair.id,
        phase: pair.phase,
        platform: pair.platform,
        timeoutMs: NATIVE_CAPTURE_TIMEOUT,
        status: 'failed',
        stage,
        elapsedMs: elapsed(),
        consecutive,
        frames,
        error: String(error),
      }, null, 2)}\n`)
    }
    catch (failure) {
      persistenceError = failure
    }
  }

  function abort() {
    persist(signal?.reason)
    if (persistenceError) {
      // 取消可能已使外层预算先行返回，落盘错误必须同时保留在作业日志。
      process.stderr.write(`React Native capture diagnostics could not be saved: ${String(persistenceError)}\n`)
    }
  }

  signal?.addEventListener('abort', abort, { once: true })
  return {
    elapsed,
    stage(next: CaptureStage) { stage = next },
    beginFrame() {
      const frame: FrameDiagnostic = { index: frames.length + 1, startedAtMs: elapsed() }
      frames.push(frame)
      stage = 'capture-screenshot'
      return frame
    },
    assessed(frame: FrameDiagnostic, checkpoints: NativeCheckpoint[]) {
      consecutive = checkpoints.every(checkpoint => checkpoint.passed) ? consecutive + 1 : 0
      Object.assign(frame, { assessedAtMs: elapsed(), consecutive, checkpoints })
    },
    fail(error: unknown) {
      persist(error)
      return persistenceError ? new AggregateError([error, persistenceError], 'Native capture and diagnostic persistence failed') : error
    },
    dispose() { signal?.removeEventListener('abort', abort) },
  }
}
