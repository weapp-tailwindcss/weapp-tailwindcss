export function watchRunScope(watcher) {
  let active
  let closing
  const results = new WeakMap()
  const errors = []
  watcher.on('event', (event) => {
    if (event.code === 'START') {
      active = Promise.withResolvers()
    }
    else if (event.code === 'END') {
      active?.resolve()
      active = undefined
    }
    if (event.result) {
      let closed = results.get(event.result)
      if (!closed) {
        closed = Promise.resolve().then(() => event.result.close()).catch((error) => {
          // 不让关闭异常截断 END；排空本轮后再向夹具报告。
          errors.push(error)
        })
        results.set(event.result, closed)
      }
      return closed
    }
  })
  // 只从用例主体退出处调用；不能在当前构建事件处理器内部等待自己。
  // Rollup 会等待 close 监听器，再移除 event 监听器，因此仍能收到 END。
  watcher.on('close', () => active?.promise)
  return () => closing ??= (async () => {
    try {
      await watcher.close()
    }
    catch (error) {
      errors.push(error)
    }
    if (errors.length === 1) {
      throw errors[0]
    }
    if (errors.length) {
      throw new AggregateError(errors, '监听 bundle 关闭失败')
    }
  })()
}

export async function withWatchCleanup(run, close, cleanup) {
  const errors = []
  let result
  try {
    result = await run()
  }
  catch (error) {
    errors.push(error)
  }
  for (const dispose of [close, cleanup]) {
    try {
      await dispose()
    }
    catch (error) {
      errors.push(error)
    }
  }
  if (errors.length === 1) {
    throw errors[0]
  }
  if (errors.length) {
    throw new AggregateError(errors, '监听用例与资源清理失败')
  }
  return result
}
