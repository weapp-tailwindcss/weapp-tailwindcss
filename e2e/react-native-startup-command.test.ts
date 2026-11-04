import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { PassThrough } from 'node:stream'
import { afterEach, expect, it, vi } from 'vitest'
import { runNativeStartupCommand, terminateNativeStartupProcess } from './react-native/startup-command'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

const platform = process.platform
afterEach(async () => {
  Object.defineProperty(process, 'platform', { value: platform })
  vi.restoreAllMocks()
  vi.resetAllMocks()
  vi.useRealTimers()
})

function child(pid = 12345) {
  return Object.assign(new EventEmitter(), {
    pid,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  })
}

function setup(target: NodeJS.Platform = 'linux') {
  Object.defineProperty(process, 'platform', { value: target })
  vi.spyOn(process, 'kill').mockImplementation(() => {
    throw Object.assign(new Error('no owned group'), { code: 'ESRCH' })
  })
  const command = child()
  vi.mocked(spawn).mockReturnValue(command as unknown as ChildProcess)
  const controller = new AbortController()
  return { command, controller, options: { cwd: process.cwd(), signal: controller.signal } }
}

function groupLifecycle(disappearOnKill = true) {
  let alive = true
  const kill = vi.spyOn(process, 'kill').mockImplementation((_pid, signal) => {
    if (!alive) {
      throw Object.assign(new Error('missing'), { code: 'ESRCH' })
    }
    if (signal === 'SIGKILL' && disappearOnKill) {
      alive = false
    }
    return true
  })
  return { kill, disappear: () => {
    alive = false
  } }
}

it('已取消的 owner 不启动任何子进程', async () => {
  const context = setup()
  const reason = new Error('owner deadline')
  context.controller.abort(reason)
  await expect(runNativeStartupCommand(process.execPath, [], context.options)).rejects.toBe(reason)
  expect(spawn).not.toHaveBeenCalled()
})

it('等待真实 close，收集完整 stdout 并可同时继承输出', async () => {
  const context = setup()
  const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  let settled = false
  const running = runNativeStartupCommand(process.execPath, ['entry.ts'], { ...context.options, stdout: 'inherit' }).finally(() => {
    settled = true
  })
  expect(spawn).toHaveBeenCalledWith(process.execPath, ['entry.ts'], expect.objectContaining({ detached: true, stdio: ['ignore', 'pipe', 'pipe'] }))
  context.command.stdout.write('first')
  context.command.emit('exit', 0, null)
  await Promise.resolve()
  expect(settled).toBe(false)
  context.command.stdout.write('last')
  context.command.emit('close', 0, null)
  expect(await running).toBe('firstlast')
  expect(output.mock.calls.map(([chunk]) => chunk).join('')).toBe('firstlast')
})

it('非零退出和启动错误均在 close 后交付失败', async () => {
  const context = setup()
  const running = runNativeStartupCommand(process.execPath, [], context.options)
  context.command.emit('close', 7, null)
  await expect(running).rejects.toThrow('exit=7')
  const next = child()
  vi.mocked(spawn).mockReturnValue(next as unknown as ChildProcess)
  const failure = new Error('spawn failed')
  let settled = false
  const failed = runNativeStartupCommand(process.execPath, [], { ...context.options, reject: false }).catch((error) => {
    settled = true
    return error
  })
  next.emit('error', failure)
  await Promise.resolve()
  expect(settled).toBe(false)
  next.emit('close', -2, null)
  expect(await failed).toBe(failure)
})

it('可选命令非零退出仍返回 stdout，默认命令保持严格失败', async () => {
  const context = setup()
  const running = runNativeStartupCommand(process.execPath, [], { ...context.options, reject: false })
  context.command.stdout.write('optional metadata')
  context.command.emit('close', 7, null)
  expect(await running).toBe('optional metadata')
})

it('取消只发给本轮进程组，一秒升级 KILL 后仍等待真实 close', async () => {
  vi.useFakeTimers()
  const context = setup()
  const { kill } = groupLifecycle()
  const reason = new Error('startup timeout')
  let settled = false
  const running = runNativeStartupCommand(process.execPath, [], { ...context.options, reject: false }).catch((error) => {
    settled = true
    return error
  })
  context.controller.abort(reason)
  expect(kill).toHaveBeenCalledWith(-12345, 'SIGTERM')
  await vi.advanceTimersByTimeAsync(1_000)
  expect(kill).toHaveBeenCalledWith(-12345, 'SIGKILL')
  expect(settled).toBe(false)
  context.command.emit('close', null, 'SIGKILL')
  expect(await running).toBe(reason)
  expect(vi.getTimerCount()).toBe(0)
})

it('根进程先 close 也继续升级，避免遗留忽略 TERM 的后代', async () => {
  vi.useFakeTimers()
  const context = setup()
  const { kill } = groupLifecycle()
  const reason = new Error('owner stopped')
  const running = runNativeStartupCommand(process.execPath, [], context.options).catch(error => error)
  context.controller.abort(reason)
  context.command.emit('close', null, 'SIGTERM')
  await vi.advanceTimersByTimeAsync(1_000)
  expect(kill).toHaveBeenCalledWith(-12345, 'SIGKILL')
  expect(await running).toBe(reason)
})

it('TERM 后确认组消失便永久撤销 PGID，重复停止不再探测或发送 KILL', async () => {
  vi.useFakeTimers()
  const context = setup()
  const group = groupLifecycle()
  const reason = new Error('owner stopped')
  const running = runNativeStartupCommand(process.execPath, [], context.options).catch(error => error)
  context.controller.abort(reason)
  context.command.emit('close', null, 'SIGTERM')
  group.disappear()
  await vi.advanceTimersByTimeAsync(25)
  expect(await running).toBe(reason)
  const calls = group.kill.mock.calls.length
  await terminateNativeStartupProcess(context.command as unknown as ChildProcess)
  await vi.advanceTimersByTimeAsync(1_000)
  expect(group.kill).toHaveBeenCalledTimes(calls)
  expect(group.kill).not.toHaveBeenCalledWith(-12345, 'SIGKILL')
  expect(vi.getTimerCount()).toBe(0)
})

it('KILL 已发送和根已 close 仍不算组消失，必须等最后的后代退出', async () => {
  vi.useFakeTimers()
  const context = setup()
  const group = groupLifecycle(false)
  const reason = new Error('owner stopped')
  let settled = false
  const running = runNativeStartupCommand(process.execPath, [], context.options).catch((error) => {
    settled = true
    return error
  })
  context.controller.abort(reason)
  context.command.emit('close', null, 'SIGTERM')
  await vi.advanceTimersByTimeAsync(1_000)
  expect(group.kill).toHaveBeenCalledWith(-12345, 'SIGKILL')
  expect(settled).toBe(false)
  group.disappear()
  await vi.advanceTimersByTimeAsync(25)
  expect(await running).toBe(reason)
  expect(vi.getTimerCount()).toBe(0)
})

it('两秒内未确认组消失必须报告清理失败，不能用根 close 掩盖后代', async () => {
  vi.useFakeTimers()
  const context = setup()
  groupLifecycle(false)
  const running = runNativeStartupCommand(process.execPath, [], { ...context.options, reject: false }).catch(error => error)
  context.controller.abort(new Error('owner stopped'))
  context.command.emit('close', null, 'SIGTERM')
  await vi.advanceTimersByTimeAsync(2_000)
  const failure = await running
  expect(failure).toBeInstanceOf(AggregateError)
  expect(failure.errors[1].errors.some((error: Error) => error.message.includes('未确认消失'))).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})

it('spawn 期间发生取消时仍登记本轮进程清理', async () => {
  vi.useFakeTimers()
  const context = setup()
  const { kill } = groupLifecycle()
  const reason = new Error('cancel while spawning')
  vi.mocked(spawn).mockImplementationOnce(() => {
    context.controller.abort(reason)
    return context.command as unknown as ChildProcess
  })
  const running = runNativeStartupCommand(process.execPath, [], context.options).catch(error => error)
  expect(kill).toHaveBeenCalledWith(-12345, 'SIGTERM')
  context.command.emit('close', null, 'SIGTERM')
  await vi.advanceTimersByTimeAsync(1_000)
  expect(await running).toBe(reason)
})

it('进程组不存在时保留原始取消原因，权限失败不能吞掉', async () => {
  vi.useFakeTimers()
  const context = setup()
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => {
    throw Object.assign(new Error('missing'), { code: 'ESRCH' })
  })
  const reason = new Error('stopped')
  const running = runNativeStartupCommand(process.execPath, [], context.options).catch(error => error)
  context.controller.abort(reason)
  context.command.emit('close', 0, null)
  expect(await running).toBe(reason)
  expect(vi.getTimerCount()).toBe(0)
  const next = setup()
  kill.mockImplementation(() => {
    throw Object.assign(new Error('denied'), { code: 'EPERM' })
  })
  const failed = runNativeStartupCommand(process.execPath, [], next.options).catch(error => error)
  next.controller.abort(reason)
  next.command.emit('close', 0, null)
  await vi.advanceTimersByTimeAsync(2_000)
  expect(await failed).toBeInstanceOf(AggregateError)
})

it('Windows 只精准 taskkill 本轮 PID 整树，等待工具及命令都 close', async () => {
  const context = setup('win32')
  const killer = child(23456)
  vi.mocked(spawn).mockReturnValueOnce(context.command as unknown as ChildProcess).mockReturnValueOnce(killer as unknown as ChildProcess)
  const reason = new Error('cancel windows')
  let settled = false
  const running = runNativeStartupCommand(process.execPath, [], context.options).catch((error) => {
    settled = true
    return error
  })
  context.controller.abort(reason)
  expect(spawn).toHaveBeenLastCalledWith('taskkill', ['/PID', '12345', '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  context.command.emit('close', null, null)
  await Promise.resolve()
  expect(settled).toBe(false)
  killer.emit('close', 0, null)
  expect(await running).toBe(reason)
})

it('Windows taskkill 超时不把未关闭的工具或命令视为完成', async () => {
  vi.useFakeTimers()
  const context = setup('win32')
  const killer = child(23456)
  vi.mocked(spawn).mockReturnValueOnce(context.command as unknown as ChildProcess).mockReturnValueOnce(killer as unknown as ChildProcess)
  let settled = false
  const running = runNativeStartupCommand(process.execPath, [], context.options).catch((error) => {
    settled = true
    return error
  })
  context.controller.abort(new Error('owner stopped'))
  context.command.emit('close', 0, null)
  await vi.advanceTimersByTimeAsync(4_000)
  expect(killer.kill).toHaveBeenCalledWith('SIGKILL')
  expect(settled).toBe(false)
  killer.emit('close', null, 'SIGKILL')
  expect(await running).toBeInstanceOf(AggregateError)
  expect(vi.getTimerCount()).toBe(0)
})

it('取消清理的真实 promise 立即交给调用方，失败不能被逻辑退出替代', async () => {
  vi.useFakeTimers()
  const context = setup()
  const failure = Object.assign(new Error('gone'), { code: 'ESRCH' })
  vi.spyOn(process, 'kill').mockImplementation(() => {
    throw failure
  })
  const registered = vi.fn()
  const reason = new Error('deadline')
  const running = runNativeStartupCommand(process.execPath, [], { ...context.options, onCleanup: registered }).catch(error => error)
  context.controller.abort(reason)
  expect(registered).toHaveBeenCalledOnce()
  await expect(registered.mock.calls[0]![0]).resolves.toBeUndefined()
  context.command.emit('close', null, 'SIGTERM')
  expect(await running).toBe(reason)
})
