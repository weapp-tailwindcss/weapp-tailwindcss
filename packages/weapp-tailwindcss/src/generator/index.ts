import type { TailwindResolvedSource, WeappTailwindcssGenerator } from './types'
import type { TailwindcssRuntimeLike } from '@/types'
import {
  createTailwindV4Engine,
  loadTailwindV4DesignSystem,
  resolveTailwindV4Source,
  resolveTailwindV4SourceFromRuntime,
  resolveTailwindV4SourceFromRuntimeOptions,
  resolveTailwindV4SourceOptionsFromRuntime,
  transformTailwindV4CssByTarget,
  transformTailwindV4CssToWeapp,
} from '@/tailwindcss/v4-engine'

export function createWeappTailwindcssGenerator(source: TailwindResolvedSource): WeappTailwindcssGenerator {
  return createTailwindV4Engine(source)
}

export async function resolveTailwindSourceFromRuntime(
  tailwindRuntime: TailwindcssRuntimeLike,
): Promise<TailwindResolvedSource> {
  return resolveTailwindV4SourceFromRuntime(tailwindRuntime)
}

export async function createWeappTailwindcssGeneratorFromRuntime(
  tailwindRuntime: TailwindcssRuntimeLike,
) {
  return createWeappTailwindcssGenerator(await resolveTailwindSourceFromRuntime(tailwindRuntime))
}

export {
  normalizeWeappTailwindcssGeneratorOptions,
} from './options'

export {
  loadTailwindV4DesignSystem,
  resolveTailwindV4Source,
  resolveTailwindV4SourceFromRuntime,
  resolveTailwindV4SourceFromRuntimeOptions,
  resolveTailwindV4SourceOptionsFromRuntime,
  transformTailwindV4CssByTarget,
  transformTailwindV4CssToWeapp,
}

export type {
  NormalizedWeappTailwindcssGeneratorOptions,
  WeappTailwindcssGeneratorOptions,
  WeappTailwindcssGeneratorUserOptions,
} from './options'

export type {
  TailwindCandidateSource,
  TailwindGeneratorVersion,
  TailwindResolvedSource,
  TailwindV4CandidateSource,
  TailwindV4DesignSystem,
  TailwindV4Engine,
  TailwindV4GenerateOptions,
  TailwindV4GenerateResult,
  TailwindV4GenerateTarget,
  TailwindV4ResolvedSource,
  TailwindV4SourceOptions,
  WeappTailwindcssGenerateOptions,
  WeappTailwindcssGenerateResult,
  WeappTailwindcssGenerator,
  WeappTailwindcssGeneratorTarget,
} from './types'
