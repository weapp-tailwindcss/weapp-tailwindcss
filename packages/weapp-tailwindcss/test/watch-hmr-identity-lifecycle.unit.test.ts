import type { ChildProcess, spawn } from 'node:child_process'
import type { WorkflowProcessObserver } from '../../../scripts/demo-e2e-workflow/process-observer'
import type { ProcessObserverQuery } from '../../../scripts/demo-e2e-workflow/process-observer/transport'
import type { ProcessIdentity } from '../../../scripts/demo-e2e-workflow/process-table'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { PassThrough } from 'node:stream'
import { afterEach, expect, it, vi } from 'vitest'
import { prepareWorkflowProcessObserver } from '../../../scripts/demo-e2e-workflow/process-observer'
import { createWatchProcessController, WEB_STOP_PHASES } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/process-controller'
import { prepareWatchIdentitySource, stopWithWatchIdentity } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/process-identity'

interface Request extends Record<string, unknown> {
  id: number
  kind: ProcessObserverQuery['kind']
  pids?: readonly number[]
  at: number
}
const platform = process.platform
const root = { pid: 100, parent: 1, group: 0, started: '2026-10-29T00:00:00Z' }
const worker = { pid: 200, parent: 100, group: 0, started: '2026-10-29T00:00:01Z' }

async function fixture() {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-30T00:00:00Z'))
  Object.defineProperty(process, 'platform', { value: 'win32' })
  let rows: ProcessIdentity[] = [root, worker]
  let rootClosed = false
  let collectorClosed = false
  const events: Array<{ kind: string, at: number }> = []
  const record = (kind: string) => events.push({ kind, at: Date.now() })
  const requests: Request[] = []
  const collector = Object.assign(new EventEmitter(), {
    pid: 424242,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn((_signal?: NodeJS.Signals) => {
      record('collector-kill')
      setTimeout(closeCollector, 50, null, 'SIGKILL')
      return true
    }),
  })
  const send = (value: unknown) => collector.stdout.write(`${JSON.stringify(value)}\n`)
  const closeCollector = (code: number | null, signal: NodeJS.Signals | null) => {
    if (collectorClosed) {
      return
    }
    collectorClosed = true
    record('collector-close')
    collector.emit('exit', code, signal)
    collector.emit('close', code, signal)
  }
  const reply = (request: Request, value: unknown, delayMs = 0) => {
    if (delayMs) {
      setTimeout(send, delayMs, { id: request.id, rows: value })
    }
    else {
      send({ id: request.id, rows: value })
    }
  }
  let onIdentity = (request: Request) => reply(request, rows)
  let input = ''
  collector.stdin.on('data', (chunk) => {
    input += chunk.toString()
    let boundary = input.indexOf('\n')
    while (boundary !== -1) {
      const request = { ...JSON.parse(input.slice(0, boundary)), at: Date.now() } as Request
      input = input.slice(boundary + 1)
      if (request.kind === 'prepare') {
        reply(request, {
          identities: [{ ...root, pid: collector.pid }],
          memory: { rssMb: 1, maxProcessRssMb: 1, processCount: 1, topProcesses: [{ pid: collector.pid, ppid: 1, rssMb: 1 }] },
        })
      }
      else {
        requests.push(request)
        onIdentity(request)
      }
      boundary = input.indexOf('\n')
    }
  })
  collector.stdin.on('finish', () => {
    record('collector-eof')
    send({ event: 'observer-stopped', pid: collector.pid })
    setTimeout(closeCollector, 50, 0, null)
  })
  const observe = async (signal: AbortSignal | undefined, read: () => Promise<ProcessIdentity[]>) => {
    const abort = () => record('request-abort')
    signal?.addEventListener('abort', abort, { once: true })
    try {
      return await read()
    }
    finally {
      signal?.removeEventListener('abort', abort)
      record('request-settled')
    }
  }
  let observer!: WorkflowProcessObserver
  const preparing = prepareWatchIdentitySource(async () => {
    observer = (await prepareWorkflowProcessObserver(undefined, {
      platform: 'win32',
      command: 'fixture',
      args: [],
      spawn: vi.fn(() => collector as unknown as ChildProcess) as unknown as typeof spawn,
    }))!
    const table = observer.table.bind(observer)
    const subset = observer.subset.bind(observer)
    const close = observer.close.bind(observer)
    vi.spyOn(observer, 'table').mockImplementation((budget, signal) => observe(signal, () => table(budget, signal)))
    vi.spyOn(observer, 'subset').mockImplementation((pids, budget, signal) => observe(signal, () => subset(pids, budget, signal)))
    vi.spyOn(observer, 'close').mockImplementation((options) => {
      record('observer-close')
      return close(options)
    })
    return observer
  })
  send({ event: 'observer-ready', pid: collector.pid })
  const source = (await preparing)!
  const child = Object.assign(new EventEmitter(), {
    pid: root.pid,
    exitCode: null as number | null,
    signalCode: null,
    kill: vi.fn(() => true),
  }) as unknown as ChildProcess
  const closeRoot = () => {
    if (rootClosed) {
      return
    }
    rootClosed = true
    child.exitCode = 0
    child.emit('close', 0, null)
    rows = rows.filter(row => row.pid !== root.pid).map(row => ({ ...row, parent: 1 }))
  }
  const kill = vi.spyOn(process, 'kill').mockImplementation((pid) => {
    rows = rows.filter(row => row.pid !== pid)
    if (pid === root.pid) {
      closeRoot()
    }
    return true
  })
  const controller = createWatchProcessController(child, { identitySource: source, phases: WEB_STOP_PHASES })
  await controller.capture()
  requests.length = 0
  events.length = 0
  return {
    child,
    collector,
    controller,
    source,
    observer,
    requests,
    events,
    kill,
    reply,
    closeRoot,
    getRows: () => rows,
    setRows: (value: ProcessIdentity[]) => { rows = value },
    onIdentity: (read: typeof onIdentity) => { onIdentity = read },
  }
}

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: platform })
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('热查询超过500ms仍在原1500+1500ms阶段内完成身份确认和真实宿主退出', async () => {
  const f = await fixture()
  f.onIdentity(request => f.reply(request, f.getRows(), request.pids ? 20 : 600))
  const started = Date.now()
  let completedAt = 0
  const stopping = f.controller.stop().then(() => {
    completedAt = Date.now()
  }, error => error)
  expect(f.controller.stop()).toBe(f.controller.stop())
  await vi.advanceTimersByTimeAsync(3000)
  expect(await stopping).toBeUndefined()
  expect(completedAt - started).toBe(1570)
  expect(f.kill.mock.calls).toEqual([[worker.pid, 'SIGTERM'], [root.pid, 'SIGTERM']])
  expect(f.requests.map(request => [request.at - started, request.pids])).toEqual([[0, undefined], [1500, [root.pid, worker.pid]]])
  expect(f.events.filter(event => event.kind === 'request-abort')).toEqual([])
  expect(f.collector.kill).not.toHaveBeenCalled()
  expect(f.observer.close).toHaveBeenCalledExactlyOnceWith({ deadline: started + 3000 })
  expect(vi.getTimerCount()).toBe(0)
})

it('t2截止先取消并排空待答请求，再关闭协议层，迟到及复用PID数据均不能放行', async () => {
  const f = await fixture()
  f.closeRoot()
  f.kill.mockReturnValue(true)
  let count = 0
  f.onIdentity((request) => {
    count += 1
    f.reply(request, count === 1
      ? f.getRows()
      : [
          { ...worker, parent: 1, started: '2026-10-29T00:00:10Z' },
          { ...worker, pid: 300 },
        ], count === 1 ? 20 : 501)
  })
  const started = Date.now()
  const stopping = f.controller.stop().catch(error => error)
  await vi.advanceTimersByTimeAsync(1999)
  expect(f.observer.close).not.toHaveBeenCalled()
  expect(f.collector.kill).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(f.events.find(event => event.kind === 'request-abort')?.at).toBe(started + 2000)
  expect(f.observer.close).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1000)
  const failure = await stopping
  expect(failure).toBeInstanceOf(Error)
  const collectErrors = (error: unknown): unknown[] => error instanceof AggregateError
    ? error.errors.flatMap(collectErrors)
    : [error]
  expect(collectErrors(failure).map(String).join('；')).not.toContain('关闭时仍有未落定请求')
  const order = f.events.filter(event => event.at >= started + 2000).map(event => event.kind)
  expect(order.indexOf('request-abort')).toBeLessThan(order.indexOf('collector-kill'))
  expect(order.indexOf('collector-close')).toBeLessThan(order.indexOf('request-settled'))
  expect(order.indexOf('request-settled')).toBeLessThan(order.indexOf('observer-close'))
  expect(f.kill.mock.calls).toEqual([[worker.pid, 'SIGTERM']])
  expect(f.requests).toHaveLength(2)
  expect(f.controller.snapshot().get(worker.pid)?.started).toBe(worker.started)
  expect(f.collector.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
  expect(f.observer.close).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})

it('收紧停止前在途查询后仍重读出生身份，旧快照不能终止复用PID或同父号外部进程', async () => {
  const f = await fixture()
  const oldRows = f.getRows().map(row => ({ ...row }))
  f.onIdentity(request => f.reply(request, oldRows, 600))
  const pending = f.controller.capture()
  await vi.advanceTimersByTimeAsync(0)
  f.closeRoot()
  f.setRows([{ ...worker, parent: 1, started: '2026-10-29T00:00:10Z' }, { ...worker, pid: 300 }])
  f.onIdentity(request => f.reply(request, f.getRows(), 20))
  const started = Date.now()
  let completedAt = 0
  const stopping = f.controller.stop().then(() => {
    completedAt = Date.now()
  }, error => error)
  await vi.advanceTimersByTimeAsync(3000)
  await pending
  expect(await stopping).toBeUndefined()
  expect(completedAt - started).toBe(670)
  expect(f.requests.map(request => [request.at - started, request.pids])).toEqual([[0, undefined], [600, [root.pid, worker.pid]]])
  expect(f.kill).not.toHaveBeenCalled()
  expect(f.controller.snapshot().size).toBe(0)
  expect(f.events.filter(event => event.kind === 'request-abort')).toEqual([])
  expect(f.collector.kill).not.toHaveBeenCalled()
  expect(f.observer.close).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})

it('beginStop收紧已经发出的旧查询，取消排空仍须传播失败且不能接受原4秒预算内的晚答', async () => {
  const f = await fixture()
  const oldRows = f.getRows().map(row => ({ ...row }))
  f.onIdentity(request => f.reply(request, oldRows, 2100))
  const pending = f.controller.capture().catch(error => error)
  await vi.advanceTimersByTimeAsync(0)
  const started = Date.now()
  const stopping = stopWithWatchIdentity(f.source, 3000, async () => {
    await new Promise(resolve => setTimeout(resolve, 2500))
  }).catch(error => error)
  await vi.advanceTimersByTimeAsync(1999)
  expect(f.events.filter(event => event.kind === 'request-abort')).toEqual([])
  expect(f.observer.close).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(f.events.find(event => event.kind === 'request-abort')?.at).toBe(started + 2000)
  await vi.advanceTimersByTimeAsync(1000)
  expect(await pending).toBeInstanceOf(Error)
  expect(await stopping).toBeInstanceOf(Error)
  expect(f.requests).toHaveLength(1)
  expect(f.kill).not.toHaveBeenCalled()
  expect(f.controller.snapshot().get(worker.pid)?.started).toBe(worker.started)
  expect(f.events.find(event => event.kind === 'collector-close')?.at).toBe(started + 2050)
  const order = f.events.filter(event => event.at >= started + 2000).map(event => event.kind)
  expect(order.indexOf('request-settled')).toBeLessThan(order.indexOf('observer-close'))
  expect(f.observer.close).toHaveBeenCalledExactlyOnceWith({ deadline: started + 3000 })
  expect(f.collector.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
  expect(vi.getTimerCount()).toBe(0)
})
