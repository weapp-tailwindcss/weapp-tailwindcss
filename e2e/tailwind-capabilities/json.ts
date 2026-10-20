import { randomUUID } from 'node:crypto'
import { open, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { types } from 'node:util'

class JsonArray {
  constructor(readonly values: Iterable<unknown>) {}
}

/** 延迟枚举 JSON 数组，避免为落盘重新创建完整 registry 和 evidence。 */
export function jsonArray(values: Iterable<unknown>) {
  return new JsonArray(values)
}

function* stringTokens(value: string): Generator<string> {
  yield '"'
  for (let start = 0; start < value.length;) {
    let end = Math.min(start + 8192, value.length)
    const last = value.charCodeAt(end - 1)
    if (end < value.length && last >= 0xD800 && last <= 0xDBFF) {
      end--
    }
    yield JSON.stringify(value.slice(start, end)).slice(1, -1)
    start = end
  }
  yield '"'
}

function jsonValue(value: unknown, key: string): unknown {
  if (value && typeof value === 'object' && 'toJSON' in value && typeof value.toJSON === 'function') {
    value = value.toJSON(key)
  }
  if (types.isNumberObject(value) || types.isStringObject(value) || types.isBooleanObject(value)) {
    return value.valueOf()
  }
  return value
}

function omitted(value: unknown) {
  return value === undefined || typeof value === 'function' || typeof value === 'symbol'
}

function* tokens(value: unknown, ancestors: Set<object>): Generator<string> {
  if (typeof value === 'string') {
    yield* stringTokens(value)
    return
  }
  if (!value || typeof value !== 'object') {
    yield JSON.stringify(value) ?? 'null'
    return
  }
  if (ancestors.has(value)) {
    throw new TypeError('Converting circular structure to JSON')
  }
  ancestors.add(value)
  try {
    if (Array.isArray(value) || value instanceof JsonArray) {
      yield '['
      let index = 0
      for (const entry of value instanceof JsonArray ? value.values : value) {
        if (index) {
          yield ','
        }
        yield* tokens(jsonValue(entry, String(index++)), ancestors)
      }
      yield ']'
      return
    }
    yield '{'
    let count = 0
    for (const key of Object.keys(value)) {
      const entry = jsonValue((value as Record<string, unknown>)[key], key)
      if (omitted(entry)) {
        continue
      }
      if (count++) {
        yield ','
      }
      yield* stringTokens(key)
      yield ':'
      yield* tokens(entry, ancestors)
    }
    yield '}'
  }
  finally {
    ancestors.delete(value)
  }
}

/** 单个写入块有界；切块时保留 UTF-16 代理对，不能破坏原始证据中的 Unicode。 */
export function* jsonChunks(value: unknown, maxChunkChars = 64 * 1024): Generator<string> {
  if (!Number.isInteger(maxChunkChars) || maxChunkChars < 2) {
    throw new Error('JSON chunk size must be an integer of at least 2')
  }
  let pending = ''
  for (const token of tokens(jsonValue(value, ''), new Set())) {
    pending += token
    while (pending.length >= maxChunkChars) {
      let end = maxChunkChars
      const last = pending.charCodeAt(end - 1)
      if (last >= 0xD800 && last <= 0xDBFF && end < pending.length) {
        end--
      }
      yield pending.slice(0, end)
      pending = pending.slice(end)
    }
  }
  if (pending) {
    yield pending
  }
  yield '\n'
}

/** 使用同目录临时文件发布完整 JSON；序列化失败不留下看似完整的半份报告。 */
export async function writeJsonFile(file: string, value: unknown, maxChunkChars?: number) {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`)
  const handle = await open(temporary, 'wx')
  let closed = false
  let published = false
  try {
    for (const chunk of jsonChunks(value, maxChunkChars)) {
      await handle.writeFile(chunk)
    }
    await handle.close()
    closed = true
    await rename(temporary, file)
    published = true
  }
  finally {
    if (!closed) {
      await handle.close()
    }
    if (!published) {
      await rm(temporary, { force: true })
    }
  }
}
