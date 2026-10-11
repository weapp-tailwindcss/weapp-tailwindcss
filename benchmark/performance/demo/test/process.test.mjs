import { expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { run, startProcess } from '../process.mjs'

// Windows 采样器冷准备最多 60 秒，独立于被测进程的超时与清理预算。
const preparedProcessTestTimeout = 70_000

it('超时会结束被测进程，并保留失败原因', async () => {
  const session = await startProcess(process.execPath, ['-e', 'setInterval(()=>{},100)'], { timeout: 100 })
  try {
    await expect(session.complete()).rejects.toThrow('超时')
    expect(performance.now() - session.startedAt).toBeLessThan(5000)
  }
  finally { await session.stop() }
}, preparedProcessTestTimeout)
it('找不到命令正常失败，不产生未处理拒绝', async () => {
  await expect(run('weapp-demo-cost-command-does-not-exist', [], { timeout: 1000 })).rejects.toThrow()
}, preparedProcessTestTimeout)
it('重复停止同一个 watcher 等待同一个清理过程', async () => {
  const session = await startProcess(process.execPath, ['-e', 'setInterval(()=>{},100)'])
  await Promise.all([session.stop(), session.stop()])
  expect(() => session.ensureRunning()).toThrow()
}, preparedProcessTestTimeout)

it('短进程仍保留内存样本，采样器准备时间不混入耗时', async () => {
  const result = await run(process.execPath, ['-e', 'setTimeout(()=>{},150)'])
  expect(result.peakRssMb).toBeGreaterThan(0)
  expect(result.ms).toBeGreaterThanOrEqual(150)
  expect(result.ms).toBeLessThan(5000)
}, preparedProcessTestTimeout)

it('超时结束自己创建的子孙进程，不碰其他进程', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cost-process-'))
  const file = path.join(directory, 'child.json')
  const source = `const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','setInterval(()=>{},100)'],{stdio:'ignore'}); require('node:fs').writeFileSync(process.argv[1],JSON.stringify(child.pid)); setInterval(()=>{},100)`
  try {
    const session = await startProcess(process.execPath, ['-e', source, file], { timeout: 1200 })
    try {
      await expect(session.complete()).rejects.toThrow('超时')
      expect(performance.now() - session.startedAt).toBeLessThan(5000)
    }
    finally { await session.stop() }
    const pid = JSON.parse(await readFile(file, 'utf8'))
    let alive = true
    for (let attempt = 0; attempt < 30 && alive; attempt++) {
      try { process.kill(pid, 0); await delay(100) } catch (error) { if (error.code === 'ESRCH') alive = false; else throw error }
    }
    expect(alive).toBe(false)
    expect(() => process.kill(process.pid, 0)).not.toThrow()
  }
  finally { await rm(directory, { recursive: true, force: true }) }
}, preparedProcessTestTimeout)
