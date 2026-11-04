import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PNG } from 'pngjs'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { syntheticRuntimeInstallation } from './react-native/installation-fixture'
import { awaitIosCaptureReadiness } from './react-native/ios-capture-readiness'
import { createIosLaunchPublication } from './react-native/ios-launch-publication'
import { headers, pair, withReporter } from './react-native/reporter-fixture'

let directory: string
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rn-ios-readiness-'))
})
afterEach(async () => {
  vi.restoreAllMocks()
  await fs.rm(directory, { recursive: true, force: true })
})

function options(capture: (filename: string, signal: AbortSignal) => Promise<unknown>, overrides: Partial<Parameters<typeof awaitIosCaptureReadiness>[0]> = {}) {
  return {
    directory: path.join(directory, 'ios-capture-startup'),
    runId: 'owned-run',
    invocationId: 'owned-invocation',
    device: 'owned-device',
    bundleId: 'com.weapptailwindcss.rncompat',
    startupDeadline: Date.now() + 25_000,
    signal: new AbortController().signal,
    capture,
    ...overrides,
  }
}

function png(width = 16) {
  return PNG.sync.write(new PNG({ width, height: 16 }))
}

async function diagnostic() {
  return JSON.parse(await fs.readFile(path.join(directory, 'ios-capture-startup', 'readiness.json'), 'utf8'))
}

it('冷截图加同步解码越过10s时只重试就绪探测，后续必须在完整窗口内连续完成双帧', async () => {
  let elapsed = 0
  let captures = 0
  const decode = PNG.sync.read
  vi.spyOn(performance, 'now').mockImplementation(() => elapsed)
  vi.spyOn(PNG.sync, 'read').mockImplementation((...args) => {
    const result = decode(...args)
    elapsed += captures === 1 ? 2395 : 100
    return result
  })
  await fs.writeFile(path.join(directory, 'ios-screenshots.json'), 'parent-owned')
  const capture = vi.fn(async (filename: string) => {
    captures++
    elapsed += captures === 1 ? 9100 : 500
    await fs.writeFile(filename, png())
  })
  await awaitIosCaptureReadiness(options(capture))
  const report = await diagnostic()
  expect(report).toMatchObject({ evidence: 'diagnostic-only', status: 'ready', timeoutMs: 10_000, runId: 'owned-run', invocationId: 'owned-invocation' })
  expect(report.attempts.map((attempt: { status: string }) => attempt.status)).toEqual(['window-exhausted', 'ready'])
  expect(report.attempts[0].frames).toHaveLength(1)
  expect(report.attempts[0].frames[0].decodedAtMs).toBe(11_495)
  expect(report.attempts[1].frames).toHaveLength(2)
  expect(capture).toHaveBeenCalledTimes(3)
  expect(await fs.readFile(path.join(directory, 'ios-screenshots.json'), 'utf8')).toBe('parent-owned')
  expect((await fs.readdir(directory)).some(name => name.startsWith('case-'))).toBe(false)
})

it('反复窗口耗尽不刷新原生启动截止时间', async () => {
  let elapsed = 0
  vi.spyOn(performance, 'now').mockImplementation(() => elapsed)
  const decode = PNG.sync.read
  vi.spyOn(PNG.sync, 'read').mockImplementation((...args) => {
    const result = decode(...args)
    elapsed += 2395
    return result
  })
  const capture = vi.fn(async (filename: string) => {
    elapsed += 9100
    await fs.writeFile(filename, png())
  })
  await expect(awaitIosCaptureReadiness(options(capture, { startupDeadline: Date.now() + 20_000 }))).rejects.toThrow('existing native startup deadline')
  expect(capture).toHaveBeenCalledTimes(2)
  expect((await diagnostic()).status).toBe('failed')
})

it('取消在途截图后等待真实结束，不开始下一轮或迟到发布就绪', async () => {
  const owner = new AbortController()
  let entered!: () => void
  const pending = new Promise<void>(resolve => entered = resolve)
  let settled = false
  const capture = vi.fn((_filename: string, signal: AbortSignal) => new Promise<void>((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      settled = true
      reject(signal.reason)
    }, { once: true })
    entered()
  }))
  const work = awaitIosCaptureReadiness(options(capture, { signal: owner.signal })).catch(error => error)
  await pending
  const failure = new Error('startup owner stopped')
  owner.abort(failure)
  expect(await work).toBe(failure)
  expect(settled).toBe(true)
  expect(capture).toHaveBeenCalledOnce()
  expect(await diagnostic()).toMatchObject({ status: 'failed', attempts: [{ status: 'failed' }] })
})

it.each(['cancel', 'deadline'] as const)('最终诊断写入期间停止启动仍拒绝发布就绪：%s', async (kind) => {
  const owner = new AbortController()
  const failure = new Error('startup stopped during persistence')
  let now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const writeFile = fs.writeFile
  vi.spyOn(fs, 'writeFile').mockImplementation(async (...args) => {
    await writeFile(...args)
    if (path.basename(String(args[0])) === 'readiness.json') {
      if (kind === 'cancel') {
        owner.abort(failure)
      }
      else { now = 30_000 }
    }
  })
  const launch = createIosLaunchPublication(async () => syntheticRuntimeInstallation().publication)
  launch.bind(awaitIosCaptureReadiness(options(filename => fs.writeFile(filename, png()), { signal: owner.signal })))
  await expect(launch.ready).rejects.toThrow(kind === 'cancel' ? failure.message : 'existing native startup deadline')
  expect((await diagnostic()).status).toBe('failed')
})

it.each(['command', 'png', 'dimensions'] as const)('设备或PNG错误立即失败：%s', async (kind) => {
  const failure = new Error('simulator disappeared')
  let captures = 0
  const capture = vi.fn(async (filename: string) => {
    captures++
    if (kind === 'command') {
      throw failure
    }
    await fs.writeFile(filename, kind === 'png' ? 'broken-png' : png(captures === 1 ? 16 : 32))
  })
  await expect(awaitIosCaptureReadiness(options(capture))).rejects.toThrow(kind === 'command' ? failure.message : kind === 'dimensions' ? 'inconsistent PNG dimensions' : /signature|Unexpected end|unrecognised/i)
  expect(capture).toHaveBeenCalledTimes(kind === 'dimensions' ? 2 : 1)
  expect((await diagnostic()).attempts).toHaveLength(1)
})

it.each(['../escape', 'C:\\escape', '/root', undefined])('身份不能冒用文件系统路径：%s', async (runId) => {
  const capture = vi.fn()
  await expect(awaitIosCaptureReadiness(options(capture, { runId: runId as string }))).rejects.toThrow('invalid runtime identity')
  expect(capture).not.toHaveBeenCalled()
})

it('启动CLI等待就绪期间不授予context、不消耗真实用例预算', async () => {
  const publication = syntheticRuntimeInstallation().publication
  const launch = createIosLaunchPublication(async () => publication)
  let release!: () => void
  const blocked = new Promise<void>(resolve => release = resolve)
  let entered!: () => void
  const started = new Promise<void>(resolve => entered = resolve)
  const startupCapture = vi.fn(async (filename: string) => {
    entered()
    await blocked
    await fs.writeFile(filename, png())
  })
  launch.bind(awaitIosCaptureReadiness(options(startupCapture)))
  await withReporter(async ({ endpoint, reporter, capture, post }) => {
    const context = fetch(`${endpoint}/context`, { headers })
    await started
    expect((await post('/case', pair())).status).toBe(409)
    expect(reporter.captureElapsed()).toBe(0)
    expect(capture).not.toHaveBeenCalled()
    release()
    await launch.ready
    expect((await context).status).toBe(200)
    expect((await post('/case', pair())).status).toBe(200)
    expect(startupCapture).toHaveBeenCalledTimes(2)
    expect(capture).toHaveBeenCalledOnce()
  }, signal => launch.read(signal))
})
