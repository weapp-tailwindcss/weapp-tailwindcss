import path from 'node:path'
import { analyzeTailwindV4Source } from '@weapp-tailwindcss/postcss/transform'
import { scoreTailwindV4CssSourceFileMatch } from '@/generation/source-resolver/matching'
import { hasTailwindGenerationSource } from './sfc-style-source'

export interface TailwindV4GenerationCssSourceEntry {
  file: string
  source: string
}

export interface TailwindV4GenerationCssSourceSelectionOptions {
  cwd?: string | undefined
  outputRoot?: string | undefined
  projectRoot?: string | undefined
}

export function collectTailwindV4SourceFingerprint(source: string) {
  return analyzeTailwindV4Source(source, path.basename).getFingerprint()
}

function scoreSourceFingerprints(rawTokens: Set<string>, entryTokens: Set<string>) {
  let score = 0
  for (const token of entryTokens) {
    if (rawTokens.has(token)) {
      score += token.startsWith('config:') ? 100 : 1
    }
  }
  return score
}

export function scoreConfiguredTailwindV4SourceForRawSource(rawSource: string | undefined, entrySource: string) {
  if (!rawSource) {
    return 0
  }
  const rawTokens = collectTailwindV4SourceFingerprint(rawSource)
  if (rawTokens.size === 0) {
    return 0
  }
  const entryTokens = collectTailwindV4SourceFingerprint(entrySource)
  return scoreSourceFingerprints(rawTokens, entryTokens)
}

export function selectTailwindV4GenerationCssSourceForOutput<T extends TailwindV4GenerationCssSourceEntry>(
  outputFile: string,
  entries: T[],
  rawSource?: string,
  options: TailwindV4GenerationCssSourceSelectionOptions = {},
) {
  const generationSources = entries.filter(entry => hasTailwindGenerationSource(entry.source))
  if (generationSources.length <= 1) {
    return generationSources[0]
  }
  const analyses = new Map<string, ReturnType<typeof analyzeTailwindV4Source>>()
  const analyze = (source: string) => {
    let analysis = analyses.get(source)
    if (!analysis) {
      analysis = analyzeTailwindV4Source(source, path.basename)
      analyses.set(source, analysis)
    }
    return analysis
  }
  const canMatchByOutputPath = Boolean(options.cwd || options.outputRoot || options.projectRoot)
  const selectByOutputPath = (
    candidates: typeof generationSources,
    shouldUseScore: (score: number) => boolean = score => score > 0,
  ) => {
    if (!canMatchByOutputPath) {
      return undefined
    }
    const scoredSources = candidates
      .map(entry => ({
        entry,
        score: scoreTailwindV4CssSourceFileMatch(outputFile, entry.file, {
          cwd: options.cwd,
          outputRoot: options.outputRoot,
          projectRoot: options.projectRoot,
        }),
      }))
      .filter(item => shouldUseScore(item.score))
      .sort((a, b) => b.score - a.score)
    const bestScore = scoredSources[0]?.score
    const bestSources = bestScore ? scoredSources.filter(item => item.score === bestScore) : []
    return bestSources.length === 1 ? bestSources[0]?.entry : undefined
  }
  const selectByRawSourceFingerprint = (candidates: typeof generationSources) => {
    if (!rawSource) {
      return undefined
    }
    const rawTokens = analyze(rawSource).getFingerprint()
    if (rawTokens.size === 0) {
      return undefined
    }
    const scoredSources = candidates
      .map(entry => ({
        entry,
        score: scoreSourceFingerprints(rawTokens, analyze(entry.source).getFingerprint()),
      }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
    const bestScore = scoredSources[0]?.score
    const bestSources = bestScore ? scoredSources.filter(item => item.score === bestScore) : []
    return bestSources.length === 1 ? bestSources[0]?.entry : undefined
  }
  const explicitSources = generationSources.filter(entry => analyze(entry.source).hasExplicitDirectives)
  const candidates = explicitSources.length === 1 ? explicitSources : generationSources
  const directoryIndexOutputPathMatched = selectByOutputPath(candidates, score => score >= 25000 && score < 50000)
  if (directoryIndexOutputPathMatched) {
    return directoryIndexOutputPathMatched
  }
  const rawSourceMatched = selectByRawSourceFingerprint(generationSources)
  if (rawSourceMatched) {
    return rawSourceMatched
  }
  const outputPathMatched = selectByOutputPath(candidates)
  if (outputPathMatched) {
    return outputPathMatched
  }
  if (candidates.length === 1) {
    return candidates[0]
  }
  return selectByRawSourceFingerprint(candidates)
}
