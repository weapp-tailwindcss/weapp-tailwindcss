import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { limits } from '../scripts/diagnostics/constants.mjs'
import { createEvidenceWriter, sha256 } from '../scripts/diagnostics/evidence.mjs'
import { decodeAllocationEvidence, encodeAllocationEvidence, writeAllocationEvidence } from '../scripts/diagnostics/profile-codec.mjs'
import { readAllocationEvidenceFile } from '../scripts/diagnostics/profile-files.mjs'

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'allocation-codec-'))
  roots.push(root)
  return root
}

function profile(urls) {
  const nodes = urls.map((url, i) => ({ id: i + 1, selfSize: i * 256, callFrame: { functionName: 'allocate', scriptId: `${i}`, url, lineNumber: -1, columnNumber: 0, custom: { url: '未声明的同名字段' } }, children: [], extra: [i] }))
  nodes[0].children = nodes.slice(1)
  return { identity: { role: 'base' }, sampling: { profile: { head: nodes[0], samples: nodes.map(node => ({ nodeId: node.id, size: node.selfSize, ordinal: node.id, custom: true })), extension: { url: '保持原值' } }, parameters: { samplingInterval: limits.samplingInterval } }, extra: { url: '不是栈 URL' } }
}

function serialize(value) {
  return Buffer.from(`${JSON.stringify(value)}\n`)
}

function receipt(raw) {
  return { bytes: raw.length, sha256: sha256(raw) }
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    Object.values(value).forEach(freeze)
  }
  return value
}

describe('完整 profile 的有界 URL 字典传输', () => {
  it.each([
    ['', '', 'data:text/javascript,中文\n"\\', '\uD800', 'node:fs'],
    ['', 'file:///one.js', 'C:\\project\\two.js', 'relative/path?raw'],
  ].map(urls => [urls]))('往返保持节点、样本、未知字段、顺序与所有 URL 原值：%j', (urls) => {
    const original = freeze(profile(urls))
    const before = JSON.stringify(original)
    const encoded = encodeAllocationEvidence(original)
    expect(encoded.statistics.decodedDocumentBytes).toBe(Buffer.byteLength(before))
    const raw = serialize(encoded)
    const decoded = decodeAllocationEvidence(raw, receipt(raw))
    expect(decoded).toEqual(original)
    expect(JSON.stringify(decoded)).toBe(before)
    expect(JSON.stringify(original)).toBe(before)
    expect(encoded.urls).toEqual([...new Set(urls)])
    expect(encoded.document.extra.url).toBe('不是栈 URL')
  })

  it('完整保留当前 head 无对应节点的样本并单列关联缺失，不把它们归入模块', () => {
    const original = profile([''])
    original.sampling.profile.samples.push({ nodeId: 99, size: 512, ordinal: 2, extension: '原始样本' })
    const encoded = encodeAllocationEvidence(original)
    expect(encoded.statistics.samplesWithoutNodeCount).toBe(1)
    expect(decodeAllocationEvidence(serialize(encoded))).toEqual(original)
    for (const patch of [{ nodeId: -1 }, { size: -1 }, { ordinal: -1 }]) {
      const invalid = structuredClone(original)
      Object.assign(invalid.sampling.profile.samples[0], patch)
      expect(() => encodeAllocationEvidence(invalid)).toThrow('sample：')
    }
  })

  it('重复超长 data URL 超过原文件大小时仍保留全文，编码在原上限内', async () => {
    const root = await fixture()
    const url = `data:text/javascript,${'x'.repeat(1024 * 1024)}`
    const original = profile(Array.from({ length: 20 }).fill(url))
    const writer = createEvidenceWriter(root)
    expect(() => writer.write('legacy-allocation.json', original)).toThrow('encoded-file')
    expect(await fs.readdir(root)).toEqual([])
    expect(writer.accounting()).toEqual({ bytesWritten: 0, filesWritten: 0 })
    const stored = writeAllocationEvidence(writer, 'allocation-1.json', original)
    const raw = await fs.readFile(path.join(root, 'allocation-1.json'))
    expect(raw.length).toBeLessThan(limits.maxProfileBytes)
    const encoded = JSON.parse(raw)
    expect(encoded.statistics.decodedDocumentBytes).toBeGreaterThan(limits.maxProfileBytes)
    expect(encoded.statistics.uniqueUrls).toBe(1)
    expect(decodeAllocationEvidence(raw, stored)).toEqual(original)
    const frames = { profileFile: 'allocation-1.json', profileReceipt: stored, allocationFrames: Array.from({ length: 20 }, (_, nodeId) => ({ nodeId, originalUrl: url, custom: { url } })) }
    // 非 URL 槽不做字典替换，gzip 仍保留扩展字段的完整内容。
    const fullFrames = writeAllocationEvidence(writer, 'large-frames.json', frames)
    expect(decodeAllocationEvidence(await fs.readFile(path.join(root, 'large-frames.json')), fullFrames)).toEqual(frames)
    const mapping = { ...frames, allocationFrames: frames.allocationFrames.map(({ custom, ...frame }) => frame) }
    const mapped = writeAllocationEvidence(writer, 'allocation-frames-1.json', mapping)
    expect(decodeAllocationEvidence(await fs.readFile(path.join(root, 'allocation-frames-1.json')), mapped)).toEqual(mapping)
  })

  it('旧未编码 profile 与 frames 按实际 receipt 校验后继续读取', () => {
    for (const original of [profile(['', 'node:fs']), { allocationFrames: [{ nodeId: 1, originalUrl: '' }] }]) {
      const raw = serialize(original)
      expect(decodeAllocationEvidence(raw, receipt(raw))).toEqual(original)
    }
  })

  it.each([-1, 1, 0.5, Number.MAX_SAFE_INTEGER + 1, '0', null])('拒绝非法或混合 URL 引用 %j', (index) => {
    const encoded = encodeAllocationEvidence(profile(['']))
    encoded.document.sampling.profile.head.callFrame.url = index
    expect(() => decodeAllocationEvidence(serialize(encoded))).toThrow('URL index')
  })

  it('拒绝未知版本、非法字典、结构、统计和未引用内容', () => {
    const mutations = [
      value => ({ ...value, encoding: 'future-v2' }),
      value => ({ ...value, extra: true }),
      value => ({ ...value, urls: [42] }),
      value => ({ ...value, urls: ['', ''] }),
      value => ({ ...value, urls: ['', 'unused'] }),
      value => ({ ...value, statistics: { ...value.statistics, decodedDocumentBytes: 1 } }),
      value => ({ ...value, document: { ...value.document, allocationFrames: [] } }),
      value => ({ ...value, document: { sampling: { profile: { head: { children: [] } } } } }),
    ]
    for (const mutate of mutations) {
      expect(() => decodeAllocationEvidence(serialize(mutate(encodeAllocationEvidence(profile([''])))))).toThrow('结构无效')
    }
    expect(() => decodeAllocationEvidence('null')).toThrow('根对象')
  })

  it('先核实际 bytes 和 SHA，拒绝正确 hash 下的错误尺寸及损坏文件', () => {
    const raw = serialize(encodeAllocationEvidence(profile([''])))
    expect(() => decodeAllocationEvidence(raw, { ...receipt(raw), bytes: raw.length - 1 })).toThrow('尺寸或哈希')
    expect(() => decodeAllocationEvidence(raw, { ...receipt(raw), sha256: '0'.repeat(64) })).toThrow('尺寸或哈希')
    expect(() => decodeAllocationEvidence(Buffer.concat([raw, Buffer.from(' ')]), receipt(raw))).toThrow('尺寸或哈希')
  })

  it('逻辑展开超过 64 MiB 时编码与解码均失败，不先创建展开字符串', async () => {
    const root = await fixture()
    const writer = createEvidenceWriter(root)
    const url = 'x'.repeat(1024 * 1024)
    expect(() => writeAllocationEvidence(writer, 'allocation-1.json', profile(Array.from({ length: 65 }).fill(url)))).toThrow('decoded-document')
    expect(await fs.readdir(root)).toEqual([])
    const encoded = encodeAllocationEvidence(profile(Array.from({ length: 33 }).fill(url)))
    encoded.urls[0] = url.repeat(2)
    // 伪造者可以重写统计，解码器仍必须自行计算并在还原前拒绝展开。
    const increment = Buffer.byteLength(url)
    encoded.statistics.uniqueUrlUtf8Bytes += increment
    encoded.statistics.largestUrlUtf8Bytes += increment
    encoded.statistics.expandedUrlUtf8Bytes += increment * 33
    encoded.statistics.decodedDocumentBytes += increment * 33
    expect(() => decodeAllocationEvidence(serialize(encoded))).toThrow('decoded-document')
  })

  it('压缩实际输出越界仍执行原 16 MiB 文件上限，保留预算和统计且不写半文件', async () => {
    const root = await fixture()
    const writer = createEvidenceWriter(root)
    writer.write('prior.json', { retained: true })
    const original = profile([`data:text/plain,${randomBytes(limits.maxProfileBytes).toString('base64')}`])
    const encoded = encodeAllocationEvidence(original)
    let failure
    try {
      writeAllocationEvidence(writer, 'allocation-1.json', original)
    }
    catch (error) {
      failure = error.message
    }
    expect(failure).toContain('分配证据压缩失败')
    expect(failure).toContain('"filename":"allocation-1.json","maximumCompressedBytes":')
    expect(failure).toContain(`"fileMaximum":${limits.maxProfileBytes}`)
    expect(failure).toContain(`"bytesWritten":${writer.accounting().bytesWritten}`)
    expect(failure).toContain(`"totalMaximum":${limits.maxTotalBytes}`)
    expect(failure).toContain('"nodeCount":1')
    expect(await fs.readdir(root)).toEqual(['prior.json'])
    expect(() => decodeAllocationEvidence(serialize(encoded))).toThrow('encoded-read')
  })

  it('压缩文件按实际存储字节计入原会话总预算，超额失败保留此前文件', async () => {
    const root = await fixture()
    const writer = createEvidenceWriter(root)
    for (let i = 0; i < 4; i++) {
      writer.write(`prior-${i}.json`, { retained: 'x'.repeat(15 * 1024 * 1024) })
    }
    const original = profile([randomBytes(4 * 1024 * 1024).toString('base64')])
    expect(() => writeAllocationEvidence(writer, 'allocation-1.json', original)).toThrow('session-total')
    expect(await fs.readdir(root)).toHaveLength(4)
    expect(writer.accounting().bytesWritten).toBeLessThan(limits.maxTotalBytes)
  })

  it('有界文件读取核对实际大小、receipt 和期望种类，不能用 frames 冒充 profile', async () => {
    const root = await fixture()
    const writer = createEvidenceWriter(root)
    const original = profile(['', 'node:fs'])
    const stored = writeAllocationEvidence(writer, 'allocation-1.json', original)
    const file = path.join(root, 'allocation-1.json')
    expect(await readAllocationEvidenceFile(file, stored, 'profile')).toEqual(original)
    await expect(readAllocationEvidenceFile(file, undefined, 'profile')).rejects.toThrow('receipt')
    await expect(readAllocationEvidenceFile(file, { bytes: -1, sha256: stored.sha256 }, 'profile')).rejects.toThrow('receipt')
    await expect(readAllocationEvidenceFile(file, stored, 'frames')).rejects.toThrow('文件类型')
    await expect(readAllocationEvidenceFile(file, { ...stored, bytes: 1 }, 'profile')).rejects.toThrow('尺寸或哈希')
    const frames = { allocationFrames: [{ nodeId: 1, originalUrl: '' }] }
    const mapped = writeAllocationEvidence(writer, 'allocation-frames-1.json', frames)
    await expect(readAllocationEvidenceFile(path.join(root, 'allocation-frames-1.json'), mapped, 'profile')).rejects.toThrow('文件类型')
    const large = await fs.open(path.join(root, 'oversized.json'), 'w')
    try {
      await large.truncate(limits.maxProfileBytes + 1)
    }
    finally {
      await large.close()
    }
    await expect(readAllocationEvidenceFile(path.join(root, 'oversized.json'), { bytes: limits.maxProfileBytes + 1, sha256: '0'.repeat(64) })).rejects.toThrow('encoded-read')
  })

  it('真实 Node inspector 的递归分配按实际 URL 无损持久化并解码', async () => {
    const root = await fixture()
    const moduleUrl = name => new URL(`../scripts/diagnostics/${name}.mjs`, import.meta.url).href
    const entry = path.join(root, 'worker.mjs')
    await fs.writeFile(entry, `
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createAllocationSampler } from ${JSON.stringify(moduleUrl('sampling'))};
import { createEvidenceWriter } from ${JSON.stringify(moduleUrl('evidence'))};
import { decodeAllocationEvidence, writeAllocationEvidence } from ${JSON.stringify(moduleUrl('profile-codec'))};
const sampler = await createAllocationSampler();
try {
  const source = 'export function allocate(depth) { const values = new Array(100000).fill(depth); return depth ? [values, ...allocate(depth - 1)] : [values]; } /*' + 'x'.repeat(750000) + '*/';
  const url = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
  const { allocate } = await import(url);
  const retained = allocate(31);
  const sampling = await sampler.capture(true);
  const document = { sampling };
  const writer = createEvidenceWriter(${JSON.stringify(root)});
  const receipt = writeAllocationEvidence(writer, 'allocation-1.json', document);
  const raw = fs.readFileSync(path.join(${JSON.stringify(root)}, 'allocation-1.json'));
  assert.deepStrictEqual(decodeAllocationEvidence(raw, receipt), document);
  assert.equal(retained.length, 32);
  const encoded = JSON.parse(raw);
  console.log(JSON.stringify({ receipt, statistics: encoded.statistics, parameters: sampling.parameters }));
} finally { await sampler.close(); }
`)
    const { stdout } = await promisify(execFile)(process.execPath, [entry], { timeout: 30000, maxBuffer: 10000, env: { ...process.env, NODE_OPTIONS: '' } })
    const report = JSON.parse(stdout)
    expect(report.statistics.nodeCount).toBeGreaterThan(1)
    expect(report.statistics.sampleCount).toBeGreaterThan(0)
    expect(report.statistics.decodedDocumentBytes).toBeLessThan(limits.maxTotalBytes)
    expect(report.receipt.bytes).toBeLessThan(limits.maxProfileBytes)
    expect(report.parameters).toEqual({ samplingInterval: limits.samplingInterval, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true })
  }, 40000)
})
