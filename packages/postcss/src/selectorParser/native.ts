import type { EscapeMappingEntry } from '../native/binding'
import type { InternalCssSelectorReplacerOptions } from '../types'
import { loadNativeCssBinding } from '../native/binding'
import { defaultCssEscapeKeys, resolveCssEscapeMap } from '../utils/escape-map'

export { loadNativeCssBinding as loadNativeSelectorBinding } from '../native/binding'
export type { NativeCssBinding as NativeSelectorBinding } from '../native/binding'

const mappingCache = new WeakMap<Record<string, string>, EscapeMappingEntry[]>()

function resolveMapping(escapeMap: Record<string, string> | undefined) {
  const snapshot = resolveCssEscapeMap(escapeMap)
  if (snapshot === undefined) {
    return undefined
  }
  let entries = mappingCache.get(snapshot)
  if (!entries) {
    entries = [...new Set([...defaultCssEscapeKeys, ...Object.keys(snapshot)])]
      .filter(key => key.length === 1 && key.charCodeAt(0) < 128)
      .map(key => ({ key: key.charCodeAt(0), value: snapshot[key] }))
    mappingCache.set(snapshot, entries)
  }
  return entries
}

/** 原生内核只接管可完整处理的选择器；复杂语法与自定义映射继续经过 AST。 */
export function transformNativeSelector(value: string, options?: InternalCssSelectorReplacerOptions) {
  if (resolveCssEscapeMap(options?.escapeMap) !== undefined) {
    return undefined
  }
  return loadNativeCssBinding()?.transformSelector(value) ?? undefined
}

export function escapeNativeSelectorClasses(values: string[], options?: InternalCssSelectorReplacerOptions) {
  return loadNativeCssBinding()?.escapeClasses(values, resolveMapping(options?.escapeMap))
}
