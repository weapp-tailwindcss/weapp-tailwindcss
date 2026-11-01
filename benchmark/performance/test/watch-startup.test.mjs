import process from 'node:process'
import { beforeEach, expect, it, vi } from 'vitest'
import { measureWatchLifecycle } from '../src/watch-lifecycle.mjs'

const mocks = vi.hoisted(() => ({ load: vi.fn(), write: vi.fn(), remove: vi.fn() }))
vi.mock('node:module', () => ({ createRequire: () => mocks.load }))
vi.mock('node:fs/promises', () => ({
  default: {
    mkdtemp: async prefix => `${prefix}synthetic`,
    realpath: async file => file,
    symlink: async () => {},
    writeFile: mocks.write,
    rm: mocks.remove,
  },
}))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.write.mockResolvedValue(undefined)
  mocks.load.mockImplementation(() => {
    throw new Error('不应启动真实 compiler')
  })
})

it.each(['webpack', 'vite'])('%s 初始化期间取消后不启动编译器', async (kind) => {
  const controller = new AbortController()
  let finishWrite
  let startedWrite
  const started = new Promise((resolve) => {
    startedWrite = resolve
  })
  mocks.write.mockImplementationOnce(() => {
    startedWrite()
    return new Promise((resolve) => {
      finishWrite = resolve
    })
  })
  const pending = measureWatchLifecycle({ sourceRoot: process.cwd(), kind, size: 3, warmups: 0, runs: 3, signal: controller.signal })
  const result = pending.catch(error => error)
  await started
  controller.abort(new Error('初始化已超时'))
  finishWrite()
  const error = await result
  expect(error.message).toContain('cancelled at startup after build 0')
  expect(error.watchEvents.some(event => event.event === 'remove-complete')).toBe(false)
  expect(error.watchReceipt.events.map(event => event.event)).toEqual(expect.arrayContaining(['close-start', 'close-complete', 'remove-start', 'remove-complete', 'operation-failed']))
  expect(error.watchReceipt.events.at(-1).event).toBe('operation-failed')
  expect(error.watchReceipt.events.filter(event => event.event === 'close-complete').map(event => event.resource)).toEqual(['unacquired'])
  expect(mocks.load).not.toHaveBeenCalled()
  expect(mocks.remove).toHaveBeenCalledOnce()
})

it('Webpack watcher 关闭失败仍关闭 compiler，并保留跳过删除的阶段记录', async () => {
  const primary = new Error('compile failed')
  const closeError = new Error('watcher close failed')
  const watcherClose = vi.fn(callback => callback(closeError))
  const compilerClose = vi.fn(callback => callback())
  const compiler = {
    hooks: { invalid: { tap: vi.fn() }, watchRun: { tap: vi.fn() }, afterDone: { tap: vi.fn() } },
    watchFileSystem: { watch: vi.fn() },
    watch: (_options, callback) => {
      callback(primary)
      return { close: watcherClose }
    },
    close: compilerClose,
  }
  mocks.load.mockImplementation(id => id === 'webpack' ? () => compiler : { WeappTailwindcss: class {} })
  const error = await measureWatchLifecycle({ sourceRoot: process.cwd(), kind: 'webpack', size: 3, warmups: 0, runs: 3 }).catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.errors[0].cause).toBe(primary)
  expect(error.errors[1].cause).toBe(closeError)
  expect(watcherClose).toHaveBeenCalledOnce()
  expect(compilerClose).toHaveBeenCalledOnce()
  expect(mocks.remove).not.toHaveBeenCalled()
  expect(error.watchReceipt.events.filter(event => event.event === 'close-start').map(event => event.resource)).toEqual(['webpack-resources', 'webpack-watcher', 'webpack-compiler'])
  expect(error.watchReceipt.events).toEqual(expect.arrayContaining([
    expect.objectContaining({ event: 'close-failed', resource: 'webpack-watcher' }),
    expect.objectContaining({ event: 'close-complete', resource: 'webpack-compiler' }),
  ]))
  expect(error.watchReceipt.events.some(event => event.event === 'remove-start')).toBe(false)
})

it('删除失败保留首错、删除原因及终态阶段', async () => {
  const removal = new Error('remove failed')
  mocks.remove.mockRejectedValueOnce(removal)
  const error = await measureWatchLifecycle({ sourceRoot: process.cwd(), kind: 'webpack', size: 3, warmups: 0, runs: 3 }).catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.errors[0].cause.message).toBe('不应启动真实 compiler')
  expect(error.errors[1].cause).toBe(removal)
  expect(error.watchReceipt.events.map(event => event.event)).toEqual(expect.arrayContaining(['remove-start', 'remove-failed', 'cleanup-failed', 'operation-failed']))
  expect(error.watchReceipt.events.some(event => event.event === 'remove-complete')).toBe(false)
  expect(error.message).toContain('remove-failed')
  expect(mocks.remove).toHaveBeenCalledOnce()
})
