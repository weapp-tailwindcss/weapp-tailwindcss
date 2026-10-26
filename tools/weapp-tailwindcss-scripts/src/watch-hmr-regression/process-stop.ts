/** 两条收尾分支同时执行；停止单飞并保留各自原始错误。 */
export function createWatchResourceStop(memory: {
  stop: () => Promise<void>
}, process: {
  stop: () => Promise<void>
}, dispose: () => void) {
  let stopping: Promise<void> | undefined
  const stop = async () => {
    const results = await Promise.allSettled([
      Promise.resolve().then(() => memory.stop()),
      Promise.resolve().then(() => process.stop()),
    ])
    const errors = results.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
    try {
      dispose()
    }
    catch (error) {
      errors.push(error)
    }
    if (errors.length === 1) {
      throw errors[0]
    }
    if (errors.length) {
      throw new AggregateError(errors, `watch process and memory probe cleanup failed: ${errors.map(String).join('；')}`)
    }
  }
  return () => {
    stopping ??= stop()
    return stopping
  }
}
