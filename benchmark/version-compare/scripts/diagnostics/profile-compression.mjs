import { Buffer, isUtf8 } from 'node:buffer'
import { gunzipSync, gzipSync } from 'node:zlib'
import { limits } from './constants.mjs'
import { boundedJsonBytes } from './profile-json.mjs'

export const compressedAllocationEncoding = 'weapp-tailwindcss.allocation-gzip.v1'

function invalid(detail) {
  throw new Error(`分配证据压缩结构无效：${detail}`)
}

export function compressAllocationEnvelope(document, { filename, bytesWritten = 0 }) {
  const uncompressedBytes = boundedJsonBytes(document, { filename, maximum: limits.maxTotalBytes, bytesWritten, scope: 'compression-input' })
  const envelope = { encoding: compressedAllocationEncoding, uncompressedBytes, statistics: document.statistics, data: '' }
  // Base64 和封装同样占用原 16 MiB；zlib 在实际输出越界时终止，不能先生成无界压缩结果。
  const overhead = Buffer.byteLength(JSON.stringify(envelope)) + 1
  const maximum = Math.floor((limits.maxProfileBytes - overhead) / 4) * 3
  let compressed
  try {
    compressed = gzipSync(Buffer.from(JSON.stringify(document)), { maxOutputLength: maximum })
  }
  catch (cause) {
    throw new Error(`分配证据压缩失败：${JSON.stringify({ filename, maximumCompressedBytes: maximum, bytesWritten, fileMaximum: limits.maxProfileBytes, totalMaximum: limits.maxTotalBytes, statistics: document.statistics })}`, { cause })
  }
  return { ...envelope, data: compressed.toString('base64') }
}

export function decompressAllocationEnvelope(envelope, filename) {
  if (envelope.encoding !== compressedAllocationEncoding || Object.keys(envelope).length !== 4
    || Object.keys(envelope).some(key => !['encoding', 'uncompressedBytes', 'statistics', 'data'].includes(key))
    || !Number.isSafeInteger(envelope.uncompressedBytes) || envelope.uncompressedBytes < 0
    || envelope.uncompressedBytes > limits.maxTotalBytes
    || typeof envelope.data !== 'string' || envelope.data.length === 0 || envelope.data.length % 4 !== 0
    || !/^[A-Z\d+/]*={0,2}$/i.test(envelope.data)) {
    invalid('envelope schema/version/base64')
  }
  const compressed = Buffer.from(envelope.data, 'base64')
  if (compressed.toString('base64') !== envelope.data) {
    invalid('非规范 base64')
  }
  let raw
  try {
    // 实际解压上限固定为 64 MiB，绝不使用 envelope 自报尺寸分配输出。
    raw = gunzipSync(compressed, { maxOutputLength: limits.maxTotalBytes })
  }
  catch (cause) {
    throw new Error(`分配证据解压失败或实际输出超过固定上限：${filename}`, { cause })
  }
  if (raw.length !== envelope.uncompressedBytes) {
    invalid('实际解压尺寸不匹配')
  }
  if (!isUtf8(raw)) {
    invalid('解压内容不是合法 UTF-8')
  }
  return JSON.parse(raw.toString('utf8'))
}
