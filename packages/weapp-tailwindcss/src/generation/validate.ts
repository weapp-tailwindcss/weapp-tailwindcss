import type { GenerateCssByGeneratorOptions } from './types'
import { runCompilerOwnerActivity } from '@/compiler/compiler-owner-state'
import { getTailwindGenerationSessionPool } from '@/compiler/tailwind-generation-session-pool'
import { normalizeWeappTailwindcssGeneratorOptions } from '@/generator/index'
import { collectGeneratedRawSourceCandidates } from './class-selectors'
import { resolveGeneratorSources } from './source-resolver'

export interface ValidateCandidatesByGeneratorOptions extends Omit<GenerateCssByGeneratorOptions, 'runtime'> {
  candidates: Set<string>
  generatedCssSources?: Iterable<string> | undefined
  skipGenerateFallback?: boolean | undefined
}

export async function validateCandidatesByGenerator(
  options: ValidateCandidatesByGeneratorOptions,
): Promise<Set<string>> {
  return runCompilerOwnerActivity(
    options.runtimeState,
    () => validateCandidatesByGeneratorWithOwner(
      options,
      getTailwindGenerationSessionPool(options.runtimeState),
    ),
  )
}

async function validateCandidatesByGeneratorWithOwner(
  options: ValidateCandidatesByGeneratorOptions,
  generationSession: ReturnType<typeof getTailwindGenerationSessionPool>,
): Promise<Set<string>> {
  const {
    candidates,
    cssHandlerOptions,
    debug,
    file,
    opts,
    rawSource,
    runtimeState,
  } = options
  const majorVersion = runtimeState.tailwindRuntime.majorVersion
  if (majorVersion !== 4 || candidates.size === 0) {
    return new Set<string>()
  }
  const classSet = new Set<string>()
  try {
    const generatorOptions = {
      ...normalizeWeappTailwindcssGeneratorOptions(opts.generator),
      bareArbitraryValues: opts.arbitraryValues?.bareArbitraryValues,
    }
    if (generatorOptions.enabled) {
      const sourceRecords = await resolveGeneratorSources(
        majorVersion,
        runtimeState,
        rawSource,
        file,
        cssHandlerOptions,
        generatorOptions,
        {
          cssEntries: opts.cssEntries,
          runtime: candidates,
        },
      )
      const classSets = await Promise.all(sourceRecords.map(async ({ source }) => {
        return generationSession.validateCandidates(source, candidates)
      }))
      for (const candidate of classSets.flatMap(item => [...item])) {
        classSet.add(candidate)
      }
    }
  }
  catch {
  }
  const rawSourceCandidates = collectGeneratedRawSourceCandidates(candidates, rawSource, opts.escapeMap)
  for (const candidate of rawSourceCandidates) {
    classSet.add(candidate)
  }
  for (const generatedCss of options.generatedCssSources ?? []) {
    for (const candidate of collectGeneratedRawSourceCandidates(candidates, generatedCss, opts.escapeMap)) {
      classSet.add(candidate)
    }
  }
  debug(
    'tailwind generator validated candidates: %s candidates=%d classSet=%d',
    file,
    candidates.size,
    classSet.size,
  )
  return classSet
}
