import { mkdtempSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

export class WorkflowCancellationError extends Error {
  readonly exitCode: number
  constructor(readonly signal: 'SIGINT' | 'SIGTERM', cause?: unknown) {
    super(`全面测试收到 ${signal}，取消当前阶段并停止后续调度；进程退出不代表源码已恢复。`, cause ? { cause } : undefined)
    this.exitCode = signal === 'SIGINT' ? 130 : 143
  }
}

/** 复用 watch 的取消文件；重复信号不能绕过阶段及门禁的收尾。 */
export function createWorkflowCancellation() {
  const controller = new AbortController()
  const directory = mkdtempSync(path.join(tmpdir(), 'demo-workflow-cancel-'))
  const file = path.join(directory, 'cancel')
  const cancel = (signal: 'SIGINT' | 'SIGTERM') => {
    if (controller.signal.aborted) {
      return
    }
    let failure: unknown
    try {
      writeFileSync(file, `${signal}\n`)
    }
    catch (error) {
      failure = error
    }
    controller.abort(new WorkflowCancellationError(signal, failure))
  }
  const handlers = { SIGINT: () => cancel('SIGINT'), SIGTERM: () => cancel('SIGTERM') }
  process.on('SIGINT', handlers.SIGINT)
  process.on('SIGTERM', handlers.SIGTERM)
  return {
    signal: controller.signal,
    env: { E2E_WATCH_CANCEL_FILE: file },
    async dispose() {
      try {
        await rm(directory, { recursive: true, force: true })
      }
      finally {
        process.removeListener('SIGINT', handlers.SIGINT)
        process.removeListener('SIGTERM', handlers.SIGTERM)
      }
    },
  }
}

/** 清理失败不能覆盖取消原因，也不重复加入已由 cause/errors 保留的同一个错误。 */
export function includeWorkflowCancellation(error: unknown, signal: AbortSignal) {
  if (!signal.aborted) {
    return error
  }
  const pending: unknown[] = [error]
  const seen = new Set<unknown>()
  while (pending.length) {
    const current = pending.pop()
    if (current === signal.reason) {
      return error
    }
    if (seen.has(current)) {
      continue
    }
    seen.add(current)
    if (current instanceof Error) {
      pending.push(current.cause)
    }
    if (current instanceof AggregateError) {
      pending.push(...current.errors)
    }
  }
  return new AggregateError([signal.reason, error], '工作流取消与收尾同时失败。', { cause: signal.reason })
}
