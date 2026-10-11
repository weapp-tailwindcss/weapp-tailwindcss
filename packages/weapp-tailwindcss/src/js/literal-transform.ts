import type { IJsHandlerOptions } from '../types'
import { splitCandidateTokens } from '@weapp-tailwindcss/engine'
import { resolveClassNameTransformWithResult } from '../shared/classname-transform'
import { decodeUnicode2 } from '../utils/decode'
import { getReplacement, getReplacementCacheStore } from './replacement-cache'

export function transformLiteralText(
  literal: string,
  options: IJsHandlerOptions,
  classContext = true,
): string | undefined {
  if (!options.alwaysEscape && (!options.classNameSet || options.classNameSet.size === 0)) {
    return undefined
  }

  const source = options.unescapeUnicode && literal.includes('\\u') ? decodeUnicode2(literal) : literal
  const candidates = splitCandidateTokens(source)
  if (candidates.length === 0) {
    return undefined
  }

  const transformOptions = {
    ...options,
    classContext,
  }
  const replacementCache = getReplacementCacheStore(options.escapeMap)
  let transformed = source
  let mutated = false

  for (const candidate of candidates) {
    const result = resolveClassNameTransformWithResult(candidate, transformOptions)
    if (result.decision === 'skip' || !transformed.includes(candidate)) {
      continue
    }

    const replacement = result.decision === 'escaped' && result.escapedValue
      ? result.escapedValue
      : getReplacement(candidate, options.escapeMap, replacementCache)
    const replaced = transformed.replace(candidate, replacement)
    if (replaced !== transformed) {
      transformed = replaced
      mutated = true
    }
  }

  return mutated ? transformed : undefined
}
