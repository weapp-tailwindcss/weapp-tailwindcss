import { execa } from 'execa'
import { afterEach, expect, it, vi } from 'vitest'
import { readNativeProcessIdentity } from './native-command/identity'

vi.mock('execa', () => ({ execa: vi.fn() }))
afterEach(() => vi.mocked(execa).mockReset())

it('保留含空格的真实可执行路径，并以独立参数查询唯一 PID', async () => {
  vi.mocked(execa).mockResolvedValue({ stdout: ' 42  81 Sun Oct 25 20:33:17 2026 /Applications/Xcode with spaces.app/usr/bin/simctl\n' } as never)
  const signal = new AbortController().signal
  await expect(readNativeProcessIdentity(42, signal)).resolves.toEqual({ pid: 42, parentPid: 81, startedAt: 'Sun Oct 25 20:33:17 2026', executable: '/Applications/Xcode with spaces.app/usr/bin/simctl' })
  expect(execa).toHaveBeenCalledExactlyOnceWith('ps', ['-p', '42', '-o', 'pid=,ppid=,lstart=,comm='], { cancelSignal: signal, timeout: 1000, killSignal: 'SIGKILL', maxBuffer: 16 * 1024, env: { LC_ALL: 'C' } })
})

it.each(['', '43 81 Sun Oct 25 20:33:17 2026 /simctl', '42 0 Sun Oct 25 20:33:17 2026 /simctl', '42 81 Sun Oct 25 20:33:17 2026 /simctl\n42 81 Sun Oct 25 20:33:17 2026 /simctl'])('拒绝缺失、不匹配或歧义的身份：%s', async (stdout) => {
  vi.mocked(execa).mockResolvedValue({ stdout } as never)
  await expect(readNativeProcessIdentity(42, new AbortController().signal)).rejects.toThrow('identity is unavailable or ambiguous')
})

it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])('无效 PID 不发起进程查询：%s', async (pid) => {
  await expect(readNativeProcessIdentity(pid, new AbortController().signal)).rejects.toThrow('positive safe integer')
  expect(execa).not.toHaveBeenCalled()
})

it('保留身份查询的取消原错', async () => {
  const failure = new Error('lookup canceled')
  vi.mocked(execa).mockRejectedValue(failure)
  await expect(readNativeProcessIdentity(42, new AbortController().signal)).rejects.toBe(failure)
})
