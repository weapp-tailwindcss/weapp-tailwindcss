import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import { createNativeCaptureBudget, NATIVE_CAPTURE_DRAIN_TIMEOUT, NATIVE_CAPTURE_TIMEOUT } from './react-native/capture-budget'
import { publishAfterCapture } from './react-native/capture-cleanup'
import { createRuntimeArtifacts } from './react-native/runtime-artifacts'

it.each(['resolve', 'reject'] as const)('首次清理超时必须随最终归档保留，即使真实操作迟到 %s', async (outcome) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'rn-cleanup-history-'))
  const destination = path.join(workspace, 'archived')
  const session = await createRuntimeArtifacts(destination, { version: 1, runId: 'cleanup-history', target: 'react-native-ios', producer: 'react-native', invocationId: 'unit' })
  const budget = createNativeCaptureBudget(2)
  let release!: () => void
  const lateFailure = new Error('late screenshot stream failed')
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  try {
    const captured = budget.capture(async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      if (outcome === 'reject') {
        throw lateFailure
      }
    }).catch(error => error)
    await vi.advanceTimersByTimeAsync(NATIVE_CAPTURE_TIMEOUT)
    expect(await captured).toEqual(new Error('Native semantic host capture exceeded 10000ms'))
    const firstDrain = budget.drain().catch(error => error)
    await vi.advanceTimersByTimeAsync(NATIVE_CAPTURE_DRAIN_TIMEOUT)
    const firstFailure = await firstDrain
    expect(firstFailure).toEqual(new Error('Native capture cleanup exceeded 5000ms; owned operation is still pending'))
    expect(budget.pending()).toBe(true)
    await expect(budget.capture(async () => {})).rejects.toThrow('already pending')
    const restore = vi.fn(async () => {
      expect(budget.pending()).toBe(false)
    })
    const publishing = publishAfterCapture(session, { drain: () => budget.drain(), capturePending: budget.pending }, restore).catch(error => error)
    await vi.advanceTimersByTimeAsync(100)
    expect(budget.pending()).toBe(true)
    expect(restore).not.toHaveBeenCalled()
    release()
    const finalFailure = await publishing
    if (outcome === 'reject') {
      expect(finalFailure).toBeInstanceOf(AggregateError)
      expect(finalFailure.errors).toHaveLength(2)
      expect(finalFailure.errors[0]).toBe(firstFailure)
      expect(finalFailure.errors[1]).toBe(lateFailure)
      expect(finalFailure.cause).toBe(firstFailure)
    }
    else {
      expect(finalFailure).toBe(firstFailure)
    }
    expect(budget.pending()).toBe(false)
    expect(restore).toHaveBeenCalledOnce()
    const saved = JSON.parse(await fs.readFile(path.join(destination, 'capture-cleanup.json'), 'utf8'))
    expect(saved).toMatchObject({ pending: false, status: 'failed', error: expect.stringContaining(firstFailure.message) })
    if (outcome === 'reject') {
      expect(saved.error).toContain(lateFailure.message)
    }
    expect(vi.getTimerCount()).toBe(0)
  }
  finally {
    release?.()
    vi.useRealTimers()
    await fs.rm(workspace, { recursive: true, force: true })
    await fs.rm(session.directory, { recursive: true, force: true })
  }
})

it.each([false, true])('最终 drain 才结束时先恢复本轮状态再归档，迟到拒绝仍失败：%s', async (lateFailure) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'rn-late-restore-'))
  const destination = path.join(workspace, 'archived')
  const session = await createRuntimeArtifacts(destination, { version: 1, runId: 'restore', target: 'react-native-ios', producer: 'react-native', invocationId: 'unit' })
  let pending = true
  const failure = new Error('late provider failure')
  const restore = vi.fn(async () => {
    expect(pending).toBe(false)
    await fs.writeFile(path.join(session.directory, 'restore.json'), JSON.stringify({ marker: 'baseline', device: 'restored' }))
  })
  const owner = { capturePending: () => pending, drain: async () => {
    pending = false
    if (lateFailure) {
      throw failure
    }
  } }
  try {
    expect(owner.capturePending()).toBe(true)
    const completion = publishAfterCapture(session, owner, restore)
    if (lateFailure) {
      await expect(completion).rejects.toThrow(failure.message)
    }
    else {
      await completion
    }
    expect(restore).toHaveBeenCalledOnce()
    expect(JSON.parse(await fs.readFile(path.join(destination, 'restore.json'), 'utf8'))).toEqual({ marker: 'baseline', device: 'restored' })
    await expect(fs.stat(session.directory)).rejects.toMatchObject({ code: 'ENOENT' })
  }
  finally {
    await fs.rm(workspace, { recursive: true, force: true })
    await fs.rm(session.directory, { recursive: true, force: true })
  }
})

it.each([false, true])('最终收尾的迟到拒绝不能丢失；pending=%s 决定能否归档和删除临时证据', async (pending) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'rn-late-archive-'))
  const destination = path.join(workspace, 'archived')
  const session = await createRuntimeArtifacts(destination, { version: 1, runId: 'late', target: 'react-native-ios', producer: 'react-native', invocationId: 'unit' })
  const failure = new Error('late screenshot close failed')
  const owner = { drain: vi.fn(async () => {
    throw failure
  }), capturePending: () => pending }
  const restore = vi.fn(async () => {})
  try {
    await expect(publishAfterCapture(session, owner, restore)).rejects.toThrow(pending ? '执行与会话收尾均失败' : failure.message)
    expect(owner.drain).toHaveBeenCalledOnce()
    expect(restore).toHaveBeenCalledTimes(pending ? 0 : 1)
    const evidenceRoot = pending ? session.directory : destination
    expect(JSON.parse(await fs.readFile(path.join(evidenceRoot, 'capture-cleanup.json'), 'utf8'))).toMatchObject({ pending, status: 'failed', error: expect.stringContaining(failure.message) })
    await expect(fs.stat(pending ? destination : session.directory)).rejects.toMatchObject({ code: 'ENOENT' })
  }
  finally {
    await fs.rm(workspace, { recursive: true, force: true })
    await fs.rm(session.directory, { recursive: true, force: true })
  }
})

it('keeps live Metro evidence outside the workspace and publishes the complete session after shutdown', async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'rn-workspace-'))
  const destination = path.join(workspace, 'e2e', '.artifacts', 'native')
  const identity = { version: 1 as const, runId: 'runtime-artifacts', target: 'react-native-ios', producer: 'react-native' as const, invocationId: 'a'.repeat(36) }
  const session = await createRuntimeArtifacts(destination, identity)
  try {
    expect(path.relative(workspace, session.directory).split(path.sep)[0]).toBe('..')
    await fs.writeFile(path.join(session.directory, 'metro.log'), 'fresh runtime')
    await fs.writeFile(path.join(session.directory, 'failure.png'), new Uint8Array([1, 2, 3]))
    await expect(fs.access(destination)).rejects.toMatchObject({ code: 'ENOENT' })
    await fs.mkdir(destination, { recursive: true })
    await fs.writeFile(path.join(destination, 'old.png'), 'old')
    await session.publish()
    expect(await fs.readdir(destination)).toEqual(['failure.png', 'metro.log', 'runtime-session.json'])
    expect(JSON.parse(await fs.readFile(path.join(destination, 'runtime-session.json'), 'utf8'))).toEqual(identity)
    expect(await fs.readFile(path.join(destination, 'metro.log'), 'utf8')).toBe('fresh runtime')
    await expect(fs.access(session.directory)).rejects.toMatchObject({ code: 'ENOENT' })
  }
  finally {
    await fs.rm(workspace, { recursive: true, force: true })
    await fs.rm(session.directory, { recursive: true, force: true })
  }
})
