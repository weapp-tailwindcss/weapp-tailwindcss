import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { runWithCleanup } from '../scripts/e2e-preflight/cleanup'
import { captureNativeDiagnosticCommand, withNativeFailureDiagnostics } from './react-native/failure-capture'
import { captureMetroEvidence } from './react-native/metro-evidence'

let directory: string
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rn-failure-capture-'))
})
afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  await fs.rm(directory, { recursive: true, force: true })
})

it('Metro 读取期间取消后不再保存源文件或继续采集', async () => {
  const source = path.join(directory, 'source.css')
  const output = path.join(directory, 'metro')
  await fs.writeFile(source, 'owned source')
  const owner = new AbortController()
  const failure = new Error('diagnostic owner stopped')
  const readFile = fs.readFile
  vi.spyOn(fs, 'readFile').mockImplementation(async (...args) => {
    const result = await readFile(...args)
    if (args[0] === source) {
      owner.abort(failure)
    }
    return result
  })
  const write = vi.spyOn(fs, 'writeFile')
  await expect(captureMetroEvidence(directory, output, { 'source.css': source }, owner.signal)).rejects.toBe(failure)
  expect(write).not.toHaveBeenCalled()
  expect(await fs.readdir(output)).toEqual([])
})

it('日志和备用截图共享总截止时间，超时后保留首错并继续会话清理', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  const first = new Error('Native pair requires two consecutive passing frames')
  const closed: string[] = []
  const filename = path.join(directory, 'diagnostic.json')
  let signal: AbortSignal | undefined
  const outcome = runWithCleanup(async () => {
    throw first
  }, () => runWithCleanup(async () => {
    await withNativeFailureDiagnostics(filename, async (owner) => {
      signal = owner.signal
      await owner.step('device-log', () => new Promise<void>(resolve => setTimeout(resolve, 60)))
      await owner.step('failure-screenshot', () => new Promise<void>((_resolve, reject) => {
        owner.signal.addEventListener('abort', () => {
          closed.push('screenshot-settled')
          reject(owner.signal.reason)
        }, { once: true })
      }))
    }, 100)
  }, async () => { closed.push('run', 'metro', 'reporter', 'publish') })).catch(error => error)
  await vi.advanceTimersByTimeAsync(60)
  expect(signal?.aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(40)
  const error = await outcome
  expect(signal?.aborted).toBe(true)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.cause).toBe(first)
  expect(error.errors[0]).toBe(first)
  expect(closed).toEqual(['screenshot-settled', 'run', 'metro', 'reporter', 'publish'])
  const report = JSON.parse(await fs.readFile(filename, 'utf8'))
  expect(report).toMatchObject({ status: 'failed', cancelled: true, timeoutMs: 100, elapsedMs: 100 })
  expect(report.spans).toMatchObject([
    { name: 'device-log', startedAtMs: 0, settledAtMs: 60 },
    { name: 'failure-screenshot', startedAtMs: 60, settledAtMs: 100 },
  ])
})

it('同步工作使定时器迟到时仍拒绝超时诊断，不再启动备用截图', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  let now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const screenshot = vi.fn()
  await expect(withNativeFailureDiagnostics(path.join(directory, 'late.json'), async (owner) => {
    await owner.step('device-log', async () => {
      now = 101
    })
    await owner.step('failure-screenshot', screenshot)
  }, 100)).rejects.toThrow('exceeded 100ms')
  expect(screenshot).not.toHaveBeenCalled()
  expect(JSON.parse(await fs.readFile(path.join(directory, 'late.json'), 'utf8'))).toMatchObject({ status: 'failed', cancelled: true })
})

it('取消真实自有子进程后等待关闭并保留部分 stdout 和 stderr', async () => {
  let pid: number | undefined
  let settled = false
  const filename = path.join(directory, 'child.json')
  const stdout = path.join(directory, 'child.stdout.log')
  const stderr = path.join(directory, 'child.stderr.log')
  const outcome = withNativeFailureDiagnostics(filename, async (owner) => {
    await owner.step('device-log', async () => {
      const command = captureNativeDiagnosticCommand(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); process.stdout.write("ready\\n"); process.stderr.write("partial error\\n"); setInterval(() => {}, 1000)'], { signal: owner.signal, stdout, stderr })
      pid = command.pid
      try {
        await command
      }
      finally { settled = true }
    })
  }, 5_000).catch(error => error)
  const error = await outcome
  expect(error).toBeInstanceOf(Error)
  expect(await fs.readFile(stdout, 'utf8')).toBe('ready\n')
  expect(await fs.readFile(stderr, 'utf8')).toBe('partial error\n')
  expect(settled).toBe(true)
  expect(pid).toBeTypeOf('number')
  expect(() => process.kill(pid!, 0)).toThrow()
  expect(JSON.parse(await fs.readFile(filename, 'utf8'))).toMatchObject({ status: 'failed', cancelled: true })
})
