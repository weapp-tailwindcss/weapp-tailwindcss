import type { RememberedCssSource } from './types'

/** 来源标注沿用各入口的扫描目录，合并时保留同一候选的全部文件。 */
export async function createMergedCssSourceTraceMap(
  sources: Pick<RememberedCssSource, 'rawSource' | 'sourceFile'>[],
  resolve: (source: Pick<RememberedCssSource, 'rawSource' | 'sourceFile'>) => Promise<Map<string, Set<string>> | undefined>,
) {
  const merged = new Map<string, Set<string>>()
  for (const map of await Promise.all(sources.map(resolve))) {
    for (const [candidate, files] of map ?? []) {
      const existing = merged.get(candidate) ?? new Set<string>()
      for (const file of files) {
        existing.add(file)
      }
      merged.set(candidate, existing)
    }
  }
  return merged
}
