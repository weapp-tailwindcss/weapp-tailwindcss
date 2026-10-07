interface RuntimePreparationEntry {
  revision: number
  task: Promise<Set<string> | undefined>
}

/** 同一轮 loader 共享准备结果；失效后串行准备新快照，旧请求等待最新结果。 */
export function createWebpackLoaderRuntimePreparation(
  prepare: (isCurrent: () => boolean) => Promise<Set<string>>,
) {
  let revision = 0
  let entry: RuntimePreparationEntry | undefined
  let settled: Promise<void> = Promise.resolve()

  function invalidate() {
    revision++
    entry = undefined
  }

  function getRuntimeSet(): Promise<Set<string>> {
    if (!entry) {
      const currentRevision = revision
      const task = settled.then(() => {
        if (currentRevision !== revision) {
          return undefined
        }
        return prepare(() => currentRevision === revision)
      })
      entry = { revision: currentRevision, task }
      // 前一轮失败也必须释放队列，让下一次请求能够重新准备。
      settled = task.then(() => {}, () => {})
    }
    const current = entry
    return current.task.then((result) => {
      if (current.revision !== revision || result === undefined) {
        return getRuntimeSet()
      }
      return result
    }, (error) => {
      if (entry === current) {
        entry = undefined
      }
      throw error
    })
  }

  return { getRuntimeSet, invalidate }
}
