import { afterEach, expect, it, vi } from 'vitest'
import { prepareWorkflowProcessObserver } from '../scripts/demo-e2e-workflow/process-observer'
import { createProcessObserverTransport } from '../scripts/demo-e2e-workflow/process-observer/transport'
import { prepareWatchMemorySource, spawnWithWatchMemorySource } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/memory/source'
import { createColdObserverProvider } from './helpers/observer-cold-provider'

const fixtures: ReturnType<typeof coldProvider>[] = []

function coldProvider(...args: Parameters<typeof createColdObserverProvider>) {
  const fixture = createColdObserverProvider(...args)
  fixtures.push(fixture)
  return fixture
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    fixture.child.stdin.destroy()
    fixture.child.stdout.destroy()
    fixture.child.stderr.destroy()
  }
  vi.clearAllTimers()
  vi.useRealTimers()
})

it('Watch 的 12 秒宿主启动与 7 秒真实预热分开计时，预热完成前不启动业务', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const fixture = coldProvider()
  const spawnChild = vi.fn(() => ({ pid: 100 }))
  const running = spawnWithWatchMemorySource('repo', spawnChild, () => prepareWatchMemorySource('repo', {
    platform: 'win32',
    command: 'fixture',
    args: [],
    spawn: fixture.createChild,
  })).catch(error => error)
  await vi.advanceTimersByTimeAsync(18_999)
  expect(spawnChild).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  const session = await running
  expect(session).not.toBeInstanceOf(Error)
  expect(session.startedAt).toBe(19_000)
  expect(fixture.requests.map(request => request.sentAt)).toEqual([12_000])
  expect(fixture.createChild).toHaveBeenCalledOnce()
  await session.memorySource.close()
  expect(fixture.child.kill).not.toHaveBeenCalled()
})

it('Workflow 的同一宿主握手后只读一次真实本体快照，同时预热身份和内存', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const fixture = coldProvider()
  const preparing = prepareWorkflowProcessObserver(undefined, {
    platform: 'win32',
    command: 'fixture',
    args: [],
    spawn: fixture.createChild,
  }).catch(error => error)
  await vi.advanceTimersByTimeAsync(19_000)
  const observer = await preparing
  expect(observer).not.toBeInstanceOf(Error)
  expect(fixture.requests.map(request => [request.kind, request.sentAt])).toEqual([['prepare', 12_000]])
  expect(fixture.createChild).toHaveBeenCalledOnce()
  await observer.close()
})

it('冷模块 5169ms 与首次 CIM 8100ms 只消耗一次准备查询，完成前不放行业务', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const fixture = coldProvider(5761, 5169, 8100)
  let finished = false
  const preparing = prepareWorkflowProcessObserver(undefined, {
    platform: 'win32', command: 'fixture', args: [], spawn: fixture.createChild,
  }).then((observer) => {
    finished = true
    return observer!
  })
  await vi.advanceTimersByTimeAsync(19_029)
  expect(finished).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  const observer = await preparing
  expect(finished).toBe(true)
  expect(fixture.requests.map(request => [request.kind, request.sentAt])).toEqual([['prepare', 5761]])
  expect(fixture.child.kill).not.toHaveBeenCalled()
  await observer.close()
})

it('宿主启动超时前不发查询或启动业务，失败仅回收本轮持有的采集器', async () => {
  vi.useFakeTimers()
  const fixture = coldProvider(20_000)
  const spawnChild = vi.fn()
  const running = spawnWithWatchMemorySource('repo', spawnChild, () => prepareWatchMemorySource('repo', {
    platform: 'win32',
    command: 'fixture',
    args: [],
    spawn: fixture.createChild,
  })).catch(error => error)
  await vi.advanceTimersByTimeAsync(15_000)
  expect(await running).toBeInstanceOf(Error)
  expect(fixture.requests).toEqual([])
  expect(spawnChild).not.toHaveBeenCalled()
  expect(fixture.child.kill).toHaveBeenCalledExactlyOnceWith('SIGKILL')
  expect(vi.getTimerCount()).toBe(0)
})

it('单次准备仍受 ready 接收后 15 秒的截止约束，不能按宿主上限续借', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const fixture = coldProvider(10_000, 5000, 10_000)
  const preparing = prepareWorkflowProcessObserver(undefined, {
    platform: 'win32',
    command: 'fixture',
    args: [],
    spawn: fixture.createChild,
  }).catch(error => error)
  await vi.advanceTimersByTimeAsync(24_999)
  expect(fixture.child.kill).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  const error = await preparing
  expect(String(error.cause)).toContain('timeoutMs=15000')
  expect(fixture.requests.map(request => [request.kind, request.sentAt])).toEqual([['prepare', 10_000]])
  expect(fixture.createChild).toHaveBeenCalledOnce()
  expect(fixture.child.kill).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['watch', 'workflow'])('ready 已到达但 Promise 续体越过预热截止时不发查询：%s', async (mode) => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const fixture = coldProvider(100_000)
  const options = { platform: 'win32' as const, command: 'fixture', args: [], spawn: fixture.createChild }
  const preparing = (mode === 'watch' ? prepareWatchMemorySource('repo', options) : prepareWorkflowProcessObserver(undefined, options)).catch(error => error)
  fixture.send({ event: 'observer-ready', pid: fixture.child.pid })
  vi.setSystemTime(30_000)
  expect(await preparing).toBeInstanceOf(Error)
  expect(fixture.requests).toEqual([])
  expect(fixture.child.kill).toHaveBeenCalledOnce()
})

it('定时器尚未执行也拒绝在宿主截止时刻到达的 ready', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const fixture = coldProvider(100_000)
  const transport = createProcessObserverTransport('fixture', [], fixture.createChild)
  const reading = transport.waitUntilReady(15_000).catch(error => error)
  vi.setSystemTime(15_000)
  fixture.send({ event: 'observer-ready', pid: fixture.child.pid })
  const error = await reading
  expect(String(error)).toContain('宿主握手超过本轮绝对截止')
  expect(transport.diagnostics().readyAtMs).toBeNull()
  await expect(transport.close()).rejects.toBe(error)
})

it.each(['wrong-pid', 'wrong-version', 'duplicate', 'corrupt-tail'])('宿主握手坏身份或坏尾行阻断预热：%s', async (mode) => {
  vi.useFakeTimers()
  const fixture = coldProvider(100_000)
  const preparing = prepareWorkflowProcessObserver(undefined, {
    platform: 'win32',
    command: 'fixture',
    args: [],
    spawn: fixture.createChild,
  }).catch(error => error)
  const ready = { event: 'observer-ready', pid: fixture.child.pid }
  if (mode === 'wrong-pid') {
    fixture.send({ ...ready, pid: 1 })
  }
  else if (mode === 'wrong-version') {
    fixture.send({ ...ready, version: 'invalid' })
  }
  else {
    fixture.child.stdout.write(`${JSON.stringify(ready)}\n${mode === 'duplicate' ? JSON.stringify(ready) : 'invalid-json'}\n`)
  }
  expect(await preparing).toBeInstanceOf(Error)
  expect(fixture.requests).toEqual([])
  expect(fixture.child.kill).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['abort', 'error', 'end', 'close', 'close-call'])('等待宿主握手时的 %s 使会话失效并确认退出', async (mode) => {
  vi.useFakeTimers()
  const fixture = coldProvider(100_000)
  const transport = createProcessObserverTransport('fixture', [], fixture.createChild)
  const controller = new AbortController()
  const reading = transport.waitUntilReady(15_000, controller.signal).catch(error => error)
  const reason = new Error('启动中止')
  let closing: Promise<unknown> | undefined
  if (mode === 'abort') {
    controller.abort(reason)
  }
  else if (mode === 'error') {
    fixture.child.emit('error', reason)
  }
  else if (mode === 'end') {
    fixture.child.stdout.end()
  }
  else if (mode === 'close') {
    fixture.child.emit('close', 0, null)
  }
  else {
    closing = transport.close().catch(error => error)
  }
  const error = await reading
  expect(error).toBeInstanceOf(Error)
  expect(fixture.requests).toEqual([])
  expect(fixture.child.kill).toHaveBeenCalledTimes(mode === 'close' ? 0 : 1)
  if (closing) {
    expect(await closing).toBe(error)
  }
  await expect(transport.close()).rejects.toBe(error)
  expect(vi.getTimerCount()).toBe(0)
})

it.each([
  ['watch', 'deadline'],
  ['workflow', 'deadline'],
  ['watch', 'exit'],
  ['workflow', 'exit'],
])('最后查询通过后、外层续体前发生 %s/%s 仍阻断业务准备', async (mode, failure) => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const fixture = coldProvider()
  const options = { platform: 'win32' as const, command: 'fixture', args: [], spawn: fixture.createChild }
  const spawnChild = vi.fn()
  const preparing = (mode === 'watch'
    ? spawnWithWatchMemorySource('repo', spawnChild, () => prepareWatchMemorySource('repo', options))
    : prepareWorkflowProcessObserver(undefined, options)).catch(error => error)
  fixture.child.stdout.on('data', (data) => {
    const message = JSON.parse(String(data))
    if (message.rows && !Array.isArray(message.rows)) {
      queueMicrotask(() => {
        if (failure === 'deadline') {
          vi.setSystemTime(27_000)
        }
        else {
          fixture.child.emit('close', 1, null)
        }
      })
    }
  })
  await vi.advanceTimersByTimeAsync(23_000)
  const error = await preparing
  expect(error).toBeInstanceOf(Error)
  const cause = mode === 'watch' ? error.cause.cause : error.cause
  expect(String(cause)).toContain(failure === 'deadline' ? '预热超过本轮绝对截止' : '意外退出')
  expect(spawnChild).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})
