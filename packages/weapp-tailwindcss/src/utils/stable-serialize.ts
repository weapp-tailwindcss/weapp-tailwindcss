/** 统一生成缓存的配置身份；映射顺序和正则游标不改变配置语义。 */
export function stableSerialize(value: unknown, stack = new WeakSet<object>()): string {
  if (value == null || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'function') {
    return `[Function:${value.name}]`
  }
  if (typeof value !== 'object') {
    return String(value)
  }
  if (stack.has(value)) {
    return '[Circular]'
  }
  if (value instanceof RegExp) {
    return `RegExp(${JSON.stringify(value.source)},${JSON.stringify(value.flags)})`
  }
  stack.add(value)
  let serialized: string
  if (value instanceof Map) {
    const entries = [...value].map(([key, item]) => `[${stableSerialize(key, stack)},${stableSerialize(item, stack)}]`)
    serialized = `Map(${entries.sort().join(',')})`
  }
  else if (Array.isArray(value)) {
    serialized = `[${value.map(item => stableSerialize(item, stack)).join(',')}]`
  }
  else {
    serialized = `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key], stack)}`).join(',')}}`
  }
  stack.delete(value)
  return serialized
}
