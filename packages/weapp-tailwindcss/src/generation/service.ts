import type { FrameworkPostcssOwner } from './framework-postcss'
import type { GenerateCssByGeneratorOptions, GenerateCssByGeneratorResult } from './index'
import type { CompilationDependencyChange, CompilerShadowReport, CssStage, GenerationArtifact, SourceScope } from '@/compiler'
import { finalizeWebCssPropertyFallbacks } from '@weapp-tailwindcss/postcss/transform'
import { consumeCompilationScopeChanges, createCompilerShadowReport, createCssFragment, createGenerationArtifact, getCompilerShadowRunRevision, mergeCompilationDependencyChanges, recordCompilerShadowReport } from '@/compiler'
import { runCompilerOwnerActivity } from '@/compiler/compiler-owner-state'
import { getFrameworkCompilerSession } from '@/compiler/framework-compiler-session'
import { recordRpxThemeRisk } from '@/compiler/rpx-theme-diagnostics'
import { adaptGeneratedCssWithFrameworkPipeline, adaptGeneratedCssWithFrameworkRootPipeline, hasFrameworkPostcssOptions } from './framework-postcss'
import { normalizeFrameworkProcessedUserCss, restoreFrameworkProcessedUserCss } from './framework-user-css'
import { generateCssByGenerator } from './index'
import { resolveGeneratedCssClassSet } from './result-helpers'
import { preferScopedGeneratedCssRules } from './scoped-rules'
import { resolvePostcssRequestOption } from './source-resolver/postcss-source'
import { isVueScopedStyleRequest, stripRequestQuery } from './style-requests'

export interface TailwindV4GenerationCoreInput extends GenerateCssByGeneratorOptions {
  /** CSS-only 构建不需要 compiler graph/shadow artifact，固定使用 legacy 输出。 */
  compilerMode?: 'legacy' | 'graph' | 'shadow' | undefined
  compilationChanges?: CompilationDependencyChange[] | undefined
  frameworkPostcssOwner?: FrameworkPostcssOwner | undefined
  cssStage?: CssStage | undefined
  outputFile?: string | undefined
  onCompilerShadowReport?: ((report: CompilerShadowReport) => void) | undefined
  scope?: SourceScope | undefined
  sourceCandidates?: Set<string> | undefined
}

export interface TailwindV4GenerationCoreResult extends GenerateCssByGeneratorResult {
  artifact?: GenerationArtifact | undefined
  classSet: Set<string>
  dependencies: string[]
  metadata: NonNullable<GenerateCssByGeneratorResult['metadata']>
}

interface GenerationImplementationOptions {
  emitArtifact: boolean
  frameworkAdapter: 'legacy' | 'graph'
}

function resolveGenerationOptions(
  options: TailwindV4GenerationCoreInput,
  mode: TailwindV4GenerationCoreInput['profile']['compilerMode'],
) {
  const physicalFile = stripRequestQuery(options.file)
  const normalizedOptions = physicalFile === options.file
    ? options
    : { ...options, file: physicalFile }
  if (mode === 'legacy') {
    return normalizedOptions
  }
  const scopeId = normalizedOptions.scope?.id ?? normalizedOptions.outputFile ?? normalizedOptions.file
  const compilationChanges = mergeCompilationDependencyChanges(
    normalizedOptions.compilationChanges,
    consumeCompilationScopeChanges(normalizedOptions.runtimeState, scopeId),
  )
  if (compilationChanges.length === 0) {
    return normalizedOptions
  }
  return {
    ...normalizedOptions,
    compilationChanges,
    previousClassSet: undefined,
    previousCss: undefined,
  }
}

function createCoreArtifact(
  generated: GenerateCssByGeneratorResult,
  css: string,
  options: TailwindV4GenerationCoreInput,
): GenerationArtifact {
  const sourceId = generated.metadata?.file ?? options.file
  const scopeId = generated.metadata?.outputFile ?? options.outputFile ?? sourceId
  const scope = options.scope ?? {
    id: scopeId,
    kind: options.cssHandlerOptions.isMainChunk ? 'global' : 'component',
  }
  return createGenerationArtifact([
    createCssFragment({
      id: `${scopeId}:generated`,
      kind: 'tailwind',
      css,
      sourceId,
      scope,
      stage: 'adapted',
    }),
  ], {
    classSet: new Set(generated.classSet),
    rawCandidates: options.runtime,
    dependencies: generated.dependencies,
    sourceEntries: options.cssHandlerOptions.sourceOptions?.cssEntries ?? [],
    ...(generated.metadata?.revision === undefined ? {} : { revision: generated.metadata.revision }),
  })
}

async function generateTailwindV4CssWithImplementation(
  options: TailwindV4GenerationCoreInput,
  implementation: GenerationImplementationOptions,
): Promise<TailwindV4GenerationCoreResult | undefined> {
  const majorVersion = options.runtimeState.tailwindRuntime.majorVersion
  if (majorVersion !== 4) {
    throw new Error('weapp-tailwindcss 生成管线仅支持 Tailwind CSS v4。')
  }
  const frameworkPostcssOwner = options.frameworkPostcssOwner ?? options.profile
  const normalizedGeneratorOptions = options.profile.generator
  const shouldReplayFrameworkPostcss = options.cssStage === 'framework-processed'
    && hasFrameworkPostcssOptions(frameworkPostcssOwner)

  const generationInput = !shouldReplayFrameworkPostcss && options.frameworkProcessedUserCss
    ? { ...options, userRawSource: [options.userRawSource, options.frameworkProcessedUserCss].filter(Boolean).join('\n'), frameworkProcessedUserCss: undefined }
    : options
  const scope = options.scope ?? {
    id: options.outputFile ?? options.file,
    kind: options.cssHandlerOptions.isMainChunk ? 'global' : 'component',
  }
  const generated = await generateCssByGenerator(
    shouldReplayFrameworkPostcss
      ? {
          ...generationInput,
          deferWebCssPropertyFallback: normalizedGeneratorOptions.target === 'web' || options.deferWebCssPropertyFallback,
          frameworkProcessedUserCss: options.frameworkProcessedUserCss === undefined
            ? undefined
            : normalizeFrameworkProcessedUserCss(options.frameworkProcessedUserCss),
          compilation: implementation.frameworkAdapter === 'graph'
            ? {
                enabled: true,
                preserveDeletedCss: normalizedGeneratorOptions.hmr?.preserveDeletedCss ?? true,
                scope,
                ...(options.compilationChanges === undefined ? {} : { changes: options.compilationChanges }),
              }
            : undefined,
          deferCssAdaptation: normalizedGeneratorOptions.target === 'weapp',
        }
      : {
          ...generationInput,
          deferWebCssPropertyFallback: normalizedGeneratorOptions.target === 'web' || options.deferWebCssPropertyFallback,
          compilation: implementation.frameworkAdapter === 'graph'
            ? {
                enabled: true,
                preserveDeletedCss: normalizedGeneratorOptions.hmr?.preserveDeletedCss ?? true,
                scope,
                ...(options.compilationChanges === undefined ? {} : { changes: options.compilationChanges }),
              }
            : undefined,
        },
  )
  if (!generated || !options.isConfigurationCurrent()) {
    return undefined
  }
  const adaptedCss = shouldReplayFrameworkPostcss
    ? await (implementation.frameworkAdapter === 'graph'
        ? adaptGeneratedCssWithFrameworkRootPipeline
        : adaptGeneratedCssWithFrameworkPipeline)(frameworkPostcssOwner, generated, {
        cssHandlerOptions: options.cssHandlerOptions,
        file: options.file,
        majorVersion,
        rawCandidates: options.runtime,
        styleHandler: options.styleHandler,
        ...(implementation.frameworkAdapter === 'graph' && generated.snapshot
          ? {
              compiler: getFrameworkCompilerSession(options.runtimeState, options.compilerTransforms).compiler,
              snapshot: generated.snapshot,
            }
          : {}),
      })
    : generated.css
  const composedCss = shouldReplayFrameworkPostcss && options.frameworkProcessedUserCss
    ? await restoreFrameworkProcessedUserCss(adaptedCss, generated, generated.frameworkProcessedUserCss ?? options.frameworkProcessedUserCss, options, normalizedGeneratorOptions)
    : adaptedCss
  const scopedCss = isVueScopedStyleRequest(resolvePostcssRequestOption(options.cssHandlerOptions))
    ? preferScopedGeneratedCssRules(composedCss)
    : composedCss
  const css = generated.target === 'web' && !options.deferWebCssPropertyFallback
    ? finalizeWebCssPropertyFallbacks([scopedCss], normalizedGeneratorOptions.webCompat)[0]!
    : scopedCss
  const classSet = options.frameworkProcessedUserCss
    ? resolveGeneratedCssClassSet(generated.target, generated.classSet, options.runtime, css, options.profile.escapeMap, options.previousClassSet)
    : new Set(generated.classSet)
  if (options.profile.checkRpxThemeRisk) {
    recordRpxThemeRisk(options.runtimeState, options.file, generated.rpxThemeVariables ?? [])
  }
  if (!options.isConfigurationCurrent()) {
    return undefined
  }
  const artifact = implementation.emitArtifact
    ? createCoreArtifact({ ...generated, classSet }, css, options)
    : undefined
  const {
    compileAuthorCssFunctions: _compileAuthorCssFunctions,
    ...generatedRest
  } = generated
  return {
    ...generatedRest,
    ...(artifact ? { artifact } : {}),
    css,
    classSet,
    dependencies: generated.dependencies,
    metadata: {
      file: options.file,
      majorVersion,
      outputFile: options.outputFile,
      ...(generated.metadata ?? {}),
    },
  }
}

async function generateTailwindV4CssWithOwner(
  options: TailwindV4GenerationCoreInput,
): Promise<TailwindV4GenerationCoreResult | undefined> {
  const mode = options.compilerMode ?? options.profile.compilerMode
  const generationOptions = resolveGenerationOptions(options, mode)
  if (mode === 'legacy') {
    return generateTailwindV4CssWithImplementation(generationOptions, {
      emitArtifact: false,
      frameworkAdapter: 'legacy',
    })
  }
  if (mode === 'graph') {
    return generateTailwindV4CssWithImplementation(generationOptions, {
      emitArtifact: true,
      frameworkAdapter: 'graph',
    })
  }

  const shadowRunRevision = getCompilerShadowRunRevision(generationOptions.runtimeState)
  const legacy = await generateTailwindV4CssWithImplementation(generationOptions, {
    emitArtifact: true,
    frameworkAdapter: 'legacy',
  })
  const graph = await generateTailwindV4CssWithImplementation(generationOptions, {
    emitArtifact: true,
    frameworkAdapter: 'graph',
  })
  if (!generationOptions.isConfigurationCurrent()) {
    return undefined
  }
  const report = createCompilerShadowReport(
    generationOptions.file,
    legacy?.artifact,
    graph?.artifact,
    {
      scopeId: generationOptions.scope?.id ?? generationOptions.outputFile ?? generationOptions.file,
    },
  )
  recordCompilerShadowReport(generationOptions.runtimeState, report, shadowRunRevision)
  generationOptions.onCompilerShadowReport?.(report)
  if (!report.equal) {
    generationOptions.debug('compiler shadow semantic mismatch: %s', generationOptions.file)
    generationOptions.debug('compiler shadow semantic report: %O', report)
  }
  return legacy
}

export function generateTailwindV4Css(options: TailwindV4GenerationCoreInput) {
  return runCompilerOwnerActivity(options.runtimeState, async () => {
    const result = await generateTailwindV4CssWithOwner(options)
    return options.isConfigurationCurrent() ? result : undefined
  })
}
