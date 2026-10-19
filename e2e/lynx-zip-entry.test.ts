import { Buffer } from 'node:buffer'
import { expect, it } from 'vitest'
import { zipFixture } from './lynx/fixtures/zip'
import { readZipEntry } from './lynx/zip-entry'

const name = 'assets/run-context.json'
const payload = Buffer.from('{"runId":"fixture"}')

it.each([false, true])('固定条目支持 ZIP32 stored/deflate=%s，完全在内存读取', (deflate) => {
  expect(readZipEntry(zipFixture([[name, payload]], deflate), name)).toEqual(payload)
})

it.each([1, 3, 17, 5423])('接受 Android zipalign 的 %s 字节纯零 local extra 填充', (padding) => {
  const archive = zipFixture([[name, payload]], false, padding)
  expect(readZipEntry(archive, name)).toEqual(payload)
  archive[30 + Buffer.byteLength(name) + padding - 1] = 1
  expect(() => readZipEntry(archive, name)).toThrow()
})

it.each([true, 'unsigned'] as const)('读取 %s data descriptor 并拒绝被替换的 descriptor CRC', (descriptor) => {
  const archive = zipFixture([[name, payload]], true, 0, descriptor)
  expect(readZipEntry(archive, name)).toEqual(payload)
  const central = archive.readUInt32LE(archive.length - 6)
  const start = central - 12
  archive.writeUInt32LE(0, start)
  expect(() => readZipEntry(archive, name)).toThrow()
})

it('即使中央和本地摘要相同，也检查解压后 CRC；ZIP64 extra 不能藏进对齐填充', () => {
  const archive = zipFixture([[name, payload]], false, 4)
  const central = archive.readUInt32LE(archive.length - 6)
  archive.writeUInt32LE(0, 14)
  archive.writeUInt32LE(0, central + 16)
  expect(() => readZipEntry(archive, name)).toThrow()
  const extra = zipFixture([[name, payload]], false, 4)
  extra.writeUInt16LE(1, 30 + Buffer.byteLength(name))
  expect(() => readZipEntry(extra, name)).toThrow()
})

it.each(['truncated', 'offset', 'duplicate', 'encrypted', 'multivolume', 'zip64-size', 'zip64-version', 'crc', 'local-name', 'local-size', 'local-method', 'local-offset', 'directory-size', 'oversized', 'absent'] as const)('拒绝 %s ZIP 原始证据', (mode) => {
  const archive = zipFixture(mode === 'duplicate' ? [[name, payload], [name, payload]] : [[name, payload]], true)
  const end = archive.length - 22
  const central = archive.readUInt32LE(end + 16)
  if (mode === 'truncated') {
    return expect(() => readZipEntry(archive.subarray(0, archive.length - 1), name)).toThrow()
  }
  if (mode === 'offset') {
    archive.writeUInt32LE(0xFFFFFF00, end + 16)
  }
  if (mode === 'encrypted') {
    archive.writeUInt16LE(1, central + 8)
  }
  if (mode === 'multivolume') {
    archive.writeUInt16LE(1, end + 4)
  }
  if (mode === 'zip64-size') {
    archive.writeUInt32LE(0xFFFFFFFF, central + 24)
  }
  if (mode === 'zip64-version') {
    archive.writeUInt16LE(45, central + 6)
  }
  if (mode === 'crc') {
    archive[30 + Buffer.byteLength(name)]! ^= 1
  }
  if (mode === 'local-name') {
    archive[30]! = 0x62
  }
  if (mode === 'local-size') {
    archive.writeUInt32LE(0, 22)
  }
  if (mode === 'local-method') {
    archive.writeUInt16LE(0, 8)
  }
  if (mode === 'local-offset') {
    archive.writeUInt32LE(archive.length, central + 42)
  }
  if (mode === 'directory-size') {
    archive.writeUInt32LE(1, end + 12)
  }
  expect(() => readZipEntry(archive, mode === 'absent' ? 'assets/missing.json' : name, mode === 'oversized' ? 2 : undefined)).toThrow()
})

it.each(['../escape', '..\\escape', '/assets/run-context.json', 'C:\\assets\\run-context.json', 'C:assets/run-context.json'])('拒绝文件系统路径 %s 作为 ZIP 逻辑条目', (entry) => {
  expect(() => readZipEntry(zipFixture([[entry, payload]]), entry)).toThrow()
})

it('归一化后可别名的 ZIP 路径也拒绝，不能混淆固定 asset 身份', () => {
  expect(() => readZipEntry(zipFixture([[name, payload], ['assets/./run-context.json', payload]]), name)).toThrow()
})
