import type { OxcParser } from './oxc-parser/loader'
import { loadOxcParser } from './oxc-parser/loader'

export { isOxcParserRuntimeSupported, loadOxcParser } from './oxc-parser/loader'

type OxcParseOptions = NonNullable<Parameters<OxcParser['parseSync']>[2]>
type OxcParseTransport = 'auto' | 'ast'

const rawTransferSupportCache = new WeakMap<object, boolean>()

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

/** 优先使用 raw transfer，运行时不支持或失败时回退到普通 AST。 */
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

  if (transport === 'auto' && supportsRawTransfer(parser)) {
    try {
      const rawOptions = { ...options, experimentalRawTransfer: true }
      return parser.parseSync(filename, sourceText, rawOptions)
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
