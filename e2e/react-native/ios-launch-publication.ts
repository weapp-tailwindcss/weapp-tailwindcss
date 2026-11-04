/** 首次 context 必须等到启动及清理完成，等待期间不占用截图预算。 */
export function createIosLaunchPublication<T>(readPublication: (signal: AbortSignal) => Promise<T>) {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  let bound = false
  const ready = new Promise<void>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  // CLI 可能先于首个请求失败；保留原拒绝供主流程和请求消费。
  void ready.catch(() => {})

  return {
    ready,
    bind(completion: PromiseLike<void>) {
      if (bound) {
        throw new Error('iOS 启动完成门禁不能重复绑定')
      }
      bound = true
      void Promise.resolve(completion).then(resolve, reject)
    },
    async read(signal: AbortSignal) {
      signal.throwIfAborted()
      await new Promise<void>((accept, fail) => {
        const abort = () => fail(signal.reason)
        signal.addEventListener('abort', abort, { once: true })
        void ready.then(() => {
          signal.removeEventListener('abort', abort)
          accept()
        }, (error) => {
          signal.removeEventListener('abort', abort)
          fail(error)
        })
      })
      signal.throwIfAborted()
      return readPublication(signal)
    },
  }
}
