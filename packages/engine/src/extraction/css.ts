import type { ExtractCandidateOptions, ExtractSourceCandidateWithContext } from './types.ts'
import { createBareArbitraryValueCandidateContexts } from './segments.ts'

const CSS_APPLY_RE = /@apply\s+([^;{}]+)/g

export async function extractCssApplyCandidates(
  content: string,
  extension: string,
  extractRawCandidatesWithPositions: (
    content: string,
    extension: string,
    options?: ExtractCandidateOptions,
  ) => Promise<Array<{ rawCandidate: string, start: number, end: number }>>,
  options?: ExtractCandidateOptions,
) {
  const candidates: ExtractSourceCandidateWithContext[] = []
  CSS_APPLY_RE.lastIndex = 0
  let match = CSS_APPLY_RE.exec(content)
  while (match !== null) {
    const applyParams = match[1] ?? ''
    const applyParamsStart = match.index + match[0].indexOf(applyParams)
    const applyCandidates = await extractRawCandidatesWithPositions(applyParams, extension)
    candidates.push(...applyCandidates.map(candidate => ({
      content: applyParams,
      extension: 'html',
      localStart: candidate.start,
      rawCandidate: candidate.rawCandidate,
      skipHtmlContextChecks: true,
      start: candidate.start + applyParamsStart,
      end: candidate.end + applyParamsStart,
    })))
    candidates.push(...createBareArbitraryValueCandidateContexts(applyParams, 'html', applyParamsStart, options))
    match = CSS_APPLY_RE.exec(content)
  }
  return candidates
}
