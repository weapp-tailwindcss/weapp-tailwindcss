import type { Buffer } from 'node:buffer'
import { crc32, inflateRawSync } from 'node:zlib'

/** 仅读取 AAR/APK 的固定 ZIP32 条目，不解压到文件系统或接受 ZIP64。 */
export function readZipEntry(archive: Buffer, name: string, limit = 128 * 1024 * 1024): Buffer {
  const invalid = () => new Error(`Lynx SDK ZIP32 条目损坏或不受支持：${name}`)
  const fits = (offset: number, length: number) => offset >= 0 && length >= 0 && offset + length <= archive.length
  const validExtra = (start: number, length: number) => {
    const end = start + length
    if (!fits(start, length)) {
      return false
    }
    while (start < end) {
      // Android zipalign 允许 local extra 的尾部为任意长度的纯零对齐填充。
      if (archive.subarray(start, end).every(value => value === 0)) {
        return true
      }
      if (start + 4 > end || archive.readUInt16LE(start) === 1) {
        return false
      }
      start += 4 + archive.readUInt16LE(start + 2)
    }
    return start === end
  }
  if (!/^(?:assets|lib|jni)\/[\w./-]+$/i.test(name) || name.includes('..') || archive.length < 22) {
    throw invalid()
  }
  let end = archive.length - 22
  const minimum = Math.max(0, end - 65535)
  while (end >= minimum && !(archive.readUInt32LE(end) === 0x06054B50 && end + 22 + archive.readUInt16LE(end + 20) === archive.length)) {
    end--
  }
  if (end < minimum || archive.readUInt16LE(end + 4) !== 0 || archive.readUInt16LE(end + 6) !== 0) {
    throw invalid()
  }
  const count = archive.readUInt16LE(end + 10)
  const directorySize = archive.readUInt32LE(end + 12)
  const directoryOffset = archive.readUInt32LE(end + 16)
  if (count === 65535 || count !== archive.readUInt16LE(end + 8) || directoryOffset === 0xFFFFFFFF
    || directorySize === 0xFFFFFFFF || directoryOffset + directorySize !== end) {
    throw invalid()
  }
  let offset = directoryOffset
  let result: Buffer | undefined
  const names = new Set<string>()
  for (let index = 0; index < count; index++) {
    if (!fits(offset, 46) || archive.readUInt32LE(offset) !== 0x02014B50) {
      throw invalid()
    }
    const flags = archive.readUInt16LE(offset + 8)
    const method = archive.readUInt16LE(offset + 10)
    const crc = archive.readUInt32LE(offset + 16)
    const compressedSize = archive.readUInt32LE(offset + 20)
    const size = archive.readUInt32LE(offset + 24)
    const nameLength = archive.readUInt16LE(offset + 28)
    const extraLength = archive.readUInt16LE(offset + 30)
    const commentLength = archive.readUInt16LE(offset + 32)
    const localOffset = archive.readUInt32LE(offset + 42)
    if (!fits(offset, 46 + nameLength + extraLength + commentLength) || archive.readUInt16LE(offset + 34) !== 0
      || [compressedSize, size, localOffset].includes(0xFFFFFFFF) || flags & ~0x080E || archive.readUInt16LE(offset + 6) > 20
      || !validExtra(offset + 46 + nameLength, extraLength)) {
      throw invalid()
    }
    const entryName = archive.subarray(offset + 46, offset + 46 + nameLength)
    const entry = entryName.toString('utf8')
    if (names.has(entry) || /\\|\0|^(?:\/|[a-z]:)|(?:^|\/)\.{1,2}(?:\/|$)/i.test(entry)) {
      throw invalid()
    }
    names.add(entry)
    if (entry === name) {
      if (![0, 8].includes(method) || size > limit || !fits(localOffset, 30) || archive.readUInt32LE(localOffset) !== 0x04034B50
        || archive.readUInt16LE(localOffset + 6) !== flags || archive.readUInt16LE(localOffset + 8) !== method
        || archive.readUInt16LE(localOffset + 26) !== nameLength || archive.readUInt16LE(localOffset + 4) !== archive.readUInt16LE(offset + 6)
        || !validExtra(localOffset + 30 + nameLength, archive.readUInt16LE(localOffset + 28))) {
        throw invalid()
      }
      const dataOffset = localOffset + 30 + nameLength + archive.readUInt16LE(localOffset + 28)
      if (!fits(dataOffset, compressedSize) || dataOffset + compressedSize > directoryOffset
        || !archive.subarray(localOffset + 30, localOffset + 30 + nameLength).equals(entryName)) {
        throw invalid()
      }
      if (!(flags & 8) && (archive.readUInt32LE(localOffset + 14) !== crc || archive.readUInt32LE(localOffset + 18) !== compressedSize
        || archive.readUInt32LE(localOffset + 22) !== size)) {
        throw invalid()
      }
      if (flags & 8) {
        let descriptor = dataOffset + compressedSize
        if (!fits(descriptor, 12)) {
          throw invalid()
        }
        if (archive.readUInt32LE(descriptor) === 0x08074B50) {
          descriptor += 4
        }
        if (!fits(descriptor, 12) || descriptor + 12 > directoryOffset || archive.readUInt32LE(descriptor) !== crc
          || archive.readUInt32LE(descriptor + 4) !== compressedSize || archive.readUInt32LE(descriptor + 8) !== size) {
          throw invalid()
        }
        for (const [index, value] of [crc, compressedSize, size].entries()) {
          const localValue = archive.readUInt32LE(localOffset + 14 + index * 4)
          if (localValue !== 0 && localValue !== value) {
            throw invalid()
          }
        }
      }
      const compressed = archive.subarray(dataOffset, dataOffset + compressedSize)
      result = method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: limit })
      if (result.length !== size || crc32(result) !== crc) {
        throw invalid()
      }
    }
    offset += 46 + nameLength + extraLength + commentLength
  }
  if (offset !== end || !result) {
    throw invalid()
  }
  return result
}
