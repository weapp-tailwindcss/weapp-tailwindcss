import type { IJsHandlerOptions } from '../types'
import { replaceWxml } from '../wxml/shared'

export type ClassNameTransformDecision = 'direct' | 'escaped' | 'skip'
type EscapeMap = NonNullable<IJsHandlerOptions['escapeMap']>

const escapedCandidateCacheByEscapeMap = new WeakMap<EscapeMap, Map<string, string>>()
const defaultEscapedCandidateCache = new Map<string, string>()
let lastEscapedCandidateEscapeMap: EscapeMap | undefined
let lastEscapedCandidateCacheStore: Map<string, string> | undefined

/**
 * 决策结果，附带已计算的 escaped 值以避免下游重复计算。
 */
export interface ClassNameTransformResult {
  decision: ClassNameTransformDecision
  /** 仅在 decision 为 'escaped' 时有值，可直接作为替换结果复用 */
  escapedValue?: string
}

interface ResolveClassNameTransformOptions extends Pick<
  IJsHandlerOptions,
  | 'alwaysEscape'
  | 'classNameSet'
  | 'escapeMap'
  | 'jsArbitraryValueFallback'
  | 'jsPreserveClass'
  | 'tailwindcssMajorVersion'
> {
  classContext?: boolean
}

function isUrlLikeCandidate(candidate: string) {
  return candidate.startsWith('//')
    || candidate.startsWith('http://')
    || candidate.startsWith('https://')
}

function isPlainSlashPathCandidate(candidate: string) {
  if (isUrlLikeCandidate(candidate)) {
    return true
  }

  const slashIndex = candidate.indexOf('/')
  if (slashIndex <= 0) {
    return false
  }

  if (candidate.includes('[') || candidate.includes(']') || candidate.includes(':')) {
    return false
  }

  // Tailwind 斜杠语义通常出现在带 utility 前缀的 token 中，例如 w-1/2、bg-red-500/50。
  // 没有前缀分隔符的 slash token 更像业务 API、页面路由、文件路径或 MIME。
  return !candidate.slice(0, slashIndex).includes('-')
}

const SKIP_RESULT: ClassNameTransformResult = { decision: 'skip' }
const DIRECT_RESULT: ClassNameTransformResult = { decision: 'direct' }

function getEscapedCandidateCacheStore(escapeMap?: EscapeMap) {
  if (!escapeMap) {
    return defaultEscapedCandidateCache
  }

  if (escapeMap === lastEscapedCandidateEscapeMap && lastEscapedCandidateCacheStore) {
    return lastEscapedCandidateCacheStore
  }

  let store = escapedCandidateCacheByEscapeMap.get(escapeMap)
  if (!store) {
    store = new Map<string, string>()
    escapedCandidateCacheByEscapeMap.set(escapeMap, store)
  }
  lastEscapedCandidateEscapeMap = escapeMap
  lastEscapedCandidateCacheStore = store
  return store
}

function getEscapedCandidate(candidate: string, escapeMap?: EscapeMap, store = getEscapedCandidateCacheStore(escapeMap)) {
  let cached = store.get(candidate)
  if (cached === undefined) {
    cached = replaceWxml(candidate, { escapeMap, keepEOL: true })
    store.set(candidate, cached)
  }
  return cached
}

/**
 * JS 转译严格遵循 runtime class set：
 * 1. 直接命中 classNameSet 原始值；
 * 2. 兼容命中 classNameSet 中已转义值；
 * 3. 除显式 alwaysEscape 外，不允许绕过 classNameSet。
 *
 * 返回结构化结果，附带已计算的 escapedValue 以避免下游重复 escape。
 */
export function resolveClassNameTransformWithResult(
  candidate: string,
  {
    alwaysEscape,
    classNameSet,
    escapeMap,
    jsPreserveClass,
    classContext,
  }: ResolveClassNameTransformOptions,
): ClassNameTransformResult {
  if (jsPreserveClass?.(candidate)) {
    return SKIP_RESULT
  }

  if (alwaysEscape) {
    return DIRECT_RESULT
  }

  if (!classContext && isPlainSlashPathCandidate(candidate)) {
    return SKIP_RESULT
  }

  if (classNameSet?.has(candidate)) {
    return DIRECT_RESULT
  }

  if (classNameSet && classNameSet.size > 0) {
    const escapedCandidate = getEscapedCandidate(candidate, escapeMap)
    if (escapedCandidate !== candidate && classNameSet.has(escapedCandidate)) {
      return { decision: 'escaped', escapedValue: escapedCandidate }
    }
  }

  return SKIP_RESULT
}

/**
 * 兼容旧接口，仅返回 decision 字符串。
 */
export function resolveClassNameTransformDecision(
  candidate: string,
  options: ResolveClassNameTransformOptions,
): ClassNameTransformDecision {
  return resolveClassNameTransformWithResult(candidate, options).decision
}

export function shouldTransformClassNameCandidate(
  candidate: string,
  options: ResolveClassNameTransformOptions,
) {
  return resolveClassNameTransformDecision(candidate, options) !== 'skip'
}
