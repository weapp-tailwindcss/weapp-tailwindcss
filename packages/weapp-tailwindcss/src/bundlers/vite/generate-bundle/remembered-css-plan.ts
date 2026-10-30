import type { OutputAsset } from 'rollup'
import type { BundleSnapshot } from '../bundle-state'
import type { RememberedCssSource } from './types'
import { normalizeOutputPathKey } from '../../shared/module-graph'
import { findRememberedCssSources } from './remembered-css'
import {
  hasTailwindGenerationSource,
  normalizeSfcSourceFileForCompare,
  resolveSfcStyleSourceFromOutputFile,
} from './sfc-style-source'

export interface ResolveRememberedCssSourcePlanOptions {
  configuredSourceFileKeys: ReadonlySet<string>
  currentRawSourceHasExplicitScanContext: boolean
  debug: (format: string, ...args: unknown[]) => void
  explicitConfiguredSourceFileKeys: ReadonlySet<string>
  file: string
  getRememberedCssSources: (() => Iterable<[string, RememberedCssSource]>) | undefined
  getSfcSource: ((file: string) => string | undefined) | undefined
  hasExplicitConfiguredRootSource: boolean
  normalizeConfiguredSourceFile: (file: string) => string
  originalSource: OutputAsset
  outputFile: string
  outputRoot: string
  rawSource: string
  resolveConfiguredRootSource: () => RememberedCssSource | undefined
  resolveMatchedOutputFile: (sourceFile: string) => string | undefined
  resolveTemporarySource: (outputFile: string, rawSource: string) => RememberedCssSource | undefined
  shouldKeepCurrentRootOutput: (sourceFile: string, outputFile: string) => boolean
  snapshot: BundleSnapshot
  sourceRoot: string | undefined
  temporaryOutput: boolean
  cssMatcher: ((file: string) => boolean) | undefined
}

export interface RememberedCssSourcePlan {
  forceNonMainChunk: boolean
  hasUsableTailwindSource: boolean
  outputFile: string
  resolvedFromTemporarySource: boolean
  sources: RememberedCssSource[]
  usedConfiguredSourceFiles: string[]
}

export async function resolveRememberedCssSourcePlan(
  options: ResolveRememberedCssSourcePlanOptions,
): Promise<RememberedCssSourcePlan> {
  let sources = findRememberedCssSources(
    options.getRememberedCssSources?.(),
    options.outputFile,
    options.file,
    options.originalSource,
    options.outputRoot,
    options.sourceRoot,
  )
  sources = sources.filter((remembered) => {
    if (
      options.currentRawSourceHasExplicitScanContext
      && !remembered.rawSource.includes('@source')
      && !remembered.rawSource.includes('@config')
    ) {
      return false
    }
    const sourceFileKey = options.normalizeConfiguredSourceFile(remembered.sourceFile)
    if (
      options.hasExplicitConfiguredRootSource
      && !options.explicitConfiguredSourceFileKeys.has(sourceFileKey)
    ) {
      return false
    }
    if (!options.configuredSourceFileKeys.has(sourceFileKey)) {
      return true
    }
    const matchedOutputFile = options.resolveMatchedOutputFile(remembered.sourceFile)
    return !matchedOutputFile
      || normalizeOutputPathKey(matchedOutputFile) === normalizeOutputPathKey(options.outputFile)
  })

  let hasUsableTailwindSource = sources.some(remembered =>
    hasTailwindGenerationSource(remembered.rawSource)
    && normalizeOutputPathKey(remembered.sourceFile.replace(/[?#].*$/, '')) !== normalizeOutputPathKey(options.file),
  )
  const inferredSfcStyleSource = await resolveSfcStyleSourceFromOutputFile(
    options.outputFile,
    options.snapshot,
    options.outputRoot,
    options.sourceRoot,
    options.cssMatcher,
    options.getSfcSource,
    options.debug,
  )
  if (inferredSfcStyleSource) {
    const inferredSourceFile = normalizeSfcSourceFileForCompare(inferredSfcStyleSource.sourceFile)
    const sourcesBelongToInferredSfc = sources.length > 0
      && sources.every(remembered =>
        normalizeSfcSourceFileForCompare(remembered.sourceFile) === inferredSourceFile,
      )
    if (!hasUsableTailwindSource || sourcesBelongToInferredSfc) {
      sources = [inferredSfcStyleSource]
      hasUsableTailwindSource = true
    }
  }

  if (
    options.temporaryOutput
    && sources.some(remembered =>
      options.configuredSourceFileKeys.has(options.normalizeConfiguredSourceFile(remembered.sourceFile)),
    )
  ) {
    sources = []
    hasUsableTailwindSource = false
  }

  const configuredRootSource = options.resolveConfiguredRootSource()
  const shouldUseConfiguredRootSource = configuredRootSource != null
    && (
      !options.currentRawSourceHasExplicitScanContext
      || hasTailwindGenerationSource(configuredRootSource.rawSource)
    )
  const hasExplicitRememberedRootSource = sources.some(remembered =>
    options.explicitConfiguredSourceFileKeys.has(options.normalizeConfiguredSourceFile(remembered.sourceFile)),
  )
  if (
    shouldUseConfiguredRootSource
    && (!hasUsableTailwindSource || !hasExplicitRememberedRootSource)
    && configuredRootSource
  ) {
    sources = [configuredRootSource]
    hasUsableTailwindSource = true
    options.debug(
      'source style source inferred from configured root tailwind v4 css source: %s -> %s',
      options.outputFile,
      configuredRootSource.sourceFile,
    )
  }

  let outputFile = options.outputFile
  let forceNonMainChunk = false
  let resolvedFromTemporarySource = false
  const usedConfiguredSourceFiles: string[] = []
  if (
    !hasUsableTailwindSource
    && options.temporaryOutput
    && hasTailwindGenerationSource(options.rawSource)
  ) {
    const temporarySource = options.resolveTemporarySource(outputFile, options.rawSource)
    if (temporarySource) {
      outputFile = options.shouldKeepCurrentRootOutput(temporarySource.sourceFile, outputFile)
        ? outputFile
        : options.resolveMatchedOutputFile(temporarySource.sourceFile) ?? temporarySource.outputFile
      forceNonMainChunk = true
      resolvedFromTemporarySource = true
      usedConfiguredSourceFiles.push(normalizeOutputPathKey(temporarySource.sourceFile))
      sources = [{
        outputFile,
        rawSource: temporarySource.rawSource,
        sourceFile: temporarySource.sourceFile,
      }]
      hasUsableTailwindSource = true
      options.debug(
        'source style source inferred from temporary tailwind v4 css source: %s -> %s',
        outputFile,
        temporarySource.sourceFile,
      )
    }
  }

  return {
    forceNonMainChunk,
    hasUsableTailwindSource,
    outputFile,
    resolvedFromTemporarySource,
    sources,
    usedConfiguredSourceFiles,
  }
}
