import type { ChildProcess } from 'node:child_process'
import type { SpawnedHBuilderXCommand } from '../packages/hbuilderx-runner/src/types'
import { EventEmitter } from 'node:events'
import { beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ command: undefined as SpawnedHBuilderXCommand | undefined, spawn: vi.fn() }))
vi.mock('./hbuilderx-local/process', () => ({
  spawnPnpm: (...args: unknown[]) => {
    state.spawn(...args)
    return state.command!
  },
}))

let servers: typeof import('./hbuilderx-local/web/dev-server')
beforeEach(async () => {
  vi.resetModules()
  state.spawn.mockClear()
  const child = Object.assign(new EventEmitter(), { pid: 12345, exitCode: null, signalCode: null }) as ChildProcess
  state.command = {
    child,
    logs: ['owned log'],
    command: 'pnpm',
    args: [],
    cwd: '.',
    closed: new Promise(() => {}),
    ensureRunning() {},
    stop: vi.fn(async () => {}),
  }
  servers = await import('./hbuilderx-local/web/dev-server')
})

it('会话和兜底共享挂起的严格 stop，成功后才允许下一个服务', async () => {
  let release!: () => void
  vi.mocked(state.command!.stop).mockReturnValue(new Promise<void>((resolve) => {
    release = resolve
  }))
  const server = servers.createDevServer('.', 1234)
  const stop = server.stop()
  expect(server.stop()).toBe(stop)
  const fallback = servers.stopDevServer()
  expect(() => servers.createDevServer('.', 1235)).toThrow('尚未确认停止')
  expect(state.spawn).toHaveBeenCalledTimes(1)
  expect(state.command!.stop).toHaveBeenCalledTimes(1)
  release()
  await Promise.all([stop, fallback])
  vi.mocked(state.command!.stop).mockResolvedValue()
  await servers.createDevServer('.', 1235).stop()
  expect(state.spawn).toHaveBeenCalledTimes(2)
})

it('异步终止失败保留原错误和资源句柄，兜底不得重发信号或覆盖', async () => {
  const failure = new Error('owned signal failed')
  vi.mocked(state.command!.stop).mockRejectedValue(failure)
  const server = servers.createDevServer('.', 1234)
  await expect(server.stop()).rejects.toBe(failure)
  await expect(servers.stopDevServer()).rejects.toBe(failure)
  expect(state.command!.stop).toHaveBeenCalledTimes(1)
  expect(() => servers.createDevServer('.', 1235)).toThrow('尚未确认停止')
  expect(state.spawn).toHaveBeenCalledTimes(1)
})

it('同步终止异常也锁存到同一次收尾结果', async () => {
  const failure = new Error('kill threw synchronously')
  vi.mocked(state.command!.stop).mockImplementation(() => {
    throw failure
  })
  const server = servers.createDevServer('.', 1234)
  await expect(server.stop()).rejects.toBe(failure)
  await expect(servers.stopDevServer()).rejects.toBe(failure)
  expect(state.command!.stop).toHaveBeenCalledTimes(1)
})

it('完整受管句柄继续传递调用方明确指定的停止信号', async () => {
  const server = servers.createDevServer('.', 1234)
  await server.stop('SIGINT')
  expect(state.command!.stop).toHaveBeenCalledExactlyOnceWith('SIGINT')
})

it.each([0, 1])('CLI 提前退出code=%s和独立收尾失败均保留，不能把 exit0当正常停止', async (exitCode) => {
  Object.assign(state.command!.child, { exitCode })
  const cleanup = new Error('independent cleanup failure')
  vi.mocked(state.command!.stop).mockRejectedValue(cleanup)
  const server = servers.createDevServer('.', 1234)
  const error = await server.stop().catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.cause.message).toContain('Web 服务在停止前已退出')
  expect(error.cause.message).toContain('owned log')
  expect(error.errors).toEqual([error.cause, cleanup])
  await expect(servers.stopDevServer()).rejects.toBe(error)
  expect(state.command!.stop).toHaveBeenCalledTimes(1)
})
