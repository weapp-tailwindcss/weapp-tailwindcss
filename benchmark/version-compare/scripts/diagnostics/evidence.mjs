import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { limits } from './constants.mjs'

export const sha256 = value => createHash('sha256').update(value).digest('hex')

export function rootRelativeKey(value, root, platform = process.platform) {
  if (typeof value !== 'string') {
    return value
  }
  let file = value
  if (file.startsWith('file:')) {
    try {
      file = fileURLToPath(file, { windows: platform === 'win32' })
    }
    catch {
      return value
    }
  }
  const implementation = platform === 'win32' ? path.win32 : path.posix
  const suffixIndex = file.search(/[?#]/)
  const suffix = suffixIndex < 0 ? '' : file.slice(suffixIndex)
  const pathname = suffixIndex < 0 ? file : file.slice(0, suffixIndex)
  if (!implementation.isAbsolute(pathname) || !implementation.isAbsolute(root)) {
    return value
  }
  const relative = implementation.relative(root, pathname)
  if (relative === '..' || relative.startsWith(`..${implementation.sep}`) || implementation.isAbsolute(relative)) {
    return value
  }
  return `<root>/${relative.split(implementation.sep).join('/')}${suffix}`
}

function sortedCandidates(values) {
  const candidates = [...values].sort()
  if (candidates.length > limits.maxCandidates) {
    throw new Error('完整候选集合超过诊断上限')
  }
  return candidates
}

export function candidateEvidence(store, root, onSnapshot) {
  const snapshot = store.snapshot()
  const result = { revision: store.getRevision(), candidates: sortedCandidates(store.values()), maps: {} }
  let count = 0
  for (const [name, entries] of Object.entries(snapshot)) {
    if (name === 'inlineIncludedCandidates' || name === 'inlineExcludedCandidates') {
      result.maps[name] = sortedCandidates(entries)
      continue
    }
    if (!Array.isArray(entries)) {
      throw new TypeError(`未知候选快照字段：${name}`)
    }
    count += entries.length
    if (count > limits.maxSourceEntries) {
      throw new Error('完整来源集合超过诊断上限')
    }
    result.maps[name] = entries.map(([key, value]) => ({
      key,
      comparableKey: rootRelativeKey(key, root),
      ...(typeof value === 'string'
        ? { sha256: sha256(Buffer.from(value)), utf8Bytes: Buffer.byteLength(value), utf16Length: value.length }
        : { candidates: sortedCandidates(value) }),
    })).sort((a, b) => a.key.localeCompare(b.key))
  }
  onSnapshot?.(snapshot)
  return result
}

export function compilationCandidates(collections) {
  return Object.fromEntries(Object.entries(collections).map(([name, values]) => [name, sortedCandidates(values)]))
}

export function evidenceLimitError({ filename, bytes, maximum, bytesWritten, scope = 'encoded-file', statistics }) {
  return new Error(`诊断输出超过固定上限；本份证据未写入，不做静默截断：${JSON.stringify({ filename, bytes, maximum, bytesWritten, totalMaximum: limits.maxTotalBytes, fileMaximum: limits.maxProfileBytes, scope, statistics })}`)
}

export function createEvidenceWriter(directory) {
  let bytesWritten = 0
  let filesWritten = 0
  function write(name, value, maximum = limits.maxProfileBytes, statistics) {
    if (path.basename(name) !== name) {
      throw new Error('诊断文件名不能越过会话目录')
    }
    const payload = Buffer.from(`${JSON.stringify(value)}\n`)
    if (payload.length > maximum || bytesWritten + payload.length > limits.maxTotalBytes) {
      throw evidenceLimitError({ filename: name, bytes: payload.length, maximum, bytesWritten, scope: payload.length > maximum ? 'encoded-file' : 'session-total', statistics })
    }
    fs.writeFileSync(path.join(directory, name), payload, { flag: 'wx' })
    bytesWritten += payload.length
    filesWritten++
    return { sha256: sha256(payload), bytes: payload.length }
  }
  return { write, accounting: () => ({ bytesWritten, filesWritten }) }
}
