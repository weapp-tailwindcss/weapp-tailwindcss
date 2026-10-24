import type { ViteCssSourceLease } from './source-lifecycle'
import { AsyncLocalStorage } from 'node:async_hooks'

/** 构建轮次统一释放来源凭据，包含规划失败和最终没有执行的排队任务。 */
export function createViteCssSourceTaskScope(captureSource?: (file: string) => ViteCssSourceLease) {
  const active = new AsyncLocalStorage<{ closed: boolean, leases: Set<ViteCssSourceLease> }>()
  return {
    captureSource: captureSource
      ? (file: string) => {
          const lease = captureSource(file)
          const scope = active.getStore()
          if (scope?.closed) {
            lease.release()
          }
          else {
            scope?.leases.add(lease)
          }
          return lease
        }
      : undefined,
    async run<T>(task: () => Promise<T>): Promise<T> {
      const scope = { closed: false, leases: new Set<ViteCssSourceLease>() }
      try {
        return await active.run(scope, task)
      }
      finally {
        scope.closed = true
        for (const lease of scope.leases) {
          lease.release()
        }
        scope.leases.clear()
      }
    },
  }
}
