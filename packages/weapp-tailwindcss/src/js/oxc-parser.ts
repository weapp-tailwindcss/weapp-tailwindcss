import type { OxcParser } from './oxc-parser/loader'
import { loadOxcParser } from './oxc-parser/loader'

export { isOxcParserRuntimeSupported, loadOxcParser } from './oxc-parser/loader'

type OxcParseOptions = NonNullable<Parameters<OxcParser['parseSync']>[2]>
type OxcParseTransport = 'auto' | 'ast'

// 首次 raw 解析还要加载和编译对应的反序列化器；不能用预热后的阈值选择冷路径。
// 大型 bundle 才承担初始化成本，同一 AST 形态成功初始化后再使用预热阈值。
const RAW_TRANSFER_COLD_MIN_SOURCE_LENGTH = 512 * 1024
const RAW_TRANSFER_MIN_SOURCE_LENGTH = 96 * 1024

const rawTransferSupportCache = new WeakMap<object, boolean>()
const initializedRawVariants = new WeakMap<object, Set<string>>()

function rawVariant(options: OxcParseOptions) {
  const astType = options.astType ?? (options.lang
    ? options.lang === 'js' || options.lang === 'jsx' ? 'js' : 'ts'
    : undefined)
  // 未显式指定语言时保持冷阈值，避免猜测 filename 导致复用错误的初始化状态。
  return astType ? `${astType}:${options.range === true}` : undefined
}

function supportsRawTransfer(parser: OxcParser) {
  const cached = rawTransferSupportCache.get(parser)
  if (cached !== undefined) {
    return cached
  }
  let supported = false
  try {
    supported = parser.rawTransferSupported?.() === true
  }
  catch {
    supported = false
  }
  rawTransferSupportCache.set(parser, supported)
  return supported
}

/** 按反序列化器的初始化状态选择 raw transfer，不支持或失败时回退到普通 AST。 */
export function parseOxcSync(
  filename: string,
  sourceText: string,
  options: OxcParseOptions,
  transport: OxcParseTransport = 'auto',
) {
  // N-API 的 UTF-8 转换会把输入中的孤立代理替换为 U+FFFD，必须交还 Babel。
  if (/[\uD800-\uDFFF]/u.test(sourceText)) {
    return undefined
  }
  const parser = loadOxcParser()
  if (!parser) {
    return undefined
  }

  const variant = rawVariant(options)
  const initialized = variant !== undefined && initializedRawVariants.get(parser)?.has(variant)
  const minSourceLength = initialized ? RAW_TRANSFER_MIN_SOURCE_LENGTH : RAW_TRANSFER_COLD_MIN_SOURCE_LENGTH
  if (transport === 'auto' && sourceText.length >= minSourceLength && supportsRawTransfer(parser)) {
    try {
      const rawOptions = { ...options, experimentalRawTransfer: true }
      const result = parser.parseSync(filename, sourceText, rawOptions)
      if (variant !== undefined) {
        let variants = initializedRawVariants.get(parser)
        if (!variants) {
          variants = new Set()
          initializedRawVariants.set(parser, variants)
        }
        variants.add(variant)
      }
      return result
    }
    catch {
      // raw transfer 失败时继续使用兼容性更高的普通 AST。
    }
  }

  try {
    return parser.parseSync(filename, sourceText, options)
  }
  catch {
    return undefined
  }
}
