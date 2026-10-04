import type { CreateJsHandlerOptions, IJsHandlerOptions, JsHandler, JsHandlerResult } from '../types'
import { LRUCache } from 'lru-cache'
import { md5Hash } from '../cache/md5'
import { defuOverrideArray } from '../utils'
import { jsHandler } from './babel'
import { nativeJsHandler } from './fast-path/native'
import { oxcJsHandler } from './fast-path/oxc'
import { hasDependencyHint } from './precheck'

export {
  jsHandler,
}
export { transformLiteralText } from './literal-transform'

/** 默认 LRU 缓存最大条目数 */
const RESULT_CACHE_MAX = 512
/** 仅对短片段做内层结果缓存，避免 bundler 热路径重复 hash 大块 JS。 */
const CACHEABLE_SOURCE_MAX_LENGTH = 512

/** 为每个 ClassNameSet 实例分配递增 ID */
const classNameSetIds = new WeakMap<Set<string>, number>()
let nextClassNameSetId = 0

/**
 * 获取 ClassNameSet 的唯一身份 ID。
 * 每个 Set 引用分配一个递增整数，用于指纹计算。
 */
function getClassNameSetId(set?: Set<string>): string {
  if (!set) {
    return 'none'
  }
  const existing = classNameSetIds.get(set)
  if (existing !== undefined) {
    return String(existing)
  }
  const id = nextClassNameSetId++
  classNameSetIds.set(set, id)
  return String(id)
}

/** 缓存 IJsHandlerOptions -> fingerprint 的映射 */
const fingerprintCache = new WeakMap<IJsHandlerOptions, string>()

/**
 * 计算选项指纹，包含所有影响转译结果的字段。
 * 不包含 filename、moduleGraph、jsPreserveClass。
 */
function getOptionsFingerprint(options: IJsHandlerOptions): string {
  const cached = fingerprintCache.get(options)
  if (cached) {
    return cached
  }

  const parts = [
    getClassNameSetId(options.classNameSet),
    JSON.stringify(options.escapeMap ?? null),
    options.needEscaped ? '1' : '0',
    options.alwaysEscape ? '1' : '0',
    options.unescapeUnicode ? '1' : '0',
    options.generateMap ? '1' : '0',
    options.uniAppX ? '1' : '0',
    options.wrapExpression ? '1' : '0',
    JSON.stringify(options.arbitraryValues ?? null),
    JSON.stringify(options.ignoreCallExpressionIdentifiers ?? null),
    JSON.stringify(options.ignoreTaggedTemplateExpressionIdentifiers?.map(v => v instanceof RegExp ? v.source : v) ?? null),
    JSON.stringify(options.moduleSpecifierReplacements ?? null),
    String(options.experimentalJsFastPath ?? ''),
    JSON.stringify(options.babelParserOptions ?? null),
  ]

  const fingerprint = parts.join('|')
  fingerprintCache.set(options, fingerprint)
  return fingerprint
}

function hasDefinedOverrides(options?: CreateJsHandlerOptions) {
  if (!options) {
    return false
  }

  for (const key in options) {
    if (options[key as keyof CreateJsHandlerOptions] !== undefined) {
      return true
    }
  }

  return false
}

function shouldCacheJsResult(rawSource: string, options: IJsHandlerOptions) {
  if (rawSource.length === 0 || rawSource.length > CACHEABLE_SOURCE_MAX_LENGTH) {
    return false
  }
  if (options.moduleGraph || options.filename) {
    return false
  }
  return true
}

function resolveFastPathOptions(rawSource: string, options: IJsHandlerOptions): IJsHandlerOptions {
  if (!options.moduleGraph) {
    return options
  }
  if (options.moduleSpecifierReplacements && Object.keys(options.moduleSpecifierReplacements).length > 0) {
    return options
  }
  if (hasDependencyHint(rawSource)) {
    return options
  }
  const { moduleGraph: _moduleGraph, ...fastPathOptions } = options
  return fastPathOptions
}

export function createJsHandler(options: CreateJsHandlerOptions): JsHandler {
  // 预构建不可变的默认选项对象，避免每次调用都重新创建字面量。
  const defaults: IJsHandlerOptions = {
    escapeMap: options.escapeMap,
    jsArbitraryValueFallback: options.jsArbitraryValueFallback,
    tailwindcssMajorVersion: options.tailwindcssMajorVersion,
    arbitraryValues: options.arbitraryValues,
    jsPreserveClass: options.jsPreserveClass,
    generateMap: options.generateMap,
    needEscaped: options.needEscaped,
    alwaysEscape: options.alwaysEscape,
    unescapeUnicode: options.unescapeUnicode,
    babelParserOptions: options.babelParserOptions,
    experimentalJsFastPath: options.experimentalJsFastPath,
    ignoreCallExpressionIdentifiers: options.ignoreCallExpressionIdentifiers,
    ignoreTaggedTemplateExpressionIdentifiers: options.ignoreTaggedTemplateExpressionIdentifiers,
    uniAppX: options.uniAppX,
    moduleSpecifierReplacements: options.moduleSpecifierReplacements,
  } as IJsHandlerOptions

  /** 层1: 无 override 时，classNameSet -> resolvedOptions */
  const defaultOptionsCache = new WeakMap<Set<string>, IJsHandlerOptions>()
  let resolvedOptionsWithoutClassNameSet: IJsHandlerOptions | undefined

  /** 层2: 有 override 时，overrideOptions -> { bySet, noSet } */
  const overrideOptionsCache = new WeakMap<
    CreateJsHandlerOptions,
    { bySet: WeakMap<Set<string>, IJsHandlerOptions>, noSet?: IJsHandlerOptions }
  >()

  const resultCache = new LRUCache<string, JsHandlerResult>({ max: RESULT_CACHE_MAX })

  function resolveDefaultOptions(classNameSet?: Set<string>) {
    if (!classNameSet) {
      if (!resolvedOptionsWithoutClassNameSet) {
        resolvedOptionsWithoutClassNameSet = {
          ...defaults,
          classNameSet,
        }
      }
      return resolvedOptionsWithoutClassNameSet
    }

    const cached = defaultOptionsCache.get(classNameSet)
    if (cached) {
      return cached
    }

    const created = {
      ...defaults,
      classNameSet,
    }
    defaultOptionsCache.set(classNameSet, created)
    return created
  }

  function getCachedJsResult(rawSource: string, resolvedOptions: IJsHandlerOptions): JsHandlerResult | undefined {
    if (!shouldCacheJsResult(rawSource, resolvedOptions)) {
      return undefined
    }

    const key = `${getOptionsFingerprint(resolvedOptions)}:${md5Hash(rawSource)}`
    return resultCache.get(key)
  }

  function setCachedJsResult(
    rawSource: string,
    resolvedOptions: IJsHandlerOptions,
    result: JsHandlerResult,
  ): JsHandlerResult {
    if (!shouldCacheJsResult(rawSource, resolvedOptions) || result.error || result.linked) {
      return result
    }

    const key = `${getOptionsFingerprint(resolvedOptions)}:${md5Hash(rawSource)}`
    resultCache.set(key, result)
    return result
  }

  function resolveOptions(
    classNameSet?: Set<string>,
    overrideOptions?: CreateJsHandlerOptions,
  ) {
    if (!hasDefinedOverrides(overrideOptions)) {
      return resolveDefaultOptions(classNameSet)
    }

    let entry = overrideOptionsCache.get(overrideOptions!)
    if (!entry) {
      entry = { bySet: new WeakMap<Set<string>, IJsHandlerOptions>() }
      overrideOptionsCache.set(overrideOptions!, entry)
    }

    if (!classNameSet) {
      if (entry.noSet) {
        return entry.noSet
      }
      const created = defuOverrideArray<IJsHandlerOptions, IJsHandlerOptions[]>(
        {
          ...(overrideOptions as IJsHandlerOptions),
          classNameSet,
        },
        defaults,
      )
      entry.noSet = created
      return created
    }

    const cached = entry.bySet.get(classNameSet)
    if (cached) {
      return cached
    }

    const created = defuOverrideArray<IJsHandlerOptions, IJsHandlerOptions[]>(
      {
        ...(overrideOptions as IJsHandlerOptions),
        classNameSet,
      },
      defaults,
    )
    entry.bySet.set(classNameSet, created)
    return created
  }

  function handler(rawSource: string, classNameSet?: Set<string>, options?: CreateJsHandlerOptions) {
    const resolvedOptions = resolveOptions(classNameSet, options)
    const fastPathOptions = resolveFastPathOptions(rawSource, resolvedOptions)
    // 原生实例自行缓存解析事实，先校验可变集合与映射，并执行 required 加载检查。
    const nativeResult = nativeJsHandler(rawSource, fastPathOptions)
    if (nativeResult) {
      return nativeResult
    }
    if (nativeResult === null) {
      // 原生语义检查拒绝的输入交还 Babel，不能被较宽松的 Oxc 分析重新接管。
      return jsHandler(rawSource, resolvedOptions)
    }

    const cached = getCachedJsResult(rawSource, resolvedOptions)
    if (cached) {
      return cached
    }

    const fastPathResult = oxcJsHandler(rawSource, fastPathOptions)
    return setCachedJsResult(rawSource, resolvedOptions, fastPathResult ?? jsHandler(rawSource, resolvedOptions))
  }

  return handler
}
