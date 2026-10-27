import { writeSync } from 'node:fs'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import process from 'node:process'

type LaunchPhase = 'discovery' | 'login-before-auto' | 'auto' | 'login-after-auto' | 'connect' | 'readiness'
type Outcome = 'succeeded' | 'failed'

interface LaunchDiagnostics {
  stage: <T>(phase: LaunchPhase, action: () => Promise<T>) => Promise<T>
}

interface SafeError {
  name: string
  code?: string
}

interface StageObservation {
  phase: LaunchPhase
  startedAtMs: number | null
  durationMs: number | null
  remainingAtStartMs: number | null
  remainingAtEndMs: number | null
  outcome: Outcome
  error?: SafeError
}

const MAX_STAGE_OBSERVATIONS = 64
const EVENT_LOOP_RESOLUTION_MS = 20
const errorNames = new Set(['Error', 'TypeError', 'RangeError', 'AggregateError', 'WechatEnvironmentError', 'AbortError'])
const errorCodes = new Set(['DEVTOOLS_PROTOCOL_TIMEOUT', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ABORT_ERR'])

function safeError(error: unknown): SafeError {
  try {
    if (!(error instanceof Error)) {
      return { name: 'NonError' }
    }
    const name = error.name
    const code = 'code' in error ? error.code : undefined
    return {
      name: errorNames.has(name) ? name : 'OtherError',
      ...(typeof code === 'string' && errorCodes.has(code) ? { code } : {}),
    }
  }
  catch {
    return { name: 'UnreadableError' }
  }
}

function milliseconds(value: number) {
  return Number.isFinite(value) ? Math.round(Math.max(0, value) * 1000) / 1000 : null
}

function monotonicNow() {
  try {
    return performance.now()
  }
  catch {
    return Number.NaN
  }
}

function wallNow() {
  try {
    return Date.now()
  }
  catch {
    return Number.NaN
  }
}

function remainingMilliseconds(deadline: number) {
  return milliseconds(deadline - wallNow())
}

/** 只观察本轮已有操作；诊断失败不能改变请求、原始异常或项目收尾结果。 */
export async function withWechatLaunchDiagnostics<T>(
  deadline: number,
  action: (diagnostics: LaunchDiagnostics) => Promise<T>,
): Promise<T> {
  const startedAtMonotonic = monotonicNow()
  const startedAtUnixMs = milliseconds(wallNow())
  const stages: StageObservation[] = []
  let stageCount = 0
  let outcome: Outcome = 'failed'
  let error: SafeError | undefined
  let observer: ReturnType<typeof monitorEventLoopDelay> | undefined
  let observerAvailable = false
  try {
    observer = monitorEventLoopDelay({ resolution: EVENT_LOOP_RESOLUTION_MS })
    observer.enable()
    observerAvailable = true
  }
  catch {
    // 原生观察器不可用时仍执行原操作，并在最终日志中标记缺证。
  }

  const diagnostics: LaunchDiagnostics = {
    async stage(phase, run) {
      const phaseStartedAt = monotonicNow()
      const remainingAtStartMs = remainingMilliseconds(deadline)
      let phaseOutcome: Outcome = 'failed'
      let phaseError: SafeError | undefined
      try {
        const result = await run()
        phaseOutcome = 'succeeded'
        return result
      }
      catch (cause) {
        phaseError = safeError(cause)
        throw cause
      }
      finally {
        try {
          const observation: StageObservation = {
            phase,
            startedAtMs: milliseconds(phaseStartedAt - startedAtMonotonic),
            durationMs: milliseconds(monotonicNow() - phaseStartedAt),
            remainingAtStartMs,
            remainingAtEndMs: remainingMilliseconds(deadline),
            outcome: phaseOutcome,
            ...(phaseError ? { error: phaseError } : {}),
          }
          stageCount += 1
          // 保留最初阶段与最后一次操作；只限制日志容量，不改变连接重试。
          if (stages.length < MAX_STAGE_OBSERVATIONS) {
            stages.push(observation)
          }
          else {
            stages[MAX_STAGE_OBSERVATIONS - 1] = observation
          }
        }
        catch {
          // 观察数据失败不能替换当前操作的结果或原始异常。
        }
      }
    },
  }

  try {
    const result = await action(diagnostics)
    outcome = 'succeeded'
    return result
  }
  catch (cause) {
    error = safeError(cause)
    throw cause
  }
  finally {
    try {
      observer?.disable()
    }
    catch {
      observerAvailable = false
    }
    try {
      const sampleCount = observerAvailable && observer ? Number(observer.count) : 0
      const eventLoop = {
        available: observerAvailable,
        resolutionMs: EVENT_LOOP_RESOLUTION_MS,
        sampleCount,
        maxDelayMs: sampleCount > 0 && observer ? milliseconds(observer.max / 1e6) : null,
        meanDelayMs: sampleCount > 0 && observer ? milliseconds(observer.mean / 1e6) : null,
      }
      // 收尾后只写有界元数据；同步写入避免诊断引入异步流错误和待排空任务。
      writeSync(process.stderr.fd, `[wechat:launch] ${JSON.stringify({
        pid: process.pid,
        startedAtUnixMs,
        durationMs: milliseconds(monotonicNow() - startedAtMonotonic),
        remainingMs: remainingMilliseconds(deadline),
        outcome,
        ...(error ? { error } : {}),
        stageCount,
        omittedStages: Math.max(0, stageCount - stages.length),
        stages,
        eventLoop,
      })}\n`)
    }
    catch {
      // 日志或统计读取失败不能改变启动及清理已经确定的结果。
    }
  }
}
