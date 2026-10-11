import type { TailwindSourceEntry } from './types'

export interface SourceScanPlanOptions {
  base: string
  mode: 'auto' | 'fallback' | 'explicit' | 'disabled'
  entries?: TailwindSourceEntry[]
  pattern?: string
  ignoredPatterns?: readonly string[]
}

/** 禁用自动扫描不抹掉显式来源；显式空来源不会退回扫描整个项目。 */
export function createSourceScanPlan(options: SourceScanPlanOptions): TailwindSourceEntry[] {
  const automatic = options.mode === 'auto'
    || (options.mode === 'fallback' && !options.entries?.some(entry => !entry.negated))
  const entries = [
    ...(automatic ? [{ base: options.base, pattern: options.pattern ?? '**/*', negated: false }] : []),
    ...(options.entries ?? []),
  ]
  const bases = new Set([options.base, ...entries.filter(entry => !entry.negated).map(entry => entry.base)])
  return [...entries, ...[...bases].flatMap(base => (options.ignoredPatterns ?? []).map(pattern => ({
    base,
    pattern,
    negated: true,
  })))]
}
