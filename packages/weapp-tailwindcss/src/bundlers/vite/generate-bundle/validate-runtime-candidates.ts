import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { OutputAsset } from 'rollup'
import type { GenerateBundleContext } from './types'
import type { InternalUserDefinedOptions } from '@/types'
import { Buffer } from 'node:buffer'
import { hasTailwindApplyDirective } from '../../../generation/directives'
import { validateCandidatesByGenerator } from '../../../generation/index'

export interface ValidateRuntimeCandidatesOptions {
  cssEntries: Array<{
    file: string
    output: OutputAsset
  }>
  debug: GenerateBundleContext['debug']
  getCssHandlerOptions: (file: string) => IStyleHandlerOptions
  getCssUserHandlerOptions: (file: string) => IStyleHandlerOptions
  getViteProcessedCssAssetResults: GenerateBundleContext['getViteProcessedCssAssetResults']
  hasMultipleConfiguredCssEntries: boolean
  normalizeMiniProgramGeneratorRawSource: (source: string, outputFile: string) => string
  opts: InternalUserDefinedOptions
  runtimeState: GenerateBundleContext['runtimeState']
  sourceCandidates: Set<string>
  styleHandler: InternalUserDefinedOptions['styleHandler']
  transformRuntime: Set<string>
}

export async function validateRuntimeCandidates(
  options: ValidateRuntimeCandidatesOptions,
) {
  if (options.sourceCandidates.size === 0 || options.hasMultipleConfiguredCssEntries) {
    return
  }
  const mainCssEntry = options.cssEntries.find(
    entry => options.getCssHandlerOptions(entry.file).isMainChunk,
  ) ?? options.cssEntries[0]
  if (!mainCssEntry) {
    return
  }
  const mainCssRawSource = typeof mainCssEntry.output.source === 'string'
    ? mainCssEntry.output.source
    : Buffer.from(mainCssEntry.output.source).toString()
  if (hasTailwindApplyDirective(mainCssRawSource)) {
    return
  }
  const generatedCssSources = new Set<string>()
  for (const [, record] of options.getViteProcessedCssAssetResults?.() ?? []) {
    if (typeof record === 'string') {
      generatedCssSources.add(record)
    }
    else if (typeof record?.css === 'string') {
      generatedCssSources.add(record.css)
    }
  }
  const validatedSourceRuntime = await validateCandidatesByGenerator({
    candidates: options.sourceCandidates,
    cssHandlerOptions: options.getCssHandlerOptions(mainCssEntry.file),
    cssUserHandlerOptions: options.getCssUserHandlerOptions(mainCssEntry.file),
    debug: options.debug,
    file: mainCssEntry.file,
    generatedCssSources,
    opts: options.opts,
    rawSource: options.normalizeMiniProgramGeneratorRawSource(
      mainCssRawSource,
      mainCssEntry.file,
    ),
    runtimeState: options.runtimeState,
    skipGenerateFallback: false,
    styleHandler: options.styleHandler,
  })
  for (const candidate of validatedSourceRuntime) {
    options.transformRuntime.add(candidate)
  }
}
