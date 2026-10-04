import type { NativeCompiler } from '../../native'
import type { ITemplateHandlerOptions } from '../../types'
import type { NativeWxmlCompiler, NativeWxmlEscapeEntry, NativeWxmlTransformer } from './types'
import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { loadNativeCompiler } from '../../native'
import { isAllWhitespace } from '../whitespace'
import { getNativeWxmlEscapeEntries } from './escape'

const caches = new WeakMap<NativeCompiler, WeakMap<NativeWxmlEscapeEntry[], NativeWxmlTransformer>>()
const setHas = Set.prototype.has

export function nativeStaticTemplateReplacer(source: string, options: ITemplateHandlerOptions): string | undefined {
  // tokenizer 从单个左花括号起等待 }}；拒绝必须发生在读取/缓存转义表之前。
  const opening = source.indexOf('{')
  if (opening >= 0 && source.includes('}}', opening + 1)) {
    return undefined
  }
  // 用户 getter 或重载 has 可以修改选项；沿用原逐片段读取与异常传播顺序。
  if (['escapeMap', 'runtimeSet', 'classSetMode'].some(key => Object.getOwnPropertyDescriptor(options, key)?.get)) {
    return undefined
  }
  const exact = options.classSetMode === 'exact' && Boolean(options.runtimeSet)
  if (exact && options.runtimeSet!.has !== setHas) {
    return undefined
  }
  // exact 无命中时原实现不会首次读取自定义表，不能提前冻结其有效值。
  if (exact && options.escapeMap && options.escapeMap !== MappingChars2String) {
    return undefined
  }
  const compiler = loadNativeCompiler() as (NativeCompiler & NativeWxmlCompiler) | undefined
  if (!compiler) {
    return undefined
  }
  if (typeof compiler.createWxmlTransformer !== 'function') {
    throw new TypeError('Native compiler does not provide createWxmlTransformer')
  }
  if (isAllWhitespace(source)) {
    return source
  }
  const entries = getNativeWxmlEscapeEntries(options.escapeMap)
  if (!entries) {
    return undefined
  }
  let cache = caches.get(compiler)
  if (!cache) {
    cache = new WeakMap()
    caches.set(compiler, cache)
  }
  let transformer = cache.get(entries)
  if (!transformer) {
    const created = compiler.createWxmlTransformer(entries)
    if (!created) {
      return undefined
    }
    transformer = created
    cache.set(entries, transformer)
  }
  // 不跨 ABI 复制完整 runtimeSet；只为实际候选进行一次同步查询。
  const contains = exact ? (candidate: string) => options.runtimeSet!.has(candidate) : undefined
  return transformer.transformStatic(source, contains) ?? undefined
}
