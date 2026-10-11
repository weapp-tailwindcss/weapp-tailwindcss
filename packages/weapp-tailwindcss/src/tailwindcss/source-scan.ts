import type { TailwindV4CssSource } from '@weapp-tailwindcss/engine'
import path from 'node:path'

export { collectCssInlineSourceCandidates, expandInlineSourceCandidatePattern, expandTailwindSourceEntries, parseConfigParam, parseSourceFileParam, resolveCssSourceEntries, type TailwindInlineSourceCandidates } from '@weapp-tailwindcss/postcss/syntax'
export * from '@weapp-tailwindcss/source-scan'

export function resolveTailwindV4CssSourceBase(
  source: Pick<TailwindV4CssSource, 'base' | 'file'>,
  fallbackBase: string,
) {
  if (typeof source.base === 'string' && source.base.length > 0) {
    return source.base
  }
  if (typeof source.file === 'string' && source.file.length > 0) {
    return path.dirname(source.file)
  }
  return fallbackBase
}
