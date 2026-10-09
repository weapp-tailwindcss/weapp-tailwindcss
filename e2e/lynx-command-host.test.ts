import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import { captureNativeHost } from './lynx/native-command-host'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

it('主机诊断只请求进程状态和可执行文件名，记录资源及目标身份', async () => {
  const result = await captureNativeHost(42, new AbortController().signal, {
    file: process.execPath,
    args: ['-e', 'console.log(JSON.stringify(process.argv.slice(1)))', '--'],
  })
  expect(result).toMatchObject({
    observedPid: 42,
    platform: process.platform,
    architecture: process.arch,
    nodeVersion: process.version,
    totalMemory: os.totalmem(),
    parentPid: process.pid,
    processes: { status: 'complete', exitCode: 0 },
  })
  expect(JSON.parse(result.processes.stdout)).toEqual(['-A', '-o', 'pid=,ppid=,state=,pcpu=,rss=,comm='])
  expect(result).not.toHaveProperty('env')
  expect(result.parallelism).toBeGreaterThan(0)
  expect(result.loadAverage).toHaveLength(3)
})

it('主机查询失败保留错误与退出码，不包装成健康状态', async () => {
  const result = await captureNativeHost(42, new AbortController().signal, {
    file: process.execPath,
    args: ['-e', 'console.error("host query failed"); process.exit(7)', '--'],
  })
  expect(result.processes).toMatchObject({ status: 'failed', exitCode: 7, stderr: 'host query failed' })
})

it.each(['timeout', 'cancel'] as const)('主机查询忽略 SIGTERM 时仍通过 %s 回收本轮进程', async (mode) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx-host-'))
  directories.push(directory)
  const marker = path.join(directory, 'pid.json')
  const controller = new AbortController()
  const source = 'process.on("SIGTERM", () => {}); require("node:fs").writeFileSync(process.argv[1], JSON.stringify({ pid: process.pid })); setInterval(() => {}, 1000)'
  const started = performance.now()
  const running = captureNativeHost(42, controller.signal, { file: process.execPath, args: ['-e', source, '--', marker] })
  try {
    await vi.waitFor(async () => expect(JSON.parse(await fs.readFile(marker, 'utf8')).pid).toBeGreaterThan(0), { timeout: 3000, interval: 20 })
    if (mode === 'cancel') {
      controller.abort()
    }
    const result = await running
    expect(result.processes).toMatchObject(mode === 'cancel' ? { status: 'canceled' } : { status: 'failed', timedOut: true })
    expect(performance.now() - started).toBeLessThan(8000)
    const { pid } = JSON.parse(await fs.readFile(marker, 'utf8'))
    expect(() => process.kill(pid, 0)).toThrow()
  }
  finally {
    controller.abort()
    await running
  }
}, 10_000)
