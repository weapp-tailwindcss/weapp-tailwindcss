import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'

export const limits = Object.freeze({
  maxEvents: 16384,
  maxSnapshots: 8,
  maxFileBytes: 16 * 1024 * 1024,
  maxDecodedBytes: 64 * 1024 * 1024,
  maxTotalBytes: 64 * 1024 * 1024,
  maxSourceBytes: 32 * 1024 * 1024,
  maxSourceFiles: 512,
  samplingInterval: 256 * 1024,
})
export const sha256 = value => createHash('sha256').update(value).digest('hex')
export function describeFailure(value, seen = new Map()) {
  if (!(value instanceof Error)) {
    return {
      thrownType: typeof value,
      value: String(value),
    }
  }
  if (seen.has(value)) {
    return {
      reference: seen.get(value),
    }
  }
  const id = seen.size + 1
  seen.set(value, id)
  return {
    id,
    name: value.name,
    message: value.message,
    stack: value.stack,
    ...(Object.hasOwn(value, 'cause')
      ? {
          cause: describeFailure(value.cause, seen),
        }
      : {}),
    ...(value instanceof AggregateError
      ? {
          errors: value.errors.map(error => describeFailure(error, seen)),
        }
      : {}),
  }
}
export const failureText = value => value instanceof Error ? `${value.name}: ${value.message}` : String(value)

/** 在完整序列化前核对实际 JSON UTF-8 尺寸；拒绝循环和自定义对象。 */
export function jsonBytes(value, maximum = limits.maxDecodedBytes) {
  let bytes = 0
  const add = (count) => {
    bytes += count
    if (!Number.isSafeInteger(bytes) || bytes > maximum) {
      throw new Error(`运行时诊断 JSON 超限：${bytes} > ${maximum}`)
    }
  }
  const string = (text) => {
    add(2)
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i)
      if (code === 34 || code === 92 || [8, 9, 10, 12, 13].includes(code)) {
        add(2)
      }
      else if (code < 32) {
        add(6)
      }
      else if (code < 128) {
        add(1)
      }
      else if (code < 2048) {
        add(2)
      }
      else if (code >= 0xD800 && code <= 0xDFFF) {
        const next = text.charCodeAt(i + 1)
        if (code <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF) {
          add(4)
          i++
        }
        else {
          add(6)
        }
      }
      else {
        add(3)
      }
    }
  }
  const active = new Set()
  const tasks = [{
    value,
  }]
  while (tasks.length) {
    const item = tasks.pop()
    if (item.exit) {
      active.delete(item.value)
      continue
    }
    const current = item.value
    if (current === null || current === undefined) {
      add(4)
    }
    else if (typeof current === 'string') {
      string(current)
    }
    else if (typeof current === 'boolean') {
      add(current ? 4 : 5)
    }
    else if (typeof current === 'number') {
      add(Number.isFinite(current) ? String(current).length : 4)
    }
    else {
      if (typeof current !== 'object' || active.has(current) || (!Array.isArray(current) && ![Object.prototype, null].includes(Object.getPrototypeOf(current))) || typeof current.toJSON === 'function') {
        throw new Error('运行时诊断只接受无循环的普通 JSON')
      }
      active.add(current)
      add(2)
      tasks.push({
        value: current,
        exit: true,
      })
      if (Array.isArray(current)) {
        add(Math.max(0, current.length - 1))
        for (let i = current.length - 1; i >= 0; i--) {
          tasks.push({
            value: current[i],
          })
        }
      }
      else {
        const keys = Object.keys(current).filter(key => current[key] !== undefined)
        add(Math.max(0, keys.length - 1))
        for (const key of keys) {
          string(key)
          add(1)
          tasks.push({
            value: current[key],
          })
        }
      }
    }
  }
  return bytes
}

/** 总账记录当前实际文件尺寸；证据超限停止诊断，不截断后冒充完整。 */
export function createWorkerEvidence(directory) {
  const streams = new Map()
  const sizes = new Map()
  let totalBytes = 0
  let events = 0
  const costs = {
    dataWriteMs: 0,
    statusWriteMs: 0,
  }
  let closed = false
  const checkName = (name) => {
    if (path.basename(name) !== name) {
      throw new Error('运行时诊断文件越过会话目录')
    }
  }
  function checkSize(name, bytes, replacement = false) {
    const previous = replacement ? sizes.get(name) ?? 0 : 0
    if (bytes > limits.maxFileBytes || totalBytes - previous + bytes > limits.maxTotalBytes - 65536) {
      throw new Error(`运行时诊断输出超限：${JSON.stringify({
        name,
        bytes,
        totalBytes,
        limits,
      })}`)
    }
    return previous
  }
  function write(name, data, replace = false) {
    checkName(name)
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data)
    const previous = checkSize(name, bytes.length, replace)
    const started = performance.now()
    if (replace) {
      const temporary = path.join(directory, `.${name}.${process.pid}`)
      fs.writeFileSync(temporary, bytes)
      fs.renameSync(temporary, path.join(directory, name))
    }
    else {
      fs.writeFileSync(path.join(directory, name), bytes, {
        flag: 'wx',
      })
    }
    sizes.set(name, bytes.length)
    totalBytes += bytes.length - previous
    costs[replace ? 'statusWriteMs' : 'dataWriteMs'] += performance.now() - started
    return {
      sha256: sha256(bytes),
      bytes: bytes.length,
    }
  }
  function json(name, value, replace = false) {
    jsonBytes(value, limits.maxFileBytes - 1)
    return write(name, `${JSON.stringify(value)}\n`, replace)
  }
  function append(name, value) {
    checkName(name)
    if (closed) {
      throw new Error('运行时诊断事件文件已关闭')
    }
    if (++events > limits.maxEvents) {
      throw new Error('运行时诊断事件数超过固定上限')
    }
    jsonBytes(value, limits.maxFileBytes - 1)
    const data = Buffer.from(`${JSON.stringify(value)}\n`)
    let stream = streams.get(name)
    if (!stream) {
      stream = {
        fd: fs.openSync(path.join(directory, name), 'wx'),
        hash: createHash('sha256'),
        bytes: 0,
        events: 0,
      }
      streams.set(name, stream)
    }
    checkSize(name, stream.bytes + data.length, true)
    const started = performance.now()
    let offset = 0
    while (offset < data.length) {
      const written = fs.writeSync(stream.fd, data, offset, data.length - offset)
      if (!written) {
        throw new Error('运行时诊断写入没有推进')
      }
      stream.hash.update(data.subarray(offset, offset + written))
      offset += written
      stream.bytes += written
      totalBytes += written
    }
    stream.events++
    sizes.set(name, stream.bytes)
    costs.dataWriteMs += performance.now() - started
  }
  return {
    json,
    write,
    append,
    accounting: () => ({
      totalBytes,
      events,
      costs: {
        ...costs,
      },
    }),
    eventFiles: () => [...streams].map(([file, stream]) => ({
      file,
      receipt: {
        sha256: stream.hash.copy().digest('hex'),
        bytes: stream.bytes,
        events: stream.events,
      },
    })),
    close() {
      if (closed) {
        return
      }
      closed = true
      const failures = []
      for (const stream of streams.values()) {
        try {
          fs.closeSync(stream.fd)
        }
        catch (error) {
          failures.push(error)
        }
      }
      if (failures.length) {
        throw new AggregateError(failures, '运行时诊断事件文件关闭失败')
      }
    },
  }
}
