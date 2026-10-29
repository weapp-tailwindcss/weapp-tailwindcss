import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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

interface WorkflowCancellationOptions {
  signal?: AbortSignal | undefined
  listenForSignals?: boolean
}

/** 仅创建者写入和删除取消文件；阶段可继承取消原因，但必须拥有自己的子任务凭据。 */
export function createWorkflowCancellation(options: WorkflowCancellationOptions = {}) {
  const controller = new AbortController()
  const directory = mkdtempSync(path.join(tmpdir(), 'demo-workflow-cancel-'))
  const file = path.join(directory, 'cancel')
  const cancel = (reason: unknown) => {
    if (controller.signal.aborted) {
      return
    }
    try {
      // 先通知独立进程组中的消费者，再触发父侧清理，避免 launcher 提前退出截断恢复。
      writeFileSync(file, `${String(reason)}\n`)
    }
    catch (error) {
      reason = reason instanceof WorkflowCancellationError
        ? new WorkflowCancellationError(reason.signal, error)
        : new AggregateError([reason, error], '工作流取消文件写入失败。', { cause: reason })
    }
    controller.abort(reason)
  }
  const inherited = () => cancel(options.signal!.reason)
  options.signal?.addEventListener('abort', inherited, { once: true })
  const handlers = { SIGINT: () => cancel(new WorkflowCancellationError('SIGINT')), SIGTERM: () => cancel(new WorkflowCancellationError('SIGTERM')) }
  if (options.listenForSignals !== false) {
    process.on('SIGINT', handlers.SIGINT)
    process.on('SIGTERM', handlers.SIGTERM)
  }
  if (options.signal?.aborted) {
    inherited()
  }
  return {
    signal: controller.signal,
    env: { E2E_WATCH_CANCEL_FILE: file },
    cancel,
    async dispose() {
      try {
        await rm(directory, { recursive: true, force: true })
      }
      finally {
        options.signal?.removeEventListener('abort', inherited)
        if (options.listenForSignals !== false) {
          process.removeListener('SIGINT', handlers.SIGINT)
          process.removeListener('SIGTERM', handlers.SIGTERM)
        }
      }
    },
  }
}

export type WorkflowCancellation = ReturnType<typeof createWorkflowCancellation>

/** 消费者只读父侧凭据；不得创建、改写或删除借用的取消文件。 */
export function observeWorkflowCancellation(env: NodeJS.ProcessEnv = process.env) {
  const controller = new AbortController()
  const file = env['E2E_WATCH_CANCEL_FILE']
  let timer: NodeJS.Timeout | undefined
  const check = () => {
    if (!file || controller.signal.aborted) {
      return
    }
    try {
      const reason = readFileSync(file, 'utf8')
      controller.abort(new Error(`父工作流请求合作取消，停止本轮命令：${reason.trim()}`))
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        controller.abort(new Error('父工作流取消凭据读取失败，停止本轮命令。', { cause: error }))
      }
    }
    if (controller.signal.aborted) {
      clearInterval(timer)
    }
  }
  check()
  if (file && !controller.signal.aborted) {
    timer = setInterval(check, 100)
    timer.unref?.()
  }
  return { signal: controller.signal, dispose: () => clearInterval(timer) }
}

/** 按对象身份检查 cause/errors 图，循环引用不能阻断查询或制造重复错误。 */
export function containsWorkflowError(error: unknown, candidate: unknown) {
  const pending: unknown[] = [error]
  const seen = new Set<unknown>()
  while (pending.length) {
    const current = pending.pop()
    if (current === candidate) {
      return true
    }
    if (seen.has(current)) {
      continue
    }
    seen.add(current)
    if (current instanceof Error && current.cause !== undefined) {
      pending.push(current.cause)
    }
    if (current instanceof AggregateError) {
      pending.push(...current.errors)
    }
  }
  return false
}

/** 清理失败不能覆盖取消原因，也不重复加入已由 cause/errors 保留的同一个错误。 */
export function includeWorkflowCancellation(error: unknown, signal: AbortSignal) {
  if (!signal.aborted || containsWorkflowError(error, signal.reason)) {
    return error
  }
  return new AggregateError([signal.reason, error], '工作流取消与收尾同时失败。', { cause: signal.reason })
}
