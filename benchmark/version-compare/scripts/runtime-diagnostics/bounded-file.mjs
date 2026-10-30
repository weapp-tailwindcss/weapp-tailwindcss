import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}
export const digestBytes = value => createHash('sha256').update(value).digest('hex')
export const sameRuntimePath = (left, right) => typeof left === 'string' && typeof right === 'string' && path.isAbsolute(left) && path.isAbsolute(right) && path.relative(left, right) === ''
const sameStat = (left, right) => ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(name => left[name] === right[name])
function assertUnchanged(condition, message) {
  if (!condition) {
    throw Object.assign(new Error(message), {
      code: 'ERR_WEAPP_RUNTIME_FILE_CHANGED',
    })
  }
}

/** 固定 descriptor 与读取上限；多读一个字节只用于发现增长，不再调用无界 readFile。 */
export function readBoundedFile(file, {
  maximumBytes,
  receipt,
  budget,
} = {}, io = fs) {
  if (file instanceof URL) {
    file = fileURLToPath(file)
  }
  assert(Number.isSafeInteger(maximumBytes) && maximumBytes >= 0 && maximumBytes < 128 * 1024 * 1024, '运行时诊断读取上限无效')
  if (budget) {
    assert(Number.isSafeInteger(budget.bytes) && budget.bytes >= 0 && Number.isSafeInteger(budget.maximumBytes) && budget.maximumBytes >= budget.bytes, '运行时诊断累计读取上限无效')
  }
  if (receipt) {
    assert(Number.isSafeInteger(receipt.bytes) && receipt.bytes >= 0 && /^[a-f\d]{64}$/i.test(receipt.sha256 ?? ''), '运行时诊断文件回执无效')
  }
  const resolved = path.resolve(file)
  const parent = io.realpathSync(path.dirname(resolved))
  const absolute = path.join(parent, path.basename(resolved))
  const initial = io.lstatSync(absolute, {
    bigint: true,
  })
  assert(initial.isFile() && !initial.isSymbolicLink(), '运行时诊断只读取普通文件，禁止符号链接')
  assert(initial.size <= BigInt(maximumBytes) && (!budget || initial.size <= BigInt(budget.maximumBytes - budget.bytes)), '运行时诊断文件超过固定读取上限')
  const flags = io.constants.O_RDONLY | (io.constants.O_NOFOLLOW ?? 0) | (io.constants.O_NONBLOCK ?? 0)
  const fd = io.openSync(absolute, flags)
  let result
  let failure
  try {
    const opened = io.fstatSync(fd, {
      bigint: true,
    })
    assertUnchanged(opened.isFile() && sameStat(initial, opened) && sameRuntimePath(io.realpathSync(absolute), absolute), '运行时诊断文件在打开时被替换或变化')
    const expectedBytes = Number(opened.size)
    const buffer = Buffer.allocUnsafe(expectedBytes + 1)
    let offset = 0
    while (offset < buffer.length) {
      const read = io.readSync(fd, buffer, offset, buffer.length - offset, offset)
      assert(Number.isInteger(read) && read >= 0 && read <= buffer.length - offset, '运行时诊断 descriptor 读取结果无效')
      if (read === 0) {
        break
      }
      offset += read
    }
    const final = io.fstatSync(fd, {
      bigint: true,
    })
    const linked = io.lstatSync(absolute, {
      bigint: true,
    })
    assertUnchanged(offset === expectedBytes && final.isFile() && linked.isFile() && !linked.isSymbolicLink() && sameStat(opened, final) && sameStat(final, linked) && sameRuntimePath(io.realpathSync(absolute), absolute), '运行时诊断文件读取时增长、替换或变化')
    result = buffer.subarray(0, offset)
    assert(!receipt || (receipt.bytes === result.length && receipt.sha256 === digestBytes(result)), '运行时诊断文件哈希或尺寸不符')
    if (budget) {
      budget.bytes += result.length
    }
  }
  catch (error) {
    failure = error
  }
  try {
    io.closeSync(fd)
  }
  catch (error) {
    if (failure) {
      throw new AggregateError([failure, error], '运行时诊断读取与 descriptor 关闭均失败', {
        cause: failure,
      })
    }
    throw error
  }
  if (failure) {
    throw failure
  }
  return result
}

/** command/reply 有明确的原子替换协议；最多重读三次，仅重试 descriptor 身份变化。 */
export function readRuntimeControlFile(file, io = fs) {
  const failures = []
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return readBoundedFile(file, {
        maximumBytes: 64 * 1024,
      }, io)
    }
    catch (error) {
      if (error.code !== 'ERR_WEAPP_RUNTIME_FILE_CHANGED') {
        throw error
      }
      failures.push(error)
    }
  }
  throw new AggregateError(failures, '运行时诊断控制文件连续变化，固定重读次数已耗尽', {
    cause: failures[0],
  })
}

/** 工件名称同时拒绝 POSIX 与 Windows 的路径语法。 */
export function runtimeArtifactPath(directory, name) {
  assert(typeof name === 'string' && name.length > 0 && !['.', '..'].includes(name) && !name.includes('\0') && !name.includes(':') && !name.includes('\\') && path.posix.basename(name) === name && path.win32.basename(name) === name, '运行时诊断工件文件名越界')
  return path.join(directory, name)
}
