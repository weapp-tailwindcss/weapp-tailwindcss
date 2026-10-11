import type { createScopedGeneratorCandidateSignature } from './scoped-generator'
import type { RememberedCssSource } from './types'
import { hasOwnSourceDirectives } from './scoped-generator'
import { createMergedCssSourceTraceMap } from './source-trace'

interface GeneratorCssHandlerOptions {
  isMainChunk?: boolean | undefined
}
type SourceTraceResolver = (rawSource: string, sourceFile: string, options?: { scopeToSource?: boolean }) => Promise<Map<string, Set<string>> | undefined>
type RuntimeResolver = (outputFile: string, options: GeneratorCssHandlerOptions, runtime: Set<string>, rawSource?: string, sourceFile?: string, scopeToSource?: boolean) => Promise<Set<string>>
type CandidateSignatureResolver = typeof createScopedGeneratorCandidateSignature
type SignatureSource = Pick<RememberedCssSource, 'rawSource' | 'sourceFile'>

export function hasScopedSourceDirectives(sources: readonly RememberedCssSource[]) {
  return sources.length > 1 && sources.some(source => hasOwnSourceDirectives(source.rawSource, true))
}

function getSignatureSources(rememberedCssSources: RememberedCssSource[], generatorRawSource: string, generatorSourceFile: string): SignatureSource[] {
  return hasScopedSourceDirectives(rememberedCssSources)
    ? rememberedCssSources
    : [{ rawSource: generatorRawSource, sourceFile: generatorSourceFile }]
}

export async function createScopedGeneratorSourceData(options: {
  createScopedGeneratorRuntime: RuntimeResolver
  createScopedGeneratorSourceTraceMap: SourceTraceResolver
  generatorCssHandlerOptions: GeneratorCssHandlerOptions
  generatorRawSource: string
  generatorRuntime: Set<string>
  generatorSourceFile: string
  rememberedCssSources: RememberedCssSource[]
  scopedSourceCandidateSourceGetter: ((entries: unknown) => Map<string, Set<string>>) | undefined
  outputFile: string
}) {
  const { createScopedGeneratorRuntime, createScopedGeneratorSourceTraceMap, generatorCssHandlerOptions, generatorRawSource, generatorRuntime, generatorSourceFile, rememberedCssSources, scopedSourceCandidateSourceGetter, outputFile } = options
  const signatureSources = getSignatureSources(rememberedCssSources, generatorRawSource, generatorSourceFile)
  const sourceTraceSources = scopedSourceCandidateSourceGetter
    ? signatureSources.length > 1
      ? await createMergedCssSourceTraceMap(signatureSources, source => createScopedGeneratorSourceTraceMap(source.rawSource, source.sourceFile, { scopeToSource: true }))
      : await createScopedGeneratorSourceTraceMap(generatorRawSource, generatorSourceFile, { scopeToSource: hasScopedSourceDirectives(rememberedCssSources) })
    : undefined
  const scopedGeneratorRuntime = hasScopedSourceDirectives(rememberedCssSources)
    ? new Set<string>((await Promise.all(rememberedCssSources.map(source => createScopedGeneratorRuntime(outputFile, generatorCssHandlerOptions, generatorRuntime, source.rawSource, source.sourceFile, true)))).flatMap(candidates => [...candidates]))
    : await createScopedGeneratorRuntime(outputFile, generatorCssHandlerOptions, generatorRuntime, generatorRawSource, generatorSourceFile)
  return { scopedGeneratorRuntime, signatureSources, sourceTraceSources }
}

export async function createScopedGeneratorCandidateSignatureForSources(options: {
  createScopedGeneratorCandidateSignature: CandidateSignatureResolver
  generatorCssHandlerOptions: GeneratorCssHandlerOptions
  majorVersion: number | undefined
  scopedSourceCandidateGetter: Parameters<CandidateSignatureResolver>[3]
  signatureSources: readonly SignatureSource[]
  trackedGeneratorCandidateSignature: string
}) {
  const { createScopedGeneratorCandidateSignature, generatorCssHandlerOptions, majorVersion, scopedSourceCandidateGetter, signatureSources, trackedGeneratorCandidateSignature } = options
  return JSON.stringify(await Promise.all(signatureSources.map(async source => [
    source.sourceFile,
    await createScopedGeneratorCandidateSignature(source.rawSource, source.sourceFile, trackedGeneratorCandidateSignature, scopedSourceCandidateGetter, { includeFallbackSignature: generatorCssHandlerOptions.isMainChunk, majorVersion, scopeToSource: true }),
  ])))
}
