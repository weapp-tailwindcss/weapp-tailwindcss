/** 关闭协调者先拒绝新任务，再等待已接收的异步钩子。 */
export function createPluginInvocationSession() {
  let phase: 'active' | 'closing' | 'closed' = 'active'
  const pending = new Set<Promise<unknown>>()
  let disposal: Promise<unknown> | undefined
  return {
    run(invoke: () => unknown) {
      if (phase !== 'active') {
        throw new Error('Vite 编译会话已关闭，不再接收钩子任务。')
      }
      const result = invoke()
      if (!result || (typeof result !== 'object' && typeof result !== 'function') || !('then' in result)) {
        return result
      }
      const task = Promise.resolve(result)
      pending.add(task)
      void task.then(() => pending.delete(task), () => pending.delete(task))
      return result
    },
    close(dispose: () => unknown) {
      if (!disposal) {
        phase = 'closing'
        disposal = Promise.allSettled([...pending]).then(dispose).finally(() => {
          phase = 'closed'
          pending.clear()
        })
      }
      return disposal
    },
  }
}
