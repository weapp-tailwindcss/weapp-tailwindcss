/** 模块与 design system 的跨会话复用有界，命中时更新最近使用顺序。 */
export class BoundedCache<K, V> extends Map<K, V> {
  constructor(private readonly limit: number) {
    super()
  }

  override get(key: K) {
    const value = super.get(key)
    if (super.has(key)) {
      super.delete(key)
      super.set(key, value!)
    }
    return value
  }

  override set(key: K, value: V) {
    super.delete(key)
    super.set(key, value)
    while (this.size > this.limit) {
      super.delete(this.keys().next().value!)
    }
    return this
  }
}
