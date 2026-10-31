import type { ProcessOptions } from 'postcss'

function isSnapshotData(value: unknown, seen: Set<object>): boolean {
  if (typeof value === 'function' || typeof value === 'symbol') {
    return false
  }
  if (value === null || typeof value !== 'object') {
    return true
  }
  const prototype = Object.getPrototypeOf(value)
  if (Array.isArray(value) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
    return false
  }
  if (seen.has(value)) {
    return true
  }
  seen.add(value)
  const keys = Reflect.ownKeys(value)
  if (Array.isArray(value) && keys.length !== value.length + 1) {
    return false
  }
  return keys.every((key) => {
    if (typeof key === 'symbol') {
      return false
    }
    if (Array.isArray(value)) {
      if (key === 'length') {
        return true
      }
      const index = Number(key)
      if (!Number.isInteger(index) || index < 0 || index >= value.length || String(index) !== key) {
        return false
      }
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    return descriptor?.enumerable === true && 'value' in descriptor && isSnapshotData(descriptor.value, seen)
  })
}

/** 函数身份不能代表闭包状态；不透明处理选项必须交给本轮真实 LazyResult 执行。 */
export function hasOpaqueProcessOptions(options?: ProcessOptions): boolean {
  if (options === undefined) {
    return false
  }
  try {
    return !isSnapshotData(options, new Set())
  }
  catch {
    return true
  }
}
