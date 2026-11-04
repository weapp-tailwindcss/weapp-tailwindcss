import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { PNG } from 'pngjs'
import { runWithCleanup } from '../../scripts/e2e-preflight/cleanup'
import { captureNativeHostResources } from '../native-command/host'
import { NATIVE_CAPTURE_TIMEOUT } from './capture-budget'

interface ReadinessFrame {
  name: string
  startedAtMs: number
  capturedAtMs?: number
  readAtMs?: number
  decodedAtMs?: number
  width?: number
  height?: number
  sha256?: string
  bytes?: number
}

interface ReadinessAttempt {
  index: number
  startedAtMs: number
  settledAtMs?: number
  windowMs: number
  status: 'pending' | 'ready' | 'window-exhausted' | 'failed'
  frames: ReadinessFrame[]
  resources: ReturnType<typeof captureNativeHostResources>
  error?: string
}

/** context 发布前验证真实截图、读取和解码的吞吐；这些帧不作为用例或像素支持证据。 */
export async function awaitIosCaptureReadiness(options: {
  directory: string
  runId: string
  invocationId: string
  device: string
  bundleId: string
  startupDeadline: number
  signal: AbortSignal
  capture: (filename: string, signal: AbortSignal) => Promise<unknown>
}) {
  const { directory, runId, invocationId, device, bundleId, startupDeadline, signal, capture } = options
  if (![runId, invocationId, device].every(value => typeof value === 'string' && /^[\w.-]+$/.test(value)) || bundleId !== 'com.weapptailwindcss.rncompat') {
    throw new Error('iOS capture readiness has an invalid runtime identity')
  }
  const started = performance.now()
  const remainingStartup = startupDeadline - Date.now()
  const deadline = started + remainingStartup
  const elapsed = () => performance.now() - started
  const attempts: ReadinessAttempt[] = []
  const startupError = new Error('iOS capture readiness exhausted the existing native startup deadline')
  const checkStartup = () => {
    signal.throwIfAborted()
    if (!Number.isFinite(remainingStartup) || performance.now() >= deadline) {
      throw startupError
    }
  }
  let failure: unknown
  let failed = false
  await fs.mkdir(directory, { recursive: true })
  return runWithCleanup(async () => {
    try {
      while (true) {
        checkStartup()
        const window = new AbortController()
        const combined = AbortSignal.any([signal, window.signal])
        const windowMs = Math.min(NATIVE_CAPTURE_TIMEOUT, deadline - performance.now())
        const attempt: ReadinessAttempt = {
          index: attempts.length + 1,
          startedAtMs: elapsed(),
          windowMs,
          status: 'pending',
          frames: [],
          resources: captureNativeHostResources(),
        }
        attempts.push(attempt)
        const exhausted = new Error(`iOS capture readiness window exceeded ${windowMs}ms`)
        const timer = setTimeout(() => window.abort(exhausted), Math.ceil(windowMs))
        const checkWindow = () => {
          checkStartup()
          if (elapsed() - attempt.startedAtMs >= windowMs && !window.signal.aborted) {
            window.abort(exhausted)
          }
          combined.throwIfAborted()
        }
        try {
          for (let index = 1; index <= 2; index++) {
            checkWindow()
            const name = `attempt-${attempt.index}-frame-${index}.png`
            const frame: ReadinessFrame = { name, startedAtMs: elapsed() }
            attempt.frames.push(frame)
            const file = path.join(directory, name)
            await capture(file, combined)
            frame.capturedAtMs = elapsed()
            checkWindow()
            const bytes = await fs.readFile(file, { signal: combined })
            frame.readAtMs = elapsed()
            const png = PNG.sync.read(bytes)
            Object.assign(frame, { decodedAtMs: elapsed(), width: png.width, height: png.height, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
            checkWindow()
            const previous = attempt.frames[0]!
            if (png.width <= 0 || png.height <= 0 || png.width !== previous.width || png.height !== previous.height) {
              throw new Error('iOS capture readiness has inconsistent PNG dimensions')
            }
            if (index === 1) {
              await delay(100, undefined, { signal: combined })
            }
          }
          checkWindow()
          attempt.status = 'ready'
          return
        }
        catch (error) {
          attempt.error = String(error)
          attempt.status = 'failed'
          checkStartup()
          const windowExpired = error === exhausted || (error instanceof Error && error.name === 'AbortError' && error.cause === exhausted)
          if (!window.signal.aborted || window.signal.reason !== exhausted || !windowExpired) {
            throw error
          }
          attempt.status = 'window-exhausted'
        }
        finally {
          clearTimeout(timer)
          attempt.settledAtMs = elapsed()
        }
        // 上一轮命令已经真实结束；只对探测窗口耗尽重试，不能刷新启动总预算。
        await delay(100, undefined, { signal })
      }
    }
    catch (error) {
      failed = true
      failure = error
      throw error
    }
  }, async () => {
    const persist = () => fs.writeFile(path.join(directory, 'readiness.json'), `${JSON.stringify({
      version: 1,
      evidence: 'diagnostic-only',
      runId,
      invocationId,
      device,
      bundleId,
      startupDeadline,
      timeoutMs: NATIVE_CAPTURE_TIMEOUT,
      status: failed ? 'failed' : 'ready',
      elapsedMs: elapsed(),
      ...(failed ? { error: String(failure) } : {}),
      attempts,
    }, null, 2)}\n`)
    await persist()
    if (!failed) {
      try {
        checkStartup()
      }
      catch (error) {
        failed = true
        failure = error
        await runWithCleanup(async () => {
          throw error
        }, persist)
      }
    }
  })
}
