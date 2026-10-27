import type { IosHostLogSource } from './lynx/ios-host-log-source'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { collectIosLaunchHostLogs, iosHostLogLimits } from './lynx/ios-launch-host-logs'

const roots: string[] = []
const device = { platform: 'ios' as const, id: 'selected', name: '设备', runtime: 'runtime', destination: 'id=selected', state: 'Booted' as const }

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx-host-log-'))
  roots.push(root)
  const logPath = path.join(root, device.id)
  const artifactDir = path.join(root, 'artifacts')
  await fs.mkdir(artifactDir)
  await fs.mkdir(logPath)
  const source: IosHostLogSource = { status: 'bound', logPath, deviceId: device.id, runtime: device.runtime, runId: '123', runAttempt: '2', sha: 'a'.repeat(40), inventorySha256: 'b'.repeat(64) }
  const output = path.join(artifactDir, 'ios-launch-host-logs')
  return { root, logPath, artifactDir, source, output, manifest: async () => JSON.parse(await fs.readFile(path.join(output, 'collection.json'), 'utf8')) }
}

it('只导出原始尾部，二进制字节不经过文本解码，SHA明确属于尾部', async () => {
  const f = await fixture()
  const bytes = Buffer.alloc(iosHostLogLimits.fileBytes + 47, 255)
  bytes[bytes.length - 1] = 0
  await fs.writeFile(path.join(f.logPath, 'actual-file'), bytes)
  await collectIosLaunchHostLogs(f.artifactDir, device, f.source)
  const manifest = await f.manifest()
  const record = manifest.files[0]
  const tail = bytes.subarray(47)
  expect(await fs.readFile(path.join(f.output, record.output))).toEqual(tail)
  expect(record).toMatchObject({ status: 'copied', offset: 47, byteLength: tail.length, truncated: true, tailSha256: createHash('sha256').update(tail).digest('hex'), changedDuringRead: false })
  expect(record).not.toHaveProperty('sha256')
  expect(manifest.acceptance).toBe('diagnostic-only')
})

it('非递归枚举有上限，总导出字节不会因日志文件巨大而增长', async () => {
  const f = await fixture()
  await Promise.all(Array.from({ length: 7 }, (_, i) => fs.writeFile(path.join(f.logPath, `large-${i}`), Buffer.alloc(iosHostLogLimits.fileBytes + 1, i))))
  await collectIosLaunchHostLogs(f.artifactDir, device, f.source)
  const manifest = await f.manifest()
  expect(manifest.copiedBytes).toBe(iosHostLogLimits.totalBytes)
  expect(manifest.files.filter((file: { status: string }) => file.status === 'copied')).toHaveLength(4)
  expect(manifest.files.filter((file: { status: string }) => file.status === 'skipped')).toHaveLength(3)
})

it('文件数及目录项分别受限，不递归子目录', async () => {
  const f = await fixture()
  await Promise.all(Array.from({ length: iosHostLogLimits.entries + 3 }, (_, i) => fs.writeFile(path.join(f.logPath, `file-${i}`), 'x')))
  await collectIosLaunchHostLogs(f.artifactDir, device, f.source)
  const manifest = await f.manifest()
  expect(manifest.enumerated).toBe(iosHostLogLimits.entries)
  expect(manifest.entriesTruncated).toBe(true)
  expect(manifest.files.filter((file: { status: string }) => file.status === 'copied')).toHaveLength(iosHostLogLimits.files)
})

it.each(['absent', 'unavailable', 'missing', 'empty'])('缺少可用日志（%s）如实记录，不能推断服务端正常', async (kind) => {
  const f = await fixture()
  if (kind === 'missing') {
    await fs.rmdir(f.logPath)
  }
  const source = kind === 'absent' ? undefined : kind === 'unavailable' ? { status: 'unavailable' as const, reason: '库存未提供' } : f.source
  await collectIosLaunchHostLogs(f.artifactDir, device, source)
  const manifest = await f.manifest()
  expect(manifest.files).toEqual([])
  expect(manifest.status).toBe(kind === 'empty' ? 'collected' : 'unavailable')
})

it('设备身份不匹配时拒绝读取目录，仍保存诊断错误', async () => {
  const f = await fixture()
  const open = vi.spyOn(fs, 'opendir')
  await expect(collectIosLaunchHostLogs(f.artifactDir, { ...device, id: 'other' }, f.source)).rejects.toThrow(AggregateError)
  expect(open).not.toHaveBeenCalled()
  expect((await f.manifest()).reason).toContain('身份')
})

it('叶子和根目录的链接均不跟随，也不递归子目录', async () => {
  const f = await fixture()
  const outside = path.join(f.root, 'outside')
  await fs.mkdir(outside)
  await fs.writeFile(path.join(outside, 'secret'), 'outside bytes')
  await fs.symlink(outside, path.join(f.logPath, 'linked'), 'junction')
  await fs.mkdir(path.join(f.logPath, 'nested'))
  await collectIosLaunchHostLogs(f.artifactDir, device, f.source)
  expect((await f.manifest()).files.every((file: { status: string }) => file.status === 'skipped')).toBe(true)
  const other = path.join(f.root, 'second-artifacts')
  await fs.mkdir(other)
  await fs.rmdir(path.join(f.logPath, 'nested'))
  await fs.unlink(path.join(f.logPath, 'linked'))
  await fs.rmdir(f.logPath)
  await fs.symlink(outside, f.logPath, 'junction')
  await collectIosLaunchHostLogs(other, device, f.source)
  const manifest = JSON.parse(await fs.readFile(path.join(other, 'ios-launch-host-logs', 'collection.json'), 'utf8'))
  expect(manifest.status).toBe('unavailable')
  expect(manifest.files).toEqual([])
})

it('部分文件权限错误不阻止其他导出，原错误对象独立保留', async () => {
  const f = await fixture()
  await fs.writeFile(path.join(f.logPath, 'denied'), 'denied')
  await fs.writeFile(path.join(f.logPath, 'good'), 'good')
  const open = fs.open.bind(fs)
  const failure = Object.assign(new Error('permission denied'), { code: 'EACCES' })
  vi.spyOn(fs, 'open').mockImplementation(async (file, flags, mode) => {
    if (path.basename(String(file)) === 'denied') {
      throw failure
    }
    return open(file, flags, mode)
  })
  const error = await collectIosLaunchHostLogs(f.artifactDir, device, f.source).catch(caught => caught)
  expect(error.errors[0]).toBe(failure)
  const manifest = await f.manifest()
  expect(manifest.files.filter((file: { status: string }) => file.status === 'copied')).toHaveLength(1)
  expect(manifest.files.filter((file: { status: string }) => file.status === 'failed')).toHaveLength(1)
})

it('打开前文件轮换时拒绝把新文件冒充已检查文件', async () => {
  const f = await fixture()
  const file = path.join(f.logPath, 'rotated')
  await fs.writeFile(file, 'original')
  const open = fs.open.bind(fs)
  vi.spyOn(fs, 'open').mockImplementation(async (candidate, flags, mode) => {
    await fs.rename(file, path.join(f.root, 'old-log'))
    await fs.writeFile(file, 'replacement')
    return open(candidate, flags, mode)
  })
  await expect(collectIosLaunchHostLogs(f.artifactDir, device, f.source)).rejects.toThrow(AggregateError)
  expect((await f.manifest()).files[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('描述符') })
})

it('读取和关闭同时失败时，两个原始错误对象按顺序保留', async () => {
  const f = await fixture()
  await fs.writeFile(path.join(f.logPath, 'log'), 'bytes')
  const operationFailure = new Error('original read error')
  const closeFailure = new Error('close error')
  const open = fs.open.bind(fs)
  vi.spyOn(fs, 'open').mockImplementation(async (file, flags, mode) => {
    const handle = await open(file, flags, mode)
    const close = handle.close.bind(handle)
    vi.spyOn(handle, 'read').mockRejectedValue(operationFailure)
    vi.spyOn(handle, 'close').mockImplementation(async () => {
      await close()
      throw closeFailure
    })
    return handle
  })
  const error = await collectIosLaunchHostLogs(f.artifactDir, device, f.source).catch(caught => caught)
  expect(error.errors[0].errors).toEqual([operationFailure, closeFailure])
  expect((await f.manifest()).status).toBe('partial')
})

it('导出写入全部失败时仍按请求读取量扣减总预算', async () => {
  const f = await fixture()
  await Promise.all(Array.from({ length: 7 }, (_, i) => fs.writeFile(path.join(f.logPath, `log-${i}`), Buffer.alloc(iosHostLogLimits.fileBytes))))
  const write = fs.writeFile.bind(fs)
  vi.spyOn(fs, 'writeFile').mockImplementation(async (file, data, options) => {
    if (String(file).endsWith('.bin')) {
      throw new Error('output denied')
    }
    return write(file, data, options)
  })
  await expect(collectIosLaunchHostLogs(f.artifactDir, device, f.source)).rejects.toThrow(AggregateError)
  const manifest = await f.manifest()
  expect(manifest).toMatchObject({ requestedReadBytes: iosHostLogLimits.totalBytes, actualReadBytes: iosHostLogLimits.totalBytes, copiedBytes: 0 })
  expect(manifest.files.filter((file: { status: string }) => file.status === 'failed')).toHaveLength(4)
})

it('枚举时目录已被替换即停止，不能导出替代目录内容', async () => {
  const f = await fixture()
  await fs.writeFile(path.join(f.logPath, 'original'), 'original')
  const opendir = fs.opendir.bind(fs)
  vi.spyOn(fs, 'opendir').mockImplementation(async (file, options) => {
    await fs.rename(f.logPath, path.join(f.root, 'previous-directory'))
    await fs.mkdir(f.logPath)
    await fs.writeFile(path.join(f.logPath, 'replacement'), 'unowned bytes')
    return opendir(file, options)
  })
  const open = vi.spyOn(fs, 'open')
  await expect(collectIosLaunchHostLogs(f.artifactDir, device, f.source)).rejects.toThrow(AggregateError)
  expect(open).not.toHaveBeenCalled()
  expect((await f.manifest()).reason).toContain('目录已被替换')
})

it('读取期间缩短的文件保留真实短读与前后尺寸，不伪造完整尾部', async () => {
  const f = await fixture()
  const file = path.join(f.logPath, 'log')
  await fs.writeFile(file, Buffer.alloc(iosHostLogLimits.fileBytes + 1, 7))
  const open = fs.open.bind(fs)
  vi.spyOn(fs, 'open').mockImplementation(async (candidate, flags, mode) => {
    const handle = await open(candidate, flags, mode)
    const read = handle.read.bind(handle)
    vi.spyOn(handle, 'read').mockImplementation(async (...args: Parameters<typeof read>) => {
      await fs.truncate(file, 1)
      return read(...args)
    })
    return handle
  })
  await collectIosLaunchHostLogs(f.artifactDir, device, f.source)
  const record = (await f.manifest()).files[0]
  expect(record).toMatchObject({ byteLength: 0, truncated: true, changedDuringRead: true, opened: { size: iosHostLogLimits.fileBytes + 1 }, after: { size: 1 } })
})

it('目录读取与关闭同时拒绝时也保留两者，关闭实际目录句柄', async () => {
  const f = await fixture()
  const original = new Error('directory read error')
  const closing = new Error('directory close error')
  const opendir = fs.opendir.bind(fs)
  vi.spyOn(fs, 'opendir').mockImplementation(async (file, options) => {
    const directory = await opendir(file, options)
    const close = directory.close.bind(directory)
    vi.spyOn(directory, 'read').mockRejectedValue(original)
    vi.spyOn(directory, 'close').mockImplementation(async () => {
      await close()
      throw closing
    })
    return directory
  })
  const error = await collectIosLaunchHostLogs(f.artifactDir, device, f.source).catch(caught => caught)
  expect(error.errors[0].errors).toEqual([original, closing])
})

it('已经观察到的空目录消失时是诊断失败，不能改写成初始缺失或正常collected', async () => {
  const f = await fixture()
  const opendir = fs.opendir.bind(fs)
  vi.spyOn(fs, 'opendir').mockImplementation(async (file, options) => {
    const directory = await opendir(file, options)
    const close = directory.close.bind(directory)
    vi.spyOn(directory, 'close').mockImplementation(async () => {
      await close()
      await fs.rmdir(f.logPath)
    })
    return directory
  })
  await expect(collectIosLaunchHostLogs(f.artifactDir, device, f.source)).rejects.toThrow(AggregateError)
  expect((await f.manifest()).status).toBe('partial')
})
