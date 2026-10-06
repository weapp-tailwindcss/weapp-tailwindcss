import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import { runProcessCommand } from '../scripts/demo-e2e-workflow/process-command'

const state = vi.hoisted(() => ({ synthetic: false, child: undefined as ChildProcess | undefined, callback: undefined as ((error: Error | null, stdout: string, stderr: string) => void) | undefined }))
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execFile: (...args: Parameters<typeof actual.execFile>) => {
    if (!state.synthetic) {
      state.child = actual.execFile(...args)
      return state.child
    }
    state.callback = args.at(-1) as typeof state.callback
    return state.child
  } }
})
afterEach(() => {
  vi.useRealTimers()
  state.synthetic = false
  state.callback = undefined
  state.child = undefined
})

it('Abort 错误回调先到仍等待探针 close 后才拒绝', async () => {
  state.synthetic = true
  state.child = Object.assign(new EventEmitter(), { kill: vi.fn() }) as unknown as ChildProcess
  const aborted = new Error('aborted')
  let settled = false
  const task = runProcessCommand('ps', [], 500).catch(error => error).finally(() => {
    settled = true
  })
  state.callback!(aborted, '')
  await Promise.resolve()
  expect(settled).toBe(false)
  state.child.emit('close', null, 'SIGKILL')
  expect(await task).toBe(aborted)
})

it('真实探针超时后已等待本轮进程退出，不留下后台进程', async () => {
  await expect(runProcessCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], 80)).rejects.toThrow()
  expect(state.child?.exitCode !== null || state.child?.signalCode !== null).toBe(true)
  expect(() => process.kill(state.child!.pid!, 0)).toThrow()
})

it('预算耗尽不启动探针', async () => {
  await expect(runProcessCommand('ps', [], 0)).rejects.toThrow('禁止继续调度')
  expect(state.child).toBeUndefined()
})

it('调用方确认合法失败时接受空输出', async () => {
  state.synthetic = true
  state.child = Object.assign(new EventEmitter(), { kill: vi.fn() }) as unknown as ChildProcess
  const noMatch = Object.assign(new Error('ps exited'), { code: 1 })
  const task = runProcessCommand('ps', [], 500, undefined, {
    acceptFailure: (error, stdout, stderr) => error === noMatch && stdout === '' && stderr === '',
  })
  state.callback!(noMatch, '', '')
  state.child.emit('close', null, null)
  await expect(task).resolves.toBe('')
})

it('合法失败判定必须拒绝带错误输出的退出码', async () => {
  state.synthetic = true
  state.child = Object.assign(new EventEmitter(), { kill: vi.fn() }) as unknown as ChildProcess
  const invalidQuery = Object.assign(new Error('ps exited'), { code: 1 })
  const task = runProcessCommand('ps', [], 500, undefined, {
    acceptFailure: (error, stdout, stderr) => error === invalidQuery && stdout === '' && stderr === '',
  })
  state.callback!(invalidQuery, '', 'ps: invalid option')
  state.child.emit('close', null, null)
  await expect(task).rejects.toBe(invalidQuery)
})

it('超时后缺少 callback 与 close 仍有独立截止并记录未确认 PID', async () => {
  vi.useFakeTimers()
  state.synthetic = true
  state.child = Object.assign(new EventEmitter(), { pid: 424242, kill: vi.fn(() => true) }) as unknown as ChildProcess
  let result: unknown
  const task = runProcessCommand('ps', [], 80).catch((error) => {
    result = error
  })
  await vi.advanceTimersByTimeAsync(80)
  expect(state.child.kill).toHaveBeenCalledWith('SIGKILL')
  expect(result).toBeUndefined()
  await vi.advanceTimersByTimeAsync(1000)
  expect(result).toBeInstanceOf(Error)
  expect((result as Error).message).toContain('pid=424242')
  expect((result as Error).message).toContain('退出未确认')
  await task
})
