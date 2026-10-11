import type { ChildProcess, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { prepareWorkflowProcessObserver } from '../scripts/demo-e2e-workflow/process-observer'
import { createProcessObserverTransport } from '../scripts/demo-e2e-workflow/process-observer/transport'

let child: ChildProcess & { stdin: PassThrough, stdout: PassThrough, stderr: PassThrough }
let requests: Array<{ id: number, kind: string }>
let createChild: typeof spawn

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  requests = []
  child = Object.assign(new EventEmitter(), {
    pid: 424242,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => {
      queueMicrotask(() => child.emit('close', null, 'SIGKILL'))
      return true
    }),
  }) as unknown as typeof child
  child.stdin.on('data', data => requests.push(JSON.parse(String(data))))
  child.stdin.on('finish', () => queueMicrotask(() => child.emit('close', 0, null)))
  createChild = vi.fn(() => child) as unknown as typeof spawn
})

afterEach(() => {
  vi.useRealTimers()
  child.stdin.destroy()
  child.stdout.destroy()
  child.stderr.destroy()
})

function emit(value: unknown) {
  child.stdout.write(`${JSON.stringify(value)}\n`)
}

function progress(id: number, kind: string, event: string) {
  emit({ id, kind, event })
}

it('诊断区分进程启动、输入消费、真实查询与序列化，进度行不能充当结果', async () => {
  const transport = createProcessObserverTransport('fixture', [], createChild)
  const reading = transport.request({ kind: 'identity' }, 5000)
  let settled = false
  void reading.then(() => {
    settled = true
  })
  await vi.advanceTimersByTimeAsync(1000)
  emit({ event: 'observer-ready', pid: child.pid })
  progress(1, 'identity', 'request-received')
  await vi.advanceTimersByTimeAsync(500)
  progress(1, 'identity', 'query-completed')
  await vi.advanceTimersByTimeAsync(300)
  progress(1, 'identity', 'response-ready')
  await Promise.resolve()
  expect(settled).toBe(false)
  emit({ id: 1, rows: [{ pid: child.pid }] })
  expect(await reading).toEqual([{ pid: child.pid }])
  expect(transport.diagnostics()).toMatchObject({
    readyAtMs: 1000,
    requests: [{ id: 1, kind: 'identity', sentAtMs: 0, stages: [
      { stage: 'stdin-written', elapsedMs: 0 },
      { stage: 'request-received', elapsedMs: 1000 },
      { stage: 'query-completed', elapsedMs: 1500 },
      { stage: 'response-ready', elapsedMs: 1800 },
      { stage: 'response-received', elapsedMs: 1800 },
    ] }],
  })
  await transport.close()
})

it('持续进度不能延长原请求截止，超时保留最后已确认阶段', async () => {
  const transport = createProcessObserverTransport('fixture', [], createChild)
  const reading = transport.request({ kind: 'identity' }, 5000).catch(error => error)
  await vi.advanceTimersByTimeAsync(1000)
  emit({ event: 'observer-ready', pid: child.pid })
  progress(1, 'identity', 'request-received')
  await vi.advanceTimersByTimeAsync(3000)
  progress(1, 'identity', 'query-completed')
  await vi.advanceTimersByTimeAsync(1000)
  const error = await reading
  expect(String(error)).toContain('timeoutMs=5000')
  expect(String(error)).toContain('"stage":"query-completed","elapsedMs":4000')
  expect(String(error)).toContain('"readyAtMs":1000')
  expect(child.kill).toHaveBeenCalledOnce()
  await expect(transport.close()).rejects.toBe(error)
})

it('首行都未收到时明确保留启动未知状态，不把已写入 stdin 当作 provider ready', async () => {
  const transport = createProcessObserverTransport('fixture', [], createChild)
  const reading = transport.request({ kind: 'identity' }, 5000).catch(error => error)
  await vi.advanceTimersByTimeAsync(5000)
  const error = await reading
  expect(String(error)).toContain('"readyAtMs":null')
  expect(String(error)).toContain('stdin-written')
  expect(String(error)).not.toContain('query-completed')
  await expect(transport.close()).rejects.toBe(error)
})

it.each([
  { event: 'observer-ready', pid: 123 },
  { event: 'request-received', id: 123, kind: 'identity' },
  { event: 'request-received', id: 1, kind: 'memory' },
  { event: 'query-completed', id: 1, kind: 'identity' },
])('坏进度仍使会话失效，不能以诊断协议绕过本轮身份：%j', async (message) => {
  const transport = createProcessObserverTransport('fixture', [], createChild)
  const reading = transport.request({ kind: 'identity' }, 5000).catch(error => error)
  if (message.event !== 'observer-ready') {
    emit({ event: 'observer-ready', pid: child.pid })
  }
  emit(message)
  const error = await reading
  expect(error).toBeInstanceOf(Error)
  expect(child.kill).toHaveBeenCalledOnce()
  await expect(transport.close()).rejects.toBe(error)
})

it('请求进度不能先于采集器本体准备进度', async () => {
  const transport = createProcessObserverTransport('fixture', [], createChild)
  const reading = transport.request({ kind: 'identity' }, 5000).catch(error => error)
  progress(1, 'identity', 'request-received')
  const error = await reading
  expect(String(error)).toContain('阶段顺序无效')
  await expect(transport.close()).rejects.toBe(error)
})

it('迟到的启动进度也不能续借已经耗尽的请求预算', async () => {
  const transport = createProcessObserverTransport('fixture', [], createChild)
  const reading = transport.request({ kind: 'identity' }, 5000).catch(error => error)
  vi.setSystemTime(5001)
  emit({ event: 'observer-ready', pid: child.pid })
  const error = await reading
  expect(String(error)).toContain('进度超过本轮绝对截止')
  expect(transport.diagnostics().readyAtMs).toBeNull()
  await expect(transport.close()).rejects.toBe(error)
})

it('事件循环迟到的进度必须按原绝对截止失败', async () => {
  const transport = createProcessObserverTransport('fixture', [], createChild)
  const reading = transport.request({ kind: 'identity' }, 5000).catch(error => error)
  vi.setSystemTime(5001)
  progress(1, 'identity', 'request-received')
  const error = await reading
  expect(String(error)).toContain('进度超过本轮绝对截止')
  await expect(transport.close()).rejects.toBe(error)
})

it('合法握手后的坏进度尾行仍阻断业务准备', async () => {
  const preparing = prepareWorkflowProcessObserver(undefined, { platform: 'win32', command: 'fixture', args: [], spawn: createChild }).catch(error => error)
  child.stdout.write(`${JSON.stringify({ id: 1, rows: [{ pid: child.pid, parent: 1, group: 0, started: '2026-10-04T12:00:00Z' }] })}\n${JSON.stringify({ event: 'request-received', id: 999, kind: 'identity' })}\n`)
  expect(await preparing).toBeInstanceOf(Error)
  expect(createChild).toHaveBeenCalledOnce()
  expect(child.kill).toHaveBeenCalledWith('SIGKILL')
})

it('仅保留最近四个请求的阶段，诊断快照修改不影响采集器', async () => {
  const transport = createProcessObserverTransport('fixture', [], createChild)
  for (let index = 0; index < 6; index++) {
    const reading = transport.request({ kind: 'identity' }, 5000)
    emit({ id: requests[index]!.id, rows: [] })
    await reading
  }
  const snapshot = transport.diagnostics()
  expect(snapshot.requests.map(request => request.id)).toEqual([3, 4, 5, 6])
  snapshot.requests[0]!.stages.push({ stage: 'forged', elapsedMs: 123 })
  expect(transport.diagnostics().requests[0]!.stages.some(stage => stage.stage === 'forged')).toBe(false)
  await transport.close()
})
