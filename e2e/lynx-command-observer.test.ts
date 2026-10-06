import type { ChildProcess } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { PassThrough } from 'node:stream'
import { execa } from 'execa'
import { afterEach, expect, it, vi } from 'vitest'
import { observeNativeCommand, sampleNativeProcess } from './lynx/native-command-observer'

const directories: string[] = []
afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

async function artifact() {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx-observer-'))
  directories.push(cwd)
  return path.join(cwd, 'command.json')
}

function fakeChild() {
  return Object.assign(new EventEmitter(), {
    pid: 123,
    exitCode: null,
    signalCode: null,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  }) as unknown as ChildProcess
}

it('快速退出或未成功 spawn 时不采样，完成后释放监听与定时器', async () => {
  const file = await artifact()
  vi.useFakeTimers()
  for (const spawned of [false, true]) {
    const child = fakeChild()
    const sampleProcess = vi.fn()
    const finish = observeNativeCommand(child, file, { sampleAfterMs: 10, sampleProcess })
    if (spawned) {
      child.emit('spawn')
      child.emit('exit', 0, null)
    }
    await vi.advanceTimersByTimeAsync(20)
    child.emit('close', 0, null)
    await finish('success')
    expect(sampleProcess).not.toHaveBeenCalled()
    expect(child.eventNames()).toEqual([])
    expect(child.stdout!.listenerCount('data')).toBe(0)
    expect(child.stderr!.listenerCount('data')).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  }
})

it('exit 后仍采集晚到输出与 close，双流字节边界保留完整中文字符', async () => {
  const file = await artifact()
  const child = fakeChild()
  const finish = observeNativeCommand(child, file)
  child.emit('spawn')
  const text = Buffer.from('中'.repeat(6000))
  child.stdout!.emit('data', text.subarray(0, 1))
  child.emit('exit', 0, null)
  child.stdout!.emit('data', text.subarray(1))
  child.stderr!.emit('data', text)
  child.emit('close', 0, null)
  await finish('success')
  const report = JSON.parse(await fs.readFile(file, 'utf8'))
  for (const stream of [report.stdout, report.stderr]) {
    expect(stream).toMatchObject({ bytes: text.length, truncated: true })
    expect(Buffer.byteLength(stream.text)).toBeLessThanOrEqual(16 * 1024)
    expect(stream.text).toBe('中'.repeat(Math.floor(16 * 1024 / 3)))
  }
  expect(report.events.map((event: { name: string }) => event.name)).toEqual(['spawn', 'stdout', 'exit', 'stderr', 'close', 'settled'])
})

it('真实进程只采样一次，退出时取消未完成采样并等待清理', async () => {
  const file = await artifact()
  const child = execa(process.execPath, ['-e', 'process.stdin.once("data", () => process.exit(0)); setInterval(() => {}, 1000)'], { timeout: 5000 })
  let started!: () => void
  const samplingStarted = new Promise<void>((resolve) => {
    started = resolve
  })
  let canceled = false
  const sampleProcess = vi.fn(async (pid: number, signal: AbortSignal) => {
    expect(pid).toBe(child.pid)
    started()
    return new Promise<{ status: string }>((resolve) => {
      signal.addEventListener('abort', () => {
        canceled = true
        resolve({ status: 'canceled' })
      }, { once: true })
    })
  })
  const finish = observeNativeCommand(child, file, { sampleAfterMs: 25, sampleProcess })
  try {
    await samplingStarted
    child.stdin!.end('exit')
    await child
    await finish('success')
    expect(canceled).toBe(true)
    expect(sampleProcess).toHaveBeenCalledTimes(1)
    const report = JSON.parse(await fs.readFile(file, 'utf8'))
    expect(report.sample.status).toBe('canceled')
    expect(report.events).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'sample-start', pid: child.pid })]))
  }
  finally {
    child.kill('SIGKILL')
    await child.catch(() => {})
  }
})

it('采样失败不会覆盖原命令成功，也不会形成未处理拒绝', async () => {
  const file = await artifact()
  vi.useFakeTimers()
  const child = fakeChild()
  const sampleProcess = vi.fn().mockRejectedValue(new Error('sample unavailable'))
  const finish = observeNativeCommand(child, file, { sampleAfterMs: 10, sampleProcess })
  child.emit('spawn')
  await vi.advanceTimersByTimeAsync(20)
  child.emit('exit', 0, null)
  child.emit('close', 0, null)
  await finish('success')
  expect(JSON.parse(await fs.readFile(file, 'utf8'))).toMatchObject({ outcome: 'success', sample: { status: 'failed', stderr: 'sample unavailable' } })
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['timeout', 'cancel'] as const)('采样替身忽略 SIGTERM 时仍通过 %s 强制回收，只写指定证据', async (mode) => {
  const file = await artifact()
  const controller = new AbortController()
  const source = 'process.on("SIGTERM", () => {}); require("node:fs").writeFileSync(process.argv.at(-1), JSON.stringify({ pid: process.pid, args: process.argv.slice(1) })); setInterval(() => {}, 1000)'
  const started = performance.now()
  const running = sampleNativeProcess(42, controller.signal, file, { file: process.execPath, args: ['-e', source, '--'] })
  try {
    await vi.waitFor(async () => {
      expect(JSON.parse(await fs.readFile(file, 'utf8')).args).toEqual(['42', '2', '10', '-file', file])
    }, { timeout: 3000, interval: 20 })
    if (mode === 'cancel') {
      controller.abort()
    }
    const result = await running
    expect(result).toMatchObject(mode === 'cancel' ? { status: 'canceled' } : { status: 'failed', timedOut: true })
    expect(performance.now() - started).toBeLessThan(8000)
    const { pid } = JSON.parse(await fs.readFile(file, 'utf8'))
    expect(() => process.kill(pid, 0)).toThrow()
  }
  finally {
    controller.abort()
    await running
  }
}, 10_000)
