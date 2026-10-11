import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { GeneratorResult } from '../generation-helpers/results'
import type { TailwindV4CssSource } from '../source-resolver/types'
import type { GenerateCssByGeneratorOptions } from '../types'
import type { NormalizedWeappTailwindcssGeneratorOptions, TailwindResolvedSource } from '@/generator/index'
import type { RuntimeBranch } from '@/runtime-branch'

export interface GeneratorPipelineExecutionContext {
  cssHandlerOptions: GenerateCssByGeneratorOptions['cssHandlerOptions']
  cssUserHandlerOptions: GenerateCssByGeneratorOptions['cssUserHandlerOptions']
  debug: GenerateCssByGeneratorOptions['debug']
  file: string
  finalizeGeneratorCss: (
    css: string,
    target: string,
    options?: {
      injectPreflight?: boolean | undefined
      preservePreflight?: boolean | undefined
      removeEmptyAtRuleAncestors?: boolean | undefined
      styleOptions?: Partial<IStyleHandlerOptions> | undefined
    },
  ) => string
  generatedUserCssRawSource: string
  generatorBranch: RuntimeBranch
  generatorOptions: NormalizedWeappTailwindcssGeneratorOptions
  generatorRawSource: string
  getSourceCandidatesForEntries: GenerateCssByGeneratorOptions['getSourceCandidatesForEntries']
  hasDistinctUserRawSource: boolean
  hasGeneratedCss: boolean
  hasGeneratedMarkers: boolean
  hasSourceDirectives: boolean
  hasWebUserCssFallbackSource: boolean
  legacyCompatUserCssRawSource: string
  localImports: string | undefined
  majorVersion: number
  normalizeGeneratorSource: (source: TailwindResolvedSource) => TailwindResolvedSource
  normalizedCssSources: TailwindV4CssSource[] | undefined
  options: GenerateCssByGeneratorOptions
  opts: GenerateCssByGeneratorOptions['opts']
  prepareFinalGeneratorCss: (css: string) => string
  runtime: Set<string>
  runtimeState: GenerateCssByGeneratorOptions['runtimeState']
  shouldPreserveLegacyCompatSelectorOverrides: boolean
  styleHandler: GenerateCssByGeneratorOptions['styleHandler']
  userCssOrderSource: string
  userCssRawSource: string
  userRawSourceProcessed: boolean | undefined
  useMiniProgramCssBranch: boolean
}

export interface GeneratorPipelineOutputContext extends GeneratorPipelineExecutionContext {
  compileAuthorCssFunctions: (css: string) => Promise<string>
  configuredContainerCompat: boolean
  filterGeneratedApplyOnlyCss: (css: string) => string
  generated: GeneratorResult
  generatedCss: string
  generatorStyleOptions: Partial<IStyleHandlerOptions>
  hasMatchedCssSourceFile: boolean
  isolateCurrentCssCandidates: boolean
  preflightMode: {
    inject: boolean
    preserve: boolean
  }
  runtimeWithCurrentCss: Set<string>
  shouldFilterApplyOnlyCss: boolean
}
