import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { publishAfterCapture } from './react-native/capture-cleanup'
import { syntheticRuntimeInstallation } from './react-native/installation-fixture'
import { awaitIosContextRequest, createIosContextRequestPublisher } from './react-native/ios-context-request'
import { createIosLaunchPublication } from './react-native/ios-launch-publication'
import { headers, pair, withReporter } from './react-native/reporter-fixture'

const identity = { runId: 'owned-run', invocationId: 'owned-invocation', device: 'owned-device', bundleId: 'com.weapptailwindcss.rncompat' }
let directory: string
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rn-ios-context-'))
})
afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  await fs.rm(directory, { recursive: true, force: true })
})

it('认证后的并发 context 只发布一次事件，CLI 未完成仍不能取得 context', async () => {
  const publisher = createIosContextRequestPublisher(directory, identity)
  const rename = vi.spyOn(fs, 'rename')
  const read = vi.fn(async () => syntheticRuntimeInstallation().publication)
  const launch = createIosLaunchPublication(read)
  let release!: () => void
  launch.bind(new Promise<void>(resolve => release = resolve))
  await withReporter(async ({ endpoint, reporter, post }) => {
    expect((await fetch(`${endpoint}/context`, { headers: { 'x-rn-e2e-client': 'wrong-client' } })).status).toBe(401)
    expect(await fs.readdir(directory)).toEqual([])
    let responses = 0
    const requested = () => {
      responses++
    }
    const first = fetch(`${endpoint}/context`, { headers })
    const second = fetch(`${endpoint}/context`, { headers })
    void first.then(requested)
    void second.then(requested)
    try {
      await awaitIosContextRequest(directory, identity, new AbortController().signal, () => {})
      await new Promise(resolve => setImmediate(resolve))
      expect(responses).toBe(0)
      expect(read).not.toHaveBeenCalled()
      expect(rename).toHaveBeenCalledOnce()
      expect(reporter.captureElapsed()).toBe(0)
    }
    finally {
      release()
    }
    expect((await first).status).toBe(200)
    expect((await second).status).toBe(200)
    expect((await post('/case', pair())).status).toBe(200)
    reporter.setRevision('next-phase')
    expect((await fetch(`${endpoint}/context`, { headers })).status).toBe(425)
    expect(rename).toHaveBeenCalledOnce()
  }, async (signal) => {
    await publisher.publish(signal)
    return launch.read(signal)
  })
  await publisher.drain()
  expect(publisher.pending()).toBe(false)
  expect(await fs.readdir(directory)).toEqual(['context-requested.json'])
})

it('首个 HTTP 请求断开不取消任务 owner，后续请求复用同一次事件写入', async () => {
  const publisher = createIosContextRequestPublisher(directory, identity)
  const launch = createIosLaunchPublication(async () => syntheticRuntimeInstallation().publication)
  let finishLaunch!: () => void
  launch.bind(new Promise<void>(resolve => finishLaunch = resolve))
  let entered!: () => void
  const started = new Promise<void>(resolve => entered = resolve)
  let finishWrite!: () => void
  const held = new Promise<void>(resolve => finishWrite = resolve)
  const writeFile = fs.writeFile
  const write = vi.spyOn(fs, 'writeFile').mockImplementation(async (...args) => {
    await writeFile(...args)
    entered()
    await held
  })
  await withReporter(async ({ endpoint }) => {
    const request = new AbortController()
    const first = fetch(`${endpoint}/context`, { headers, signal: request.signal }).catch(error => error)
    try {
      await started
      request.abort()
      expect(await first).toMatchObject({ name: 'AbortError' })
      const second = fetch(`${endpoint}/context`, { headers })
      finishWrite()
      await awaitIosContextRequest(directory, identity, new AbortController().signal, () => {})
      finishLaunch()
      expect((await second).status).toBe(200)
      expect(write).toHaveBeenCalledOnce()
    }
    finally {
      finishWrite()
      finishLaunch()
    }
  }, async (signal) => {
    await publisher.publish(signal)
    return launch.read(signal)
  })
  await publisher.drain()
})

it.each(['version', 'runId', 'invocationId', 'device', 'bundleId', 'kind', 'evidence'])('已有事件的%s身份不符立即失败', async (key) => {
  const event = { version: 1, evidence: 'diagnostic-only', kind: 'authenticated-context-request', ...identity, [key]: 'another-owner' }
  await fs.writeFile(path.join(directory, 'context-requested.json'), JSON.stringify(event))
  await expect(awaitIosContextRequest(directory, identity, new AbortController().signal, () => {})).rejects.toThrow('mismatched runtime identity')
})

it('已有事件损坏不能作为尚未请求而轮询', async () => {
  await fs.writeFile(path.join(directory, 'context-requested.json'), '{broken')
  await expect(awaitIosContextRequest(directory, identity, new AbortController().signal, () => {})).rejects.toThrow(SyntaxError)
})

it('等待请求耗尽原启动截止时间后不刷新预算', async () => {
  const failure = new Error('original startup deadline')
  let checks = 0
  await expect(awaitIosContextRequest(directory, identity, new AbortController().signal, () => {
    if (++checks === 2) {
      throw failure
    }
  })).rejects.toBe(failure)
  expect(checks).toBe(2)
})

it('owner 取消无请求的等待时保留原取消原因', async () => {
  const owner = new AbortController()
  const failure = new Error('startup stopped')
  const wait = awaitIosContextRequest(directory, identity, owner.signal, () => owner.signal.throwIfAborted())
  const result = wait.catch(error => error)
  owner.abort(failure)
  const error = await result
  expect(error === failure || error.cause === failure).toBe(true)
})

it.each(['write', 'rename'] as const)('取消%s后 drain 等待真实写入结束，不迟到发布新事件', async (stage) => {
  const publisher = createIosContextRequestPublisher(directory, identity)
  const owner = new AbortController()
  const failure = new Error(`owner stopped during ${stage}`)
  let entered!: () => void
  const started = new Promise<void>(resolve => entered = resolve)
  let release!: () => void
  const held = new Promise<void>(resolve => release = resolve)
  const original = fs[stage === 'write' ? 'writeFile' : 'rename']
  if (stage === 'write') {
    vi.spyOn(fs, 'writeFile').mockImplementation(async (...args) => {
      await (original as typeof fs.writeFile)(...args)
      entered()
      await held
    })
  }
  else {
    vi.spyOn(fs, 'rename').mockImplementation(async (...args) => {
      await (original as typeof fs.rename)(...args)
      entered()
      await held
    })
  }
  const work = publisher.publish(owner.signal).catch(error => error)
  await started
  owner.abort(failure)
  let drained = false
  const drain = publisher.drain().finally(() => {
    drained = true
  }).catch(error => error)
  await new Promise(resolve => setImmediate(resolve))
  expect(drained).toBe(false)
  expect(publisher.pending()).toBe(true)
  release()
  expect(await work).toBe(failure)
  expect(await drain).toBe(failure)
  expect(publisher.pending()).toBe(false)
  expect(await fs.readdir(directory)).toEqual([])
})

it('写入卡住时五秒 drain 失败并保留原目录，迟到结束不能改写期限失败', async () => {
  vi.useFakeTimers()
  const publisher = createIosContextRequestPublisher(directory, identity)
  const owner = new AbortController()
  let entered!: () => void
  const started = new Promise<void>(resolve => entered = resolve)
  let release!: () => void
  const held = new Promise<void>(resolve => release = resolve)
  const writeFile = fs.writeFile
  vi.spyOn(fs, 'writeFile').mockImplementation(async (...args) => {
    await writeFile(...args)
    if (path.basename(String(args[0])) === 'context-requested.pending.json') {
      entered()
      await held
    }
  })
  const work = publisher.publish(owner.signal).catch(error => error)
  await started
  const drain = publisher.drain().catch(error => error)
  await vi.advanceTimersByTimeAsync(5_000)
  expect(await drain).toMatchObject({ message: 'iOS context request cleanup exceeded 5000ms' })
  expect(publisher.pending()).toBe(true)
  const publish = vi.fn()
  await expect(publishAfterCapture({ directory, publish }, { drain: publisher.drain, capturePending: publisher.pending })).rejects.toThrow()
  expect(publish).not.toHaveBeenCalled()
  owner.abort(new Error('owner closed after cleanup deadline'))
  release()
  await work
  expect(publisher.pending()).toBe(false)
  await expect(publisher.drain()).rejects.toThrow('failed after exceeding its cleanup deadline')
  expect(await fs.readdir(directory)).toEqual(['capture-cleanup.json'])
})

it('写入失败保留首错并清理临时事件，不允许后续请求重新发布', async () => {
  const publisher = createIosContextRequestPublisher(directory, identity)
  const failure = new Error('marker disk write failed')
  const write = vi.spyOn(fs, 'writeFile').mockRejectedValue(failure)
  const signal = new AbortController().signal
  await expect(publisher.publish(signal)).rejects.toBe(failure)
  await expect(publisher.publish(signal)).rejects.toBe(failure)
  await expect(publisher.drain()).rejects.toBe(failure)
  expect(write).toHaveBeenCalledOnce()
  expect(await fs.readdir(directory)).toEqual([])
})
