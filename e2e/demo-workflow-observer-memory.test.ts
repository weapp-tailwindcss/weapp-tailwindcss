import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { sampleProcessTreeAsync } from '../scripts/demo-e2e-memory'
import { containsWorkflowError, WorkflowCancellationError } from '../scripts/demo-e2e-workflow/cancellation'
import * as observerModule from '../scripts/demo-e2e-workflow/process-observer'
import { runStep } from '../scripts/demo-e2e-workflow/step'

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), command: vi.fn() }))
vi.mock('node:child_process', async importOriginal => ({ ...await importOriginal<object>(), spawn: mocks.spawn }))
vi.mock('../scripts/demo-e2e-workflow/process-command', () => ({ runProcessCommand: mocks.command }))

const prepare = observerModule.prepareWorkflowProcessObserver
const options = { platform: 'win32' as const, command: 'fixture-observer', args: [] }
const identity = { pid: 424242, parent: 1, group: 0, started: '2026-10-04T12:00:00Z' }
const metric = { rssMb: 10, maxProcessRssMb: 6, processCount: 2, topProcesses: [{ pid: 100, ppid: 1, rssMb: 6, command: 'node long worker' }] }
let child: ChildProcess & { stdin: PassThrough, stdout: PassThrough, stderr: PassThrough }
let requests: Array<{ id: number, kind: string, rootPid?: number, cwd?: string }>

function reply(index: number, rows: unknown) {
  child.stdout.write(`${JSON.stringify({ id: requests[index]!.id, rows })}\n`)
}

async function initialized() {
  const preparing = prepare(undefined, options)
  reply(0, [identity])
  await Promise.resolve()
  await Promise.resolve()
  reply(1, metric)
  return (await preparing)!
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  requests = []
  const current = Object.assign(new EventEmitter(), { pid: identity.pid, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() }) as unknown as typeof child
  const currentRequests = requests
  current.stdin.on('data', data => currentRequests.push(JSON.parse(String(data))))
  current.stdin.on('finish', () => queueMicrotask(() => current.emit('close', 0, null)))
  current.kill = vi.fn(() => {
    queueMicrotask(() => current.emit('close', null, 'SIGKILL'))
    return true
  })
  child = current
  mocks.spawn.mockReset().mockReturnValue(child)
  mocks.command.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  child.stdin.destroy()
  child.stdout.destroy()
  child.stderr.destroy()
})

it('身份 10 秒与内存 5 秒共用单一准备截止；不能重置预算或启动业务', async () => {
  vi.spyOn(observerModule, 'prepareWorkflowProcessObserver').mockImplementation(signal => prepare(signal, options))
  const running = runStep({ name: 'unstarted', command: 'workload', args: [] }, 1, 1).catch(error => error)
  await vi.advanceTimersByTimeAsync(10_000)
  reply(0, [identity])
  await vi.advanceTimersByTimeAsync(0)
  expect(requests[1]).toMatchObject({ kind: 'memory', rootPid: identity.pid, cwd: process.cwd() })
  await vi.advanceTimersByTimeAsync(5000)
  const error = await running
  expect(String(error.cause)).toContain('timeoutMs=5000')
  expect(mocks.spawn).toHaveBeenCalledOnce()
  expect(child.kill).toHaveBeenCalledWith('SIGKILL')
})

it('连续内存采样重新查询同一热会话，丢弃 warmup 且没有额外 PowerShell spawn', async () => {
  const observer = await initialized()
  try {
    for (let index = 0; index < 2; index++) {
      const reading = sampleProcessTreeAsync(100, observer)
      const rssMb = 20 + index
      reply(2 + index, { ...metric, rssMb })
      expect(await reading).toMatchObject({ rssMb, processCount: 2, topProcesses: metric.topProcesses })
    }
    expect(requests.map(request => request.kind)).toEqual(['identity', 'memory', 'memory', 'memory'])
    expect(requests.slice(2).every(request => request.rootPid === 100)).toBe(true)
    expect(mocks.spawn).toHaveBeenCalledOnce()
    expect(mocks.command).not.toHaveBeenCalled()
  }
  finally {
    await observer.close()
  }
})

it('热内存采样仍在原 5 秒截止失败，不能缓存旧样本或重启续借预算', async () => {
  const observer = await initialized()
  const reading = sampleProcessTreeAsync(100, observer).catch(error => error)
  await vi.advanceTimersByTimeAsync(5000)
  expect(String(await reading)).toContain('timeoutMs=5000')
  reply(2, metric)
  await expect(observer.memory(100, 5000)).rejects.toThrow('timeoutMs=5000')
  await expect(observer.close()).rejects.toThrow('timeoutMs=5000')
  expect(mocks.spawn).toHaveBeenCalledOnce()
})

it('内存请求排队与身份请求共享失效边界，清理身份不能越过自己的截止', async () => {
  const observer = await initialized()
  const reading = observer.memory(100, 5000).catch(error => error)
  const identityReading = observer.table(2000).catch(error => error)
  vi.setSystemTime(2000)
  reply(3, [identity])
  expect(String(await identityReading)).toContain('绝对截止')
  expect(await reading).toBeInstanceOf(Error)
  await expect(observer.close()).rejects.toThrow('绝对截止')
})

it('响应已经到达但 Promise 续体或解析越过截止时，不能接受迟到内存样本', async () => {
  const observer = await initialized()
  const reading = observer.memory(100, 5000).catch(error => error)
  reply(2, metric)
  vi.setSystemTime(5000)
  expect(String(await reading)).toContain('结果超过本轮绝对截止')
  await expect(observer.close()).rejects.toThrow('结果超过本轮绝对截止')
})

it('正常关闭仍拒绝响应流中未完成的尾行', async () => {
  const observer = await initialized()
  child.stdout.write('{"id":')
  const closing = observer.close().catch(error => error)
  child.stdout.emit('end')
  expect(String(await closing)).toContain('响应流意外结束')
})

it('关闭超时且 kill 抛错仍等待回收截止，同时保留终止错误与缺少 close 证据', async () => {
  const observer = await initialized()
  child.stdin.removeAllListeners('finish')
  child.kill = vi.fn(() => {
    throw new Error('observer kill failed')
  })
  const closing = observer.close().catch(error => error)
  await vi.advanceTimersByTimeAsync(2000)
  const error = await closing
  expect(error).toBeInstanceOf(AggregateError)
  expect(String(error)).toContain('退出未确认')
  expect(String(error.errors[0])).toContain('终止失败')
  expect(String(error.errors[0].errors[1])).toContain('observer kill failed')
})

it('业务已有失败报告时，采集器回收错误仍必须进入同一报告', async () => {
  const close = vi.fn().mockRejectedValue(new Error('observer close failed'))
  vi.spyOn(observerModule, 'prepareWorkflowProcessObserver').mockResolvedValue({ table: vi.fn(), subset: vi.fn(), memory: vi.fn(), close })
  const report = { exitCode: 2, error: 'workload failed' }
  mocks.spawn.mockImplementation(() => {
    throw Object.assign(new Error('workload failed'), { stepReport: report })
  })
  const error = await runStep({ name: 'failed workload', command: 'workload', args: [] }, 1, 1).catch(caught => caught)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.stepReport).toBe(report)
  expect(report.error).toContain('workload failed')
  expect(report.error).toContain('observer close failed')
  expect(close).toHaveBeenCalledOnce()
})

it.each(['SIGINT', 'SIGTERM'] as const)('%s 已记录的查询 fatal 回收后不重复误标，原取消报告与错误对象保持可见', async (signal) => {
  const queryError = new Error('identity query already failed')
  const cancelled = new WorkflowCancellationError(signal)
  const report = { exitCode: cancelled.exitCode, cancelled: signal, error: `${cancelled.message}\n${queryError.message}` }
  const primary = Object.assign(new AggregateError([cancelled, new AggregateError([queryError], 'capture failed')], `业务阶段取消 (${signal})`), { stepReport: report })
  queryError.cause = primary
  expect(containsWorkflowError(primary, new Error(queryError.message))).toBe(false)
  const close = vi.fn().mockRejectedValue(queryError)
  vi.spyOn(observerModule, 'prepareWorkflowProcessObserver').mockResolvedValue({ table: vi.fn(), subset: vi.fn(), memory: vi.fn(), close })
  mocks.spawn.mockImplementation(() => {
    throw primary
  })
  const error = await runStep({ name: 'cancelled', command: 'workload', args: [] }, 1, 1).catch(error => error)
  expect(error).toBe(primary)
  expect(String(error)).toContain(signal)
  expect(error.stepReport).toBe(report)
  expect(report.exitCode).toBe(cancelled.exitCode)
  expect(report.error).not.toContain('身份采集器回收失败')
  expect(close).toHaveBeenCalledOnce()
})

it.each(['SIGINT', 'SIGTERM'] as const)('%s 与真正退出未确认并存时仍阻断，顶层及报告保留两处原始原因', async (signal) => {
  const queryError = new Error('identity query already failed')
  const cancelled = new WorkflowCancellationError(signal)
  const report = { exitCode: cancelled.exitCode, cancelled: signal, error: cancelled.message }
  const primary = Object.assign(new AggregateError([cancelled, queryError], `业务阶段取消 (${signal})`), { stepReport: report })
  const reapError = new Error('observer pid=424242 退出未确认')
  const closeError = new AggregateError([queryError, reapError], 'observer close failed')
  const close = vi.fn().mockRejectedValue(closeError)
  vi.spyOn(observerModule, 'prepareWorkflowProcessObserver').mockResolvedValue({ table: vi.fn(), subset: vi.fn(), memory: vi.fn(), close })
  mocks.spawn.mockImplementation(() => {
    throw primary
  })
  const error = await runStep({ name: 'cancelled', command: 'workload', args: [] }, 1, 1).catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.errors).toEqual([primary, closeError])
  expect(String(error)).toContain(signal)
  expect(String(error)).toContain('observer close failed')
  expect(error.stepReport).toBe(report)
  expect(report.error).toContain(signal)
  expect(report.error).toContain(reapError.message)
  expect(report.exitCode).toBe(cancelled.exitCode)
  expect(close).toHaveBeenCalledOnce()
})

it.each([{ rssMb: -1 }, { processCount: 1.5 }, { topProcesses: [{ pid: 1, ppid: 0, rssMb: 'bad' }] }])('坏内存结果使会话失效并保留失败：%j', async (invalid) => {
  const observer = await initialized()
  const reading = observer.memory(100, 5000).catch(error => error)
  reply(2, { ...metric, ...invalid })
  expect(String(await reading)).toContain('响应无效')
  await expect(observer.table(5000)).rejects.toThrow('响应无效')
  await expect(observer.close()).rejects.toThrow('响应无效')
  expect(child.kill).toHaveBeenCalledWith('SIGKILL')
})
