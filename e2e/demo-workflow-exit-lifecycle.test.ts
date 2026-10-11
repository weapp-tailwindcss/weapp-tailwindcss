import { spawn } from 'node:child_process'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import { createWorkflowProcessTree } from '../scripts/demo-e2e-workflow/process-tree'

const emptyTable = process.platform === 'win32' ? '[]' : ''
const probe = vi.hoisted(() => ({ delay: 60, calls: [] as number[] }))
vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>()
  const result = (timeout: number) => timeout < probe.delay
    ? Object.assign(new Error('process probe timed out'), { code: 'ETIMEDOUT' })
    : undefined
  return {
    ...original,
    spawnSync: (_command: string, _args: string[], options: { timeout: number }) => {
      probe.calls.push(options.timeout)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(probe.delay, options.timeout))
      return { error: result(options.timeout), status: 0, stdout: emptyTable, stderr: '' }
    },
    execFile: (_command: string, _args: string[], options: { timeout: number }, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
      probe.calls.push(options.timeout)
      const child = new EventTarget()
      setTimeout(() => {
        callback(result(options.timeout) ?? null, emptyTable, '')
        child.dispatchEvent(new Event('close'))
      }, Math.min(probe.delay, options.timeout))
      return { once: (event: string, listener: () => void) => child.addEventListener(event, listener, { once: true }) }
    },
  }
})

afterEach(() => {
  probe.delay = 60
  probe.calls.length = 0
})

async function normalExit(cleanupMs: number) {
  const child = spawn(process.execPath, ['-e', ''], { detached: process.platform !== 'win32', stdio: 'ignore' })
  const events: string[] = []
  const closed = new Promise<void>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', () => {
      events.push('close')
      resolve()
    })
  })
  const tree = createWorkflowProcessTree(child, closed, { cleanupMs })
  let cleanup: Promise<unknown> | undefined
  child.once('exit', () => {
    events.push('exit')
    cleanup = tree.stop().catch(error => error)
    events.push('exit-handler-returned')
  })
  await closed
  return { result: await cleanup, events }
}

it('正常退出的慢扫描让 close 先推进，不以同步扫描饥饿伪造清理失败', async () => {
  const { result, events } = await normalExit(100)
  expect(result).toBeUndefined()
  expect(events).toEqual(['exit', 'exit-handler-returned', 'close'])
  expect(probe.calls).toHaveLength(1)
})

it('真实扫描超时仍失败，耗尽预算后不再调度 1ms 扫描', async () => {
  probe.delay = 150
  const { result } = await normalExit(80)
  expect(result).toBeInstanceOf(AggregateError)
  expect(String(result)).toContain('清理未成功')
  expect(probe.calls).toHaveLength(1)
  expect((result as AggregateError).errors.some(error => String(error).includes('process probe timed out'))).toBe(true)
})
