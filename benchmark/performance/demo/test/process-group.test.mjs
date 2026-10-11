import { expect, it } from 'vitest'
import { liveGroupMembers, signalProcessGroup } from '../process-group.mjs'

it('只检查目标进程组的存活成员，不把其他任务或僵尸进程算作未完成清理', () => {
  expect(liveGroupMembers('100 100 Z\n101 100 S+\n200 200 R', 100)).toEqual([101])
  expect(liveGroupMembers('100 100 Z\r\n200 200 R', 100)).toEqual([])
  expect(() => liveGroupMembers('unexpected output', 100)).toThrow('无法解析')
})

it('EPERM 只有在独立确认目标组已退出后才可忽略，活进程及查询失败仍阻断', async () => {
  const error = Object.assign(new Error('kill EPERM'), { code: 'EPERM' })
  const kill = (pid, signal) => { expect(pid).toBe(-100); expect(signal).toBe('SIGKILL'); throw error }
  await expect(signalProcessGroup(100, 'SIGKILL', { kill, inspect: async () => '200 200 S' })).resolves.toBeUndefined()
  await expect(signalProcessGroup(100, 'SIGKILL', { kill, inspect: async () => '101 100 S' })).rejects.toBe(error)
  await expect(signalProcessGroup(100, 'SIGKILL', { kill, inspect: async () => { throw new Error('ps failed') } })).rejects.toBe(error)
  await expect(signalProcessGroup(100, 'SIGKILL', { kill, inspect: async () => 'malformed' })).rejects.toBe(error)
})
