import { rm } from 'node:fs/promises'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as processTable from '../../../scripts/demo-e2e-workflow/process-table'
import { runWithCleanup } from '../../../scripts/e2e-preflight/cleanup'
import { runLocalCommand } from './command'
import { withLocalWorker } from './server'
import { assertFixtureProcessStopped } from './test-process-state'
import { createLocalTestScope, localIntegrationTimeout, localTestCleanupMs } from './test-scope'
import { workerFixture } from './test-support'

const fixtures: Awaited<ReturnType<typeof workerFixture>>[] = []
const browserLifecycleTimeout = localIntegrationTimeout(1, 2 * 5000 + 500)
// 就绪、退出请求、三次身份查询、登记轮询、取消通知与端口检查各自保留原预算。
const workerLifecycleTimeout = localIntegrationTimeout(1, 2000 + 80 + 3 * 5000 + 5000 + 1000 + 500)
let scope: ReturnType<typeof createLocalTestScope>
beforeEach(({ signal }) => {
  scope = createLocalTestScope(signal)
})
async function fixture(mode: string | undefined, timeoutMs: number) {
  // 自退安全阀晚于整轮断言与收尾，不能用自然退出证明被测清理成功。
  const item = await workerFixture(mode, timeoutMs + localTestCleanupMs)
  fixtures.push(item)
  return item
}
afterEach(async () => {
  await runWithCleanup(() => scope.close(), async () => {
    vi.restoreAllMocks()
    const results = await Promise.allSettled(fixtures.splice(0).map(item => runWithCleanup(
      () => item.stopDescendants(),
      () => rm(item.root, { recursive: true, force: true }),
    )))
    const errors = results.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
    if (errors.length) {
      throw new AggregateError(errors, '本地进程生命周期夹具收尾失败。')
    }
  })
}, localTestCleanupMs)

function messages(error: unknown): string {
  if (error instanceof AggregateError) {
    return `${error.message}\n${error.errors.map(messages).join('\n')}`
  }
  return error instanceof Error ? error.message : String(error)
}

it('浏览器根命令退出 0，后代关闭所有输出仍存活时不能绕过清理', () => scope.run(async (signal) => {
  const item = await fixture(undefined, browserLifecycleTimeout)
  const error = await runLocalCommand(item.survivingBrowserCommand, signal).catch(error => error)
  const descendant = await item.descendant('browser')
  if (error instanceof Error) {
    expect(error).toBeInstanceOf(Error)
    expect(messages(error)).toContain('子进程清理')
  }
  else {
    expect(error).toBeUndefined()
  }
  await assertFixtureProcessStopped(descendant)
}), browserLifecycleTimeout)

it.each(['surviving-descendant', 'surviving-detached'])('Worker 根退出 0 后仍确认关闭输出的 %s 后代已结束', mode => scope.run(async (signal) => {
  const item = await fixture(mode, workerLifecycleTimeout)
  const captures = vi.spyOn(processTable, 'collectOwnedProcesses')
  let registered: processTable.ProcessIdentity | undefined
  const error = await withLocalWorker(async (context) => {
    const descendant = await vi.waitFor(() => item.descendant('worker'), { timeout: 5000 })
    context.signal.throwIfAborted()
    await vi.waitFor(() => {
      registered = captures.mock.results.flatMap(result => result.type === 'return' ? [result.value.get(descendant.pid)] : []).find(Boolean)
      expect(registered).toBeDefined()
    }, { timeout: 5000 })
    context.signal.throwIfAborted()
    await expect(assertFixtureProcessStopped(descendant, registered)).rejects.toThrow('仍在执行')
    context.signal.throwIfAborted()
    await context.request('/exit')
    await vi.waitFor(() => expect(context.signal.aborted).toBe(true))
    context.signal.throwIfAborted()
  }, { ...item.options, signal }).catch(error => error)
  expect(error).toBeInstanceOf(Error)
  expect(messages(error)).toContain('Worker 提前退出：exit=0')
  const descendant = await item.descendant('worker')
  await assertFixtureProcessStopped(descendant, registered)
  if (mode === 'surviving-detached') {
    expect(messages(error)).toContain('子进程清理未正常完成')
  }
}), workerLifecycleTimeout)
