import type { OutputAsset, OutputBundle } from 'rollup'
import type { ViteFrameworkCssPipelineContext } from '../shared/framework-strategy'
import type { CssFinalizerContext } from './options'
import { hasTailwindGeneratedCss, hasTailwindGeneratedCssMarkers } from '../../../generation/index'
import { stripBundlerGeneratedCssMarkers } from '../../shared/generated-css-marker'
import { normalizeOutputPathKey } from '../../shared/module-graph'
import { resolveViteCssPipelineOutputFile } from '../css-output'
import { collectMatchingGeneratedCssMarkerFiles, resolveViteProcessedCssAssetSource } from '../processed-css-assets/markers-imports'
import { shouldUseGenericWebFinalizerFastPath } from '../shared/generic-web-production-fast-path'
import { finalizeWebCss } from './options'

interface GenericWebFinalizerFastPathContext {
  bundle: OutputBundle
  context: CssFinalizerContext
  createCssPipelineContext: (file: string) => ViteFrameworkCssPipelineContext
  isHarmonyAppStyleTarget: boolean
  isNativeAppStyleTarget: boolean
  isWebGeneratorTarget: boolean
  recordTiming: (phase: string, startedAt: number) => void
  rootDir: string
  sourceRoot: string | undefined
}

interface GenericWebCssAsset {
  asset: OutputAsset
  file: string
  original: string
}

function readAssetSource(asset: OutputAsset) {
  return typeof asset.source === 'string'
    ? asset.source
    : asset.source.toString()
}

function collectCssAssets(
  bundle: OutputBundle,
  context: CssFinalizerContext,
) {
  const assets = new Map<string, GenericWebCssAsset>()
  for (const [bundleFile, output] of Object.entries(bundle)) {
    if (output.type !== 'asset') {
      continue
    }
    const file = output.fileName || bundleFile
    if (!context.opts.cssMatcher(file) || context.opts.htmlMatcher(file)) {
      continue
    }
    assets.set(normalizeOutputPathKey(file), {
      asset: output,
      file,
      original: readAssetSource(output),
    })
  }
  return assets
}

function resolveProcessedCssOutputFile(
  file: string,
  options: GenericWebFinalizerFastPathContext,
  bundleFiles: string[],
) {
  return resolveViteCssPipelineOutputFile(
    file,
    options.context.opts,
    options.rootDir,
    true,
    false,
    options.sourceRoot,
    '.css',
    bundleFiles,
  )
}

function resolveProcessedCssAssets(
  cssAssets: Map<string, GenericWebCssAsset>,
  records: Array<[string, string | { css: string, outputFile?: string | undefined }]>,
  options: GenericWebFinalizerFastPathContext,
  bundleFiles: string[],
) {
  const assetBySourceFile = new Map<string, GenericWebCssAsset>()
  for (const output of cssAssets.values()) {
    const identity = options.context.resolveCssAssetIdentity?.(output.asset, output.file)
    if (identity?.kind === 'bundler-generated' && identity.sourceFile) {
      assetBySourceFile.set(normalizeOutputPathKey(identity.sourceFile), output)
    }
    for (const sourceFile of collectMatchingGeneratedCssMarkerFiles(
      output.file,
      output.original,
      file => resolveProcessedCssOutputFile(file, options, bundleFiles),
    )) {
      assetBySourceFile.set(normalizeOutputPathKey(sourceFile), output)
    }
  }
  const processedAssets = new Map<GenericWebCssAsset, { css: string, useAssetSource: boolean }>()
  const htmlOwnedAssets = [...cssAssets.values()].filter(output => [
    output.asset.originalFileName,
    ...(output.asset.originalFileNames ?? []),
  ].some(file => typeof file === 'string' && /\.html(?:$|[?#])/i.test(file)))
  for (const [file, record] of records) {
    const recordCss = typeof record === 'string' ? record : record.css
    const outputFile = typeof record === 'string'
      ? resolveProcessedCssOutputFile(file, options, bundleFiles)
      : record.outputFile ?? resolveProcessedCssOutputFile(file, options, bundleFiles)
    let output = assetBySourceFile.get(normalizeOutputPathKey(file))
      ?? (outputFile ? cssAssets.get(normalizeOutputPathKey(outputFile)) : undefined)
    let useAssetSource = output !== undefined
    if (!output) {
      const matchingAssets = [...cssAssets.values()].filter(candidate =>
        options.context.isCssAssetProcessed(candidate.asset, candidate.file)
        && resolveViteProcessedCssAssetSource(
          candidate.file,
          candidate.original,
          sourceFile => resolveProcessedCssOutputFile(sourceFile, options, bundleFiles),
        ) === recordCss,
      )
      if (matchingAssets.length === 1) {
        output = matchingAssets[0]
        useAssetSource = true
      }
    }
    if (!output && records.length === 1 && htmlOwnedAssets.length === 1 && htmlOwnedAssets[0]) {
      output = htmlOwnedAssets[0]
      useAssetSource = hasTailwindGeneratedCss(output.original)
        || hasTailwindGeneratedCssMarkers(output.original)
    }
    if (!output) {
      return
    }
    const existing = processedAssets.get(output)
    if (existing !== undefined && existing.css !== recordCss) {
      return
    }
    processedAssets.set(output, { css: recordCss, useAssetSource })
  }
  return processedAssets
}

/**
 * Generic Web 的 transform 结果能唯一映射到最终 CSS asset 时，只做一次 marker 清理和 Web 兼容收尾。
 */
export function tryFinalizeGenericWebCss(
  options: GenericWebFinalizerFastPathContext,
) {
  const { bundle, context } = options
  const resolvedConfig = context.getResolvedConfig()
  const collectStartedAt = performance.now()
  const processedCssResults = [...(context.getViteProcessedCssAssetResults?.() ?? [])]
  if (!shouldUseGenericWebFinalizerFastPath({
    command: resolvedConfig?.command,
    frameworkName: context.frameworkName ?? '',
    hasFrameworkRootImportShells: (context.frameworkRootImportShellTargetByFile?.size ?? 0) > 0,
    hasProcessedCss: processedCssResults.length > 0,
    isHarmonyAppStyleTarget: options.isHarmonyAppStyleTarget,
    isNativeAppStyleTarget: options.isNativeAppStyleTarget,
    isWebGeneratorTarget: options.isWebGeneratorTarget,
    watch: resolvedConfig?.build?.watch,
  })) {
    return false
  }

  const enumerateStartedAt = performance.now()
  const cssAssets = collectCssAssets(bundle, context)
  const bundleFiles = [...cssAssets.values()].map(item => item.file)
  options.recordTiming('assets.enumerate', enumerateStartedAt)
  const processedAssets = resolveProcessedCssAssets(cssAssets, processedCssResults, options, bundleFiles)
  options.recordTiming('processedCss.collect', collectStartedAt)
  if (!processedAssets) {
    return false
  }

  const writeStartedAt = performance.now()
  for (const [{ asset, file, original }, processed] of processedAssets) {
    const finalizeStartedAt = performance.now()
    const finalCssSource = processed.useAssetSource ? original : processed.css
    const generated = finalizeWebCss(
      stripBundlerGeneratedCssMarkers(finalCssSource),
      { ...options.createCssPipelineContext(file), file },
      context.cssPipelineStrategy,
    )
    options.recordTiming('finalizeWebCss', finalizeStartedAt)
    asset.source = generated
    context.markCssAssetProcessed(asset, file)
    context.recordCssAssetResult?.(file, generated)
    if (generated !== original) {
      context.opts.onUpdate(file, original, generated)
    }
  }
  options.recordTiming('processedCss.inject', performance.now())
  options.recordTiming('assets.markerCleanupWrite', writeStartedAt)
  return true
}
