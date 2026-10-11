import { MappingChars2String, MappingChars2StringEntries } from '@weapp-tailwindcss/escape'

const defaultEntries = MappingChars2StringEntries.map(([key, value]) => [key, value] as const)
const snapshots = new WeakMap<Record<string, string>, Record<string, string>>()

function sameEntries(left: Record<string, string>, right: Record<string, string>) {
  const entries = Object.entries(left)
  return entries.length === Object.keys(right).length
    && entries.every(([key, value]) => Object.hasOwn(right, key) && right[key] === value)
}

/** 按映射内容而非对象身份复用快照，隔离底层 escape 包的身份缓存。 */
export function resolveCssEscapeMap(map?: Record<string, string>): Record<string, string> | undefined {
  if (!map) {
    return undefined
  }
  if (map === MappingChars2String && Object.keys(map).length === defaultEntries.length && defaultEntries.every(([key, value]) => map[key] === value)) {
    return undefined
  }
  const merged: Record<string, string> = { ...MappingChars2String, ...map }
  if (Object.keys(merged).length === defaultEntries.length && defaultEntries.every(([key, value]) => merged[key] === value)) {
    return undefined
  }
  const previous = snapshots.get(map)
  if (previous && sameEntries(merged, previous)) {
    return previous
  }
  snapshots.set(map, merged)
  return merged
}

export const defaultCssEscapeKeys = defaultEntries.map(([key]) => key)
