export const NATIVE_CAPTURE_TIMEOUT = 10_000
export const NATIVE_CAPTURE_DRAIN_TIMEOUT = 5_000

/** 只抵扣已认证宿主操作的实际区间；每个已登记用例最多占用既有的 10 秒。 */
export function createNativeCaptureBudget(registeredCases: number) {
  let elapsed = 0
  let started: number | undefined
  let captures = 0
  let inFlight = false
  let stopped = false
  let controller: AbortController | undefined
  let completion: Promise<void> | undefined
  let cleanupFailure: unknown
  return {
    pending: () => inFlight,
    stop() {
      stopped = true
      controller?.abort(new Error('Native capture owner is closing'))
    },
    async drain(timeout = NATIVE_CAPTURE_DRAIN_TIMEOUT) {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          completion,
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error(`Native capture cleanup exceeded ${timeout}ms; owned operation is still pending`)), timeout)
          }),
        ])
        if (cleanupFailure !== undefined) {
          throw cleanupFailure
        }
      }
      finally { clearTimeout(timer) }
    },
    elapsed() {
      return elapsed + (started === undefined ? 0 : Math.min(NATIVE_CAPTURE_TIMEOUT, Math.max(0, performance.now() - started)))
    },
    async capture<T>(operation: (cancelSignal: AbortSignal) => Promise<T>): Promise<T> {
      if (inFlight) {
        throw new Error('Native host capture is already pending')
      }
      if (stopped) {
        throw new Error('Native host capture owner is closed')
      }
      if (captures >= registeredCases) {
        throw new Error('Native host exhausted its registered case budget')
      }
      captures++
      started = performance.now()
      const activeController = controller = new AbortController()
      inFlight = true
      completion = undefined
      let ownedSettled = false
      let logicalFinished = false
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const owned = Promise.resolve(operation(activeController.signal))
        // 判定超时与真实操作结束分别记账；晚到失败必须由 drain 交付，不能成为未处理拒绝。
        completion = owned.then(() => {
          ownedSettled = true
          if (logicalFinished) {
            inFlight = false
          }
        }, (error) => {
          ownedSettled = true
          if (logicalFinished) {
            inFlight = false
          }
          if (activeController.signal.aborted) {
            cleanupFailure = error
          }
        })
        const result = await Promise.race([
          owned,
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              const error = new Error(`Native semantic host capture exceeded ${NATIVE_CAPTURE_TIMEOUT}ms`)
              activeController.abort(error)
              reject(error)
            }, NATIVE_CAPTURE_TIMEOUT)
          }),
        ])
        activeController.signal.throwIfAborted()
        if (performance.now() - started >= NATIVE_CAPTURE_TIMEOUT) {
          const error = new Error(`Native semantic host capture exceeded ${NATIVE_CAPTURE_TIMEOUT}ms`)
          activeController.abort(error)
          throw error
        }
        return result
      }
      catch (error) {
        if (!completion) {
          ownedSettled = true
        }
        throw error
      }
      finally {
        clearTimeout(timer)
        elapsed += Math.min(NATIVE_CAPTURE_TIMEOUT, Math.max(0, performance.now() - started))
        started = undefined
        logicalFinished = true
        if (ownedSettled) {
          inFlight = false
        }
      }
    },
  }
}
