export function createFrameworkCssGenerationQueue<Args extends unknown[], Result>(
  normalizeId: (id: string) => string,
  generate: (id: string, ...args: Args) => Promise<Result>,
) {
  const pendingByFile = new Map<string, Promise<void>>()
  let disposed = false
  const run = (id: string, ...args: Args) => {
    if (disposed) {
      return Promise.reject(new Error('CSS generation queue has been disposed'))
    }
    const fileKey = normalizeId(id)
    const previous = pendingByFile.get(fileKey) ?? Promise.resolve()
    const task = previous.then(() => generate(id, ...args))
    const tail = task.then(() => undefined, () => undefined)
    pendingByFile.set(fileKey, tail)
    void tail.then(() => {
      if (pendingByFile.get(fileKey) === tail) {
        pendingByFile.delete(fileKey)
      }
    })
    return task
  }
  return Object.assign(run, {
    async dispose() {
      disposed = true
      await Promise.all(pendingByFile.values())
      pendingByFile.clear()
    },
  })
}
