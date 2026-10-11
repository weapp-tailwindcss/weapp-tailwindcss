import type { GenerateCssByGeneratorResult } from '../types'
import type { GeneratorPipelineExecutionContext, GeneratorPipelineOutputContext } from './context'
import type { CompilerSnapshot } from '@/core/compiler/index'
import { runCompilerOwnerActivity } from '@/compiler/compiler-owner-state'
import { getFrameworkCompilerSession } from '@/compiler/framework-compiler-session'
import { getCompilationSessionPool } from '@/compiler/index'
import { getTailwindGenerationSessionPool } from '@/compiler/tailwind-generation-session-pool'
import { hasCssCalcVariables } from '@/tailwindcss/v4-engine/generator/style-context'
import { includesTailwindV4PreflightDirective } from '@/tailwindcss/v4/preflight'
import { collectRpxThemeRiskSources, shouldCheckRpxThemeRisk } from '@/tailwindcss/v4/rpx-theme-warning'
import { runWithConcurrency } from '../../utils/run-tasks'
import { resolveMiniProgramPreflightModeForGeneratorCss, shouldScanTailwindV4Sources } from '../generation-helpers'
import { stripTailwindBanner } from '../markers'
import { filterApplyOnlyGeneratedCss, shouldFilterApplyOnlyGeneratedCss } from '../user-css'
import { createAuthorCssFunctionCompiler } from '../user-css/compile-functions'
import { finalizeDeferredGeneratorCss } from './deferred-output'
import { finalizeFallbackGeneratorCss } from './fallback-output'
import { finalizeOrderedGeneratorCss } from './ordered-output'

import { prepareGeneratorInputs, resolveCompilationDependencies } from './preparation'
import { mergeGeneratorResultsForOutput } from './style-context'

export async function executeGeneratorPipeline(
  context: GeneratorPipelineExecutionContext,
): Promise<GenerateCssByGeneratorResult | undefined> {
  return runCompilerOwnerActivity(
    context.runtimeState,
    () => executeGeneratorPipelineWithOwner(
      context,
      getCompilationSessionPool(context.runtimeState),
      getTailwindGenerationSessionPool(context.runtimeState),
    ),
  )
}

async function executeGeneratorPipelineWithOwner(
  context: GeneratorPipelineExecutionContext,
  compilationPool: ReturnType<typeof getCompilationSessionPool>,
  generationSession: ReturnType<typeof getTailwindGenerationSessionPool>,
): Promise<GenerateCssByGeneratorResult | undefined> {
  const { cssHandlerOptions, debug, file, generatorOptions, generatorRawSource, hasGeneratedCss, hasGeneratedMarkers, localImports, majorVersion, options, opts, runtimeState } = context
  await runtimeState.readyPromise
  const compilerSession = options.compilation?.enabled
    ? getFrameworkCompilerSession(runtimeState, opts)
    : undefined
  const { isolateCurrentCssCandidates, runtimeWithCurrentCss, generatorSourceRecords, generatorStyleOptions, configuredContainerCompat, sourceConcurrency, preparedGenerationInputs } = await prepareGeneratorInputs(context)
  if (hasCssCalcVariables(generatorStyleOptions)) {
    generatorStyleOptions.customPropertyContextCss = [
      generatorStyleOptions.customPropertyContextCss,
      context.generatedUserCssRawSource,
      options.frameworkProcessedUserCss,
      ...preparedGenerationInputs.map(input => input.generatorSource.css),
    ].filter(Boolean).join('\n')
  }
  const generatePreparedInputs = async (candidateSets?: Map<string, Set<string>>) => {
    return runWithConcurrency(preparedGenerationInputs.map(input => async () => {
      const projectedCandidates = candidateSets?.get(input.sourceId)
      const currentCandidates = projectedCandidates
        ? new Set([...input.generatorRuntime, ...projectedCandidates])
        : input.generatorRuntime
      const generateOptions = {
        bareArbitraryValues: generatorOptions.bareArbitraryValues,
        candidates: currentCandidates,
        incrementalCache: options.incrementalCache ?? true,
        scanSources: options.disableSourceScan === true
          ? false
          : shouldScanTailwindV4Sources(
              majorVersion,
              generatorOptions.target,
              currentCandidates,
              input.isolateCssSource,
            ),
        styleOptions: generatorStyleOptions,
        target: generatorOptions.target,
      }
      let generated
      if (compilerSession && input.generatorSource) {
        try {
          generated = await compilerSession.generate(
            options.compilation?.scope.id ?? options.outputFile ?? file,
            input.sourceId,
            input.generatorSource,
            generateOptions,
          )
        }
        catch (error) {
          if (!(error instanceof TypeError) || !String(error.message).includes('dependencies')) {
            throw error
          }
          generated = await generationSession.generate(input.generatorSource, generateOptions)
        }
      }
      else {
        generated = await generationSession.generate(input.generatorSource, generateOptions)
      }
      return {
        generated,
        sourceId: input.sourceId,
      }
    }), sourceConcurrency)
  }
  let compilationRevision: number | undefined
  let generated
  if (options.compilation?.enabled) {
    const execution = await compilationPool.run({
      scope: options.compilation.scope,
      outputId: options.outputFile ?? file,
      changes: options.compilation.changes,
      sources: preparedGenerationInputs.map(input => ({
        id: input.sourceId,
        kind: 'css',
        content: input.generatorSource.css,
        candidates: input.generatorRuntime,
        dependencies: input.dependencies,
      })),
      preserveDeletedCss: options.compilation.preserveDeletedCss,
    }, async (compilation) => {
      if (compilerSession && options.compilation?.changes) {
        compilerSession.invalidate(options.compilation.changes.map(change => change.id))
      }
      await compilerSession?.syncScope(
        options.compilation?.scope.id ?? options.outputFile ?? file,
        preparedGenerationInputs.map(input => input.sourceId),
      )
      const results = await generatePreparedInputs(compilation.candidatesBySource)
      const merged = await mergeGeneratorResultsForOutput(results.map(result => result.generated), generatorStyleOptions)
      return merged
        ? {
            classSet: merged.classSet,
            dependenciesBySource: results.map(result => [
              result.sourceId,
              resolveCompilationDependencies(result.generated.dependencies),
            ] as const),
            generated: merged,
            ...(compilerSession
              ? (() => {
                  const snapshots = results
                    .map(result => 'snapshot' in result.generated ? result.generated.snapshot : undefined)
                    .filter((snapshot): snapshot is CompilerSnapshot => snapshot !== undefined)
                  return snapshots.length > 0
                    ? { snapshot: compilerSession.mergeSnapshots(snapshots) }
                    : {}
                })()
              : {}),
          }
        : undefined
    })
    if (!execution.committed) {
      debug(
        'discard stale graph compilation result: %s revision=%d',
        file,
        execution.compilation.revision,
      )
      return undefined
    }
    generated = execution.value?.generated
    if (generated && execution.value?.snapshot) {
      generated = {
        ...generated,
        snapshot: execution.value.snapshot as CompilerSnapshot,
      }
    }
    compilationRevision = execution.compilation.revision
  }
  else {
    generated = await mergeGeneratorResultsForOutput(
      (await generatePreparedInputs()).map(result => result.generated),
      generatorStyleOptions,
    )
  }
  if (!generated) {
    return undefined
  }
  if (generated.customPropertyContextCss) {
    generatorStyleOptions.customPropertyContextCss = generated.customPropertyContextCss
  }
  debug(
    'tailwind generator result: %s rawBytes=%d cssBytes=%d candidates=%d',
    file,
    generated.rawCss.length,
    generated.css.length,
    generated.classSet.size,
  )
  const hasMatchedCssSourceFile = generatorSourceRecords.some(record => record.metadata.matchedCssSourceFile)
  const hasExplicitCssSource = generatorSourceRecords.some(({ metadata }) => {
    return metadata?.candidateMatchedCssSource !== true
      && (metadata?.cssEntryIndex !== undefined || metadata?.cssSourceIndex !== undefined)
  })
  const hasPreflightCssSource = generatorSourceRecords.some(({ metadata }) => {
    const appEntryMatchedByCandidates = metadata?.candidateMatchedCssSource === true
      && metadata.cssEntryIndex === 0
      && metadata.cssSourceIndex === undefined
    return metadata?.includesPreflight === true
      && !appEntryMatchedByCandidates
  })
  const hasPreflightRawSource = includesTailwindV4PreflightDirective(generatorRawSource)
  const hasOnlyPrimaryCssSource = generatorSourceRecords.length > 0
    && generatorSourceRecords.every(({ metadata }) => {
      return metadata?.candidateMatchedCssSource !== true
        && metadata?.primaryCssSource === true
    })
  const shouldFilterApplyOnlyCss = shouldFilterApplyOnlyGeneratedCss(
    majorVersion,
    generated.target,
    generatorRawSource,
    {
      hasGeneratedCss,
      hasGeneratedMarkers,
    },
  )
  const filterGeneratedApplyOnlyCss = (css: string) => {
    if (!shouldFilterApplyOnlyCss) {
      return css
    }
    return filterApplyOnlyGeneratedCss(css, generatorRawSource, {
      preserveVariables: generated.target !== 'web',
      preserveRuntimeProperties: generated.target === 'web' && opts.appType === 'uni-app-x',
    })
  }
  const preflightMode = resolveMiniProgramPreflightModeForGeneratorCss(opts, {
    cssHandlerOptions,
    isolateCurrentCssCandidates,
    localImports,
    explicitCssSource: hasExplicitCssSource,
    primaryCssSource: hasOnlyPrimaryCssSource || hasPreflightCssSource || hasPreflightRawSource,
  })
  const compileAuthorCssFunctions = createAuthorCssFunctionCompiler(preparedGenerationInputs.map(input => input.generatorSource), generationSession)
  const frameworkProcessedUserCss = options.frameworkProcessedUserCss === undefined
    ? undefined
    : await compileAuthorCssFunctions(options.frameworkProcessedUserCss)
  const outputContext: GeneratorPipelineOutputContext = {
    ...context,
    ...(compilerSession && options.compilation?.preserveDeletedCss !== true
      ? {
          options: {
            ...context.options,
            previousClassSet: undefined,
            previousCss: undefined,
          },
        }
      : {}),
    compileAuthorCssFunctions,
    configuredContainerCompat,
    filterGeneratedApplyOnlyCss,
    generated,
    generatedCss: filterGeneratedApplyOnlyCss(
      generated.target === 'web' ? generated.css : stripTailwindBanner(generated.css),
    ),
    generatorStyleOptions,
    hasMatchedCssSourceFile,
    isolateCurrentCssCandidates,
    preflightMode,
    runtimeWithCurrentCss,
    shouldFilterApplyOnlyCss,
  }
  const withCompilationMetadata = (result: GenerateCssByGeneratorResult | undefined) => {
    if (result && shouldCheckRpxThemeRisk(runtimeState, generated.target, opts, options.generatorPlatform)) {
      result.rpxThemeVariables = [...new Set([
        ...preparedGenerationInputs.flatMap(input => input.generatorSource.rpxThemeVariables ?? []),
        ...collectRpxThemeRiskSources([
          generatorRawSource,
          ...preparedGenerationInputs.map(input => input.generatorSource.css),
        ]),
      ])]
    }
    if (result && frameworkProcessedUserCss !== undefined) {
      result = {
        ...result,
        compileAuthorCssFunctions,
        frameworkProcessedUserCss,
      }
    }
    if (!result || compilationRevision === undefined) {
      return result
    }
    return {
      ...result,
      ...(generated.snapshot ? { snapshot: generated.snapshot } : {}),
      metadata: {
        file,
        ...result.metadata,
        revision: compilationRevision,
      },
    }
  }
  const finalized = options.deferCssAdaptation
    ? await finalizeDeferredGeneratorCss(outputContext)
    : await finalizeOrderedGeneratorCss(outputContext) ?? await finalizeFallbackGeneratorCss(outputContext)
  return withCompilationMetadata(finalized)
}
