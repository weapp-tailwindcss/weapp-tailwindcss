const UNSUPPORTED_MINI_PROGRAM_TAILWIND_V4_CANDIDATE_RE = /(?:^|:)(?:has-)?(?:group|peer|in|not-in)-[^\s:]*\/|(?:^|:)(?:has-)?(?:in|not-in)-\[/

export function isUnsupportedMiniProgramTailwindV4Candidate(candidate: string) {
  return UNSUPPORTED_MINI_PROGRAM_TAILWIND_V4_CANDIDATE_RE.test(candidate)
}

export function filterUnsupportedMiniProgramTailwindV4Candidates<T extends Iterable<string> | undefined>(
  candidates: T,
): T extends undefined ? undefined : Set<string> {
  if (!candidates) {
    return undefined as T extends undefined ? undefined : Set<string>
  }
  return new Set([...candidates].filter(candidate => !isUnsupportedMiniProgramTailwindV4Candidate(candidate))) as T extends undefined ? undefined : Set<string>
}
