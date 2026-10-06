import type { CommandExit, SpawnedHBuilderXCommand } from '../packages/hbuilderx-runner/src/types'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { expect, it, vi } from 'vitest'
import { waitForCompiler } from '../scripts/hbuilderx/compiler-lifecycle'

function pending<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function watcher() {
  const closed = pending<CommandExit>()
  const stopped = pending<void>()
  const stop = vi.fn(() => stopped.promise)
  const events = new EventEmitter()
  return { closed, stopped, stop, events, child: { child: events, closed: closed.promise, stop } as unknown as SpawnedHBuilderXCommand }
}

it.each([0, 1])('持续编译进程自行退出 %s 也不算 watch 完成', async (code) => {
  const task = watcher()
  const signals = [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')]
  const result = waitForCompiler(task.child)
  task.events.emit('exit', code, null)
  expect(task.stop).toHaveBeenCalledExactlyOnceWith('SIGTERM')
  task.closed.resolve({ code, signal: null })
  task.stopped.resolve()
  await expect(result).rejects.toThrow('持续 watch 尚未完成')
  expect([process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')]).toEqual(signals)
})

it.each(['SIGINT', 'SIGTERM'] as const)('%s 只停止本轮编译器并等待进程树收尾', async (signal) => {
  const task = watcher()
  const existing = process.listeners(signal)
  let finished = false
  const result = waitForCompiler(task.child).then(() => {
    finished = true
  })
  process.listeners(signal).find(handler => !existing.includes(handler))!(signal)
  process.listeners(signal).find(handler => !existing.includes(handler))!(signal)
  expect(task.stop).toHaveBeenCalledExactlyOnceWith(signal)
  task.closed.resolve({ code: null, signal })
  await new Promise(resolve => setImmediate(resolve))
  expect(finished).toBe(false)
  task.stopped.resolve()
  await result
  expect(process.listeners(signal)).toEqual(existing)
})

it('自行退出与后代停止同时失败时保留原退出错误和清理错误', async () => {
  const task = watcher()
  const result = waitForCompiler(task.child)
  task.events.emit('exit', 1, null)
  task.closed.resolve({ code: 1, signal: null })
  await new Promise(resolve => setImmediate(resolve))
  const error = new Error('descendant cleanup failed')
  task.stopped.reject(error)
  const failure = await result.catch(error => error)
  expect(failure).toBeInstanceOf(AggregateError)
  expect(failure.errors[0].message).toContain('提前退出：1')
  expect(failure.errors[1]).toBe(error)
})

it('exit 后 close 尚未到达时先失败的清理不会覆盖编译退出首因', async () => {
  const task = watcher()
  const result = waitForCompiler(task.child)
  task.events.emit('exit', 9, null)
  const error = new Error('descendant pipe remains open')
  task.stopped.reject(error)
  const failure = await result.catch(error => error)
  expect(failure).toBeInstanceOf(AggregateError)
  expect(failure.errors).toHaveLength(2)
  expect(failure.errors[0].message).toContain('提前退出：9')
  expect(failure.errors[1]).toBe(error)
})

it('停止失败且编译器未退出时仍返回首因并移除自己的监听器', async () => {
  const task = watcher()
  const existing = process.listeners('SIGTERM')
  const error = new Error('owned compiler tree did not stop')
  const result = waitForCompiler(task.child)
  process.listeners('SIGTERM').find(handler => !existing.includes(handler))!('SIGTERM')
  task.stopped.reject(error)
  await expect(result).rejects.toBe(error)
  expect(process.listeners('SIGTERM')).toEqual(existing)
})

it('编译器根进程先关闭时不吞掉晚到的停止失败', async () => {
  const task = watcher()
  const existing = process.listeners('SIGTERM')
  const result = waitForCompiler(task.child)
  process.listeners('SIGTERM').find(handler => !existing.includes(handler))!('SIGTERM')
  task.closed.resolve({ code: 0, signal: null })
  await new Promise(resolve => setImmediate(resolve))
  const error = new Error('owned descendant did not stop')
  task.stopped.reject(error)
  await expect(result).rejects.toBe(error)
  expect(process.listeners('SIGTERM')).toEqual(existing)
})
