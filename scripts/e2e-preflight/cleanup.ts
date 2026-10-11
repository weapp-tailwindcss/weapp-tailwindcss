import { inspect } from 'node:util'

/** 收尾始终执行；同时失败时保留原始异常和清理异常。 */
export async function runWithCleanup<T>(action: () => Promise<T>, cleanup: () => void | Promise<void>): Promise<T> {
  let result: { passed: true, value: T } | { passed: false, error: unknown }
  try {
    result = { passed: true, value: await action() }
  }
  catch (error) {
    result = { passed: false, error }
  }
  try {
    await cleanup()
  }
  catch (error) {
    if (!result.passed) {
      throw new AggregateError([result.error, error], '全面测试执行与会话收尾均失败。', { cause: result.error })
    }
    throw error
  }
  if (!result.passed) {
    throw result.error
  }
  return result.value
}

/** CLI 日志需要展开聚合错误及 cause，避免只打印最外层堆栈。 */
export function formatWorkflowError(error: unknown): string {
  return error instanceof Error ? inspect(error, { depth: null, colors: false }) : String(error)
}
