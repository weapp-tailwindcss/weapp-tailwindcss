import type { FileHandle } from 'node:fs/promises'
import type { IosHostLogSource } from './ios-host-log-source'
import type { IosDevice } from './native-device'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { isInsideLogDirectory } from './ios-host-log-source'

export const iosHostLogLimits = Object.freeze({ entries: 64, files: 8, fileBytes: 65_536, totalBytes: 262_144 })

function statIdentity(stat: { dev: number, ino: number, size: number, mtimeMs: number }) {
  return { dev: stat.dev, ino: stat.ino, size: stat.size, mtimeMs: stat.mtimeMs }
}

function sameFile(a: { dev: number, ino: number }, b: { dev: number, ino: number }) {
  return a.dev === b.dev && a.ino === b.ino
}

async function withLogHandle(file: string, read: (handle: FileHandle) => Promise<void>) {
  // NONBLOCK 防止并发替换成 FIFO 后阻塞；NOFOLLOW 在宿主支持时拒绝叶子链接。
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
  return withClosedResource(handle, read)
}

async function withClosedResource<T extends { close: () => Promise<void> }>(handle: T, read: (handle: T) => Promise<void>) {
  const errors: unknown[] = []
  try {
    await read(handle)
  }
  catch (error) {
    errors.push(error)
  }
  try {
    await handle.close()
  }
  catch (error) {
    errors.push(error)
  }
  if (errors.length === 1) {
    throw errors[0]
  }
  if (errors.length) {
    throw new AggregateError(errors, '日志资源读取与关闭均失败。')
  }
}

async function assertDirectory(file: string, original: { dev: number, ino: number }) {
  const current = await fs.lstat(file)
  if (!current.isDirectory() || current.isSymbolicLink() || !sameFile(original, current)) {
    throw new Error('绑定日志目录已被替换，停止读取。')
  }
}

/** 仅在原 launch 步骤未交付并真实 settle 后读取同设备日志；数量/字节上限不是文件系统耗时上限。 */
export async function collectIosLaunchHostLogs(artifactDir: string, device: IosDevice, source?: IosHostLogSource) {
  const directory = path.join(artifactDir, 'ios-launch-host-logs')
  await fs.mkdir(directory)
  const startedAt = new Date().toISOString()
  const files: Array<Record<string, unknown>> = []
  const errors: unknown[] = []
  let status = 'unavailable'
  let reason: string | undefined
  let enumerated = 0
  let attempted = 0
  let copiedBytes = 0
  let requestedReadBytes = 0
  let actualReadBytes = 0
  let entriesTruncated = false
  let rootBefore: unknown
  let rootAfter: unknown
  try {
    if (!source || source.status !== 'bound') {
      reason = source?.reason ?? '本轮没有已验证的 hosted 库存日志来源。'
    }
    else if (source.deviceId !== device.id || source.runtime !== device.runtime) {
      throw new Error('宿主日志来源与原启动设备身份不一致。')
    }
    else {
      const root = await fs.lstat(source.logPath)
      rootBefore = statIdentity(root)
      if (!root.isDirectory() || root.isSymbolicLink()) {
        reason = '库存日志目录不是实际目录，拒绝跟随链接或扩大读取范围。'
      }
      else {
        const canonical = await fs.realpath(source.logPath)
        await assertDirectory(canonical, root)
        status = 'collected'
        await withClosedResource(await fs.opendir(canonical), async (entries) => {
          while (true) {
            const entry = await entries.read()
            if (!entry) {
              break
            }
            if (enumerated === iosHostLogLimits.entries) {
              entriesTruncated = true
              break
            }
            enumerated += 1
            await assertDirectory(canonical, root)
            const record: Record<string, unknown> = { name: entry.name, status: 'skipped' }
            files.push(record)
            if (!entry.isFile() || entry.isSymbolicLink()) {
              record.reason = '非普通文件；不递归或跟随链接。'
              continue
            }
            if (attempted === iosHostLogLimits.files || requestedReadBytes === iosHostLogLimits.totalBytes) {
              record.reason = '达到文件数量或总字节上限。'
              continue
            }
            attempted += 1
            try {
              const file = path.join(canonical, entry.name)
              if (!isInsideLogDirectory(canonical, file)) {
                throw new Error('日志文件越出绑定目录。')
              }
              const before = await fs.lstat(file)
              if (!before.isFile() || before.isSymbolicLink() || !isInsideLogDirectory(canonical, await fs.realpath(file))) {
                throw new Error('日志文件在打开前改变类型或越界。')
              }
              await assertDirectory(canonical, root)
              await withLogHandle(file, async (handle) => {
                const opened = await handle.stat()
                if (!opened.isFile() || !sameFile(before, opened)) {
                  throw new Error('日志描述符不再属于已检查的普通文件。')
                }
                await assertDirectory(canonical, root)
                const length = Math.min(opened.size, iosHostLogLimits.fileBytes, iosHostLogLimits.totalBytes - requestedReadBytes)
                const offset = opened.size - length
                const bytes = Buffer.alloc(length)
                requestedReadBytes += length
                const { bytesRead } = await handle.read(bytes, 0, length, offset)
                actualReadBytes += bytesRead
                const tail = bytes.subarray(0, bytesRead)
                const after = await handle.stat()
                const output = `file-${attempted}.bin`
                await fs.writeFile(path.join(directory, output), tail, { flag: 'wx' })
                copiedBytes += bytesRead
                Object.assign(record, {
                  status: 'copied',
                  output,
                  offset,
                  requestedBytes: length,
                  byteLength: bytesRead,
                  truncated: offset > 0 || bytesRead !== length || after.size !== opened.size,
                  before: statIdentity(before),
                  opened: statIdentity(opened),
                  after: statIdentity(after),
                  changedDuringRead: !sameFile(opened, after) || opened.size !== after.size || opened.mtimeMs !== after.mtimeMs,
                  tailSha256: createHash('sha256').update(tail).digest('hex'),
                })
              })
            }
            catch (error) {
              errors.push(error)
              Object.assign(record, { status: 'failed', error: error instanceof Error ? error.message : String(error) })
            }
          }
        })
        const after = await fs.lstat(source.logPath)
        rootAfter = { ...statIdentity(after), sameDirectory: after.isDirectory() && !after.isSymbolicLink() && sameFile(root, after) }
        await assertDirectory(source.logPath, root)
      }
    }
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && rootBefore === undefined) {
      reason = '库存日志目录在失败时不存在。'
    }
    else {
      errors.push(error)
      reason = error instanceof Error ? error.message : String(error)
    }
  }
  try {
    await fs.writeFile(path.join(directory, 'collection.json'), `${JSON.stringify({
      version: 1,
      acceptance: 'diagnostic-only',
      trigger: 'launch-step-failure',
      source: source ?? null,
      deviceId: device.id,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: errors.length ? 'partial' : status,
      reason,
      limits: iosHostLogLimits,
      enumerated,
      attempted,
      copiedBytes,
      requestedReadBytes,
      actualReadBytes,
      entriesTruncated,
      rootBefore,
      rootAfter,
      files,
      boundary: '同设备原始文件尾部；未解析请求或时间，不证明同一请求、全文完整或服务端正常。',
    }, null, 2)}\n`, { flag: 'wx' })
  }
  catch (error) {
    errors.push(error)
  }
  if (errors.length) {
    throw new AggregateError(errors, '部分 iOS 启动宿主日志无法导出。')
  }
}
