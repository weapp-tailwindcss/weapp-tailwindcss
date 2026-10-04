import type { NativeCompiler } from '../../native'
import type { NativeJsTransformer } from '../../native/types'
import type { IJsHandlerOptions, JsHandlerResult } from '../../types'
import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { loadNativeCompiler, nativeCompilerConfigured } from '../../native'
import { defaultJsPreserveClass } from '../default-preserve'
import { isPlainClassNameSet } from '../options-signature'
import { canAttemptOxcJsFastPath } from './oxc'
import { getParserLang, getParserSourceType } from './parser-options'

interface TransformerEntry {
  mapping: string
  transformer: NativeJsTransformer
}

const caches = new WeakMap<NativeCompiler, WeakMap<Set<string>, TransformerEntry>>()
const emptyClasses = new Set<string>()

function getTransformer(compiler: NativeCompiler, options: IJsHandlerOptions) {
  let cache = caches.get(compiler)
  if (!cache) {
    cache = new WeakMap()
    caches.set(compiler, cache)
  }
  const classes = options.classNameSet ?? emptyClasses
  // 传入最终有效映射，不让 Rust 重复维护默认字典；按内容识别原地修改。
  const entries = Object.entries({ ...MappingChars2String, ...options.escapeMap })
    .filter(([key]) => key.length === 1 && key.charCodeAt(0) < 128)
    .map(([character, replacement]) => ({ character, replacement }))
  const mapping = JSON.stringify(entries)
  const cached = cache.get(classes)
  if (cached && cached.mapping === mapping) {
    return cached.transformer
  }
  const transformer = compiler.createJsTransformer([], entries)
  if (transformer === null) {
    return undefined
  }
  cache.set(classes, { mapping, transformer })
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
  const code = transformer.transformWithCandidates(
    source,
    getParserLang(options),
    getParserSourceType(options),
    options.babelParserOptions?.createParenthesizedExpressions === true,
    {
      alwaysEscape: options.alwaysEscape === true,
      preserveStar: options.jsPreserveClass === defaultJsPreserveClass,
      unescapeUnicode: options.unescapeUnicode === true,
      moduleGraph: Boolean(options.moduleGraph),
      ignoreTaggedTemplates: Boolean(options.ignoreTaggedTemplateExpressionIdentifiers?.length),
    },
    candidate => (options.classNameSet ?? emptyClasses).has(candidate),
  )
  return code === null ? null : { code }
}
