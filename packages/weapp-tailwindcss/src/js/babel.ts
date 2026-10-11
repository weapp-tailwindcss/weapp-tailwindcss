import type { ParseError, ParseResult } from '@babel/parser'
import type { File } from '@babel/types'
import type { IJsHandlerOptions, JsHandlerResult } from '../types'
import type { EvalHandler } from './evalTransforms'
import { analyzeSource as analyze } from './babel/analyze'
import { babelParse } from './babel/parse'
import { processUpdatedSource } from './babel/process'
import { JsModuleGraph } from './ModuleGraph'

const EXPRESSION_WRAPPER_PREFIX = '(\n'
const EXPRESSION_WRAPPER_SUFFIX = '\n)'

export function analyzeSource(ast: ParseResult<File>, options: IJsHandlerOptions, handler: EvalHandler = jsHandler, collectModuleMetadata = true) {
  return analyze(ast, options, handler, collectModuleMetadata)
}

export function jsHandler(rawSource: string, options: IJsHandlerOptions): JsHandlerResult {
  const shouldWrapExpression = Boolean(options.wrapExpression)
  const source = shouldWrapExpression
    ? `${EXPRESSION_WRAPPER_PREFIX}${rawSource}${EXPRESSION_WRAPPER_SUFFIX}`
    : rawSource
  let ast: ParseResult<File>
  try {
    ast = babelParse(source, options.babelParserOptions)
  }
  catch (error) {
    return {
      code: rawSource,
      error: error as ParseError,
    } as JsHandlerResult
  }
  const needsModuleMetadata = Boolean(options.moduleSpecifierReplacements || (options.moduleGraph && options.filename))
  const analysis = analyzeSource(ast, options, jsHandler, needsModuleMetadata)
  const ms = processUpdatedSource(source, options, analysis)
  if (shouldWrapExpression) {
    const start = 0
    const end = source.length
    const prefixLength = EXPRESSION_WRAPPER_PREFIX.length
    const suffixLength = EXPRESSION_WRAPPER_SUFFIX.length
    ms.remove(start, start + prefixLength)
    ms.remove(end - suffixLength, end)
  }

  const result: JsHandlerResult = {
    code: ms.toString(),
  }

  if (options.generateMap) {
    Object.defineProperty(result, 'map', {
      configurable: true,
      enumerable: true,
      get() {
        return ms.generateMap()
      },
    })
  }

  if (options.moduleGraph && options.filename) {
    const graph = new JsModuleGraph(
      {
        filename: options.filename,
        source: rawSource,
        analysis,
        handlerOptions: options,
      },
      options.moduleGraph,
      jsHandler,
    )

    const linked = graph.build()
    if (linked) {
      result.linked = linked
    }
  }

  return result
}

export { babelParse, processUpdatedSource }
export { genCacheKey, parseCache } from './babel/parse'
export { isEvalPath } from './evalTransforms'
export type { SourceAnalysis } from './sourceAnalysis'
