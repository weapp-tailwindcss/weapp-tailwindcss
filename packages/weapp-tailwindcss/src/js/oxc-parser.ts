import type { OxcParser } from './oxc-parser/loader'
import { loadOxcParser } from './oxc-parser/loader'

export { isOxcParserRuntimeSupported, loadOxcParser } from './oxc-parser/loader'

type OxcParseOptions = NonNullable<Parameters<OxcParser['parseSync']>[2]>

/** 优先使用 raw transfer，运行时不支持或失败时回退到普通 AST。 */
export function parseOxcSync(
  filename: string,
  sourceText: string,
  options: OxcParseOptions,
) {
  const parser = loadOxcParser()
  if (!parser) {
    return undefined
  }

  let rawTransferAvailable = false
  try {
    rawTransferAvailable = parser.rawTransferSupported?.() === true
  }
  catch {
    rawTransferAvailable = false
  }

  if (rawTransferAvailable) {
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
