import type { AppTypeDetectionCandidate, AppTypeDetectionEvidence, AppTypeDetectionReport } from './types'

export function evidence(source: AppTypeDetectionEvidence['source'], key: string, value?: string, file?: string): AppTypeDetectionEvidence {
  return {
    source,
    key,
    ...(value !== undefined ? { value } : {}),
    ...(file !== undefined ? { path: file } : {}),
  }
}

export function collectMatches(matches: Iterable<AppTypeDetectionCandidate>, all: boolean): AppTypeDetectionCandidate[] {
  const result: AppTypeDetectionCandidate[] = []
  for (const candidate of matches) {
    result.push(candidate)
    if (!all) {
      break
    }
  }
  return result
}

export function detectionReport(candidates: AppTypeDetectionCandidate[]): AppTypeDetectionReport {
  const grouped = new Map<string, AppTypeDetectionCandidate>()
  for (const candidate of candidates) {
    const existing = grouped.get(candidate.appType)
    if (existing) {
      existing.evidence.push(...candidate.evidence)
    }
    else {
      grouped.set(candidate.appType, { ...candidate, evidence: [...candidate.evidence] })
    }
  }
  const unique = [...grouped.values()]
  const appType = unique[0]?.appType
  const family = (value: string) => value.startsWith('uni-app') ? 'uni-app' : value
  return {
    appType,
    candidates: unique,
    conflicts: appType === undefined
      ? []
      : unique
          .filter(candidate => family(candidate.appType) !== family(appType))
          .map(candidate => candidate.appType),
  }
}
