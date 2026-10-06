import { ChildProcess, spawnSync } from 'node:child_process'
import process from 'node:process'
import spawn from 'cross-spawn'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { killProcessTree, runCommand, spawnCommand } from '../src/process'

vi.mock('cross-spawn', () => ({ default: vi.fn() }))
vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawnSync: vi.fn(),
}))

const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!
const options = { command: 'owned-command', args: ['中文 空格'], cwd: process.cwd() }
let child: ChildProcess
let groupAlive: boolean

function closeChild(code: number | null, signal: NodeJS.Signals | null) {
  Object.defineProperty(child, 'exitCode', { value: code, configurable: true })
  Object.defineProperty(child, 'signalCode', { value: signal, configurable: true })
  child.emit('close', code, signal)
}

function terminationSignals() {
  return vi.mocked(process.kill).mock.calls.filter(([, signal]) => signal !== 0)
}

function platform(value: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value })
}

beforeEach(() => {
  vi.useFakeTimers()
  child = Object.assign(new ChildProcess(), { pid: 12345, kill: vi.fn(() => true) })
  vi.mocked(spawn).mockReturnValue(child)
  groupAlive = true
  vi.spyOn(process, 'kill').mockImplementation(() => {
    if (!groupAlive) {
      throw Object.assign(new Error('gone'), { code: 'ESRCH' })
    }
    return true
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  Object.defineProperty(process, 'platform', platformDescriptor)
})

it('停止调用复用清理状态，TERM 后升级 KILL 并确认 close，结束后释放计时器', async () => {
  platform('linux')
  const owned = spawnCommand(options)
  const first = owned.stop()
  expect(owned.stop()).toBe(first)
  await vi.advanceTimersByTimeAsync(1000)
  expect(terminationSignals()).toEqual([[-12345, 'SIGTERM'], [-12345, 'SIGKILL']])
  groupAlive = false
  closeChild(null, 'SIGKILL')
  await first
  expect(vi.getTimerCount()).toBe(0)
  await owned.stop()
  expect(terminationSignals()).toHaveLength(2)
})

it('根进程 exit 后后代仍占管道时，继续清理记录过的独立进程组', async () => {
  platform('darwin')
  const owned = spawnCommand(options)
  Object.defineProperty(child, 'exitCode', { value: 0 })
  const stopped = owned.stop()
  expect(process.kill).toHaveBeenCalledWith(-12345, 'SIGTERM')
  groupAlive = false
  closeChild(0, null)
  await stopped
})

it('detached:false 仅终止持有的子进程，不猜测独立进程组', async () => {
  platform('linux')
  const owned = spawnCommand({ ...options, detached: false })
  const stopped = owned.stop()
  expect(process.kill).not.toHaveBeenCalled()
  expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  closeChild(null, 'SIGTERM')
  await stopped
})

it('无法确认清理时保留超时为主错误，allowFailure 也不能放行', async () => {
  platform('linux')
  vi.mocked(process.kill).mockImplementation(() => {
    throw Object.assign(new Error('denied'), { code: 'EPERM' })
  })
  const result = runCommand({ ...options, timeoutMs: 10, allowFailure: true }).catch(error => error)
  await vi.advanceTimersByTimeAsync(2010)
  const error = await result
  expect(error).toMatchObject({
    name: 'HBuilderXCommandError',
    result: { ...options, exit: { code: null, signal: null }, issue: { kind: 'timeout' } },
    cleanupError: { errors: expect.arrayContaining([expect.objectContaining({ message: 'denied' })]) },
  })
  expect(error.cause).toBe(error.cleanupError)
  expect(error.message).toContain('清理失败')
  expect(vi.getTimerCount()).toBe(0)
})

it('超时后以零退出码结束仍抛 timeout，允许失败时才返回真实结果', async () => {
  platform('linux')
  const result = runCommand({ ...options, timeoutMs: 10 }).catch(error => error)
  await vi.advanceTimersByTimeAsync(10)
  groupAlive = false
  closeChild(0, null)
  expect(await result).toMatchObject({ result: { exit: { code: 0, signal: null }, issue: { kind: 'timeout' } } })
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['exit', 'timeout', 'missing', 'no-close'] as const)('Windows %s 无法确认终止时明确失败', async (scenario) => {
  platform('win32')
  const error = Object.assign(new Error(scenario), { code: scenario === 'timeout' ? 'ETIMEDOUT' : 'ENOENT' })
  vi.mocked(spawnSync).mockReturnValue({
    pid: 56789,
    output: [null, '', 'taskkill diagnostic'],
    stdout: '',
    stderr: 'taskkill diagnostic',
    status: scenario === 'no-close' ? 0 : scenario === 'exit' ? 1 : null,
    signal: scenario === 'timeout' ? 'SIGKILL' : null,
    ...(['timeout', 'missing'].includes(scenario) ? { error } : {}),
  })
  const stopped = spawnCommand(options).stop().catch(error => error)
  await vi.advanceTimersByTimeAsync(1000)
  const failure = await stopped
  expect(failure).toMatchObject({ name: 'HBuilderXCommandError', result: { issue: { kind: 'process-exit' } } })
  expect(failure.cleanupError.errors).toHaveLength(scenario === 'no-close' ? 0 : 1)
  expect(spawnSync).toHaveBeenCalledWith('taskkill', ['/pid', '12345', '/t', '/f'], expect.objectContaining({ timeout: 5000, killSignal: 'SIGKILL', windowsHide: true }))
  expect(child.kill).not.toHaveBeenCalled()
  expect(process.kill).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('Windows 已关闭的根进程不再按旧 PID 请求 taskkill，等待其管道关闭', async () => {
  platform('win32')
  const owned = spawnCommand(options)
  Object.defineProperty(child, 'exitCode', { value: 0 })
  const stopped = owned.stop()
  expect(spawnSync).not.toHaveBeenCalled()
  groupAlive = false
  closeChild(0, null)
  await stopped
})

it('清理已开始时根进程 close 不能放过独立组里关闭管道的后代', async () => {
  platform('darwin')
  const owned = spawnCommand(options)
  const stopped = owned.stop()
  let resolved = false
  void stopped.then(() => {
    resolved = true
  })
  closeChild(0, null)
  await vi.advanceTimersByTimeAsync(999)
  expect(resolved).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(terminationSignals()).toEqual([[-12345, 'SIGTERM'], [-12345, 'SIGKILL']])
  groupAlive = false
  await vi.advanceTimersByTimeAsync(25)
  await stopped
  expect(resolved).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})

it('自然 close 后公开清理不能再向可能复用的 PID 或组发信号', async () => {
  platform('linux')
  const owned = spawnCommand(options)
  closeChild(0, null)
  killProcessTree(child)
  await owned.stop()
  expect(process.kill).not.toHaveBeenCalled()
  expect(child.kill).not.toHaveBeenCalled()
})

it('组消失后等待根 close 不再向可能复用的 PGID 发信号', async () => {
  platform('linux')
  const owned = spawnCommand(options)
  const stopped = owned.stop()
  groupAlive = false
  await vi.advanceTimersByTimeAsync(25)
  groupAlive = true
  await vi.advanceTimersByTimeAsync(975)
  expect(terminationSignals()).toEqual([[-12345, 'SIGTERM']])
  closeChild(null, 'SIGKILL')
  await stopped
})

it.each(['exit', 'timeout'] as const)('Windows taskkill %s 即使根 close 仍保留清理失败且 stop 幂等', async (scenario) => {
  platform('win32')
  vi.mocked(spawnSync).mockImplementation(() => {
    closeChild(0, null)
    return {
      pid: 56789,
      output: [null, '', 'partial tree failure'],
      stdout: '',
      stderr: 'partial tree failure',
      status: scenario === 'exit' ? 1 : null,
      signal: scenario === 'timeout' ? 'SIGKILL' : null,
      ...(scenario === 'timeout' ? { error: Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }) } : {}),
    }
  })
  const owned = spawnCommand(options)
  const first = owned.stop()
  const failure = await first.catch(error => error)
  expect(failure).toMatchObject({ name: 'HBuilderXCommandError', result: { issue: { kind: 'process-exit' } } })
  expect(failure.message).toContain('partial tree failure')
  expect(owned.stop()).toBe(first)
  await expect(owned.stop()).rejects.toBe(failure)
  expect(spawnSync).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

it('退出期间探针暂时 EPERM 时在固定预算内继续确认，只有明确组消失才成功', async () => {
  platform('darwin')
  let permissionRace = true
  vi.mocked(process.kill).mockImplementation((_pid, signal) => {
    if (signal === 0) {
      throw Object.assign(new Error(permissionRace ? 'reaping' : 'gone'), { code: permissionRace ? 'EPERM' : 'ESRCH' })
    }
    return true
  })
  const owned = spawnCommand(options)
  const stopped = owned.stop()
  closeChild(0, null)
  await vi.advanceTimersByTimeAsync(25)
  permissionRace = false
  await vi.advanceTimersByTimeAsync(25)
  await stopped
  expect(terminationSignals()).toEqual([[-12345, 'SIGTERM']])
  expect(vi.getTimerCount()).toBe(0)
})

it('根进程已 close 但本轮组持续存在时，固定预算耗尽必须失败', async () => {
  platform('linux')
  const owned = spawnCommand(options)
  const stopped = owned.stop().catch(error => error)
  closeChild(0, null)
  await vi.advanceTimersByTimeAsync(2000)
  expect(await stopped).toMatchObject({ name: 'HBuilderXCommandError', cleanupError: expect.any(AggregateError) })
  expect(terminationSignals()).toEqual([[-12345, 'SIGTERM'], [-12345, 'SIGKILL']])
  expect(vi.getTimerCount()).toBe(0)
})

it('探针权限恢复后不把过期错误带入下一阶段，允许 KILL 后确认清理成功', async () => {
  platform('darwin')
  let permissionRace = true
  vi.mocked(process.kill).mockImplementation((_pid, signal) => {
    if (signal === 0) {
      if (permissionRace) {
        throw Object.assign(new Error('reaping'), { code: 'EPERM' })
      }
      if (!groupAlive) {
        throw Object.assign(new Error('gone'), { code: 'ESRCH' })
      }
    }
    if (signal === 'SIGKILL') {
      groupAlive = false
      closeChild(null, 'SIGKILL')
    }
    return true
  })
  const stopped = spawnCommand(options).stop()
  await vi.advanceTimersByTimeAsync(25)
  permissionRace = false
  await vi.advanceTimersByTimeAsync(975)
  await stopped
  expect(terminationSignals()).toEqual([[-12345, 'SIGTERM'], [-12345, 'SIGKILL']])
  expect(vi.getTimerCount()).toBe(0)
})
