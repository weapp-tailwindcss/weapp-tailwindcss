import type { FSWatcher, WatchListener } from 'node:fs'
import type { TestContext } from 'vitest'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { watchInput } from '../src/metro/watch'

function fixture({ onTestFinished }: TestContext, directory = false, prepare?: (input: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-watch-reconcile-'))
  const input = path.join(root, 'style.css')
  if (directory) {
    fs.mkdirSync(input)
  }
  else {
    fs.writeFileSync(input, 'initial')
  }
  prepare?.(input)
  vi.useFakeTimers()
  const intervals = vi.spyOn(globalThis, 'setInterval')
  const native = new EventEmitter() as FSWatcher
  const close = vi.fn(() => {
    native.emit('close')
  })
  native.close = close
  native.ref = vi.fn(() => native)
  native.unref = vi.fn(() => native)
  const watch = vi.spyOn(fs, 'watch').mockImplementation(((_root: string, _options: unknown, listener: WatchListener<string>) => {
    native.on('change', listener)
    return native
  }) as typeof fs.watch)
  const notify = vi.fn()
  const watcher = watchInput(input, notify)
  onTestFinished(() => {
    watcher.close()
    const remainingTimers = vi.getTimerCount()
    vi.restoreAllMocks()
    vi.useRealTimers()
    fs.rmSync(root, { recursive: true, force: true })
    expect(remainingTimers).toBe(0)
  })
  return { root, input, notify, watcher, native, close, watch, intervals }
}

it('原生通知缺失时仍发现返回后立即发生的连续原子保存', (context) => {
  const { root, input, notify } = fixture(context)
  notify.mockImplementation(() => fs.readFileSync(input, 'utf8'))
  for (const content of ['first', 'second']) {
    const temporary = path.join(root, 'save.tmp')
    fs.writeFileSync(temporary, content)
    fs.renameSync(temporary, input)
    vi.advanceTimersToNextTimer()
    expect(notify).toHaveLastReturnedWith(content)
  }
  expect(notify).toHaveBeenCalledTimes(2)
})

it('同大小同 mtime 的原子替换仍由文件身份识别', (context) => {
  const timestamp = new Date('2026-01-01T00:00:00Z')
  const { root, input, notify } = fixture(context, false, input => fs.utimesSync(input, timestamp, timestamp))
  const initial = fs.statSync(input, { bigint: true })
  const temporary = path.join(root, 'save.tmp')
  fs.writeFileSync(temporary, 'updated')
  fs.utimesSync(temporary, timestamp, timestamp)
  fs.renameSync(temporary, input)
  const current = fs.statSync(input, { bigint: true })
  expect(current.size).toBe(initial.size)
  expect(current.mtimeNs).toBe(initial.mtimeNs)
  expect(current.ino).not.toBe(initial.ino)
  vi.advanceTimersToNextTimer()
  expect(notify).toHaveBeenCalledOnce()
})

it('相邻文件事件不能吞掉目标文件缺失的通知', (context) => {
  const { input, native, notify } = fixture(context)
  fs.writeFileSync(input, 'updated input')
  native.emit('change', 'rename', 'neighbor.css')
  expect(notify).not.toHaveBeenCalled()
  vi.advanceTimersToNextTimer()
  expect(notify).toHaveBeenCalledOnce()
})

it('原生通知更新当前版本，之后的核对不重复通知', (context) => {
  const { input, native, notify } = fixture(context)
  fs.writeFileSync(input, 'updated input')
  native.emit('change', 'rename', path.basename(input))
  expect(notify).toHaveBeenCalledOnce()
  vi.advanceTimersToNextTimer()
  expect(notify).toHaveBeenCalledOnce()
  native.emit('change', 'change', null)
  expect(notify).toHaveBeenCalledTimes(2)
  vi.advanceTimersToNextTimer()
  expect(notify).toHaveBeenCalledTimes(2)
})

it('删除和重建均可被发现，缺失期间不重复通知', (context) => {
  const { input, notify } = fixture(context)
  fs.rmSync(input)
  vi.advanceTimersToNextTimer()
  expect(notify).toHaveBeenCalledOnce()
  vi.advanceTimersToNextTimer()
  expect(notify).toHaveBeenCalledOnce()
  fs.writeFileSync(input, 'recreated')
  vi.advanceTimersToNextTimer()
  expect(notify).toHaveBeenCalledTimes(2)
})

it('短暂缺失后在两次采样之间重建仍能识别新文件', (context) => {
  const { input, notify } = fixture(context)
  fs.rmSync(input)
  fs.writeFileSync(input, 'recreated')
  vi.advanceTimersToNextTimer()
  expect(notify).toHaveBeenCalledOnce()
})

it('未变化的文件以及仅读取导致的 atime 变化不触发刷新', (context) => {
  const { input, notify } = fixture(context)
  const current = fs.statSync(input, { bigint: true })
  vi.spyOn(fs, 'statSync').mockReturnValue({ ...current, atimeNs: current.atimeNs + 1_000_000n } as typeof current)
  vi.advanceTimersToNextTimer()
  vi.advanceTimersToNextTimer()
  expect(notify).not.toHaveBeenCalled()
})

it('文件系统不提供不同 inode 时，ctime 变化仍能识别同大小同 mtime 的保存', (context) => {
  let initial!: fs.BigIntStats
  const { notify } = fixture(context, false, (input) => {
    initial = fs.statSync(input, { bigint: true })
    initial.ino = 0n
    vi.spyOn(fs, 'statSync').mockReturnValue(initial)
  })
  vi.mocked(fs.statSync).mockReturnValue({ ...initial, ctimeNs: initial.ctimeNs + 1n } as typeof initial)
  vi.advanceTimersToNextTimer()
  expect(notify).toHaveBeenCalledOnce()
})

it('保留原生 watcher 身份和事件，关闭同步释放计时器并禁止迟到通知', (context) => {
  const { input, native, watcher, close, notify, intervals } = fixture(context)
  const closed = vi.fn()
  watcher.on('close', closed)
  expect(watcher).toBe(native)
  expect(watcher.ref()).toBe(native)
  expect(watcher.unref()).toBe(native)
  expect(vi.getTimerCount()).toBe(1)
  expect(intervals.mock.results[0]!.value.hasRef()).toBe(false)
  fs.writeFileSync(input, 'pending input')
  watcher.close()
  expect(vi.getTimerCount()).toBe(0)
  native.emit('change', 'change', path.basename(input))
  vi.advanceTimersByTime(1000)
  watcher.close()
  expect(notify).not.toHaveBeenCalled()
  expect(close).toHaveBeenCalledOnce()
  expect(closed).toHaveBeenCalledOnce()
})

it('原生自主关闭也清理核对计时器', (context) => {
  const { input, native, notify } = fixture(context)
  native.emit('close')
  expect(vi.getTimerCount()).toBe(0)
  fs.writeFileSync(input, 'pending input')
  native.emit('change', 'change', null)
  vi.advanceTimersByTime(1000)
  expect(notify).not.toHaveBeenCalled()
})

it('非缺失的 stat 错误关闭监听并沿原生 error 事件报告', (context) => {
  const { watcher, notify, close, native } = fixture(context)
  const error = Object.assign(new Error('permission denied'), { code: 'EACCES' })
  const failed = vi.fn()
  watcher.on('error', failed)
  vi.spyOn(fs, 'statSync').mockImplementation(() => {
    throw error
  })
  vi.advanceTimersToNextTimer()
  expect(failed).toHaveBeenCalledExactlyOnceWith(error)
  expect(close).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
  native.emit('change', 'change', null)
  expect(notify).not.toHaveBeenCalled()
})

it('没有错误接收者时保留 FSWatcher 的未处理 error 语义', (context) => {
  const { close } = fixture(context)
  const error = new Error('unexpected stat failure')
  vi.spyOn(fs, 'statSync').mockImplementation(() => {
    throw error
  })
  expect(() => vi.advanceTimersToNextTimer()).toThrow(error)
  expect(close).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})

it('目录保留原生递归监听，不用根目录 stat 冒充后代内容核对', (context) => {
  const { input, native, notify, watch } = fixture(context, true)
  expect(watch).toHaveBeenCalledWith(input, { persistent: false, recursive: true }, expect.any(Function))
  expect(vi.getTimerCount()).toBe(0)
  native.emit('change', 'change', path.join('nested', 'source.tsx'))
  native.emit('change', 'rename', null)
  expect(notify).toHaveBeenCalledTimes(2)
})
