import type { NativeCompiler } from '../../native'
import type { NativeJsTransformer } from '../../native/types'
import type { IJsHandlerOptions, JsHandlerResult } from '../../types'
import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { loadNativeCompiler, nativeCompilerConfigured } from '../../native'
import { defaultJsPreserveClass } from '../default-preserve'
import { isPlainClassNameSet } from '../options-signature'
import { canAttemptOxcJsFastPath } from './oxc'
import { getParserLang, getParserSourceType } from './parser-options'

const caches = new WeakMap<NativeCompiler, Map<string, NativeJsTransformer>>()
const frozenMappingEntries = new WeakMap<object, { mapping: string, entries: { character: string, replacement: string }[] }>()
const emptyClasses = new Set<string>()
const MAX_TRANSFORMER_CACHE_ENTRIES = 32

function createMappingEntries(escapeMap: IJsHandlerOptions['escapeMap']) {
  const entries = Object.entries({ ...MappingChars2String, ...escapeMap })
    .filter(([key]) => key.length === 1 && key.charCodeAt(0) < 128)
    .map(([character, replacement]) => ({ character, replacement }))
  return { mapping: JSON.stringify(entries), entries }
}

function isFrozenDataRecord(value: object) {
  if (!Object.isFrozen(value)) {
    return false
  }
  return Object.values(Object.getOwnPropertyDescriptors(value)).every(descriptor => 'value' in descriptor)
}

function getMappingEntries(escapeMap: IJsHandlerOptions['escapeMap']) {
  // 配置快照由 createJsHandler 冻结；冻结对象不会再发生原地变更，可以跨 class set 复用映射。
  if (escapeMap && isFrozenDataRecord(escapeMap)) {
    const cached = frozenMappingEntries.get(escapeMap)
    if (cached) {
      return cached
    }
    const created = createMappingEntries(escapeMap)
    frozenMappingEntries.set(escapeMap, created)
    return created
  }
  // 可变映射必须每次重算，保持直接调用 nativeJsHandler 的原地修改语义。
  return createMappingEntries(escapeMap)
}

function getTransformer(compiler: NativeCompiler, options: IJsHandlerOptions) {
  let cache = caches.get(compiler)
  if (!cache) {
    cache = new Map()
    caches.set(compiler, cache)
  }
  // 原生实例不保存 class set，集合成员由每次调用的候选回调查询；按有效映射内容共享实例。
  const { mapping, entries } = getMappingEntries(options.escapeMap)
  const cached = cache.get(mapping)
  if (cached) {
    return cached
  }
  const transformer = compiler.createJsTransformer([], entries)
  if (transformer === null) {
    return undefined
  }
  if (cache.size >= MAX_TRANSFORMER_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) {
      cache.delete(oldest)
    }
  }
  cache.set(mapping, transformer)
  return transformer
}

/** 快速路径在原生实例内完成解析与替换，只把最终代码送回 JavaScript。 */
export function nativeJsHandler(source: string, options: IJsHandlerOptions): JsHandlerResult | null | undefined {
  if (!nativeCompilerConfigured
    || !isPlainClassNameSet(options.classNameSet ?? emptyClasses)
    || !canAttemptOxcJsFastPath(options)
    || (options.jsPreserveClass && options.jsPreserveClass !== defaultJsPreserveClass)) {
    return undefined
  }
  const compiler = loadNativeCompiler()
  if (!compiler) {
    return undefined
  }
  const transformer = getTransformer(compiler, options)
  if (!transformer) {
    return null
  }
  // null 是唯一的语义回退信号；执行异常不能进入兼容路径或结果缓存。
  const parserLang = getParserLang(options)
  const sourceType = getParserSourceType(options)
  const preserveParens = options.babelParserOptions?.createParenthesizedExpressions === true
  const transformOptions = {
    alwaysEscape: options.alwaysEscape === true,
    preserveStar: options.jsPreserveClass === defaultJsPreserveClass,
    unescapeUnicode: options.unescapeUnicode === true,
    moduleGraph: Boolean(options.moduleGraph),
    ignoreTaggedTemplates: Boolean(options.ignoreTaggedTemplateExpressionIdentifiers?.length),
  }
  const classNameSet = options.classNameSet ?? emptyClasses
  const code = transformer.transformWithCandidatesBatch
    ? transformer.transformWithCandidatesBatch(
        source,
        parserLang,
        sourceType,
        preserveParens,
        transformOptions,
        candidates => candidates.map(candidate => classNameSet.has(candidate)),
      )
    : transformer.transformWithCandidates(
        source,
        parserLang,
        sourceType,
        preserveParens,
        transformOptions,
        candidate => classNameSet.has(candidate),
      )
  return code === null ? null : { code }
}
