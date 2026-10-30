import { existsSync, readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { containsWorkflowError, createWorkflowCancellation, observeWorkflowCancellation, WorkflowCancellationError } from '../scripts/demo-e2e-workflow/cancellation'

const scopes: ReturnType<typeof createWorkflowCancellation>[] = []
afterEach(async () => {
  await Promise.all(scopes.splice(0).map(scope => scope.dispose()))
})

it('内部致命错误先提交阶段自有取消凭据，重复取消保留首错', () => {
  const scope = createWorkflowCancellation({ listenForSignals: false })
  scopes.push(scope)
  const first = new Error('identity probe failed')
  let observed: string | undefined
  scope.signal.addEventListener('abort', () => {
    observed = readFileSync(scope.env.E2E_WATCH_CANCEL_FILE, 'utf8')
  }, { once: true })
  scope.cancel(first)
  scope.cancel(new Error('late cleanup failed'))
  expect(scope.signal.reason).toBe(first)
  expect(observed).toContain('identity probe failed')
  expect(observed).not.toContain('late cleanup failed')
})

it('阶段继承原因但持有独立文件，消费者释放不会改写父侧凭据', async () => {
  const parent = createWorkflowCancellation({ listenForSignals: false })
  const child = createWorkflowCancellation({ signal: parent.signal, listenForSignals: false })
  scopes.push(parent, child)
  const observer = observeWorkflowCancellation(child.env)
  try {
    expect(parent.env.E2E_WATCH_CANCEL_FILE).not.toBe(child.env.E2E_WATCH_CANCEL_FILE)
    const reason = new Error('parent stopped')
    parent.cancel(reason)
    expect(child.signal.reason).toBe(reason)
    await expect.poll(() => observer.signal.aborted).toBe(true)
    expect(String(observer.signal.reason)).toContain('parent stopped')
  }
  finally {
    observer.dispose()
  }
  await child.dispose()
  expect(existsSync(parent.env.E2E_WATCH_CANCEL_FILE)).toBe(true)
  expect(existsSync(child.env.E2E_WATCH_CANCEL_FILE)).toBe(false)
})

it.each([false, true])('取消文件写入失败仍保留首错或原信号退出码（信号=%s）', async (isSignal) => {
  const scope = createWorkflowCancellation({ listenForSignals: false })
  scopes.push(scope)
  await rm(path.dirname(scope.env.E2E_WATCH_CANCEL_FILE), { recursive: true })
  const reason = isSignal ? new WorkflowCancellationError('SIGINT') : new Error('identity probe failed')
  scope.cancel(reason)
  expect(scope.signal.aborted).toBe(true)
  if (isSignal) {
    expect(scope.signal.reason).toBeInstanceOf(WorkflowCancellationError)
    expect(scope.signal.reason.exitCode).toBe(130)
    expect(scope.signal.reason.cause.code).toBe('ENOENT')
  }
  else {
    expect(scope.signal.reason.cause).toBe(reason)
    expect(containsWorkflowError(scope.signal.reason, reason)).toBe(true)
    expect(scope.signal.reason.errors[1].code).toBe('ENOENT')
  }
})
