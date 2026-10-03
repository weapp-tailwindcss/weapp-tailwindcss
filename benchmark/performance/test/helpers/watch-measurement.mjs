/** Vitest 超时会先结束测试体；收尾钩子继续等待本轮 watcher 释放。 */
export function joinWatchMeasurement({ signal, onTestFinished }, pending) {
  const settled = pending.then(
    () => ({ passed: true }),
    error => ({ passed: false, error }),
  )
  onTestFinished(async () => {
    const result = await settled
    if (signal.aborted && !result.passed) {
      throw result.error
    }
  }, 15_000)
  return pending
}
