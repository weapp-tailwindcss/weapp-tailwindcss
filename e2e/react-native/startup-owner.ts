import { NATIVE_CAPTURE_DRAIN_TIMEOUT } from './capture-budget'

export const NATIVE_STARTUP_TIMEOUT = 1_800_000

export type NativeStartupStageStatus = 'started' | 'completed' | 'failed'

export interface NativeStartupStageDetail {
  deadline: number
  signal: AbortSignal
  error?: unknown
}

export interface NativeStartupOwnerOptions {
  deadline?: number
  parentSignal?: AbortSignal
  onStage?: (stage: string, status: NativeStartupStageStatus, detail: NativeStartupStageDetail) => Promise<void>
}

function aggregate(errors: unknown[], message: string) {
  const unique = [...new Set(errors)]
  return unique.length === 1 ? unique[0] : new AggregateError(unique, message)
}

/** 准备、构建与启动共享绝对期限；逻辑取消不能冒充实际操作已经结束。 */
export function createNativeStartupOwner(options: NativeStartupOwnerOptions = {}) {
  const startedAt = Date.now()
  const deadline = options.deadline ?? startedAt + NATIVE_STARTUP_TIMEOUT
  if (!Number.isSafeInteger(deadline) || deadline - startedAt > NATIVE_STARTUP_TIMEOUT) {
    throw new Error('Native startup deadline must not exceed the original 30 minute budget')
  }
  const controller = new AbortController()
  let completed = false
  let inFlight = false
  let failure: { error: unknown } | undefined
  let ownedFailure: { error: unknown } | undefined
  let completion: Promise<void> | undefined
  let settledAt: number | undefined
  let drainDeadline: number | undefined
  let cleanupDeadlineFailure: Error | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let rejectInterrupted!: (error: unknown) => void
  const interrupted = new Promise<never>((_resolve, reject) => {
    rejectInterrupted = reject
  })
  // 空闲阶段也可能到期；随后 run、complete 与 drain 仍须交付同一失败。
  void interrupted.catch(() => undefined)

  function dispose() {
    clearTimeout(timer)
    options.parentSignal?.removeEventListener('abort', parentAborted)
  }

  function fail(error: unknown) {
    if (!failure && !completed) {
      failure = { error }
      dispose()
      controller.abort(error)
      rejectInterrupted(error)
    }
  }

  function expire() {
    fail(new Error(`Native startup deadline exceeded at ${deadline}`))
  }

  function parentAborted() {
    fail(options.parentSignal!.reason)
  }

  function check() {
    if (!failure && !completed && Date.now() >= deadline) {
      expire()
    }
    if (failure) {
      throw failure.error
    }
    if (completed) {
      throw new Error('Native startup owner is already completed')
    }
  }

  function cleanupExpired() {
    cleanupDeadlineFailure ??= new Error(`Native startup cleanup exceeded ${NATIVE_CAPTURE_DRAIN_TIMEOUT}ms; owned operation is still pending`)
    fail(cleanupDeadlineFailure)
    return cleanupDeadlineFailure
  }

  if (options.parentSignal?.aborted) {
    parentAborted()
  }
  else {
    options.parentSignal?.addEventListener('abort', parentAborted, { once: true })
    if (deadline <= Date.now()) {
      expire()
    }
    else {
      timer = setTimeout(expire, deadline - Date.now())
    }
  }

  return {
    deadline,
    signal: controller.signal,
    pending: () => inFlight,
    async run<T>(stage: string, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
      check()
      if (inFlight) {
        throw new Error('Native startup operation is already pending')
      }
      inFlight = true
      settledAt = undefined
      const owned = Promise.resolve().then(async () => {
        try {
          check()
          await options.onStage?.(stage, 'started', { deadline, signal: controller.signal })
          check()
          const result = await operation(controller.signal)
          check()
          await options.onStage?.(stage, 'completed', { deadline, signal: controller.signal })
          check()
          return result
        }
        catch (error) {
          fail(error)
          try {
            await options.onStage?.(stage, 'failed', { deadline, signal: controller.signal, error })
          }
          catch (progressError) {
            throw aggregate([error, progressError], 'Native startup operation and progress recording both failed')
          }
          throw error
        }
      })
      // 先登记真实终态，再暴露逻辑 race；迟到拒绝始终有接收者。
      completion = owned.then(() => {
        inFlight = false
        settledAt = Date.now()
      }, (error) => {
        ownedFailure = { error }
        inFlight = false
        settledAt = Date.now()
      })
      const result = await Promise.race([owned, interrupted])
      check()
      return result
    },
    complete() {
      if (completed) {
        return
      }
      check()
      if (inFlight) {
        throw new Error('Native startup cannot complete while its operation is pending')
      }
      completed = true
      dispose()
    },
    stop(reason: unknown = new Error('Native startup owner is closing')) {
      fail(reason)
    },
    /** 收尾期限只建立一次；迟到成功或失败均不能抹去已经违反的五秒期限。 */
    async drain() {
      let cleanupTimer: ReturnType<typeof setTimeout> | undefined
      if (inFlight && !cleanupDeadlineFailure) {
        drainDeadline ??= Date.now() + NATIVE_CAPTURE_DRAIN_TIMEOUT
        const remaining = drainDeadline - Date.now()
        try {
          await Promise.race([
            completion,
            new Promise<never>((_resolve, reject) => {
              if (remaining <= 0) {
                reject(cleanupExpired())
              }
              else {
                cleanupTimer = setTimeout(() => reject(cleanupExpired()), remaining)
              }
            }),
          ])
        }
        catch (error) {
          if (error !== cleanupDeadlineFailure) {
            throw error
          }
        }
        finally { clearTimeout(cleanupTimer) }
        // 到期同 tick 的真实完成也不能通过定时器队列顺序获得额外预算。
        if (settledAt !== undefined && settledAt >= drainDeadline) {
          cleanupExpired()
        }
      }
      const errors = [
        ...(failure ? [failure.error] : []),
        ...(cleanupDeadlineFailure ? [cleanupDeadlineFailure] : []),
        ...(ownedFailure ? [ownedFailure.error] : []),
      ]
      if (errors.length) {
        throw aggregate(errors, 'Native startup failed while draining its owned operation')
      }
    },
    /** finally 释放监听器不授予成功；遗漏 complete 时仍然取消本轮操作。 */
    release() {
      if (!completed) {
        fail(new Error('Native startup owner was released before completion'))
      }
      dispose()
    },
  }
}
