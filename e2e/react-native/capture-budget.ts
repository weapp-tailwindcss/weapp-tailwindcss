export const NATIVE_CAPTURE_TIMEOUT = 10_000

/** 只抵扣已认证宿主操作的实际区间；每个已登记用例最多占用既有的 10 秒。 */
export function createNativeCaptureBudget(registeredCases: number) {
  let elapsed = 0
  let started: number | undefined
  let captures = 0
  return {
    elapsed() {
      return elapsed + (started === undefined ? 0 : Math.min(NATIVE_CAPTURE_TIMEOUT, Math.max(0, performance.now() - started)))
    },
    async capture<T>(operation: (cancelSignal: AbortSignal) => Promise<T>): Promise<T> {
      if (started !== undefined) {
        throw new Error('Native host capture is already pending')
      }
      if (captures >= registeredCases) {
        throw new Error('Native host exhausted its registered case budget')
      }
      captures++
      started = performance.now()
      const controller = new AbortController()
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const result = await Promise.race([
          operation(controller.signal),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              const error = new Error(`Native semantic host capture exceeded ${NATIVE_CAPTURE_TIMEOUT}ms`)
              controller.abort(error)
              reject(error)
            }, NATIVE_CAPTURE_TIMEOUT)
          }),
        ])
        if (performance.now() - started >= NATIVE_CAPTURE_TIMEOUT) {
          const error = new Error(`Native semantic host capture exceeded ${NATIVE_CAPTURE_TIMEOUT}ms`)
          controller.abort(error)
          throw error
        }
        return result
      }
      finally {
        clearTimeout(timer)
        elapsed += Math.min(NATIVE_CAPTURE_TIMEOUT, Math.max(0, performance.now() - started))
        started = undefined
      }
    },
  }
}
