import type { ExtractCandidateOptions, ExtractSourceCandidateWithContext, JoinedSourceSegment, SourceSegment } from './types.ts'
import { extractBareArbitraryValueSourceCandidatesWithPositions } from '../v4/bare-arbitrary-values.ts'

export function createBareArbitraryValueCandidateContexts(
  content: string,
  extension: string,
  offset: number,
  options?: ExtractCandidateOptions,
): ExtractSourceCandidateWithContext[] {
  return extractBareArbitraryValueSourceCandidatesWithPositions(content, options?.bareArbitraryValues)
    .map(candidate => ({
      content,
      extension,
      localStart: candidate.start,
      rawCandidate: candidate.rawCandidate,
      start: candidate.start + offset,
      end: candidate.end + offset,
    }))
}

export function joinSourceSegments(segments: SourceSegment[]) {
  const joinedSegments: JoinedSourceSegment[] = []
  const parts: string[] = []
  let joinedStart = 0

  for (const segment of segments) {
    if (parts.length > 0) {
      parts.push('\n')
      joinedStart++
    }
    parts.push(segment.content)
    joinedSegments.push({
      ...segment,
      joinedStart,
    })
    joinedStart += segment.content.length
  }

  return {
    content: parts.join(''),
    segments: joinedSegments,
  }
}

export function findJoinedSourceSegment(segments: JoinedSourceSegment[], start: number) {
  let low = 0
  let high = segments.length - 1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const segment = segments[mid]
    if (segment === undefined) {
      break
    }
    if (start < segment.joinedStart) {
      high = mid - 1
      continue
    }
    if (start >= segment.joinedStart + segment.content.length) {
      low = mid + 1
      continue
    }
    return segment
  }
  return undefined
}

export async function extractBatchedSourceSegmentCandidates(
  segments: SourceSegment[],
  extension: string,
  extractRawCandidatesWithPositions: (
    content: string,
    extension: string,
    options?: ExtractCandidateOptions,
  ) => Promise<Array<{ rawCandidate: string, start: number, end: number }>>,
  options?: ExtractCandidateOptions,
) {
  if (segments.length === 0) {
    return []
  }

  const joined = joinSourceSegments(segments)
  const rawCandidates = await extractRawCandidatesWithPositions(joined.content, extension, options)
  const candidates: ExtractSourceCandidateWithContext[] = []
  for (const candidate of rawCandidates) {
    const segment = findJoinedSourceSegment(joined.segments, candidate.start)
    if (segment === undefined || candidate.end > segment.joinedStart + segment.content.length) {
      continue
    }
    const segmentOffset = candidate.start - segment.joinedStart
    candidates.push({
      content: joined.content,
      extension,
      localStart: candidate.start,
      rawCandidate: candidate.rawCandidate,
      skipHtmlContextChecks: true,
      start: segment.start + segmentOffset,
      end: segment.start + segmentOffset + candidate.rawCandidate.length,
    })
  }
  return candidates
}
