/** 复制配置数据，保留函数与不透明插件实例身份，不冻结用户对象。 */
export function snapshotConfiguration<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (!value || typeof value !== 'object') {
    return value
  }
  const cached = seen.get(value)
  if (cached) {
    return cached as T
  }
  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags) as T
  }
  if (value instanceof Date) {
    return new Date(value) as T
  }
  if (Array.isArray(value)) {
    const copy: unknown[] = []
    seen.set(value, copy)
    copy.push(...value.map(item => snapshotConfiguration(item, seen)))
    return Object.freeze(copy) as T
  }
  const prototype = Object.getPrototypeOf(value)
  if ((prototype !== Object.prototype && prototype !== null) || 'postcssPlugin' in value) {
    return value
  }
  const copy: Record<PropertyKey, unknown> = {}
  seen.set(value, copy)
  for (const key of Reflect.ownKeys(value)) {
    copy[key] = snapshotConfiguration(Reflect.get(value, key), seen)
  }
  return Object.freeze(copy) as T
}
