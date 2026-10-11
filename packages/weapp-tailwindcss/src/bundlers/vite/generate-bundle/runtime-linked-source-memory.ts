import type { BundleSnapshot } from '../bundle-state'
import type { RememberedCssSource } from './types'
import type { InternalUserDefinedOptions } from '@/types'
import path from 'node:path'
import { resolveViteCssPipelineOutputFile } from '../css-output'
import { hasTailwindGenerationSource, resolveSourceStyleSourceFromOutputFile } from './sfc-style-source'

export interface RememberRuntimeLinkedCssSourcesOptions {
  bundleFiles: string[]
  defaultStyleOutputExtension: string
  debug: (message: string, ...args: unknown[]) => void
  getConfiguredTailwindV4CssSourceEntries: () => Array<{ file: string, source: string }>
  getSourceCandidateSource?: ((file: string) => string | undefined) | undefined
  getSourceCandidateSources?: (() => Iterable<[string, string]>) | undefined
  isWebGeneratorTarget: boolean
  jsImportedCssFiles: Set<string>
  opts: Pick<InternalUserDefinedOptions, 'cssMatcher' | 'platform'>
  outDir: string
  rememberCssSource?: ((source: RememberedCssSource) => void) | undefined
  rootDir: string
  runtimeLinkedCssFiles: Set<string>
  shouldPreserveAppCssExtension: boolean
  snapshot: BundleSnapshot
  sourceRoot?: string | undefined
}

export function rememberRuntimeLinkedCssSources(options: RememberRuntimeLinkedCssSourcesOptions) {
  const {
    bundleFiles,
    defaultStyleOutputExtension,
    debug,
    getConfiguredTailwindV4CssSourceEntries,
    getSourceCandidateSource,
    getSourceCandidateSources,
    isWebGeneratorTarget,
    jsImportedCssFiles,
    opts,
    outDir,
    rememberCssSource,
    rootDir,
    runtimeLinkedCssFiles,
    shouldPreserveAppCssExtension,
    snapshot,
    sourceRoot,
  } = options
  for (const file of runtimeLinkedCssFiles) {
    if (snapshot.sourceHashByFile.has(file)) {
      snapshot.processFiles.css.add(file)
      continue
    }
    const outputFile = resolveViteCssPipelineOutputFile(file, opts, rootDir, isWebGeneratorTarget, shouldPreserveAppCssExtension, sourceRoot, defaultStyleOutputExtension, bundleFiles)
    const inferredSourceStyle = resolveSourceStyleSourceFromOutputFile(
      outputFile,
      snapshot,
      outDir,
      sourceRoot,
      getSourceCandidateSource,
      jsImportedCssFiles.has(file) ? getSourceCandidateSources : undefined,
      getConfiguredTailwindV4CssSourceEntries().map(entry => [entry.file, entry.source] as [string, string]),
      debug,
    )
    const rawSource = inferredSourceStyle?.rawSource
      ?? getSourceCandidateSource?.(path.resolve(outDir, file))
      ?? getSourceCandidateSource?.(file)
    if (rawSource === undefined || !hasTailwindGenerationSource(rawSource)) {
      continue
    }
    rememberCssSource?.({
      outputFile,
      rawSource,
      sourceFile: inferredSourceStyle?.sourceFile ?? path.resolve(outDir, file),
    })
  }
}
