function immutableCollection<T extends Map<unknown, unknown> | Set<unknown>>(target: T): T {
  const view = new Proxy(target, {
    get(collection, key) {
      if (key === 'set' || key === 'add' || key === 'delete' || key === 'clear') {
        return () => {
          throw new TypeError('编译配置快照不能修改。')
        }
      }
      if (key === 'forEach') {
        return (callback: (value: unknown, key: unknown, collection: T) => void, thisArg?: unknown) => {
          collection.forEach((value, entryKey) => callback.call(thisArg, value, entryKey, view))
        }
      }
      const value = Reflect.get(collection, key, collection)
      return typeof value === 'function' && key !== 'constructor' ? value.bind(collection) : value
    },
  })
  return Object.freeze(view)
}

/** 复制配置数据和映射容器，保留函数与不透明插件实例身份，不冻结用户对象。 */
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
  if (value instanceof Map) {
    const copy = new Map<unknown, unknown>()
    const view = immutableCollection(copy)
    seen.set(value, view)
    for (const [key, item] of value) {
      copy.set(snapshotConfiguration(key, seen), snapshotConfiguration(item, seen))
    }
    return view as T
  }
  if (value instanceof Set) {
    const copy = new Set<unknown>()
    const view = immutableCollection(copy)
    seen.set(value, view)
    for (const item of value) {
      copy.add(snapshotConfiguration(item, seen))
    }
    return view as T
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
