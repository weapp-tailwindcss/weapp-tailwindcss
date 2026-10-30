import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

export const limits = Object.freeze({
  fileBytes: 64 * 1024 * 1024,
  managerBytes: 128 * 1024 * 1024,
  archiveBytes: 512 * 1024 * 1024,
  manifestBytes: 32 * 1024 * 1024,
  logBytes: 8 * 1024 * 1024,
  entries: 100000,
})
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
export function errorRecord(stage, error) {
  return {
    stage,
    name: error?.name ?? 'Error',
    message: String(error?.message ?? error),
    code: error?.code,
  }
}
export function inside(root, file) {
  const relative = path.relative(root, file)
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
}
export function logical(file) {
  if (typeof file !== 'string' || !file || unsafePathCharacters(file) || path.posix.isAbsolute(file) || path.posix.normalize(file) !== file) {
    throw new Error(`不安全的 Git/归档逻辑路径：${file}`)
  }
  for (const part of file.split('/')) {
    if (!part || part === '.' || part === '..' || part === '.git' || part.includes(':') || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) {
      throw new Error(`逻辑路径不可跨平台表示：${file}`)
    }
  }
  return file
}
export function fromLogical(root, file) {
  const physical = path.resolve(root, ...logical(file).split('/'))
  if (!inside(root, physical)) {
    throw new Error('逻辑路径越过所属根')
  }
  return physical
}
const sameIdentity = (left, right) => ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].every(key => left[key] === right[key])
export function unsafePathCharacters(file) {
  return file.includes('\\') || [...file].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
}
async function closeDescriptor(descriptor, firstFailure) {
  try {
    await descriptor.close()
  }
  catch (error) {
    if (firstFailure) {
      throw new AggregateError([firstFailure, error], firstFailure.message, {
        cause: firstFailure,
      })
    }
    throw error
  }
  if (firstFailure) {
    throw firstFailure
  }
}
export async function readBounded(file, maximum = limits.fileBytes, expectedIdentity) {
  const descriptor = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  let firstFailure
  let result
  try {
    const before = await descriptor.stat()
    if (expectedIdentity && !sameIdentity(expectedIdentity, before)) {
      throw new Error(`输入身份在打开前变化：${file}`)
    }
    if (!before.isFile() || before.size > maximum) {
      throw new Error(`输入类型或大小超限：${file}`)
    }
    const bytes = Buffer.alloc(before.size)
    let offset = 0
    while (offset < bytes.length) {
      const read = await descriptor.read(bytes, offset, bytes.length - offset, offset)
      if (!read.bytesRead) {
        throw new Error(`输入在读取时缩短：${file}`)
      }
      offset += read.bytesRead
    }
    const extra = Buffer.alloc(1)
    if ((await descriptor.read(extra, 0, 1, offset)).bytesRead) {
      throw new Error(`输入在读取时增长：${file}`)
    }
    const after = await descriptor.stat()
    if (!sameIdentity(before, after)) {
      throw new Error(`输入在读取时变化：${file}`)
    }
    result = bytes
  }
  catch (error) {
    firstFailure = error
  }
  await closeDescriptor(descriptor, firstFailure)
  return result
}
export async function fileReceipt(file, {
  root,
  kind = 'source',
  maximum = limits.fileBytes,
} = {}) {
  const physical = await fs.realpath(file)
  if (root && !inside(root, physical)) {
    throw new Error(`物理文件越过归属根：${file}`)
  }
  const identity = await fs.stat(physical)
  const descriptor = await fs.open(physical, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  let firstFailure
  let bytes = 0
  const digest = createHash('sha256')
  try {
    const before = await descriptor.stat()
    if (!sameIdentity(identity, before) || !before.isFile() || before.size > maximum) {
      throw new Error(`输入身份、类型或大小不符：${file}`)
    }
    const chunk = Buffer.alloc(64 * 1024)
    while (true) {
      const {
        bytesRead,
      } = await descriptor.read(chunk, 0, chunk.length, bytes)
      if (!bytesRead) {
        break
      }
      bytes += bytesRead
      if (bytes > maximum || bytes > before.size) {
        throw new Error(`输入在读取时增长或超限：${file}`)
      }
      digest.update(chunk.subarray(0, bytesRead))
    }
    const after = await descriptor.stat()
    if (bytes !== before.size || !sameIdentity(before, after) || (await fs.realpath(file)) !== physical || !sameIdentity(after, await fs.stat(physical))) {
      throw new Error(`输入或物理归属在读取时变化：${file}`)
    }
  }
  catch (error) {
    firstFailure = error
  }
  await closeDescriptor(descriptor, firstFailure)
  return {
    ...(root
      ? {
          logical: path.relative(root, file).split(path.sep).join('/'),
        }
      : {}),
    physical,
    bytes,
    sha256: digest.digest('hex'),
    kind,
  }
}
export async function writeJson(file, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
  if (bytes.length > limits.manifestBytes) {
    throw new Error(`清单超过固定上限：${file}`)
  }
  await fs.writeFile(file, bytes, {
    flag: 'wx',
  })
  return {
    physical: await fs.realpath(file),
    bytes: bytes.length,
    sha256: sha256(bytes),
  }
}
export async function walkFiles(root, {
  rejectGit = true,
} = {}) {
  const files = []
  const visit = async (directory) => {
    for (const entry of await fs.readdir(directory, {
      withFileTypes: true,
    })) {
      const file = path.join(directory, entry.name)
      if (rejectGit && entry.name === '.git') {
        throw new Error(`准备副本含 Git 元数据：${file}`)
      }
      if (entry.isDirectory()) {
        await visit(file)
      }
      else if (entry.isFile() || entry.isSymbolicLink()) {
        files.push(path.relative(root, file).split(path.sep).join('/'))
      }
      else {
        throw new Error(`未知文件类型：${file}`)
      }
      if (files.length > limits.entries) {
        throw new Error('文件数超过固定上限')
      }
    }
  }
  await visit(root)
  return files.sort()
}
export async function assertDirectoryOwned(root, directory) {
  const physical = await fs.realpath(directory)
  if (!inside(root, physical) || !(await fs.stat(physical)).isDirectory()) {
    throw new Error(`依赖目录不归属当前产品根：${directory}`)
  }
  return {
    logical: path.relative(root, directory).split(path.sep).join('/'),
    physical,
    kind: 'directory',
  }
}
