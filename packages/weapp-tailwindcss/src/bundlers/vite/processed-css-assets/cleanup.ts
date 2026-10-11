import type { OutputAsset, OutputBundle } from 'rollup'
import type { CollectViteProcessedCssAssetOptions } from './markers-imports'
import type { InternalUserDefinedOptions } from '@/types'
import { isCssImportOnly, restoreProcessedCssImports } from '@weapp-tailwindcss/postcss/transform'
import path from 'pathe'
import { normalizeOutputPathKey } from '../../shared/module-graph'
import { collectImportedStyleFiles, createCssAssetPipelineContext, getAssetFile, readAssetSource } from './markers-imports'
import { isMiniProgramStyleOutputFile, isRootStyleOutputFile } from './style-files'

export function restoreCssImportAtRules(source: string, filtered: string, file?: string) {
  return restoreProcessedCssImports(source, filtered, file !== undefined && isMiniProgramStyleOutputFile(file))
}

export { removeCommentOnlyAtRules } from '@weapp-tailwindcss/postcss/transform'

export function collectImportedBundleCssSources(bundle: OutputBundle, importedStyleFiles: Set<string>) {
  if (importedStyleFiles.size === 0) {
    return []
  }
  const importedFileNames = new Set([...importedStyleFiles].map(file => path.posix.basename(file)))
  const importedSources: string[] = []
  for (const [bundleFile, output] of Object.entries(bundle)) {
    if (output.type !== 'asset') {
      continue
    }
    const file = normalizeOutputPathKey(getAssetFile(bundleFile, output))
    const imported = importedStyleFiles.has(file)
      || (
        !file.includes('/')
        && importedFileNames.has(path.posix.basename(file))
      )
    if (!imported) {
      continue
    }
    importedSources.push(readAssetSource(output))
  }
  return importedSources
}

export function collectBundleAssetFiles(bundle: OutputBundle) {
  const files = new Set<string>()
  for (const [bundleFile, output] of Object.entries(bundle)) {
    if (output.type !== 'asset') {
      continue
    }
    files.add(normalizeOutputPathKey(getAssetFile(bundleFile, output)))
  }
  return files
}

function normalizeComparableStyleFile(file: string) {
  return normalizeOutputPathKey(path.normalize(file.replace(/[?#].*$/, '')))
}

function collectConfiguredTailwindV4CssEntryFiles(opts: InternalUserDefinedOptions) {
  const runtimeCssEntries = (opts.tailwindRuntime as any)?.options?.tailwindcss?.v4?.cssEntries
  return [
    ...(Array.isArray(opts.cssEntries) ? opts.cssEntries : []),
    ...(Array.isArray(opts.tailwindcss?.v4?.cssEntries) ? opts.tailwindcss.v4.cssEntries : []),
    ...(Array.isArray(opts.tailwindcssRuntimeOptions?.tailwindcss?.v4?.cssEntries) ? opts.tailwindcssRuntimeOptions.tailwindcss.v4.cssEntries : []),
    ...(Array.isArray(runtimeCssEntries) ? runtimeCssEntries : []),
  ].filter((file): file is string => typeof file === 'string' && file.length > 0)
}

function isConfiguredTailwindV4CssEntryFile(opts: InternalUserDefinedOptions, file: string | undefined) {
  if (typeof file !== 'string' || file.length === 0) {
    return false
  }
  const fileKey = normalizeComparableStyleFile(file)
  return collectConfiguredTailwindV4CssEntryFiles(opts).some(entry =>
    normalizeComparableStyleFile(entry) === fileKey,
  )
}

export function resolveConfiguredCssEntryRootInjectionTarget(
  bundle: OutputBundle,
  options: Pick<CollectViteProcessedCssAssetOptions, 'cssPipelineStrategy' | 'createCssPipelineContext' | 'opts'>,
  sourceFile: string | undefined,
  outputFile: string,
) {
  const opts = options.opts
  if (
    opts === undefined
    || isMiniProgramStyleOutputFile(outputFile)
    || !isConfiguredTailwindV4CssEntryFile(opts, sourceFile)
  ) {
    return
  }
  const context = createCssAssetPipelineContext(options, outputFile, bundle)
  if (context === undefined) {
    return
  }
  const resolvedByStrategy = options.cssPipelineStrategy?.resolveConfiguredCssEntryRootInjectionTarget?.({
    ...context,
    bundle,
    isConfiguredCssEntryFile: file => isConfiguredTailwindV4CssEntryFile(opts, file),
    isMiniProgramStyleOutputFile,
    isRootStyleOutputFile,
    outputFile,
    sourceFile,
  })
  if (resolvedByStrategy !== undefined) {
    return resolvedByStrategy
  }
  if (options.cssPipelineStrategy?.resolveConfiguredCssEntryRootInjectionTarget == null) {
    return
  }
  const rootCssFiles: string[] = []
  const matchedRootCssFiles: string[] = []
  for (const [bundleFile, output] of Object.entries(bundle)) {
    if (output.type !== 'asset') {
      continue
    }
    const file = getAssetFile(bundleFile, output)
    if (
      !opts.cssMatcher(file)
      || !isRootStyleOutputFile(file)
      || isMiniProgramStyleOutputFile(file)
    ) {
      continue
    }
    rootCssFiles.push(file)
    if (opts.mainCssChunkMatcher(file, opts.appType)) {
      matchedRootCssFiles.push(file)
    }
  }
  if (matchedRootCssFiles.length === 1) {
    return matchedRootCssFiles[0]
  }
  if (matchedRootCssFiles.length > 1) {
    return
  }
  return rootCssFiles.length === 1 ? rootCssFiles[0] : undefined
}

export function findBundleAssetByOutputFile(bundle: OutputBundle, file: string) {
  const fileKey = normalizeOutputPathKey(file)
  return Object.entries(bundle).find(([bundleFile, output]) => {
    return output.type === 'asset'
      && normalizeOutputPathKey(getAssetFile(bundleFile, output)) === fileKey
  })?.[1] as OutputAsset | undefined
}

export function isCssImportOnlyBundleAsset(
  bundle: OutputBundle,
  file: string,
  css: string,
) {
  const importedStyleFiles = collectImportedStyleFiles(css, file)
  if (importedStyleFiles.size === 0) {
    return false
  }
  if (!isCssImportOnly(css)) {
    return false
  }
  return collectImportedBundleCssSources(bundle, importedStyleFiles).length > 0
}

export function isCoveredViteGeneratedSourceAsset(
  file: string,
  existingAssetFiles: Set<string>,
  resolveViteProcessedCssOutputFile: ((file: string) => string | undefined) | undefined,
) {
  const resolvedOutputFile = normalizeOutputPathKey(resolveViteProcessedCssOutputFile?.(file) ?? file)
  const fileKey = normalizeOutputPathKey(file)
  return resolvedOutputFile !== fileKey && existingAssetFiles.has(resolvedOutputFile)
}

export function resolveViteGeneratedCssMarkerOutputFile(
  file: string,
  markerFile: string | undefined,
  existingAssetFiles: Set<string>,
  resolveViteProcessedCssOutputFile: ((file: string) => string | undefined) | undefined,
) {
  const resolvedFromFile = normalizeOutputPathKey(resolveViteProcessedCssOutputFile?.(file) ?? file)
  if (!markerFile) {
    return resolvedFromFile
  }
  const resolvedFromMarker = normalizeOutputPathKey(resolveViteProcessedCssOutputFile?.(markerFile) ?? markerFile)
  if (
    resolvedFromMarker !== resolvedFromFile
    && existingAssetFiles.has(resolvedFromMarker)
  ) {
    return resolvedFromMarker
  }
  return resolvedFromFile
}

export function isSourceRootPrefixedOutputFile(file: string, outputFile: string) {
  const fileKey = normalizeOutputPathKey(file)
  const outputFileKey = normalizeOutputPathKey(outputFile)
  return fileKey !== outputFileKey && fileKey.endsWith(`/${outputFileKey}`)
}
