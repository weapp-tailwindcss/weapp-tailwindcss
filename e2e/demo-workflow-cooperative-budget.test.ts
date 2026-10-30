import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { prepareWorkflowProcessObserver } from '../scripts/demo-e2e-workflow/process-observer'
import { createWorkflowProcessTree } from '../scripts/demo-e2e-workflow/process-tree'
import { observerPreparation } from './helpers/observer-preparation'

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), command: vi.fn() }))
vi.mock('node:child_process', async importOriginal => ({ ...await importOriginal<object>(), spawn: mocks.spawn }))
vi.mock('../scripts/demo-e2e-workflow/process-command', () => ({ runProcessCommand: mocks.command }))
vi.mock('node:timers/promises', () => ({ setTimeout: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)) }))

const platform = process.platform
const identity = (pid: number, parent: number) => ({ pid, parent, group: 0, started: '2026-10-04T12:00:00Z' })
const own = identity(424242, 1)
let observerChild: ChildProcess & { stdin: PassThrough, stdout: PassThrough, stderr: PassThrough }
let rows: Map<number, ReturnType<typeof identity>>
let workload: ChildProcess
let closed: Promise<void>
let queryStartedAt: number[]
let queryDelayMs: number

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  Object.defineProperty(process, 'platform', { value: 'win32' })
  rows = new Map([own, identity(100, 1), identity(200, 100)].map(row => [row.pid, row]))
  queryStartedAt = []
  queryDelayMs = 100
  const held = Object.assign(new EventEmitter(), { pid: own.pid, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() }) as unknown as typeof observerChild
  held.stdin.on('data', (data) => {
    const request = JSON.parse(String(data))
    const reply = (value: unknown) => held.stdout.write(`${JSON.stringify({ id: request.id, rows: value })}\n`)
    if (request.kind === 'prepare') {
      queryStartedAt.push(Date.now())
      setTimeout(() => reply(observerPreparation(own)), queryDelayMs)
    }
    else if (request.kind === 'memory') {
      reply({ rssMb: 1, maxProcessRssMb: 1, processCount: 1, topProcesses: [] })
    }
    else {
      queryStartedAt.push(Date.now())
      // 热查询耗时仍远小于 2 秒清理预算，却长于独立的 25ms 合作等待窗口。
      setTimeout(() => reply([...rows.values()].filter(row => request.pids == null || request.pids.includes(row.pid))), queryDelayMs)
    }
  })
  held.stdin.on('finish', () => queueMicrotask(() => held.emit('close', 0, null)))
  held.kill = vi.fn(() => {
    queueMicrotask(() => held.emit('close', null, 'SIGKILL'))
    return true
  })
  observerChild = held
  mocks.spawn.mockReset().mockImplementation(() => {
    queueMicrotask(() => held.stdout.write(`${JSON.stringify({ event: 'observer-ready', pid: held.pid })}\n`))
    return held
  })
  workload = Object.assign(new EventEmitter(), { pid: 100, exitCode: null, signalCode: null, kill: vi.fn() }) as unknown as ChildProcess
  closed = new Promise(resolve => workload.once('close', () => resolve()))
  mocks.command.mockReset().mockImplementation(async (_command, args) => {
    const pid = Number(args[1])
    rows.delete(pid)
    if (pid === workload.pid) {
      Object.assign(workload, { exitCode: 0 })
      workload.emit('close', 0, null)
    }
    return ''
  })
})

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: platform })
  vi.useRealTimers()
  vi.restoreAllMocks()
  observerChild.stdin.destroy()
  observerChild.stdout.destroy()
  observerChild.stderr.destroy()
})

async function prepareTree() {
  const preparing = prepareWorkflowProcessObserver(undefined, { platform: 'win32', command: 'fixture-observer', args: [] })
  await vi.advanceTimersByTimeAsync(100)
  const observer = (await preparing)!
  const tree = createWorkflowProcessTree(workload, closed, { observer, cooperativeMs: 25 })
  const captured = tree.capture()
  await vi.advanceTimersByTimeAsync(100)
  expect([...(await captured).keys()]).toEqual([100, 200])
  return { observer, tree }
}

it('25ms 合作等待结束后仍用原 2 秒核对真实身份，不能失效热采集器或遗漏独立后代', async () => {
  const { observer, tree } = await prepareTree()
  const startedAt = Date.now()
  const stopping = tree.stop(true).catch(error => error)
  await vi.advanceTimersByTimeAsync(2500)
  const error = await stopping
  expect(error).toBeInstanceOf(AggregateError)
  expect(queryStartedAt[2]).toBe(startedAt)
  expect(mocks.command.mock.calls.map(call => call.slice(0, 2))).toEqual([
    ['taskkill', ['/pid', '200', '/f']],
    ['taskkill', ['/pid', '100', '/f']],
  ])
  expect(error.errors.some((item: Error) => item.message.includes('已向本轮进程发送终止请求'))).toBe(true)
  expect((await tree.capture()).size).toBe(0)
  expect(observerChild.kill).not.toHaveBeenCalled()
  await observer.close()
  expect(observerChild.stdin.writableEnded).toBe(true)
})

it('本体在合作窗口自然退出后，100ms 身份核对仍在原 2 秒窗口完成且不强制终止', async () => {
  const { observer, tree } = await prepareTree()
  const startedAt = Date.now()
  setTimeout(() => {
    rows.delete(100)
    rows.delete(200)
    Object.assign(workload, { exitCode: 0 })
    workload.emit('close', 0, null)
  }, 10)
  const stopping = tree.stop(true).catch(error => error)
  await vi.advanceTimersByTimeAsync(2500)
  expect(await stopping).toBeUndefined()
  expect(queryStartedAt[2]).toBe(startedAt)
  expect(mocks.command).not.toHaveBeenCalled()
  expect(observerChild.kill).not.toHaveBeenCalled()
  await observer.close()
})

it('默认合作窗口内本体先 close，独立后代随后自然退出时立即完成且不强制终止', async () => {
  const { observer } = await prepareTree()
  const tree = createWorkflowProcessTree(workload, closed, { observer })
  const captured = tree.capture()
  await vi.advanceTimersByTimeAsync(100)
  await captured
  const startedAt = Date.now()
  setTimeout(() => {
    rows.delete(100)
    Object.assign(workload, { exitCode: 0 })
    workload.emit('close', 0, null)
  }, 10)
  setTimeout(() => rows.delete(200), 400)
  let finishedAt: number | undefined
  const stopping = tree.stop(true).then(() => {
    finishedAt = Date.now()
  })
  await vi.advanceTimersByTimeAsync(350)
  expect(finishedAt).toBeUndefined()
  expect(mocks.command).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(500)
  await stopping
  expect(finishedAt! - startedAt).toBeLessThan(1000)
  expect(mocks.command).not.toHaveBeenCalled()
  expect(observerChild.kill).not.toHaveBeenCalled()
  await observer.close()
})

it('查询跨合作边界仍共享预先固定的合作加 2 秒截止，不能重开清理预算', async () => {
  const { observer, tree } = await prepareTree()
  queryDelayMs = 1500
  const startedAt = Date.now()
  let finishedAt: number | undefined
  const stopping = tree.stop(true).catch((error) => {
    finishedAt = Date.now()
    return error
  })
  await vi.advanceTimersByTimeAsync(4000)
  expect(await stopping).toBeInstanceOf(AggregateError)
  expect(finishedAt! - startedAt).toBeLessThanOrEqual(25 + 2000)
  expect(mocks.command).not.toHaveBeenCalled()
  expect(observerChild.kill).toHaveBeenCalled()
  await expect(observer.close()).rejects.toBeInstanceOf(Error)
})
