import { inspect } from 'node:util'

/** 保留 cause 与 AggregateError 的首错和收尾证据，避免仅打印顶层 stack 丢失采集阶段。 */
export function formatWatchFailure(error: unknown) {
  return error instanceof Error ? inspect(error, { depth: null, colors: false, customInspect: false }) : String(error)
}
