import type { IJsHandlerOptions } from '../types'
import { replaceWxml } from '../wxml/shared'

type EscapeMap = NonNullable<IJsHandlerOptions['escapeMap']>

const replacementCacheByEscapeMap = new WeakMap<EscapeMap, Map<string, string>>()
const defaultReplacementCache = new Map<string, string>()

export function getReplacementCacheStore(escapeMap?: EscapeMap) {
  if (!escapeMap) {
    return defaultReplacementCache
  }

  let store = replacementCacheByEscapeMap.get(escapeMap)
  if (!store) {
    store = new Map<string, string>()
    replacementCacheByEscapeMap.set(escapeMap, store)
  }
  return store
}

export function getReplacement(
  candidate: string,
  escapeMap: EscapeMap | undefined,
  store = getReplacementCacheStore(escapeMap),
) {
  let cached = store.get(candidate)
  if (cached === undefined) {
    cached = replaceWxml(candidate, { escapeMap, keepEOL: true })
    store.set(candidate, cached)
  }
  return cached
}
