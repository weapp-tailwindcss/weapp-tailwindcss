import type { CreateJsHandlerOptions, IJsHandlerOptions, JsHandler } from '../types'
import { defuOverrideArray } from '../utils'
import { jsHandler } from './babel'
import { nativeJsHandler } from './fast-path/native'
import { oxcJsHandler } from './fast-path/oxc'
import { getJsOptionsSignature, isPlainClassNameSet, snapshotJsOptions } from './options-signature'
import { hasDependencyHint } from './precheck'
import { createJsResultCache } from './result-cache'

export {
  jsHandler,
}
export { transformLiteralText } from './literal-transform'

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
  // 顶层默认值在创建时固定；嵌套配置在每次调用入口检查内容版本。
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
  let defaultOptionsCache = new WeakMap<Set<string>, IJsHandlerOptions>()
  let resolvedOptionsWithoutClassNameSet: IJsHandlerOptions | undefined

  /** 层2: 有 override 时，overrideOptions -> { bySet, noSet } */
  let overrideOptionsCache = new WeakMap<
    CreateJsHandlerOptions,
    { signature: string, bySet: WeakMap<Set<string>, IJsHandlerOptions>, noSet?: IJsHandlerOptions }
  >()

  const resultCache = createJsResultCache()
  let defaultsSignature: string | undefined
  let defaultsSnapshot = defaults

  function refreshDefaults() {
    const signature = getJsOptionsSignature(defaults)
    if (signature === undefined) {
      return false
    }
    if (signature !== defaultsSignature) {
      defaultsSignature = signature
      defaultsSnapshot = snapshotJsOptions(defaults)
      defaultOptionsCache = new WeakMap()
      resolvedOptionsWithoutClassNameSet = undefined
      overrideOptionsCache = new WeakMap()
    }
    return true
  }

  function resolveDefaultOptions(classNameSet?: Set<string>) {
    if (!classNameSet) {
      if (!resolvedOptionsWithoutClassNameSet) {
        resolvedOptionsWithoutClassNameSet = {
          ...defaultsSnapshot,
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
      ...defaultsSnapshot,
      classNameSet,
    }
    defaultOptionsCache.set(classNameSet, created)
    return created
  }

  function resolveOptions(
    classNameSet?: Set<string>,
    overrideOptions?: CreateJsHandlerOptions,
  ) {
    const safeDefaults = refreshDefaults()
    const hasOverrides = hasDefinedOverrides(overrideOptions)
    const signature = hasOverrides ? getJsOptionsSignature(overrideOptions!) : ''
    if (!safeDefaults || signature === undefined || !isPlainClassNameSet(classNameSet)) {
      const resolved = hasOverrides
        ? defuOverrideArray<IJsHandlerOptions, IJsHandlerOptions[]>({ ...overrideOptions, classNameSet }, defaults)
        : { ...defaults, classNameSet }
      return { resolved, cacheable: false }
    }
    if (!hasOverrides) {
      return { resolved: resolveDefaultOptions(classNameSet), cacheable: true }
    }

    let entry = overrideOptionsCache.get(overrideOptions!)
    if (!entry || entry.signature !== signature) {
      entry = { signature, bySet: new WeakMap<Set<string>, IJsHandlerOptions>() }
      overrideOptionsCache.set(overrideOptions!, entry)
    }

    if (!classNameSet) {
      if (entry.noSet) {
        return { resolved: entry.noSet, cacheable: true }
      }
      const created = snapshotJsOptions(defuOverrideArray<IJsHandlerOptions, IJsHandlerOptions[]>(
        {
          ...(overrideOptions as IJsHandlerOptions),
          classNameSet,
        },
        defaultsSnapshot,
      ))
      entry.noSet = created
      return { resolved: created, cacheable: true }
    }

    const cached = entry.bySet.get(classNameSet)
    if (cached) {
      return { resolved: cached, cacheable: true }
    }

    const created = snapshotJsOptions(defuOverrideArray<IJsHandlerOptions, IJsHandlerOptions[]>(
      {
        ...(overrideOptions as IJsHandlerOptions),
        classNameSet,
      },
      defaultsSnapshot,
    ))
    entry.bySet.set(classNameSet, created)
    return { resolved: created, cacheable: true }
  }

  function handler(rawSource: string, classNameSet?: Set<string>, options?: CreateJsHandlerOptions) {
    const { resolved: resolvedOptions, cacheable } = resolveOptions(classNameSet, options)
    if (!cacheable) {
      return jsHandler(rawSource, resolvedOptions)
    }
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

    const key = resultCache.key(rawSource, resolvedOptions)
    const cached = resultCache.get(key)
    if (cached) {
      return cached
    }

    const fastPathResult = oxcJsHandler(rawSource, fastPathOptions)
    return resultCache.set(key, fastPathResult ?? jsHandler(rawSource, resolvedOptions))
  }

  return handler
}
