import type { GenerateCssByGeneratorOptions, GenerateCssByGeneratorResult } from './index'
import type { CompilationDependencyChange, CompilerShadowReport, CssStage, GenerationArtifact, SourceScope } from '@/compiler'
import type { InternalUserDefinedOptions } from '@/types'
import { consumeCompilationScopeChanges, createCompilerShadowReport, createCssFragment, createGenerationArtifact, getCompilerShadowRunRevision, mergeCompilationDependencyChanges, recordCompilerShadowReport, resolveCompilerMode } from '@/compiler'
import { getFrameworkCompilerSession } from '@/compiler/framework-compiler-session'
import { normalizeWeappTailwindcssGeneratorOptions } from '@/generator'
import { recordRpxThemeRisk, shouldCheckRpxThemeRisk } from '@/tailwindcss/v4/rpx-theme-warning'
import { adaptGeneratedCssWithFrameworkPipeline, adaptGeneratedCssWithFrameworkRootPipeline, hasFrameworkPostcssOptions } from './framework-postcss'
import { normalizeFrameworkProcessedUserCss, restoreFrameworkProcessedUserCss } from './framework-user-css'
import { generateCssByGenerator } from './index'
import { resolveGeneratedCssClassSet } from './result-helpers'
import { preferScopedGeneratedCssRules } from './scoped-rules'
import { resolvePostcssRequestOption } from './source-resolver/postcss-source'
import { isVueScopedStyleRequest, stripRequestQuery } from './style-requests'

export interface TailwindV4GenerationCoreInput extends GenerateCssByGeneratorOptions {
  /** CSS-only 构建不需要 compiler graph/shadow artifact，固定使用 legacy 输出。 */
  compilerMode?: 'legacy' | undefined
  compilationChanges?: CompilationDependencyChange[] | undefined
  frameworkPostcssOwner?: InternalUserDefinedOptions | undefined
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
  mode: ReturnType<typeof resolveCompilerMode>,
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
  const frameworkPostcssOwner = options.frameworkPostcssOwner ?? options.opts
  const normalizedGeneratorOptions = normalizeWeappTailwindcssGeneratorOptions(options.opts.generator, {
    appType: options.opts.appType,
    platform: options.generatorPlatform ?? options.opts.cssOptions?.platform ?? options.opts.platform,
    tailwindcssMajorVersion: majorVersion,
    uniAppX: options.opts.uniAppX,
  })
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
  if (!generated) {
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
              compiler: getFrameworkCompilerSession(options.runtimeState, options.opts).compiler,
              snapshot: generated.snapshot,
            }
          : {}),
      })
    : generated.css
  const composedCss = shouldReplayFrameworkPostcss && options.frameworkProcessedUserCss
    ? await restoreFrameworkProcessedUserCss(adaptedCss, generated, generated.frameworkProcessedUserCss ?? options.frameworkProcessedUserCss, options, normalizedGeneratorOptions)
    : adaptedCss
  const css = isVueScopedStyleRequest(resolvePostcssRequestOption(options.cssHandlerOptions))
    ? preferScopedGeneratedCssRules(composedCss)
    : composedCss
  const classSet = options.frameworkProcessedUserCss
    ? resolveGeneratedCssClassSet(generated.target, generated.classSet, options.runtime, css, options.opts.escapeMap, options.previousClassSet)
    : new Set(generated.classSet)
  if (shouldCheckRpxThemeRisk(options.runtimeState, generated.target, options.opts, options.generatorPlatform)) {
    recordRpxThemeRisk(options.runtimeState, options.file, generated.rpxThemeVariables ?? [])
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

export async function generateTailwindV4Css(
  options: TailwindV4GenerationCoreInput,
): Promise<TailwindV4GenerationCoreResult | undefined> {
  const mode = options.compilerMode ?? resolveCompilerMode()
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
