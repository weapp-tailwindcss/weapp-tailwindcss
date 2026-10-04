import type { IJsHandlerOptions, JsHandlerResult } from '../../types'
import type { LiteralSpan } from './analysis'
import MagicString from 'magic-string'
import { jsStringEscape } from '../js-string-escape'
import { transformLiteralText } from '../literal-transform'
import { getOxcSourceAnalysis } from './analysis'
import { supportsOxcParserOptions } from './parser-options'

export { isOxcParserRuntimeSupported } from '../oxc-parser'

interface ReplacementContext {
  ms?: MagicString
}

function hasValues<T>(values: T[] | undefined): values is T[] {
  return Array.isArray(values) && values.length > 0
}

function hasUnsupportedSourceMarker(rawSource: string) {
  return rawSource.includes('eval(')
    || (rawSource.includes('weapp-tw') && rawSource.includes('ignore'))
}

function hasSupportedClassMatchSource(options: IJsHandlerOptions) {
  return options.alwaysEscape === true
    || Boolean(options.classNameSet && options.classNameSet.size > 0)
}

export function canAttemptOxcJsFastPath(options: IJsHandlerOptions) {
  if (options.experimentalJsFastPath !== true && options.experimentalJsFastPath !== 'oxc') {
    return false
  }

  return !options.generateMap
    && !options.wrapExpression
    && !options.moduleSpecifierReplacements
    && hasSupportedClassMatchSource(options)
    && supportsOxcParserOptions(options)
    && !hasValues(options.ignoreCallExpressionIdentifiers)
}

export function canUseOxcJsFastPath(options: IJsHandlerOptions) {
  return canAttemptOxcJsFastPath(options)
    && !options.moduleGraph
    && !hasValues(options.ignoreTaggedTemplateExpressionIdentifiers)
}

function getMagicString(rawSource: string, context: ReplacementContext) {
  if (!context.ms) {
    context.ms = new MagicString(rawSource)
  }
  return context.ms
}

function addStringLiteralReplacement(
  rawSource: string,
  node: LiteralSpan,
  transformOptions: IJsHandlerOptions,
  context: ReplacementContext,
) {
  const transformed = transformLiteralText(node.value, transformOptions, node.classContext)
  if (!transformed) {
    return false
  }

  const start = node.start! + 1
  const end = node.end! - 1
  if (start >= end || transformed === rawSource.slice(start, end)) {
    return false
  }

  getMagicString(rawSource, context).update(start, end, jsStringEscape(transformed))
  return true
}

function addTemplateElementReplacement(
  rawSource: string,
  node: LiteralSpan,
  transformOptions: IJsHandlerOptions,
  context: ReplacementContext,
) {
  const raw = node.value

  const transformed = transformLiteralText(raw, transformOptions, node.classContext)
  if (!transformed || transformed === raw) {
    return false
  }

  const { start, end } = node
  if (start >= end) {
    return false
  }

  getMagicString(rawSource, context).update(start, end, transformed)
  return true
}

function applyReplacements(
  rawSource: string,
  literals: LiteralSpan[],
  stringLiteralOptions: IJsHandlerOptions,
  templateLiteralOptions: IJsHandlerOptions,
  context: ReplacementContext,
) {
  let changed = false
  for (const node of literals) {
    if (node.isConditionTest) {
      continue
    }
    changed = (node.kind === 'string'
      ? addStringLiteralReplacement(rawSource, node, stringLiteralOptions, context)
      : addTemplateElementReplacement(rawSource, node, templateLiteralOptions, context)) || changed
  }

  return changed
}

export function oxcJsHandler(rawSource: string, options: IJsHandlerOptions): JsHandlerResult | undefined {
  if (!canAttemptOxcJsFastPath(options)) {
    return undefined
  }
  if (hasUnsupportedSourceMarker(rawSource)) {
    return undefined
  }

  const analysis = getOxcSourceAnalysis(rawSource, options)
  if (!analysis) {
    return undefined
  }
  if (options.moduleGraph && analysis.hasModuleDeclarations) {
    return undefined
  }
  if (
    hasValues(options.ignoreTaggedTemplateExpressionIdentifiers)
    && analysis.hasTaggedTemplate
  ) {
    return undefined
  }

  const stringLiteralOptions = options.needEscaped === true
    ? options
    : {
        ...options,
        needEscaped: true,
      }
  const templateLiteralOptions = options.needEscaped === false
    ? options
    : {
        ...options,
        needEscaped: false,
      }
  const replacementContext: ReplacementContext = {}
  if (!applyReplacements(rawSource, analysis.literals, stringLiteralOptions, templateLiteralOptions, replacementContext)) {
    return {
      code: rawSource,
    }
  }

  return {
    code: replacementContext.ms!.toString(),
  }
}
