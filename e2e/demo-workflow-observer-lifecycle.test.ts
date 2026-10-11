import type { ChildProcess, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createProcessObserverTransport } from '../scripts/demo-e2e-workflow/process-observer/transport'

let child: ChildProcess & { stdin: PassThrough, stdout: PassThrough, stderr: PassThrough }
let createChild: typeof spawn

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  child = Object.assign(new EventEmitter(), {
    pid: 424242,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  }) as unknown as typeof child
  createChild = vi.fn(() => child) as unknown as typeof spawn
})

afterEach(() => {
  vi.useRealTimers()
  child.stdin.destroy()
  child.stdout.destroy()
  child.stderr.destroy()
})

it('原截止失效后的多阶段迟到输出只终止本体一次，不覆盖首错', async () => {
  const transport = createProcessObserverTransport('fixture', [], createChild)
  const reading = transport.request({ kind: 'identity' }, 5000).catch(error => error)
  vi.setSystemTime(5001)
  for (const message of [
    { event: 'observer-ready', pid: child.pid },
    { event: 'request-received', id: 1, kind: 'identity' },
    { event: 'query-completed', id: 1, kind: 'identity' },
    { event: 'response-ready', id: 1, kind: 'identity' },
    { id: 1, rows: [] },
  ]) {
    child.stdout.write(`${JSON.stringify(message)}\n`)
  }
  expect(child.kill).toHaveBeenCalledOnce()
  child.emit('close', null, 'SIGKILL')
  const error = await reading
  expect(String(error)).toContain('进度超过本轮绝对截止')
  await expect(transport.close()).rejects.toBe(error)
  transport.invalidate(new Error('late-secondary-error'))
  expect(child.kill).toHaveBeenCalledOnce()
  await expect(transport.close()).rejects.toBe(error)
})

it('终止抛错且没有 close 时，请求与 close 保留同一聚合首错和回收失败', async () => {
  const transport = createProcessObserverTransport('fixture', [], createChild)
  const reading = transport.request({ kind: 'identity' }, 5000).catch(error => error)
  const primary = new Error('original-query-failure')
  const killError = new Error('owned-child-kill-failure')
  child.kill = vi.fn(() => {
    throw killError
  })
  transport.invalidate(primary)
  transport.invalidate(new Error('late-secondary-error'))
  await vi.advanceTimersByTimeAsync(1000)
  const error = await reading
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.errors[0]).toBeInstanceOf(AggregateError)
  expect(error.errors[0].errors).toEqual([primary, killError])
  expect(String(error.errors[1])).toContain('退出未确认')
  expect(child.kill).toHaveBeenCalledOnce()
  await expect(transport.close()).rejects.toBe(error)
})

it('正常 EOF 关闭期间真实流错误仍拒绝 close，并只终止本体一次', async () => {
  const transport = createProcessObserverTransport('fixture', [], createChild)
  const closing = transport.close().catch(error => error)
  await vi.advanceTimersByTimeAsync(0)
  const error = new Error('stream-failed-during-normal-close')
  child.stdout.emit('error', error)
  child.stderr.emit('error', new Error('late-secondary-error'))
  child.emit('close', 0, null)
  expect(await closing).toBe(error)
  expect(child.kill).toHaveBeenCalledOnce()
})
