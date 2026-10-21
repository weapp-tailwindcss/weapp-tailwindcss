import type { Buffer } from 'node:buffer'

export type HistoryCapture = (token: string, timeoutMs: number) => Promise<{ file: string, bytes: Buffer }>

/** 有界观察失败不代表截图任务已取消；全部结算后才能收尾及持久化报告。 */
export async function withHistoryCapture(capture: HistoryCapture, run: (capture: HistoryCapture) => Promise<void>) {
  const pending: ReturnType<HistoryCapture>[] = []
  const errors: unknown[] = []
  try {
    await run((...args) => {
      const task = capture(...args)
      pending.push(task)
      return task
    })
  }
  catch (error) {
    errors.push(error)
  }
  const settled = await Promise.allSettled(pending)
  for (const result of settled) {
    if (result.status === 'rejected' && !errors.includes(result.reason)) {
      errors.push(result.reason)
    }
  }
  if (errors.length) {
    throw new AggregateError(errors, errors.map(String).join('；'))
  }
}
