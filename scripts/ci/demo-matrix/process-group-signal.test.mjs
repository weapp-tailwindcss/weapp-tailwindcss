import { spawn } from 'node:child_process'
import process from 'node:process'
import { execa } from 'execa'
import { expect, it, vi } from 'vitest'
import { hasLiveGroupMembers, signalOwnedProcessGroup } from './process-groups.mjs'

it.each(['', '42 Z\n43 S', '42 Z+', '42 Z\n0 ?\n43', '0 ?\n43 ?'])('仅空组或僵尸组的 EPERM 可视为已终止 (%s)', async (table) => {
  const kill = vi.fn(() => {
    throw Object.assign(new Error('kill EPERM'), { code: 'EPERM' })
  })
  await signalOwnedProcessGroup(42, 'SIGTERM', kill, async () => table)
  expect(kill).toHaveBeenCalledExactlyOnceWith(-42, 'SIGTERM')
})

it.each(['42 S', '42 Z\n42 R', '42 T', '0 ?\n42 S\n43 ?'])('组内仍有活进程时保留权限错误 (%s)', async (table) => {
  const error = Object.assign(new Error('kill EPERM'), { code: 'EPERM' })
  expect(hasLiveGroupMembers(table, 42)).toBe(true)
  await expect(signalOwnedProcessGroup(42, 'SIGKILL', () => {
    throw error
  }, async () => table)).rejects.toBe(error)
})

it('进程表读取失败不能放行清理', async () => {
  const error = new Error('ps failed')
  await expect(signalOwnedProcessGroup(42, 'SIGTERM', () => {
    throw Object.assign(new Error('kill EPERM'), { code: 'EPERM' })
  }, async () => {
    throw error
  })).rejects.toBe(error)
})

it.each(['42', '42 ?', 'unknown Z'])('目标组状态或进程组编号无效时不能把进程视为已退出 (%s)', (table) => {
  expect(() => hasLiveGroupMembers(table, 42)).toThrow('ps 输出无效')
})

it.skipIf(process.platform !== 'darwin')('真实 macOS 僵尸进程组返回 EPERM 后安全完成收尾', async () => {
  const parent = spawn(process.execPath, ['-e', `
    const { spawn, spawnSync } = require('node:child_process')
    const child = spawn(process.execPath, ['-e', 'console.log("ready");setInterval(() => {}, 1000)'], { detached: true })
    child.stdout.once('data', () => {
      console.log(child.pid)
      spawnSync(process.execPath, ['-e', 'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000)'])
    })
  `])
  const exited = new Promise(resolve => parent.once('exit', resolve))
  let pid
  try {
    pid = await new Promise(resolve => parent.stdout.once('data', data => resolve(Number(String(data)))))
    process.kill(pid, 'SIGTERM')
    await expect.poll(async () => (await execa('ps', ['-p', String(pid), '-o', 'stat='])).stdout.trim(), { timeout: 1500 }).toMatch(/^Z/)
    expect(() => process.kill(-pid, 'SIGTERM')).toThrow(expect.objectContaining({ code: 'EPERM' }))
    await signalOwnedProcessGroup(pid, 'SIGTERM')
  }
  finally {
    if (pid) {
      await signalOwnedProcessGroup(pid, 'SIGKILL')
    }
    await exited
  }
}, 10_000)
