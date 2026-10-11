import type { ExtractCandidateOptions } from './extraction/candidate-extractor.ts'
import type { BareArbitraryValueOptions } from './v4/bare-arbitrary-values.ts'
import { extractSourceCandidates } from './extraction/candidate-extractor.ts'

export interface TailwindStyleSource {
  content: string
  extension?: string
  file?: string
}

export interface TailwindStyleCandidateOptions {
  candidates?: Iterable<string>
  sources?: TailwindStyleSource[]
  /**
   * 启用 UnoCSS 风格的裸任意值，例如 `p-10%`、`p-2.5px`。
   */
  bareArbitraryValues?: boolean | BareArbitraryValueOptions
}

export async function collectTailwindStyleCandidates(
  options: TailwindStyleCandidateOptions = {},
): Promise<Set<string>> {
  const candidates = new Set<string>()
  for (const candidate of options.candidates ?? []) {
    candidates.add(candidate)
  }
  const extractOptions: ExtractCandidateOptions = options.bareArbitraryValues === undefined
    ? {}
    : { bareArbitraryValues: options.bareArbitraryValues }
  for (const source of options.sources ?? []) {
    const sourceCandidates = await extractSourceCandidates(source.content, source.extension, extractOptions)
    for (const candidate of sourceCandidates) {
      candidates.add(candidate)
    }
  }
  return candidates
}
