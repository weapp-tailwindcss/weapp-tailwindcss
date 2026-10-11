import type { ChildProcess, spawn } from 'node:child_process'
import type { ProcessIdentity } from '../scripts/demo-e2e-workflow/process-table'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as memoryModule from '../scripts/demo-e2e-memory'
import * as observerModule from '../scripts/demo-e2e-workflow/process-observer'
import * as treeModule from '../scripts/demo-e2e-workflow/process-tree'
import { createWorkflowProcessTree } from '../scripts/demo-e2e-workflow/process-tree'
import { runStep } from '../scripts/demo-e2e-workflow/step'

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawn: mocks.spawn,
}))
const at = (second = 0) => `2026-10-04T12:00:${String(second).padStart(2, '0')}Z`
const root = { pid: 100, parent: 1, group: 0, started: at() }
const own = { pid: 424242, parent: 1, group: 0, started: at() }
const prepare = observerModule.prepareWorkflowProcessObserver
const options = { platform: 'win32' as const, command: 'fixture-observer', args: [] }
const live: ChildProcess[] = []
let realSpawn: typeof spawn
let child: ChildProcess & { stdin: PassThrough, stdout: PassThrough, stderr: PassThrough }
let requests: Array<{ id: number, pids: number[] | null }>

function reply(index: number, rows: unknown = [own]) {
  child.stdout.write(`${JSON.stringify({ id: requests[index]!.id, rows })}\n`)
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  realSpawn = (await vi.importActual<typeof import('node:child_process')>('node:child_process')).spawn
  requests = []
  const current = Object.assign(new EventEmitter(), { pid: own.pid, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() }) as unknown as typeof child
  const currentRequests = requests
  current.stdin.on('data', (data) => {
    const request = JSON.parse(String(data))
    if (request.kind === 'memory') {
      current.stdout.write(`${JSON.stringify({ id: request.id, rows: { rssMb: 0, maxProcessRssMb: 0, processCount: 0, topProcesses: [] } })}\n`)
    }
    else {
      currentRequests.push(request)
    }
  })
  current.stdin.on('finish', () => queueMicrotask(() => current.emit('close', 0, null)))
  current.kill = vi.fn(() => {
    queueMicrotask(() => current.emit('close', null, 'SIGKILL'))
    return true
  })
  child = current
  mocks.spawn.mockReset().mockReturnValue(child)
})

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  child.stdin.destroy()
  child.stdout.destroy()
  child.stderr.destroy()
  for (const item of live.splice(0)) {
    if (item.exitCode === null && item.signalCode === null) {
      item.kill('SIGKILL')
      await new Promise<void>(resolve => item.once('close', () => resolve()))
    }
  }
})

it('6 秒冷准备完成真实身份握手；热查询仍按原 5 秒截止失败且不重启', async () => {
  const initializing = prepare(undefined, options)
  await vi.advanceTimersByTimeAsync(6000)
  reply(0)
  const observer = (await initializing)!
  expect(mocks.spawn).toHaveBeenCalledOnce()
  const reading = observer.table(5000).catch(error => error)
  await vi.advanceTimersByTimeAsync(5000)
  expect(String(await reading)).toContain('timeoutMs=5000')
  reply(1, [root])
  await expect(observer.table(5000)).rejects.toThrow('timeoutMs=5000')
  expect(() => observer.subset([], 2000)).toThrow('timeoutMs=5000')
  await expect(observer.close()).rejects.toThrow('timeoutMs=5000')
  expect(mocks.spawn).toHaveBeenCalledOnce()
  expect(child.kill).toHaveBeenCalledWith('SIGKILL')
})

it.each([{ rows: [] }, { rows: [{ ...own, started: 'invalid' }] }])('准备必须包含同一 parser 验证的采集器本体身份：%j', async ({ rows }) => {
  vi.spyOn(observerModule, 'prepareWorkflowProcessObserver').mockImplementation(signal => prepare(signal, options))
  const running = runStep({ name: 'unstarted', command: 'workload', args: [] }, 1, 1).catch(error => error)
  reply(0, rows)
  expect(await running).toBeInstanceOf(Error)
  expect(mocks.spawn).toHaveBeenCalledOnce()
  expect(mocks.spawn.mock.calls[0]?.[0]).toBe('fixture-observer')
  expect(child.kill).toHaveBeenCalledWith('SIGKILL')
})

it.each(['invalid JSON', JSON.stringify({ id: 123, rows: [own] })])('同一 chunk 的合法握手与坏尾行不能放行业务：%s', async (tail) => {
  vi.spyOn(observerModule, 'prepareWorkflowProcessObserver').mockImplementation(signal => prepare(signal, options))
  const running = runStep({ name: 'unstarted', command: 'workload', args: [] }, 1, 1).catch(error => error)
  child.stdout.write(`${JSON.stringify({ id: requests[0]!.id, rows: [own] })}\n${tail}\n`)
  expect(await running).toBeInstanceOf(Error)
  expect(mocks.spawn).toHaveBeenCalledOnce()
  expect(child.kill).toHaveBeenCalledWith('SIGKILL')
})

it('业务 spawn 早期抛错仍关闭已经准备的采集器', async () => {
  const close = vi.fn().mockResolvedValue(undefined)
  vi.spyOn(observerModule, 'prepareWorkflowProcessObserver').mockResolvedValue({ table: vi.fn(), subset: vi.fn(), memory: vi.fn(), close })
  const error = new Error('workload spawn failed')
  mocks.spawn.mockImplementation(() => {
    throw error
  })
  await expect(runStep({ name: 'failed spawn', command: 'workload', args: [] }, 1, 1)).rejects.toBe(error)
  expect(close).toHaveBeenCalledOnce()
})

it.each([false, true])('业务成功后必须回收采集器，回收失败不能产生成功报告：failed=%s', async (failed) => {
  const closeError = new Error('observer close failed')
  const close = failed ? vi.fn().mockRejectedValue(closeError) : vi.fn().mockResolvedValue(undefined)
  vi.spyOn(observerModule, 'prepareWorkflowProcessObserver').mockResolvedValue({ table: vi.fn(), subset: vi.fn(), memory: vi.fn(), close })
  vi.spyOn(treeModule, 'createWorkflowProcessTree').mockReturnValue({ capture: vi.fn().mockResolvedValue(new Map()), stop: vi.fn().mockResolvedValue(undefined) })
  vi.spyOn(memoryModule, 'sampleProcessTreeAsync').mockResolvedValue(null)
  mocks.spawn.mockImplementation(() => {
    queueMicrotask(() => {
      Object.assign(child, { exitCode: 0, signalCode: null })
      child.emit('close', 0, null)
    })
    return child
  })
  const result = await runStep({ name: 'finished', command: 'workload', args: [] }, 1, 1).catch(error => error)
  if (failed) {
    expect(result).toBeInstanceOf(AggregateError)
    expect(result.stepReport).toMatchObject({ exitCode: 1, error: expect.stringContaining('observer close failed') })
  }
  else {
    expect(result).toMatchObject({ exitCode: 0 })
  }
  expect(close).toHaveBeenCalledOnce()
})

it('准备中取消先回收采集器，业务从未启动', async () => {
  vi.spyOn(observerModule, 'prepareWorkflowProcessObserver').mockImplementation(signal => prepare(signal, options))
  const controller = new AbortController()
  const running = runStep({ name: 'cancelled prepare', command: 'workload', args: [] }, 1, 1, {}, process.env, controller.signal).catch(error => error)
  controller.abort(new Error('prepare aborted'))
  const error = await running
  expect(error).toBeInstanceOf(Error)
  expect(String((error as Error).cause)).toContain('prepare aborted')
  expect(mocks.spawn).toHaveBeenCalledOnce()
  expect(child.kill).toHaveBeenCalledWith('SIGKILL')
})

it('准备完成与业务 spawn 间再次检查取消并关闭热会话', async () => {
  const controller = new AbortController()
  vi.spyOn(observerModule, 'prepareWorkflowProcessObserver').mockImplementation(async (signal) => {
    const observer = await prepare(signal, options)
    controller.abort(new Error('cancel between prepare and spawn'))
    return observer
  })
  const running = runStep({ name: 'unstarted', command: 'workload', args: [] }, 1, 1, {}, process.env, controller.signal).catch(error => error)
  reply(0)
  expect(String(await running)).toContain('cancel between prepare and spawn')
  expect(mocks.spawn).toHaveBeenCalledOnce()
  expect(child.stdin.writableEnded).toBe(true)
})

it('stop 将在途 5 秒查询收紧为原 2 秒，迟到身份不能写回', async () => {
  const initializing = prepare(undefined, options)
  reply(0)
  const observer = (await initializing)!
  const workload = Object.assign(new EventEmitter(), { pid: root.pid, exitCode: null, signalCode: null, kill: vi.fn() }) as unknown as ChildProcess
  let closed!: () => void
  const tree = createWorkflowProcessTree(workload, new Promise<void>((resolve) => {
    closed = resolve
  }), { observer })
  const captured = tree.capture().catch(error => error)
  Object.assign(workload, { exitCode: 0 })
  closed()
  const stopped = tree.stop().catch(error => error)
  await vi.advanceTimersByTimeAsync(2000)
  expect(String(await captured)).toContain('清理截止时间')
  reply(1, [root])
  expect(await stopped).toBeInstanceOf(AggregateError)
  expect((await tree.capture()).size).toBe(0)
  expect(workload.kill).not.toHaveBeenCalled()
  expect(mocks.spawn).toHaveBeenCalledOnce()
  await expect(observer.close()).rejects.toThrow('清理截止时间')
})

it.each(['stdin', 'stdout', 'stderr'] as const)('%s stream 错误会失效会话、回收并保留原始错误', async (stream) => {
  const initializing = prepare(undefined, options)
  reply(0)
  const observer = (await initializing)!
  const error = new Error(`${stream} broken`)
  child[stream].emit('error', error)
  expect(() => observer.subset([], 2000)).toThrow(error)
  await expect(observer.close()).rejects.toBe(error)
  expect(child.kill).toHaveBeenCalledWith('SIGKILL')
})

it.each(['close', 'end'] as const)('空范围不能掩盖采集器闲置期间的意外 %s', async (event) => {
  const initializing = prepare(undefined, options)
  reply(0)
  const observer = (await initializing)!
  if (event === 'close') {
    child.emit('close', 1, null)
  }
  else {
    child.stdout.emit('end')
  }
  expect(() => observer.subset([], 2000)).toThrow('意外')
  await expect(observer.close()).rejects.toThrow('意外')
})

it.each([{ code: 1, signal: null }, { code: null, signal: 'SIGTERM' }])('正常 close 请求期间异常退出不能被接受：%j', async ({ code, signal }) => {
  const initializing = prepare(undefined, options)
  reply(0)
  const observer = (await initializing)!
  child.stdin.removeAllListeners('finish')
  child.stdin.once('finish', () => queueMicrotask(() => child.emit('close', code, signal)))
  await expect(observer.close()).rejects.toThrow('意外退出')
})

it('超时后只能回收持有的采集器；缺少 close 证据按独立回收截止失败', async () => {
  const initializing = prepare(undefined, options)
  reply(0)
  const observer = (await initializing)!
  child.kill = vi.fn(() => true)
  const reading = observer.table(5000).catch(error => error)
  await vi.advanceTimersByTimeAsync(6000)
  expect(String(await reading)).toContain('退出未确认')
  await expect(observer.close()).rejects.toThrow('退出未确认')
  expect(child.kill).toHaveBeenCalledWith('SIGKILL')
  expect(mocks.spawn).toHaveBeenCalledOnce()
})

it('空范围仍执行取消与预算检查，禁止将无身份工作当作成功', async () => {
  const initializing = prepare(undefined, options)
  reply(0)
  const observer = (await initializing)!
  const controller = new AbortController()
  controller.abort(new Error('empty subset aborted'))
  expect(() => observer.subset([], 2000, controller.signal)).toThrow('empty subset aborted')
  await expect(observer.subset([], 0)).rejects.toThrow('预算已耗尽')
  await observer.close()
})

it('异常行数据会使已热会话失效，禁止继续请求', async () => {
  const initializing = prepare(undefined, options)
  reply(0)
  const observer = (await initializing)!
  const reading = observer.table(5000).catch(error => error)
  reply(1, [{ ...root, started: 'invalid' }])
  expect(String(await reading)).toContain('身份表无效')
  await expect(observer.table(5000)).rejects.toThrow('身份表无效')
  await expect(observer.close()).rejects.toThrow('身份表无效')
  expect(child.kill).toHaveBeenCalledWith('SIGKILL')
})

it('排队等待也消耗本轮绝对预算，定时器迟到时仍拒绝过期响应', async () => {
  const initializing = prepare(undefined, options)
  reply(0)
  const observer = (await initializing)!
  const first = observer.table(5000).catch(error => error)
  const queued = observer.table(2000).catch(error => error)
  vi.setSystemTime(2001)
  reply(2)
  expect(String(await queued)).toContain('绝对截止')
  expect(await first).toBeInstanceOf(Error)
  await expect(observer.close()).rejects.toThrow('绝对截止')
  expect(mocks.spawn).toHaveBeenCalledOnce()
})

it('真实单个热进程连续刷新表和子集；warmup 数据不复用，finally 已回收', async () => {
  vi.useRealTimers()
  const worker = `const readline=require('node:readline'); let count=0; const input=readline.createInterface({input:process.stdin}); input.on('line',line=>{const request=JSON.parse(line); const rows=request.kind==='memory'?{rssMb:0,maxProcessRssMb:0,processCount:0,topProcesses:[]}:[{pid:process.pid,parent:1,group:0,started:'2026-10-04T12:00:00Z'},{pid:100,parent:1,group:0,started:'2026-10-04T12:00:'+String(++count).padStart(2,'0')+'Z'}].filter(row=>request.pids==null||request.pids.includes(row.pid)); console.log(JSON.stringify({id:request.id,rows}));}); input.on('close',()=>process.exit(0));`
  const createChild: typeof spawn = ((...args: Parameters<typeof spawn>) => {
    const item = realSpawn(...args)
    live.push(item)
    return item
  }) as typeof spawn
  const observer = (await prepare(undefined, { platform: 'win32', command: process.execPath, args: ['-e', worker], spawn: createChild }))!
  try {
    const first = await observer.table(5000)
    const second = await observer.table(5000)
    const subset = await observer.subset([100], 2000)
    const identity = (rows: ProcessIdentity[]) => rows.find(row => row.pid === 100)!.started
    expect(identity(first)).toBe(at(2))
    expect(identity(second)).toBe(at(3))
    expect(identity(subset)).toBe(at(4))
    expect(live).toHaveLength(1)
  }
  finally {
    await observer.close()
  }
  expect(() => process.kill(live[0]!.pid!, 0)).toThrow()
})
