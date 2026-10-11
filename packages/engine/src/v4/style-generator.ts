import type { TailwindStyleCandidateOptions } from '../style-candidates.ts'
import type {
  TailwindV4SourceOptions,
  TailwindV4StyleGenerateOptions,
  TailwindV4StyleGenerateResult,
} from './types.ts'
import { collectTailwindStyleCandidates } from '../style-candidates.ts'
import { createTailwindV4Engine } from './engine.ts'
import { resolveTailwindV4Source } from './source.ts'

function createSourceOptions(options: TailwindV4StyleGenerateOptions): TailwindV4SourceOptions {
  return {
    ...(options.projectRoot === undefined ? {} : { projectRoot: options.projectRoot }),
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    ...(options.base === undefined ? {} : { base: options.base }),
    ...(options.baseFallbacks === undefined ? {} : { baseFallbacks: options.baseFallbacks }),
    ...(options.css === undefined ? {} : { css: options.css }),
    ...(options.cssSources === undefined ? {} : { cssSources: options.cssSources }),
    ...(options.cssEntries === undefined ? {} : { cssEntries: options.cssEntries }),
    ...(options.packageName === undefined ? {} : { packageName: options.packageName }),
  }
}

export async function collectTailwindV4StyleCandidates(
  options: Pick<TailwindV4StyleGenerateOptions, 'bareArbitraryValues' | 'candidates' | 'sources'>,
): Promise<Set<string>> {
  const candidateOptions: TailwindStyleCandidateOptions = {
    ...(options.bareArbitraryValues === undefined ? {} : { bareArbitraryValues: options.bareArbitraryValues }),
    ...(options.candidates === undefined ? {} : { candidates: options.candidates }),
    ...(options.sources === undefined ? {} : { sources: options.sources }),
  }
  return collectTailwindStyleCandidates(candidateOptions)
}

export async function generateTailwindV4Style(
  options: TailwindV4StyleGenerateOptions = {},
): Promise<TailwindV4StyleGenerateResult> {
  const source = options.source ?? await resolveTailwindV4Source(createSourceOptions(options))
  const candidates = await collectTailwindV4StyleCandidates(options)
  const engine = createTailwindV4Engine(source)
  try {
    const result = await engine.generate({
      candidates,
      ...(options.bareArbitraryValues === undefined ? {} : { bareArbitraryValues: options.bareArbitraryValues }),
      ...(options.scanSources === undefined ? {} : { scanSources: options.scanSources }),
    })
    return {
      ...result,
      tokens: result.rawCandidates,
      source,
    }
  }
  finally {
    engine.dispose?.()
  }
}
