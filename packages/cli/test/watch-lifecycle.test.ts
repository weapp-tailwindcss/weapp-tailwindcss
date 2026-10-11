import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { watchBuildInputs } from '../src/build/watch'

const watcher = vi.hoisted(() => ({ subscribe: vi.fn() }))
vi.mock('@parcel/watcher', () => watcher)
let root: string
let notify: (file?: string) => void
let stop: () => void
let watching: Promise<void> | undefined
const unsubscribe = vi.fn(async () => {})

beforeEach(async () => {
  stop = () => {}
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-watch-'))
  vi.spyOn(process, 'removeListener')
  vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  const once = process.once.bind(process)
  vi.spyOn(process, 'once').mockImplementation((event, listener) => {
    if (event === 'SIGTERM' || event === 'SIGINT') {
      stop = listener as () => void
      return process
    }
    return once(event, listener)
  })
  watcher.subscribe.mockImplementation(async (_directory, callback) => {
    notify = (file = path.join(root, 'input.html')) => callback(null, [{ path: file, type: 'update' }])
    return { unsubscribe }
  })
})
afterEach(async () => {
  stop?.()
  await watching?.catch(() => {})
  watching = undefined
  vi.restoreAllMocks()
  vi.clearAllMocks()
  await fs.rm(root, { recursive: true, force: true })
})

it('原生监听在空闲后持续消费至少三轮修改', async () => {
  const rebuild = vi.fn(async () => new Set<string>())
  watching = watchBuildInputs({ cwd: root, mode: 'native', interval: 20, outputs: [], rebuild })
  await vi.waitFor(() => expect(rebuild).toHaveBeenCalledTimes(1))
  for (let round = 2; round <= 4; round++) {
    notify()
    await vi.waitFor(() => expect(rebuild).toHaveBeenCalledTimes(round))
  }
})

it('轮询忽略外置 map 自身写入', async () => {
  const input = path.join(root, 'input.css')
  const output = path.join(root, 'out.css')
  const map = path.join(root, 'out.css.map')
  await fs.writeFile(input, '.flex{}')
  const rebuild = vi.fn(async () => {
    await fs.writeFile(map, '{"version":3}')
    return new Set([input])
  })
  watching = watchBuildInputs({ cwd: root, mode: 'poll', interval: 20, outputs: [output, map], rebuild })
  await vi.waitFor(() => expect(rebuild).toHaveBeenCalledTimes(1))
  await fs.writeFile(input, '.grid{}')
  await vi.waitFor(() => expect(rebuild.mock.calls.length).toBeGreaterThanOrEqual(2))
  // 文件写入可能分多步被观察到；断言更新后恢复稳定，而非依赖系统事件次数。
  await new Promise(resolve => setTimeout(resolve, 100))
  const settled = rebuild.mock.calls.length
  await new Promise(resolve => setTimeout(resolve, 150))
  expect(rebuild).toHaveBeenCalledTimes(settled)
})

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

it('构建期间合并事件并串行执行后续构建', async () => {
  const gate = deferred()
  let active = 0
  let maximum = 0
  const rebuild = vi.fn(async () => {
    maximum = Math.max(maximum, ++active)
    if (rebuild.mock.calls.length === 2) {
      await gate.promise
    }
    active--
    return new Set<string>()
  })
  watching = watchBuildInputs({ cwd: root, mode: 'native', interval: 20, outputs: [], rebuild })
  try {
    await vi.waitFor(() => expect(rebuild).toHaveBeenCalledTimes(1))
    notify()
    await vi.waitFor(() => expect(rebuild).toHaveBeenCalledTimes(2))
    notify()
    notify()
    gate.resolve()
    await vi.waitFor(() => expect(rebuild).toHaveBeenCalledTimes(3))
    expect(maximum).toBe(1)
  }
  finally {
    gate.resolve()
  }
})

it('增量构建失败后继续等待修正，不切换后端', async () => {
  const rebuild = vi.fn(async () => new Set<string>())
  watching = watchBuildInputs({ cwd: root, mode: 'native', interval: 20, outputs: [], rebuild })
  await vi.waitFor(() => expect(rebuild).toHaveBeenCalledTimes(1))
  rebuild.mockRejectedValueOnce(new Error('invalid css'))
  notify()
  await vi.waitFor(() => expect(process.stderr.write).toHaveBeenCalledWith('invalid css\n'))
  notify()
  await vi.waitFor(() => expect(rebuild).toHaveBeenCalledTimes(3))
  expect(watcher.subscribe).toHaveBeenCalledTimes(1)
})

it.each(['native', 'poll'] as const)('停止 %s 时等待在途构建且不消费待办', async (mode) => {
  const gate = deferred()
  const rebuild = vi.fn(async () => { await gate.promise; return new Set<string>() })
  watching = watchBuildInputs({ cwd: root, mode, interval: 20, outputs: [], rebuild })
  let finished = false
  void watching.then(() => { finished = true })
  try {
    await vi.waitFor(() => expect(rebuild).toHaveBeenCalledTimes(1))
    stop()
    if (mode === 'native') notify()
    await Promise.resolve()
    expect(finished).toBe(false)
    gate.resolve()
    await watching
    expect(process.removeListener).toHaveBeenCalledWith('SIGINT', stop)
    expect(process.removeListener).toHaveBeenCalledWith('SIGTERM', stop)
    expect(rebuild).toHaveBeenCalledTimes(1)
    if (mode === 'native') expect(unsubscribe).toHaveBeenCalledTimes(1)
  }
  finally {
    gate.resolve()
  }
})

it('原生订阅部分失败先清理，再回退轮询', async () => {
  const external = path.join(path.dirname(root), 'outside.css')
  watcher.subscribe.mockRejectedValueOnce(new Error('backend unavailable'))
  const rebuild = vi.fn(async () => new Set([external]))
  watching = watchBuildInputs({ cwd: root, mode: 'native', interval: 20, outputs: [], rebuild })
  await vi.waitFor(() => expect(rebuild).toHaveBeenCalledTimes(1))
  expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining('falling back to polling'))
})

it('新增外部依赖订阅失败时释放已建立的订阅', async () => {
  const rebuild = vi.fn(async () => {
    if (rebuild.mock.calls.length === 2) expect(unsubscribe).toHaveBeenCalledTimes(1)
    return new Set([path.join(path.dirname(root), 'outside.css')])
  })
  watcher.subscribe.mockImplementationOnce(async () => ({ unsubscribe })).mockRejectedValueOnce(new Error('external unavailable'))
  watching = watchBuildInputs({ cwd: root, mode: 'native', interval: 20, outputs: [], rebuild })
  await vi.waitFor(() => expect(rebuild).toHaveBeenCalledTimes(2))
  expect(unsubscribe).toHaveBeenCalledTimes(1)
})

it('首次编译失败不误报 watcher 不可用，并释放订阅', async () => {
  const rebuild = vi.fn(async (): Promise<Set<string>> => { throw new Error('compile failure') })
  watching = watchBuildInputs({ cwd: root, mode: 'native', interval: 20, outputs: [], rebuild })
  await expect(watching).rejects.toThrow('compile failure')
  expect(unsubscribe).toHaveBeenCalledTimes(1)
  expect(process.stderr.write).not.toHaveBeenCalled()
})

it('原生后端忽略全部生成产物，但保留真实输入事件', async () => {
  const output = path.join(root, 'out.css')
  const map = path.join(root, 'out.css.map')
  const rebuild = vi.fn(async () => new Set<string>())
  watching = watchBuildInputs({ cwd: root, mode: 'native', interval: 20, outputs: [output, map], rebuild })
  await vi.waitFor(() => expect(rebuild).toHaveBeenCalledTimes(1))
  notify(output)
  notify(map)
  await new Promise(resolve => setTimeout(resolve, 30))
  expect(rebuild).toHaveBeenCalledTimes(1)
  notify()
  await vi.waitFor(() => expect(rebuild).toHaveBeenCalledTimes(2))
})

it('首次轮询构建期间新增的输入不能被补充基线吞掉', async () => {
  const rebuild = vi.fn(async () => {
    if (rebuild.mock.calls.length === 1) {
      await fs.writeFile(path.join(root, 'new.html'), '<div class="grid"></div>')
    }
    return new Set<string>()
  })
  watching = watchBuildInputs({ cwd: root, mode: 'poll', interval: 20, outputs: [], rebuild })
  await vi.waitFor(() => expect(rebuild).toHaveBeenCalledTimes(2))
})
