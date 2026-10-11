import type { NativeWxmlEscapeEntry } from './types'
import { ComplexMappingChars2String, escape } from '@weapp-tailwindcss/escape'

const entriesByMap = new WeakMap<Record<string, string>, NativeWxmlEscapeEntry[]>()
let defaultEntries: NativeWxmlEscapeEntry[] | undefined

/** 通过现有 escape 捕获有效表，保持普通自定义表的首次使用缓存语义。 */
export function getNativeWxmlEscapeEntries(map?: Record<string, string>) {
  // 复杂内置表可被直接修改；保留原实现的逐字符读取行为。
  if (map === ComplexMappingChars2String) {
    return undefined
  }
  const cached = map ? entriesByMap.get(map) : defaultEntries
  if (cached) {
    return cached
  }
  if (map && Object.values(Object.getOwnPropertyDescriptors(map)).some(descriptor => descriptor.get || descriptor.set)) {
    return undefined
  }
  const entries: NativeWxmlEscapeEntry[] = []
  for (let code = 0; code < 128; code++) {
    const character = String.fromCharCode(code)
    const replacement = escape(character, map ? { map, ignoreHead: true } : { ignoreHead: true })
    const preservesHead = (character === '-' || (code >= 48 && code <= 57))
      && escape(character, map ? { map } : undefined) === character
    if (replacement !== character || preservesHead) {
      entries.push({ character, replacement })
    }
  }
  if (map) {
    entriesByMap.set(map, entries)
  }
  else {
    defaultEntries = entries
  }
  return entries
}
