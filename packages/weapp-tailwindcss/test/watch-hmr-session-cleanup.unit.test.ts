import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { beforeEach, expect, it, vi } from 'vitest'
import { createWatchCommandSession } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/session'

const mocks = vi.hoisted(() => ({ source: vi.fn(), sampler: vi.fn(), controller: vi.fn() }))
vi.mock('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/memory/source', () => ({ spawnWithWatchMemorySource: () => mocks.source() }))
vi.mock('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/memory/sampler', () => ({ createMemorySampler: () => mocks.sampler() }))
vi.mock('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/process-controller', () => ({ createWatchProcessController: () => mocks.controller() }))
beforeEach(() => vi.resetAllMocks())
it.each([false, true])('keeps process and memory cleanup errors and shares the exact stop promise, initialization fails=%s', async (initializeFails) => {
  const primary = new Error('ownership initialization failed')
  const watchError = new Error('owned worker close not confirmed')
  const memoryError = new Error('memory source close not confirmed')
  const child = Object.assign(new EventEmitter(), { pid: 42, exitCode: null, signalCode: null, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() })
  const controller = { capture: vi.fn(async () => new Map()), ensureRunning: vi.fn(), stop: vi.fn(async () => {
    throw watchError
  }) }
  const sampler = { stop: vi.fn(async () => {
    throw memoryError
  }) }
  mocks.controller.mockReturnValue(controller)
  mocks.sampler.mockReturnValue(sampler)
  mocks.source.mockResolvedValue({ child, memorySource: {}, startedAt: Date.now() })
  if (initializeFails) {
    controller.capture.mockRejectedValue(primary)
  }
  const created = await createWatchCommandSession('unused', [], { quietSass: true }).catch(error => error)
  const stop = initializeFails ? Promise.reject(created).catch(error => error) : created.stop().catch((error: unknown) => error)
  if (!initializeFails) {
    const first = created.stop()
    expect(created.stop()).toBe(first)
    await first.catch(() => { })
    expect(created.stop()).toBe(first)
  }
  const error = await stop
  const cleanup = initializeFails ? error.errors[1] : error
  expect(cleanup.errors).toEqual([memoryError, watchError])
  expect(cleanup.message).toContain(memoryError.message)
  expect(cleanup.message).toContain(watchError.message)
  if (initializeFails) {
    expect(error.errors[0]).toBe(primary)
  }
  expect(controller.stop).toHaveBeenCalledOnce()
  expect(sampler.stop).toHaveBeenCalledOnce()
  expect(child.stdin.destroyed).toBe(true)
  expect(child.stdout.destroyed).toBe(true)
  expect(child.stderr.destroyed).toBe(true)
})

it('queues a fresh ownership checkpoint when compile success arrives during the initial capture', async () => {
  let resolve!: () => void
  const initial = new Promise<Map<number, unknown>>((yes) => {
    resolve = () => yes(new Map())
  })
  const child = Object.assign(new EventEmitter(), {
    pid: 42,
    exitCode: null,
    signalCode: null,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  })
  const controller = {
    capture: vi.fn(async () => new Map()).mockReturnValueOnce(initial),
    ensureRunning: vi.fn(),
    stop: vi.fn(async () => {}),
  }
  mocks.controller.mockReturnValue(controller)
  mocks.sampler.mockReturnValue({ stop: vi.fn(async () => {}) })
  mocks.source.mockResolvedValue({ child, memorySource: {}, startedAt: Date.now() })
  const creating = createWatchCommandSession('unused', [], { quietSass: true })
  await Promise.resolve()
  child.stdout.emit('data', 'compiled successfully\n')
  expect(controller.capture).toHaveBeenCalledOnce()
  resolve()
  const session = await creating
  await Promise.resolve()
  expect(controller.capture).toHaveBeenCalledTimes(2)
  await session.stop()
})
