import { Buffer } from 'node:buffer'
import { limits } from './constants.mjs'
import { evidenceLimitError, sha256 } from './evidence.mjs'

export const allocationEncoding = 'weapp-tailwindcss.allocation-url-dictionary.v1'

const jsonBytes = value => Buffer.byteLength(JSON.stringify(value))
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const integer = value => Number.isSafeInteger(value) && value >= 0

function invalid(detail) {
  throw new Error(`分配证据 URL 字典结构无效：${detail}`)
}

function addBytes(left, right) {
  const sum = left + right
  if (!Number.isSafeInteger(sum)) {
    invalid('尺寸算术溢出')
  }
  return sum
}

// 只改协议明确声明的 URL 槽；扩展字段和同名业务字段保持原样。
function mapDocument(document, mapUrl) {
  if (!object(document)) {
    invalid('document')
  }
  let nodeCount = 0
  let sampleCount = 0
  let samplesWithoutNodeCount = 0
  let result
  if (object(document.sampling) && object(document.sampling.profile) && !Object.hasOwn(document, 'allocationFrames')) {
    const profile = document.sampling.profile
    const ids = new Set()
    const copy = (node) => {
      if (!object(node) || !integer(node.id) || ids.has(node.id) || !Number.isFinite(node.selfSize) || node.selfSize < 0 || !Array.isArray(node.children)) {
        invalid('profile node')
      }
      const frame = node.callFrame
      if (!object(frame) || typeof frame.functionName !== 'string' || !Number.isSafeInteger(frame.lineNumber) || !Number.isSafeInteger(frame.columnNumber)) {
        invalid('callFrame')
      }
      ids.add(node.id)
      nodeCount++
      return { ...node, callFrame: { ...frame, url: mapUrl(frame.url) }, children: [] }
    }
    const head = copy(profile.head)
    const pending = [[profile.head, head]]
    while (pending.length) {
      const [source, target] = pending.pop()
      for (const child of source.children) {
        const next = copy(child)
        target.children.push(next)
        pending.push([child, next])
      }
    }
    if (profile.samples !== undefined) {
      if (!Array.isArray(profile.samples)) {
        invalid('samples')
      }
      sampleCount = profile.samples.length
      for (const sample of profile.samples) {
        samplesWithoutNodeCount += Number(!ids.has(sample?.nodeId))
        if (!object(sample) || !integer(sample.nodeId) || !Number.isFinite(sample.size) || sample.size < 0 || !integer(sample.ordinal)) {
          invalid(`sample：${JSON.stringify({ nodeId: sample?.nodeId, knownNode: ids.has(sample?.nodeId), size: sample?.size, ordinal: sample?.ordinal })}`)
        }
      }
    }
    result = { ...document, sampling: { ...document.sampling, profile: { ...profile, head } } }
  }
  else if (Array.isArray(document.allocationFrames) && !Object.hasOwn(document, 'sampling')) {
    const ids = new Set()
    const allocationFrames = document.allocationFrames.map((frame) => {
      if (!object(frame) || !integer(frame.nodeId) || ids.has(frame.nodeId)) {
        invalid('allocationFrames')
      }
      ids.add(frame.nodeId)
      nodeCount++
      return { ...frame, originalUrl: mapUrl(frame.originalUrl) }
    })
    result = { ...document, allocationFrames }
  }
  else {
    invalid('profile 或 allocationFrames 必须唯一')
  }
  return { document: result, nodeCount, sampleCount, samplesWithoutNodeCount }
}

function dictionaryStatistics(urls) {
  const seen = new Set()
  let uniqueUrlUtf8Bytes = 0
  let largestUrlUtf8Bytes = 0
  const sizes = urls.map((url) => {
    if (typeof url !== 'string' || seen.has(url)) {
      invalid('URL 必须为唯一字符串')
    }
    seen.add(url)
    const utf8 = Buffer.byteLength(url)
    uniqueUrlUtf8Bytes = addBytes(uniqueUrlUtf8Bytes, utf8)
    largestUrlUtf8Bytes = Math.max(largestUrlUtf8Bytes, utf8)
    return { utf8, json: jsonBytes(url) }
  })
  return { sizes, uniqueUrlUtf8Bytes, largestUrlUtf8Bytes }
}

function inspectEnvelope(envelope) {
  if (!object(envelope) || envelope.encoding !== allocationEncoding || !Array.isArray(envelope.urls)
    || Object.keys(envelope).some(key => !['encoding', 'urls', 'document', 'statistics'].includes(key))) {
    invalid('envelope schema/version')
  }
  const { sizes, ...dictionary } = dictionaryStatistics(envelope.urls)
  let delta = 0
  let urlReferences = 0
  let expandedUrlUtf8Bytes = 0
  const used = new Set()
  const mapped = mapDocument(envelope.document, (index) => {
    if (!integer(index) || index >= envelope.urls.length) {
      invalid('URL index')
    }
    used.add(index)
    urlReferences++
    delta = addBytes(delta, sizes[index].json - String(index).length)
    expandedUrlUtf8Bytes = addBytes(expandedUrlUtf8Bytes, sizes[index].utf8)
    return index
  })
  if (used.size !== envelope.urls.length) {
    invalid('未引用的 URL')
  }
  const encodedDocumentBytes = jsonBytes(envelope.document)
  return {
    nodeCount: mapped.nodeCount,
    sampleCount: mapped.sampleCount,
    samplesWithoutNodeCount: mapped.samplesWithoutNodeCount,
    urlReferences,
    uniqueUrls: envelope.urls.length,
    ...dictionary,
    expandedUrlUtf8Bytes,
    encodedDocumentBytes,
    decodedDocumentBytes: addBytes(encodedDocumentBytes, delta),
  }
}

function assertDecodedLimit(statistics, filename, bytesWritten = 0) {
  // 传输仍受原 16 MiB/64 MiB 预算约束；额外限制逻辑展开尺寸，不能让字典形成解码炸弹。
  if (statistics.decodedDocumentBytes > limits.maxTotalBytes) {
    throw evidenceLimitError({ filename, bytes: statistics.decodedDocumentBytes, maximum: limits.maxTotalBytes, bytesWritten, scope: 'decoded-document', statistics })
  }
}

export function encodeAllocationEvidence(document, { filename = 'allocation.json', bytesWritten = 0 } = {}) {
  const urls = []
  const indices = new Map()
  const mapped = mapDocument(document, (url) => {
    if (typeof url !== 'string') {
      invalid('原始 URL 必须为字符串')
    }
    if (!indices.has(url)) {
      indices.set(url, urls.length)
      urls.push(url)
    }
    return indices.get(url)
  })
  const envelope = { encoding: allocationEncoding, urls, document: mapped.document }
  const statistics = inspectEnvelope(envelope)
  assertDecodedLimit(statistics, filename, bytesWritten)
  return { ...envelope, statistics }
}

export function writeAllocationEvidence(writer, filename, document) {
  const envelope = encodeAllocationEvidence(document, { filename, ...writer.accounting() })
  return writer.write(filename, envelope, limits.maxProfileBytes, envelope.statistics)
}

export function decodeAllocationEvidence(raw, receipt, filename = 'allocation.json', expectedKind) {
  const size = Buffer.byteLength(raw)
  if (size > limits.maxProfileBytes) {
    throw evidenceLimitError({ filename, bytes: size, maximum: limits.maxProfileBytes, bytesWritten: 0, scope: 'encoded-read' })
  }
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
  if (receipt && (receipt.bytes !== bytes.length || receipt.sha256 !== sha256(bytes))) {
    throw new Error(`分配证据文件尺寸或哈希不匹配：${filename}`)
  }
  const value = JSON.parse(bytes.toString('utf8'))
  if (!object(value)) {
    invalid('根对象')
  }
  const document = Object.hasOwn(value, 'encoding') ? value.document : value
  if (expectedKind && (expectedKind === 'profile' ? !object(document?.sampling) : expectedKind === 'frames' ? !Array.isArray(document?.allocationFrames) : true)) {
    invalid(`文件类型应为 ${expectedKind}`)
  }
  if (!Object.hasOwn(value, 'encoding')) {
    return mapDocument(value, (url) => {
      if (typeof url !== 'string') {
        invalid('旧格式 URL')
      }
      return url
    }).document
  }
  const statistics = inspectEnvelope(value)
  if (!object(value.statistics) || Object.keys(value.statistics).length !== Object.keys(statistics).length
    || Object.entries(statistics).some(([key, count]) => value.statistics[key] !== count)) {
    invalid('statistics')
  }
  assertDecodedLimit(statistics, filename)
  // 在验证全部槽、尺寸与 receipt 后才还原，字符串复用字典引用，不重复分配 URL 内容。
  return mapDocument(value.document, index => value.urls[index]).document
}
