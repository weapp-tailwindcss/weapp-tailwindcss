import type { ViteCssSourceLease } from './source-lifecycle'
import { materializeErrorStack } from '../../shared/materialize-error-stack'

type CaptureSource = (file: string) => ViteCssSourceLease

function createSourceRound(provider?: CaptureSource) {
  const leases = new Set<ViteCssSourceLease>()
  const capture = provider
    ? (file: string) => {
        if (!provider) {
          return Object.assign(() => false, { release() {} })
        }
        const lease = provider(file)
        leases.add(lease)
        return lease
      }
    : undefined
  return {
    capture,
    close() {
      // 先断开来源服务，迟到调用和清理重入均不能再接收凭据。
      provider = undefined
      const errors: unknown[] = []
      for (const lease of leases) {
        try {
          lease.release()
        }
        catch (error) {
          errors.push(error)
        }
      }
      leases.clear()
      return errors
    },
  }
}

/** 每轮显式传递来源服务，包含规划失败和最终没有执行的排队任务。 */
export function createViteCssSourceTaskScope(captureSource?: CaptureSource) {
  return {
    async run<T>(task: (capture: CaptureSource | undefined) => Promise<T>): Promise<T> {
      const round = createSourceRound(captureSource)
      let result!: T
      const errors: unknown[] = []
      try {
        result = await task(round.capture)
      }
      catch (error) {
        errors.push(error)
      }
      errors.push(...round.close())
      if (errors.length > 0) {
        const error = errors.length === 1
          ? errors[0]
          : new AggregateError(errors, 'CSS 来源轮次执行或释放失败，已继续释放其余来源。')
        materializeErrorStack(error)
        throw error
      }
      return result
    },
  }
}
