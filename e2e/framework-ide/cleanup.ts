import { formatWorkflowError } from '../../scripts/e2e-preflight/cleanup'

export const IDE_CLEANUP_FAILURE_MARKER = '[e2e:ide:cleanup]'

/** 清理终态无法确认时保留类型，供子进程退出边界阻断后续调度。 */
export class FrameworkIdeCleanupError extends Error {
  constructor(label: string, cause: unknown) {
    super(`${IDE_CLEANUP_FAILURE_MARKER} ${label}: ${formatWorkflowError(cause)}`, { cause })
    this.name = 'FrameworkIdeCleanupError'
  }
}

export function cleanupFailure(label: string, cause: unknown) {
  return new FrameworkIdeCleanupError(label, cause)
}

/** 保留首错，逐项尝试本轮持有的资源释放，所有清理失败都参与验收。 */
export async function withCleanup<T>(run: () => Promise<T>, cleanups: Array<{ label: string, run: () => Promise<unknown> }>) {
  const errors: unknown[] = []
  let result: T | undefined
  try {
    result = await run()
  }
  catch (error) {
    errors.push(error)
  }
  for (const cleanup of cleanups) {
    try {
      await cleanup.run()
    }
    catch (error) {
      errors.push(cleanupFailure(cleanup.label, error))
    }
  }
  if (errors.length === 1) {
    throw errors[0]
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, errors.map(formatWorkflowError).join('\n'))
  }
  return result as T
}
