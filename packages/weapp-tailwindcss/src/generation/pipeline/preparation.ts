import type { GeneratorSourceRecord } from '../source-resolver'
import type { GeneratorPipelineExecutionContext } from './context'
import type { CompilationScopeDependency } from '@/compiler/index'
import process from 'node:process'
import { shouldUseMiniProgramCssBranch } from '@/runtime-branch'
import { filterUnsupportedMiniProgramTailwindV4Candidates } from '@/tailwindcss/v4-engine/candidates'
import { runWithConcurrency } from '../../utils/run-tasks'
import { collectGeneratorCssCandidates } from '../candidates'
import { removeTailwindSourceDirectives } from '../directives'
import { createRuntimeWithCurrentCssCandidates, mergeScopedRuntimeWithCurrentRuntime, resolveGeneratorStyleOptions, shouldIsolateCurrentTailwindV4CssCandidates, shouldIsolateScopedCssSource } from '../generation-helpers'
import { hasConfiguredContainerCompatSources } from '../legacy-compat'
import { removeMatchingLocalCssImports } from '../local-imports'
import { resolveGeneratorSourceEntries, resolveGeneratorSources } from '../source-resolver'
import { isSourceStyleRequest } from '../style-requests'

function resolveGeneratorSourceConcurrency() {
  const configured = Number.parseInt(process.env['WEAPP_TW_GENERATOR_SOURCE_CONCURRENCY'] ?? '', 10)
  return Number.isFinite(configured) && configured > 0 ? configured : 1
}

function resolveScopedRuntimeCandidates(sourceCandidates: Set<string> | undefined, sourceScopedRuntime: Set<string> | undefined) {
  if (!sourceCandidates) {
    return sourceScopedRuntime
  }
  if (!sourceScopedRuntime) {
    return sourceCandidates
  }
  if (sourceCandidates.size === 0) {
    return sourceScopedRuntime
  }
  const [small, large] = sourceCandidates.size <= sourceScopedRuntime.size ? [sourceCandidates, sourceScopedRuntime] : [sourceScopedRuntime, sourceCandidates]
  return new Set([...small].filter(candidate => large.has(candidate)))
}

function resolveCompilationSourceId(record: GeneratorSourceRecord, index: number) {
  const sourceId = record.metadata.matchedCssSourceFile
    ?? record.source.dependencies[0]
    ?? record.source.base
  return `${sourceId}:tailwind-source:${index}`
}

export function resolveCompilationDependencies(dependencies: Iterable<string>): CompilationScopeDependency[] {
  return [...new Set(dependencies)].map(id => ({
    id,
    kind: isSourceStyleRequest(id) ? 'css' : 'config',
  }))
}

export async function prepareGeneratorInputs(context: GeneratorPipelineExecutionContext) {
  const {
    cssHandlerOptions,
    debug,
    file,
    generatorBranch,
    generatorOptions,
    generatorRawSource,
    getSourceCandidatesForEntries,
    hasGeneratedCss,
    hasGeneratedMarkers,
    localImports,
    majorVersion,
    normalizeGeneratorSource,
    normalizedCssSources,
    options,
    opts,
    runtime,
    runtimeState,
    useMiniProgramCssBranch,
  } = context
  const currentCssCandidates = collectGeneratorCssCandidates(generatorRawSource)
  const isolateCurrentCssCandidates = shouldIsolateCurrentTailwindV4CssCandidates(
    majorVersion,
    cssHandlerOptions,
    {
      hasGeneratedCss,
      hasGeneratedMarkers,
      rawSource: generatorRawSource,
    },
  )
  const runtimeWithCurrentCss = createRuntimeWithCurrentCssCandidates(
    runtime,
    currentCssCandidates,
    isolateCurrentCssCandidates,
  )
  const sourceRecords = await resolveGeneratorSources(
    majorVersion,
    runtimeState,
    generatorRawSource,
    file,
    cssHandlerOptions,
    generatorOptions,
    {
      cssEntries: cssHandlerOptions.sourceOptions?.cssEntries ?? opts.cssEntries,
      cssSources: normalizedCssSources,
      getSourceCandidatesForEntries,
      runtime: runtimeWithCurrentCss,
    },
  )
  const generatorSourceRecords = useMiniProgramCssBranch
    ? sourceRecords.map(record => ({
        ...record,
        source: normalizeGeneratorSource(record.source),
      }))
    : sourceRecords
  const generatorStyleOptions = resolveGeneratorStyleOptions(opts, cssHandlerOptions, generatorOptions.styleOptions)
  const configuredContainerCompat = hasConfiguredContainerCompatSources(
    generatorSourceRecords.map(record => record.source),
  )
  const sourceConcurrency = resolveGeneratorSourceConcurrency()
  const preparedGenerationInputs = (await runWithConcurrency(generatorSourceRecords.map((record, index) => async () => {
    const { metadata: sourceMetadata, source } = record
    const sourceCss = options.deferCssAdaptation
      ? removeMatchingLocalCssImports(source.css, localImports)
      : source.css
    const generatorSource = options.disableSourceScan === true
      ? {
          ...source,
          css: removeTailwindSourceDirectives(sourceCss, {
            importFallback: generatorOptions.importFallback,
            preserveApplyContext: true,
          }),
        }
      : sourceCss === source.css
        ? source
        : {
            ...source,
            css: sourceCss,
          }
    const hasOwnedCssSources = Boolean(cssHandlerOptions.sourceOptions?.cssSources?.length)
    const entryCssCandidates = hasOwnedCssSources
      ? collectGeneratorCssCandidates(sourceMetadata.sourceCss ?? source.css)
      : currentCssCandidates
    const sourceEntries = getSourceCandidatesForEntries
      ? await resolveGeneratorSourceEntries(record, runtimeState)
      : undefined
    const hasOwnedSourceScope = sourceEntries !== undefined
      && (sourceEntries.length > 0 || sourceMetadata.isolateCssSource === true)
    const sourceScopedRuntime = hasOwnedSourceScope
      ? getSourceCandidatesForEntries?.(sourceEntries)
      : undefined
    const scopedRuntime = resolveScopedRuntimeCandidates(options.sourceCandidates, sourceScopedRuntime)
    const isolateCssSource = shouldIsolateScopedCssSource(majorVersion, record, sourceEntries, {
      cssHandlerOptions,
      target: generatorOptions.target,
    })
    const matchedCssSourceFile = Boolean(sourceMetadata?.matchedCssSourceFile)
    if (
      options.deferEmptyScopedCssSource
      && isolateCssSource
      && scopedRuntime?.size === 0
      && currentCssCandidates.length === 0
      && !cssHandlerOptions.isMainChunk
    ) {
      debug('defer empty scoped css source generation: %s', file)
      return undefined
    }
    const sourceRuntime = (scopedRuntime && (scopedRuntime.size > 0 || isolateCssSource)) || isolateCssSource
      ? isolateCurrentCssCandidates
        ? runtimeWithCurrentCss
        : mergeScopedRuntimeWithCurrentRuntime(scopedRuntime ?? new Set(), runtimeWithCurrentCss, {
            currentCssCandidates: entryCssCandidates,
            cssHandlerOptions,
            isolateCssSource,
            majorVersion,
            matchedCssSourceFile,
          })
      : runtimeWithCurrentCss
    const generatorRuntime = shouldUseMiniProgramCssBranch(generatorBranch)
      ? filterUnsupportedMiniProgramTailwindV4Candidates(sourceRuntime)
      : sourceRuntime
    return {
      generatorRuntime,
      generatorSource,
      dependencies: resolveCompilationDependencies(record.source.dependencies),
      isolateCssSource,
      sourceId: resolveCompilationSourceId(record, index),
    }
  }), sourceConcurrency)).filter((item): item is NonNullable<typeof item> => Boolean(item))
  return { isolateCurrentCssCandidates, runtimeWithCurrentCss, generatorSourceRecords, generatorStyleOptions, configuredContainerCompat, sourceConcurrency, preparedGenerationInputs }
}
