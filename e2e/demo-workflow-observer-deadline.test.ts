import type { ChildProcess, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, expect, it, vi } from 'vitest'
import { createProcessObserverTransport } from '../scripts/demo-e2e-workflow/process-observer/transport'

function fixture(pid: number | undefined = 424242) {
  vi.useFakeTimers()
  const child = Object.assign(new EventEmitter(), {
    pid,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  })
  const transport = createProcessObserverTransport('fixture', [], (() => child as unknown as ChildProcess) as typeof spawn)
  const send = (value: unknown) => child.stdout.write(`${JSON.stringify(value)}\n`)
  if (pid !== undefined && pid > 0) {
    send({ event: 'observer-ready', pid: child.pid })
  }
  return { child, transport, stopped: () => send({ event: 'observer-stopped', pid: child.pid }) }
}
afterEach(() => vi.useRealTimers())

it('收紧已经开始的回收并保持最早截止，不追加第二个关闭窗口', async () => {
  const { child, transport, stopped } = fixture()
  const start = Date.now()
  const closing = transport.close().catch(error => error)
  await vi.advanceTimersByTimeAsync(100)
  stopped()
  transport.constrainShutdown(start + 500)
  transport.constrainShutdown(start + 5000)
  await vi.advanceTimersByTimeAsync(399)
  expect(child.kill).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  await vi.advanceTimersByTimeAsync(0)
  const error = await closing
  expect(error).toBeInstanceOf(AggregateError)
  expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
  expect(Date.now()).toBe(start + 500)
  expect(vi.getTimerCount()).toBe(0)
  child.emit('close', null, 'SIGKILL')
  await expect(transport.close()).rejects.toBe(error)
})

it.each([0, 1])('关闭事件在绝对截止加 %sms 先于过期计时器派发时仍失败', async (late) => {
  const { child, transport, stopped } = fixture()
  const deadline = Date.now() + 500
  const closing = transport.close({ deadline }).catch(error => error)
  await Promise.resolve()
  stopped()
  vi.setSystemTime(deadline + late)
  child.emit('close', 0, null)
  expect(await closing).toBeInstanceOf(Error)
  await expect(transport.close()).rejects.toBeInstanceOf(Error)
  expect(vi.getTimerCount()).toBe(0)
})

it('按关闭接收时刻确认及时 close，Promise 续体延迟不制造错误', async () => {
  const { child, transport, stopped } = fixture()
  const deadline = Date.now() + 500
  const closing = transport.close({ deadline })
  await Promise.resolve()
  stopped()
  vi.setSystemTime(deadline - 1)
  child.emit('close', 0, null)
  vi.setSystemTime(deadline + 1)
  await closing
  expect(vi.getTimerCount()).toBe(0)
})

it('请求失败已经启动的 reap 也受停止截止约束，并保留首错', async () => {
  const { child, transport } = fixture()
  const primary = new Error('query-failed')
  const reading = transport.request({ kind: 'identity' }, 5000).catch(error => error)
  transport.invalidate(primary)
  const deadline = Date.now() + 100
  transport.constrainShutdown(deadline)
  await vi.advanceTimersByTimeAsync(100)
  const error = await reading
  expect(error.errors[0]).toBe(primary)
  await expect(transport.close()).rejects.toBe(error)
  expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
  expect(vi.getTimerCount()).toBe(0)
  child.emit('close', null, 'SIGKILL')
})

it('宿主异步 ENOENT 没有有效 PID 时不派发信号，仍确认实际 close 并保留首错', async () => {
  const { child, transport } = fixture(0)
  const primary = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })
  const starting = transport.waitUntilReady(5000).catch(error => error)
  child.emit('error', primary)
  child.emit('close', -2, null)
  expect(await starting).toBe(primary)
  await expect(transport.close()).rejects.toBe(primary)
  expect(child.kill).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})
