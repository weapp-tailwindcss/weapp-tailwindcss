import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, it, vi } from 'vitest'
import { publishAfterCapture } from './react-native/capture-cleanup'
import { createRuntimeArtifacts } from './react-native/runtime-artifacts'

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
