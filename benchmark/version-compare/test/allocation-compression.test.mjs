import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { limits } from '../scripts/diagnostics/constants.mjs'
import { createEvidenceWriter, sha256 } from '../scripts/diagnostics/evidence.mjs'
import { decodeAllocationEvidence, encodeAllocationEvidence, writeAllocationEvidence } from '../scripts/diagnostics/profile-codec.mjs'
import { compressAllocationEnvelope, compressedAllocationEncoding } from '../scripts/diagnostics/profile-compression.mjs'

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'allocation-compression-'))
  roots.push(root)
  return root
}

function repeatedProfile(count) {
  const node = id => ({ id, selfSize: id * 256, callFrame: { functionName: 'allocateRepeatedFunctionInFixture', scriptId: '123', url: 'file:///project/dependency/module.js', lineNumber: 24, columnNumber: 12 }, children: [], extension: { retain: true, values: [null, '中文', id] } })
  const head = node(1)
  head.children = Array.from({ length: count - 1 }, (_, i) => node(i + 2))
  const samples = Array.from({ length: Math.floor(count / 3) }, (_, i) => ({ nodeId: i + 1, size: 512, ordinal: i + 1, extension: '原始样本' }))
  return { identity: { role: 'base' }, sampling: { profile: { head, samples, unknown: [1, 2, 3] } }, extension: { order: ['one', 'two'] } }
}

const serialize = value => Buffer.from(`${JSON.stringify(value)}\n`)
const receipt = raw => ({ bytes: raw.length, sha256: sha256(raw) })
const encode = () => compressAllocationEnvelope(encodeAllocationEvidence(repeatedProfile(2)), { filename: 'allocation.json' })

function replaceContent(envelope, value) {
  const raw = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value))
  return { ...envelope, uncompressedBytes: raw.length, data: gzipSync(raw).toString('base64') }
}

describe('重复结构的完整分配证据压缩', () => {
  it('实际字典 JSON 大于 16 MiB 时仍在原限额内无损保存全部节点、样本与未知字段', async () => {
    const root = await fixture()
    const original = repeatedProfile(110000)
    const encoded = encodeAllocationEvidence(original)
    expect(Buffer.byteLength(JSON.stringify(encoded))).toBeGreaterThan(limits.maxProfileBytes)
    const writer = createEvidenceWriter(root)
    const receipt = writeAllocationEvidence(writer, 'allocation-1.json', original)
    const raw = await fs.readFile(path.join(root, 'allocation-1.json'))
    expect(raw.length).toBeLessThan(limits.maxProfileBytes)
    expect(writer.accounting()).toEqual({ bytesWritten: raw.length, filesWritten: 1 })
    const decoded = decodeAllocationEvidence(raw, receipt, 'allocation-1.json', 'profile')
    expect(JSON.stringify(decoded)).toBe(JSON.stringify(original))
  }, 30000)

  it('先验实际存储 receipt，正确 SHA 也不能让损坏或截断 gzip 通过', () => {
    const envelope = encode()
    const bytes = Buffer.from(envelope.data, 'base64')
    const corrupt = Buffer.from(bytes)
    corrupt[10] ^= 0xFF
    for (const compressed of [corrupt, bytes.subarray(0, bytes.length - 5)]) {
      const raw = serialize({ ...envelope, data: compressed.toString('base64') })
      expect(() => decodeAllocationEvidence(raw, { bytes: raw.length, sha256: '0'.repeat(64) })).toThrow('尺寸或哈希')
      expect(() => decodeAllocationEvidence(raw, receipt(raw))).toThrow('解压失败')
    }
  })

  it.each([
    ['未知版本', value => ({ ...value, encoding: `${compressedAllocationEncoding}-future` })],
    ['未知字段', value => ({ ...value, extra: true })],
    ['负尺寸', value => ({ ...value, uncompressedBytes: -1 })],
    ['自报超限', value => ({ ...value, uncompressedBytes: limits.maxTotalBytes + 1 })],
    ['实际尺寸不符', value => ({ ...value, uncompressedBytes: value.uncompressedBytes - 1 })],
    ['空 base64', value => ({ ...value, data: '' })],
    ['空白 base64', value => ({ ...value, data: `${value.data}\n` })],
    ['非法 base64', value => ({ ...value, data: '-'.repeat(value.data.length) })],
    ['非规范 base64', value => ({ ...value, data: 'AB==' })],
    ['伪造统计', value => ({ ...value, statistics: { ...value.statistics, nodeCount: 1 } })],
    ['缺失统计', ({ statistics, ...value }) => value],
  ])('正确 receipt 仍拒绝 %s', (_, mutate) => {
    const raw = serialize(mutate(encode()))
    expect(() => decodeAllocationEvidence(raw, receipt(raw))).toThrow('结构无效')
  })

  it('解压后继续验证 schema、类型和重新计算的统计，禁止嵌套压缩或旧 raw 冒充内层协议', () => {
    const envelope = encode()
    const inner = JSON.parse(gunzipSync(Buffer.from(envelope.data, 'base64')))
    const invalid = [
      { ...inner, encoding: 'future' },
      { ...inner, statistics: { ...inner.statistics, sampleCount: 1 } },
      { ...inner, document: { sampling: { profile: { head: {} } } } },
      envelope,
      repeatedProfile(2),
    ]
    for (const value of invalid) {
      const raw = serialize(replaceContent(envelope, value))
      expect(() => decodeAllocationEvidence(raw, receipt(raw))).toThrow('结构无效')
    }
    const raw = serialize(envelope)
    expect(() => decodeAllocationEvidence(raw, receipt(raw), 'allocation.json', 'frames')).toThrow('文件类型')
    expect(() => decodeAllocationEvidence(raw, receipt(raw), 'allocation.json', 'unknown')).toThrow('文件类型')
    const frames = compressAllocationEnvelope(encodeAllocationEvidence({ allocationFrames: [{ nodeId: 1, originalUrl: '' }] }), { filename: 'frames.json' })
    const frameBytes = serialize(frames)
    expect(() => decodeAllocationEvidence(frameBytes, receipt(frameBytes), 'frames.json', 'profile')).toThrow('文件类型')
  })

  it('不信任自报的小尺寸，实际 gzip 解压炸弹仍在 64 MiB 硬界终止', () => {
    const envelope = encode()
    const bomb = Buffer.alloc(limits.maxTotalBytes + 1, 32)
    const raw = serialize({ ...envelope, uncompressedBytes: 1, data: gzipSync(bomb).toString('base64') })
    expect(() => decodeAllocationEvidence(raw, receipt(raw))).toThrow('实际输出超过固定上限')
  })

  it('拒绝正确 gzip 和 receipt 下的非法 UTF-8，避免替换字符造成无声内容变化', () => {
    const raw = serialize(replaceContent(encode(), Buffer.from([123, 34, 120, 34, 58, 34, 0xFF, 34, 125])))
    expect(() => decodeAllocationEvidence(raw, receipt(raw))).toThrow('UTF-8')
  })

  it('旧 raw、字典 v1 与 gzip 外层也先验 receipt 再拒绝非法 UTF-8', () => {
    for (const value of [repeatedProfile(2), encodeAllocationEvidence(repeatedProfile(2)), encode()]) {
      const raw = Buffer.concat([Buffer.from('{"injected":"'), Buffer.from([0xFF]), Buffer.from('",'), serialize(value).subarray(1)])
      expect(() => decodeAllocationEvidence(raw, { ...receipt(raw), sha256: '0'.repeat(64) })).toThrow('尺寸或哈希')
      expect(() => decodeAllocationEvidence(raw, receipt(raw))).toThrow('UTF-8')
    }
  })
})
