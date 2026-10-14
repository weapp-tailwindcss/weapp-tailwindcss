import type { SpawnedHBuilderXCommand } from '../../../packages/hbuilderx-runner/src/types'
import { EventEmitter } from 'node:events'
import { rm } from 'node:fs/promises'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import * as processTools from '../../../packages/hbuilderx-runner/src/process'
import { verifyWorkerRoutes } from './assertions'
import { runLocalCommand } from './command'
import { withLocalWorker } from './server'
import { fixtureHtml, workerFixture } from './test-support'

const roots: string[] = []
async function fixture(mode?: string) {
  const result = await workerFixture(mode)
  roots.push(result.root)
  return result
}
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

it('本轮 HTML 与路由通过后等待合成服务器退出，释放自己的端口', async () => {
  const item = await fixture()
  let url: URL | undefined
  await withLocalWorker(async (context) => {
    url = context.baseUrl
    await verifyWorkerRoutes(context)
  }, item.options)
  const pid = await item.workerPid()
  expect(() => process.kill(pid, 0)).toThrow()
  await expect(fetch(url!, { signal: AbortSignal.timeout(500) })).rejects.toThrow()
})

it.each(['stale', 'wrong-url', 'silent'])('拒绝 %s 实例且不启动后续动作', async (mode) => {
  const item = await fixture(mode)
  const action = vi.fn()
  await expect(withLocalWorker(action, { ...item.options, readyTimeoutMs: 500 })).rejects.toThrow(mode === 'stale' ? '根 HTML' : mode === 'wrong-url' ? '启动 URL' : '未就绪')
  expect(action).not.toHaveBeenCalled()
  const pid = await item.workerPid()
  expect(() => process.kill(pid, 0)).toThrow()
})

it('服务启动前以零状态退出也失败，不能当作就绪', async () => {
  const item = await fixture('exit-zero')
  const action = vi.fn()
  await expect(withLocalWorker(action, item.options)).rejects.toThrow('Worker 提前退出：exit=0')
  expect(action).not.toHaveBeenCalled()
  const pid = await item.workerPid()
  expect(() => process.kill(pid, 0)).toThrow()
})

it.each(['/hang-head', '/hang-body'])('请求 %s 的响应头或响应体挂起仍受同一预算限制', async (route) => {
  const item = await fixture()
  await expect(withLocalWorker(context => context.request(route), item.options)).rejects.toThrow('预算=80ms')
  const pid = await item.workerPid()
  expect(() => process.kill(pid, 0)).toThrow()
})

it('服务运行中零退出会取消并等待合成浏览器命令关闭', async () => {
  const item = await fixture()
  await expect(withLocalWorker(async (context) => {
    const browser = runLocalCommand(item.browserCommand, context.signal)
    await vi.waitFor(() => item.browserPid())
    await context.request('/exit')
    await browser
  }, item.options)).rejects.toThrow('Worker 提前退出：exit=0')
  const browserPid = await item.browserPid()
  expect(() => process.kill(browserPid, 0)).toThrow()
})

it.each(['SIGINT', 'SIGTERM'] as const)('%s 中断后等待两个进程退出并移除本轮监听器', async (signal) => {
  const item = await fixture()
  const listeners = process.listeners(signal)
  await expect(withLocalWorker(async (context) => {
    const browser = runLocalCommand(item.browserCommand, context.signal)
    await vi.waitFor(() => item.browserPid())
    const handler = process.listeners(signal).find(listener => !listeners.includes(listener))!
    handler(signal)
    await browser
  }, item.options)).rejects.toThrow(signal)
  expect(process.listeners(signal)).toEqual(listeners)
  const browserPid = await item.browserPid()
  const workerPid = await item.workerPid()
  expect(() => process.kill(browserPid, 0)).toThrow()
  expect(() => process.kill(workerPid, 0)).toThrow()
})

it('业务失败与服务收尾失败同时保留，不把服务失败改成通过', async () => {
  const item = await fixture()
  const primary = new Error('browser test failed')
  const cleanup = new Error('worker close unconfirmed')
  vi.stubGlobal('fetch', vi.fn(async () => new Response(fixtureHtml)))
  const stop = vi.fn().mockRejectedValue(cleanup)
  vi.spyOn(processTools, 'spawnCommand').mockImplementationOnce(options => ({
    child: Object.assign(new EventEmitter(), { pid: 424242 }),
    logs: [`Ready on http://127.0.0.1:${options.args[1]}`],
    closed: new Promise(() => {}),
    stop,
    ...options,
  }) as unknown as SpawnedHBuilderXCommand)
  const error = await withLocalWorker(() => Promise.reject(primary), item.options).catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.errors).toEqual([primary, cleanup])
  expect(stop).toHaveBeenCalledOnce()
})

it('服务 exit 早于 close 时立即取消浏览器，并等待浏览器与服务收尾', async () => {
  const item = await fixture()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(fixtureHtml)))
  const child = Object.assign(new EventEmitter(), { pid: 424242 })
  let closeWorker!: (exit: { code: number, signal: null }) => void
  const workerClosed = new Promise<{ code: number, signal: null }>((resolve) => {
    closeWorker = resolve
  })
  const workerStop = vi.fn(async () => closeWorker({ code: 0, signal: null }))
  let closeBrowser!: (exit: { code: null, signal: 'SIGTERM' }) => void
  const browserClosed = new Promise<{ code: null, signal: 'SIGTERM' }>((resolve) => {
    closeBrowser = resolve
  })
  const browserStop = vi.fn(async () => closeBrowser({ code: null, signal: 'SIGTERM' }))
  vi.spyOn(processTools, 'spawnCommand')
    .mockImplementationOnce(options => ({ ...options, child, logs: [`Ready on http://127.0.0.1:${options.args[1]}`], closed: workerClosed, stop: workerStop }) as unknown as SpawnedHBuilderXCommand)
    .mockReturnValueOnce({ child: new EventEmitter(), logs: [], closed: browserClosed, stop: browserStop } as unknown as SpawnedHBuilderXCommand)
  await expect(withLocalWorker(async (context) => {
    queueMicrotask(() => child.emit('exit', 0, null))
    await runLocalCommand(item.browserCommand, context.signal)
  }, item.options)).rejects.toThrow('Worker 提前退出：exit=0')
  expect(browserStop).toHaveBeenCalledOnce()
  expect(workerStop).toHaveBeenCalledOnce()
  expect(browserStop.mock.invocationCallOrder[0]).toBeLessThan(workerStop.mock.invocationCallOrder[0])
})

it('缺少构建时不启动服务，且撤销本轮信号监听器', async () => {
  const item = await fixture()
  await rm(item.root, { recursive: true, force: true })
  const listeners = [process.listeners('SIGINT'), process.listeners('SIGTERM')]
  const createCommand = vi.fn()
  await expect(withLocalWorker(vi.fn(), { ...item.options, createCommand })).rejects.toThrow('ENOENT')
  expect(createCommand).not.toHaveBeenCalled()
  expect([process.listeners('SIGINT'), process.listeners('SIGTERM')]).toEqual(listeners)
})

it.each([false, true])('收尾期间取消不会报告成功，也保留同时发生的清理失败 (%s)', async (failCleanup) => {
  const item = await fixture()
  const controller = new AbortController()
  const reason = new Error('cancelled during cleanup')
  const cleanup = new Error('worker stop failed')
  vi.stubGlobal('fetch', vi.fn(async () => new Response(fixtureHtml)))
  vi.spyOn(processTools, 'spawnCommand').mockImplementationOnce(options => ({
    ...options,
    child: Object.assign(new EventEmitter(), { pid: 424242 }),
    logs: [`Ready on http://127.0.0.1:${options.args[1]}`],
    closed: new Promise(() => {}),
    stop: vi.fn(async () => {
      controller.abort(reason)
      if (failCleanup) {
        throw cleanup
      }
    }),
  }) as unknown as SpawnedHBuilderXCommand)
  const error = await withLocalWorker(async () => 'done', { ...item.options, signal: controller.signal }).catch(error => error)
  if (failCleanup) {
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.errors).toEqual([reason, cleanup])
  }
  else {
    expect(error).toBe(reason)
  }
})
