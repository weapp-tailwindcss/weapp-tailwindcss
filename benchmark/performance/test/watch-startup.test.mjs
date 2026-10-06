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
  expect((await result).message).toContain('cancelled at startup after build 0')
  expect(mocks.load).not.toHaveBeenCalled()
  expect(mocks.remove).toHaveBeenCalledOnce()
})
