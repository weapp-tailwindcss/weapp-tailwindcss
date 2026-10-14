import { rm } from 'node:fs/promises'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import * as processTable from '../../../scripts/demo-e2e-workflow/process-table'
import { runLocalCommand } from './command'
import { withLocalWorker } from './server'
import { workerFixture } from './test-support'

const fixtures: Awaited<ReturnType<typeof workerFixture>>[] = []
async function fixture(mode?: string) {
  const item = await workerFixture(mode)
  fixtures.push(item)
  return item
}
afterEach(async () => {
  vi.restoreAllMocks()
  for (const item of fixtures.splice(0)) {
    await item.stopDescendants()
    await rm(item.root, { recursive: true, force: true })
  }
})

function messages(error: unknown): string {
  if (error instanceof AggregateError) {
    return `${error.message}\n${error.errors.map(messages).join('\n')}`
  }
  return error instanceof Error ? error.message : String(error)
}

it('浏览器根命令退出 0，后代关闭所有输出仍存活时不能绕过清理', async () => {
  const item = await fixture()
  const error = await runLocalCommand(item.survivingBrowserCommand, new AbortController().signal).catch(error => error)
  const descendant = await item.descendant('browser')
  if (error instanceof Error) {
    expect(error).toBeInstanceOf(Error)
    expect(messages(error)).toMatch(/启动身份未确认|子进程清理/)
    if (messages(error).includes('启动身份未确认')) {
      return
    }
  }
  else {
    expect(error).toBeUndefined()
  }
  expect(() => process.kill(descendant.pid, 0)).toThrow()
})

it.each(['surviving-descendant', 'surviving-detached'])('Worker 根退出 0 后仍确认关闭输出的 %s 后代已结束', async (mode) => {
  const item = await fixture(mode)
  const captures = vi.spyOn(processTable, 'collectOwnedProcesses')
  const error = await withLocalWorker(async (context) => {
    const descendant = await vi.waitFor(() => item.descendant('worker'))
    await vi.waitFor(() => expect(captures.mock.results.some(result => result.type === 'return' && result.value.has(descendant.pid))).toBe(true), { timeout: 5000 })
    await context.request('/exit')
    await vi.waitFor(() => expect(context.signal.aborted).toBe(true))
    context.signal.throwIfAborted()
  }, item.options).catch(error => error)
  expect(error).toBeInstanceOf(Error)
  expect(messages(error)).toMatch(/Worker 提前退出：exit=0|启动身份未确认/)
  const descendant = await item.descendant('worker')
  if (messages(error).includes('启动身份未确认')) {
    return
  }
  expect(() => process.kill(descendant.pid, 0)).toThrow()
  if (mode === 'surviving-detached') {
    expect(messages(error)).toContain('子进程清理未正常完成')
  }
})
