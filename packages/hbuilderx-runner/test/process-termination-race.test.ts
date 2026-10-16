import { ChildProcess } from 'node:child_process'
import process from 'node:process'
import spawn from 'cross-spawn'
import { afterEach, expect, it, vi } from 'vitest'
import { spawnCommand } from '../src/process'

vi.mock('cross-spawn', () => ({ default: vi.fn() }))

const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  Object.defineProperty(process, 'platform', platformDescriptor)
})

it.each([
  { name: 'Darwin 已退出根的短暂 EPERM', platform: 'darwin', exited: true, code: 'EPERM', close: true, gone: true, passed: true },
  { name: 'Darwin 仍运行根的权限失败', platform: 'darwin', exited: false, code: 'EPERM', close: true, gone: true, passed: false },
  { name: 'Linux 已退出根的权限失败', platform: 'linux', exited: true, code: 'EPERM', close: true, gone: true, passed: false },
  { name: 'Darwin 已退出根的其他信号错误', platform: 'darwin', exited: true, code: 'EINVAL', close: true, gone: true, passed: false },
  { name: 'Darwin 根已关闭但组持续存在', platform: 'darwin', exited: true, code: 'EPERM', close: true, gone: false, passed: false },
  { name: 'Darwin 组消失但没有根 close', platform: 'darwin', exited: true, code: 'EPERM', close: false, gone: true, passed: false },
] as const)('$name：只在原预算内取得 close 与组消失双证据后成功', async (scenario) => {
  vi.useFakeTimers()
  Object.defineProperty(process, 'platform', { value: scenario.platform })
  const child = Object.assign(new ChildProcess(), { pid: 12345, kill: vi.fn(() => true) })
  vi.mocked(spawn).mockReturnValue(child)
  if (scenario.exited) {
    Object.defineProperty(child, 'exitCode', { value: 1, configurable: true })
  }
  let groupGone = false
  const denied = Object.assign(new Error('本轮信号被拒绝'), { code: scenario.code })
  const signals = vi.spyOn(process, 'kill').mockImplementation((_pid, signal) => {
    if (signal !== 0) {
      throw denied
    }
    if (groupGone) {
      throw Object.assign(new Error('本轮组已消失'), { code: 'ESRCH' })
    }
    if (scenario.platform === 'darwin' && scenario.exited && scenario.code === 'EPERM') {
      throw Object.assign(new Error('本轮组仍在回收'), { code: 'EPERM' })
    }
    return true
  })
  const command = spawnCommand({ command: 'owned-command', args: [], cwd: process.cwd() })
  const pending = command.stop()
  let settled = false
  const outcome = pending.then(() => ({ passed: true, error: undefined }), error => ({ passed: false, error })).then((result) => {
    settled = true
    return result
  })
  expect(signals).toHaveBeenCalledWith(-12345, 'SIGTERM')
  expect(command.stop()).toBe(pending)
  await vi.advanceTimersByTimeAsync(25)
  expect(settled).toBe(false)
  groupGone = scenario.gone
  await vi.advanceTimersByTimeAsync(25)
  expect(settled).toBe(false)
  if (scenario.close) {
    Object.defineProperty(child, 'exitCode', { value: 1, configurable: true })
    child.emit('close', 1, null)
  }
  await vi.advanceTimersByTimeAsync(1950)
  const result = await outcome
  expect(result.passed).toBe(scenario.passed)
  if (!scenario.passed) {
    expect(result.error).toMatchObject({ name: 'HBuilderXCommandError', cleanupError: { errors: expect.arrayContaining([denied]) } })
    await expect(command.stop()).rejects.toBe(result.error)
  }
  else {
    expect(signals.mock.calls.filter(([, signal]) => signal !== 0)).toEqual([[-12345, 'SIGTERM']])
    expect(groupGone).toBe(true)
    expect(await command.closed).toEqual({ code: 1, signal: null })
  }
  expect(child.kill).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})
