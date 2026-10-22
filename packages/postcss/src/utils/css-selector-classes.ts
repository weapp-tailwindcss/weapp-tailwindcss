import selectorParser from 'postcss-selector-parser'

interface SelectorClass {
  readonly value: string
  readonly raw: string
}

interface CacheEntry {
  classes: readonly SelectorClass[]
  characters: number
}

/** 只缓存完整选择器的不可变语法结果，来源映射始终由本轮调用方查询。 */
export function createSelectorClassReader({ maxEntries = 4096, maxCharacters = 1_048_576 } = {}) {
  const cache = new Map<string, CacheEntry>()
  let characters = 0

  return (selector: string): readonly SelectorClass[] => {
    const cached = cache.get(selector)
    if (cached) {
      cache.delete(selector)
      cache.set(selector, cached)
      return cached.classes
    }

    let classes: SelectorClass[] = []
    try {
      selectorParser().astSync(selector).walkClasses((node) => {
        classes.push(Object.freeze({ value: node.value, raw: node.toString().slice(1) }))
      })
    }
    catch {
      // 不完整选择器不提供部分来源证据，也不回退到正则猜测归属。
      classes = []
    }
    Object.freeze(classes)
    const size = selector.length + classes.reduce((sum, item) => sum + item.value.length + item.raw.length, 0)
    if (maxEntries > 0 && size <= maxCharacters) {
      while (cache.size >= maxEntries || characters + size > maxCharacters) {
        const oldest = cache.keys().next().value
        if (oldest === undefined) {
          break
        }
        characters -= cache.get(oldest)!.characters
        cache.delete(oldest)
      }
      cache.set(selector, { classes, characters: size })
      characters += size
    }
    return classes
  }
}

export const readSelectorClasses = createSelectorClassReader()
