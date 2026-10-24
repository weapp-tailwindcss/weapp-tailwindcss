import { evidenceLimitError } from './evidence.mjs'

// 在 stringify 分配完整字符串前计算 JSON 的实际 UTF-8 尺寸；诊断文档只接受普通 JSON 数据。
export function boundedJsonBytes(value, { filename, maximum, bytesWritten = 0, scope = 'decoded-document' }) {
  let bytes = 0
  const add = (count) => {
    bytes += count
    if (!Number.isSafeInteger(bytes) || bytes > maximum) {
      throw evidenceLimitError({ filename, bytes, maximum, bytesWritten, scope })
    }
  }
  const string = (text) => {
    add(2)
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i)
      if (code === 34 || code === 92 || code === 8 || code === 9 || code === 10 || code === 12 || code === 13) {
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
  const omitted = item => ['undefined', 'function', 'symbol'].includes(typeof item)
  const active = new Set()
  const pending = [{ value }]
  while (pending.length) {
    const task = pending.pop()
    if (task.exit) {
      active.delete(task.value)
      continue
    }
    const item = task.value
    if (item === null || omitted(item)) {
      add(4)
    }
    else if (typeof item === 'string') {
      string(item)
    }
    else if (typeof item === 'number') {
      add(Number.isFinite(item) ? String(item).length : 4)
    }
    else if (typeof item === 'boolean') {
      add(item ? 4 : 5)
    }
    else if (typeof item !== 'object' || active.has(item) || (!Array.isArray(item) && ![Object.prototype, null].includes(Object.getPrototypeOf(item))) || typeof item.toJSON === 'function') {
      throw new Error('分配证据必须为无循环、无自定义序列化的普通 JSON 数据')
    }
    else {
      active.add(item)
      add(2)
      pending.push({ value: item, exit: true })
      if (Array.isArray(item)) {
        add(Math.max(0, item.length - 1))
        for (let i = item.length - 1; i >= 0; i--) {
          pending.push({ value: item[i] })
        }
      }
      else {
        const keys = Object.keys(item).filter(key => !omitted(item[key]))
        add(Math.max(0, keys.length - 1))
        for (const key of keys) {
          string(key)
          add(1)
          pending.push({ value: item[key] })
        }
      }
    }
  }
  return bytes
}
