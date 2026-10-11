import type { TailwindSourceEntry } from '@weapp-tailwindcss/source-scan'
import type { Root } from 'postcss'
import { resolveProjectSourceFiles } from '@weapp-tailwindcss/engine'
import { createSourceScanPattern, expandSourceEntries, normalizeGlobPattern, resolveTailwindSourceEntry } from '@weapp-tailwindcss/source-scan'
import { parseSourceFileParam } from './source-scan/params'

export type { TailwindInlineSourceCandidates } from './source-scan/inline-source'
export { collectCssInlineSourceCandidates, expandInlineSourceCandidatePattern } from './source-scan/inline-source'
export { parseConfigParam, parseSourceFileParam } from './source-scan/params'
export {
  createSourceScanPattern,
  createTailwindSourceEntryMatcher,
  DEFAULT_SOURCE_SCAN_EXTENSIONS,
  FULL_SOURCE_SCAN_EXTENSION_RE,
  FULL_SOURCE_SCAN_EXTENSIONS,
  FULL_SOURCE_SCAN_PATTERN,
  isFileExcludedByTailwindSourceEntries,
  isFileMatchedByTailwindSourceEntries,
  normalizeGlobPattern,
  normalizeLegacyContentEntries,
  resolveSourceScanPath,
  resolveTailwindSourceEntry,
  type TailwindSourceEntry,
  toPosixPath,
} from '@weapp-tailwindcss/source-scan'

export async function resolveCssSourceEntries(
  root: Root,
  base: string,
  defaultPattern = createSourceScanPattern(),
) {
  const entries: TailwindSourceEntry[] = []
  const tasks: Array<Promise<TailwindSourceEntry>> = []
  root.walkAtRules('source', (rule) => {
    const parsed = parseSourceFileParam(rule.params)
    if (!parsed) {
      return
    }
    tasks.push(resolveTailwindSourceEntry(parsed.sourcePath, base, parsed.negated, defaultPattern))
  })
  entries.push(...await Promise.all(tasks))
  return entries
}

export async function expandTailwindSourceEntries(entries: TailwindSourceEntry[], options: { ignore?: string[] } = {}) {
  return expandSourceEntries(entries, ({ cwd, sources }) => resolveProjectSourceFiles({
    cwd,
    sources,
    ...(options.ignore ? { ignoredSources: options.ignore.map(pattern => ({ base: cwd, pattern: normalizeGlobPattern(pattern), negated: true })) } : {}),
  }))
}
