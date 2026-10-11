import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { CompilerGenerateResult, CompilerSnapshot } from '@/core/compiler/index'
import { hasTailwindApplyDirective, hasTailwindRootDirectives, hasTailwindSourceDirectives } from '../directives'
import { splitGeneratorPlaceholderCssBySourceOrder, splitTailwindGeneratedCssByBanner, splitTailwindV4GeneratedCssBySourceOrder } from '../markers'
import { deduplicateGeneratedCssRules } from './source-order'

export function shouldFinalizeMarkedUserLayerComponentsCss(file: string) {
  return !/\.(?:vue|svelte|astro|scss|sass|less|styl)(?:[?#].*)?$/i.test(file)
}

export function splitRawSourceByGeneratedCssOrder(rawSource: string, rawTailwindCss: string) {
  const placeholderParts = splitGeneratorPlaceholderCssBySourceOrder(rawSource, rawTailwindCss)
  if (placeholderParts) {
    return placeholderParts
  }
  const exactParts = splitTailwindV4GeneratedCssBySourceOrder(rawSource, rawTailwindCss)
  if (exactParts) {
    return exactParts
  }
  return splitTailwindGeneratedCssByBanner(rawSource)
}

export function shouldUseGeneratorForCurrentCss(
  _majorVersion: number | undefined,
  cssHandlerOptions: IStyleHandlerOptions,
  options: {
    forceGenerator?: boolean | undefined
    hasGeneratedCss: boolean
    hasGeneratedMarkers: boolean
    hasSourceDirectives: boolean
    rawSource: string
    runtimeCandidateCount?: number | undefined
    target?: string | undefined
    configuredCssSourceCount?: number | undefined
  },
) {
  const hasApplyDirectives = hasTailwindApplyDirective(options.rawSource)
  const sourceCss = (cssHandlerOptions as { sourceOptions?: { sourceCss?: string | undefined } | undefined }).sourceOptions?.sourceCss
  const hasSourceCssDirectives = typeof sourceCss === 'string'
    && (
      hasTailwindRootDirectives(sourceCss, { importFallback: true })
      || hasTailwindSourceDirectives(sourceCss, { importFallback: true })
      || hasTailwindApplyDirective(sourceCss)
    )
  return options.forceGenerator === true
    || options.hasGeneratedCss
    || options.hasGeneratedMarkers
    || options.hasSourceDirectives
    || hasApplyDirectives
    || hasSourceCssDirectives
    || (
      cssHandlerOptions.isMainChunk
      && (options.configuredCssSourceCount ?? 0) > 0
    )
    || (
      cssHandlerOptions.isMainChunk
      && options.rawSource.includes('weapp-tailwindcss')
    )
    || (
      options.target === 'web'
      && cssHandlerOptions.isMainChunk
      && (options.runtimeCandidateCount ?? 0) > 0
    )
}

export function hasGeneratorSourceDirectives(source: string, importFallback: boolean) {
  return hasTailwindSourceDirectives(source, { importFallback })
}

export function createRuntimeWithCurrentCssCandidates(
  runtime: Set<string>,
  currentCssCandidates: string[],
  isolateCurrentCssCandidates: boolean,
) {
  return isolateCurrentCssCandidates
    ? new Set(currentCssCandidates)
    : currentCssCandidates.length > 0
      ? new Set([
          ...runtime,
          ...currentCssCandidates,
        ])
      : runtime
}

export function mergeGeneratorResults(generatedResults: GeneratorResult[]) {
  const firstGenerated = generatedResults[0]
  if (!firstGenerated) {
    return undefined
  }
  if (generatedResults.length === 1) {
    return firstGenerated
  }
  const incrementalCssResults = generatedResults
    .map(item => item.incrementalCss)
    .filter((css): css is string => typeof css === 'string')
  const incrementalRawCssResults = generatedResults
    .map(item => item.incrementalRawCss)
    .filter((css): css is string => typeof css === 'string')
  const customPropertyValues = new Map<string, string>()
  const conflictingProperties = new Set<string>()
  for (const result of generatedResults) {
    for (const [name, value] of result.customPropertyValues ?? []) {
      if (customPropertyValues.has(name) && customPropertyValues.get(name) !== value) {
        conflictingProperties.add(name)
      }
      customPropertyValues.set(name, value)
    }
  }
  for (const name of conflictingProperties) {
    customPropertyValues.delete(name)
  }
  return {
    ...firstGenerated,
    css: deduplicateGeneratedCssRules(generatedResults.map(item => item.css).join('\n')),
    rawCss: deduplicateGeneratedCssRules(generatedResults.map(item => item.rawCss).join('\n')),
    customPropertyContextCss: generatedResults.map(item => item.customPropertyContextCss ?? item.rawCss).join('\n'),
    incrementalCss: incrementalCssResults.length === generatedResults.length
      ? incrementalCssResults.filter(Boolean).join('\n')
      : undefined,
    incrementalRawCss: incrementalRawCssResults.length === generatedResults.length
      ? incrementalRawCssResults.filter(Boolean).join('\n')
      : undefined,
    classSet: new Set(generatedResults.flatMap(item => [...item.classSet])),
    dependencies: [...new Set(generatedResults.flatMap(item => item.dependencies))],
    sources: generatedResults.flatMap(item => item.sources),
    customPropertyValues,
  }
}
export type GeneratorResult = Omit<CompilerGenerateResult, 'cache' | 'revision' | 'snapshot'> & {
  snapshot?: CompilerSnapshot | undefined
}
