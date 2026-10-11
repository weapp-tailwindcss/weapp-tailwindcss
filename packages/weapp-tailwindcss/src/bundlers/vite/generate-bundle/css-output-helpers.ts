import type { OutputAsset, OutputChunk } from 'rollup'
import type { ViteFrameworkCssPipelineContext, ViteFrameworkCssPipelineStrategy } from '../shared/framework-strategy'
import type { InternalUserDefinedOptions } from '@/types'
import { normalizeOutputPathKey } from '@/bundlers/shared/module-graph'
import { AssetEmissionPlan } from '@/compiler'
import { isSourceStyleRequest } from '../../../generation/style-requests'
import { canProcessViteSourceStyleAsCss, resolveViteCssOutputFile, resolveViteCssPipelineOutputFileFromSourceFile, SOURCE_STYLE_OUTPUT_EXT_RE } from '../css-output'
import { applyViteAssetEmissionPlan } from './asset-emission-plan'
import { createCssImportShell, createRootMiniProgramOriginStyleOutputFile, isRootMiniProgramStyleOutputFile, shouldKeepRootMiniProgramStyleAsImportShell, shouldMoveRootMiniProgramStyleToImportShellOrigin } from './root-style-output'
import { isTemporaryCssAssetFile } from './temporary-css-assets'

export function resolveCssBundleOutputFile(options: {
  assetOutputFile?: string | undefined
  bundleFiles: string[]
  defaultStyleOutputExtension: string
  file: string
  isWebGeneratorTarget: boolean
  opts: InternalUserDefinedOptions
  pipelineContext: ViteFrameworkCssPipelineContext
  cssPipelineStrategy?: ViteFrameworkCssPipelineStrategy | undefined
  shouldPreserveAppCssExtension: boolean
}) {
  const {
    bundleFiles,
    defaultStyleOutputExtension,
    file,
    isWebGeneratorTarget,
    opts,
    pipelineContext,
    cssPipelineStrategy,
    shouldPreserveAppCssExtension,
  } = options
  let outputFile = resolveViteCssOutputFile(file, opts, isWebGeneratorTarget, shouldPreserveAppCssExtension, defaultStyleOutputExtension, bundleFiles)
  if (
    outputFile === file
    && normalizeOutputPathKey(options.assetOutputFile ?? file) === normalizeOutputPathKey(file)
    && isRootMiniProgramStyleOutputFile(file)
    && shouldMoveRootMiniProgramStyleToImportShellOrigin(
      cssPipelineStrategy?.shouldMoveRootMiniProgramStyleToImportShellOrigin?.({
        ...pipelineContext,
        file,
      }),
    )
  ) {
    outputFile = createRootMiniProgramOriginStyleOutputFile(file)
  }
  return outputFile
}

export function shouldSkipRawSourceStyleAsset(
  outputFile: string,
  file: string,
  rawSource: string,
  assetSourceFile = file,
  cssMatcher?: ((file: string) => boolean) | undefined,
) {
  const source = rawSource.trim()
  if (source.length === 0) {
    return false
  }
  if (canProcessViteSourceStyleAsCss(source, file)) {
    return false
  }
  if (SOURCE_STYLE_OUTPUT_EXT_RE.test(assetSourceFile.replace(/[?#].*$/, ''))) {
    return true
  }
  const isKnownStyleSource = isSourceStyleRequest(assetSourceFile) || cssMatcher?.(assetSourceFile) === true
  return outputFile !== file || !isKnownStyleSource
}

export function resolveOutputFileFromMatchedCssSource(options: {
  bundleFiles: string[]
  defaultStyleOutputExtension: string
  isWebGeneratorTarget: boolean
  opts: Pick<InternalUserDefinedOptions, 'cssMatcher' | 'platform'>
  rootDir: string
  shouldPreserveAppCssExtension: boolean
  sourceFile: string | undefined
  sourceRoot?: string | undefined
}) {
  const {
    bundleFiles,
    defaultStyleOutputExtension,
    isWebGeneratorTarget,
    opts,
    rootDir,
    shouldPreserveAppCssExtension,
    sourceFile,
    sourceRoot,
  } = options
  if (!sourceFile) {
    return undefined
  }
  if (isWebGeneratorTarget) {
    return undefined
  }
  const outputFile = resolveViteCssPipelineOutputFileFromSourceFile(
    sourceFile,
    opts,
    rootDir,
    isWebGeneratorTarget,
    shouldPreserveAppCssExtension,
    sourceRoot,
    defaultStyleOutputExtension,
    bundleFiles,
  )
  return opts.cssMatcher(outputFile)
    ? outputFile
    : undefined
}

export function createMatchedCssSourceOutputResolver(options: {
  assetSourceFile: string
  file: string
  originalFileNames?: string[] | undefined
  ownedSourceFiles?: string[] | undefined
  resolveOutputFileFromMatchedCssSource: (sourceFile: string | undefined) => string | undefined
}) {
  const {
    assetSourceFile,
    file,
    originalFileNames,
    ownedSourceFiles,
    resolveOutputFileFromMatchedCssSource,
  } = options
  return (sourceFile: string | undefined) => {
    if (!sourceFile) {
      return undefined
    }
    const cleanAssetSourceFile = assetSourceFile.replace(/[?#].*$/, '')
    const cleanSourceFile = sourceFile.replace(/[?#].*$/, '')
    const sourceHasQuery = cleanSourceFile !== sourceFile
    const resolvedSourceOutputFile = resolveOutputFileFromMatchedCssSource(sourceFile)
    const ownsDeferredSource = isTemporaryCssAssetFile(file) && ownedSourceFiles?.some(originalFile =>
      normalizeOutputPathKey(originalFile.replace(/[?#].*$/, '')) === normalizeOutputPathKey(cleanSourceFile),
    ) === true
    if (
      normalizeOutputPathKey(cleanAssetSourceFile) === normalizeOutputPathKey(cleanSourceFile)
      || ownsDeferredSource
      || originalFileNames?.some(originalFile =>
        normalizeOutputPathKey(originalFile.replace(/[?#].*$/, '')) === normalizeOutputPathKey(cleanSourceFile),
      )
    ) {
      if (
        !sourceHasQuery
        // 延迟标记证明本轮仍待 bundler 映射；普通来源元数据不能阻止最终资产的归属解析。
        && !ownsDeferredSource
        && normalizeOutputPathKey(cleanAssetSourceFile) === normalizeOutputPathKey(cleanSourceFile)
        && typeof resolvedSourceOutputFile === 'string'
        && normalizeOutputPathKey(resolvedSourceOutputFile) !== normalizeOutputPathKey(file)
      ) {
        return resolvedSourceOutputFile
      }
      return file
    }
    return resolvedSourceOutputFile
  }
}

export type ResolveCssAssetOutputPlanOptions = Parameters<typeof resolveCssBundleOutputFile>[0] & {
  assetSourceFile: string
  configuredEntries: Array<{ file: string }>
  normalizeConfiguredSourceFile: (file: string) => string
  originalFileNames: string[] | undefined
  ownedSourceFiles?: string[] | undefined
  resolveOutputFileFromMatchedCssSource: (sourceFile: string | undefined) => string | undefined
  rootImportShellOutputFile: string
  rootImportShellTarget: string | undefined
  shouldReuseRootImportShell: () => boolean
}

export interface CssAssetOutputPlan {
  outputFile: string
  resolveMatchedOutputFile: (sourceFile: string | undefined) => string | undefined
  resolvedFromConfiguredOriginalCssEntry: boolean
  reusedRootImportShellTarget: boolean
}

export function resolveCssAssetOutputPlan(
  options: ResolveCssAssetOutputPlanOptions,
): CssAssetOutputPlan {
  let outputFile = resolveCssBundleOutputFile({ ...options, assetOutputFile: options.rootImportShellOutputFile })
  const reusedRootImportShellTarget = Boolean(
    options.rootImportShellTarget
    && !options.isWebGeneratorTarget
    && (options.opts.cssMatcher(options.rootImportShellOutputFile) || options.opts.cssMatcher(options.file))
    && options.shouldReuseRootImportShell(),
  )
  if (reusedRootImportShellTarget && options.rootImportShellTarget) {
    outputFile = options.rootImportShellTarget
  }
  const resolveMatchedOutputFile = createMatchedCssSourceOutputResolver({
    assetSourceFile: options.assetSourceFile,
    file: options.file,
    originalFileNames: options.originalFileNames,
    ownedSourceFiles: options.ownedSourceFiles,
    resolveOutputFileFromMatchedCssSource: options.resolveOutputFileFromMatchedCssSource,
  })
  const configuredOriginalSourceEntry = outputFile.replace(/[?#].*$/, '').endsWith('.css')
    ? options.configuredEntries.find(entry =>
        options.originalFileNames?.some(originalFile =>
          options.normalizeConfiguredSourceFile(originalFile)
          === options.normalizeConfiguredSourceFile(entry.file),
        ) === true,
      )
    : undefined
  const configuredOriginalOutputFile = configuredOriginalSourceEntry
    ? resolveMatchedOutputFile(configuredOriginalSourceEntry.file)
    : undefined
  const resolvedFromConfiguredOriginalCssEntry = configuredOriginalOutputFile != null
    && normalizeOutputPathKey(configuredOriginalOutputFile) !== normalizeOutputPathKey(outputFile)
  if (resolvedFromConfiguredOriginalCssEntry && configuredOriginalOutputFile) {
    outputFile = configuredOriginalOutputFile
  }
  return {
    outputFile,
    resolveMatchedOutputFile,
    resolvedFromConfiguredOriginalCssEntry,
    reusedRootImportShellTarget,
  }
}

export function hasViteProcessedCssResultForSource(
  sourceFile: string,
  getViteProcessedCssAssetResults?: (() => Iterable<[string, unknown]> | undefined) | undefined,
) {
  const sourceKey = normalizeOutputPathKey(sourceFile)
  for (const [file] of getViteProcessedCssAssetResults?.() ?? []) {
    if (normalizeOutputPathKey(file) === sourceKey) {
      return true
    }
  }
  return false
}

export function applyCssResultToBundle(options: {
  assetSourceFile: string
  bundle: Record<string, OutputAsset | OutputChunk>
  emitOrReplayCssAsset: (file: string, source: string) => OutputAsset | undefined
  file: string
  originalSource: OutputAsset
  outputFile: string
  source: string
  viteProcessedCssAsset: boolean
  pipelineContext: ViteFrameworkCssPipelineContext
  cssPipelineStrategy?: ViteFrameworkCssPipelineStrategy | undefined
}) {
  const {
    assetSourceFile,
    bundle,
    cssPipelineStrategy,
    emitOrReplayCssAsset,
    file,
    originalSource,
    outputFile,
    pipelineContext,
    source,
    viteProcessedCssAsset,
  } = options
  const plan = new AssetEmissionPlan()
  const writeTargets = new Map<string, OutputAsset>([[file, originalSource]])
  if (outputFile === file) {
    plan.write(file, source)
    applyViteAssetEmissionPlan(plan, {
      bundle,
      emitOrReplayAsset: emitOrReplayCssAsset,
      writeTargets,
    })
    return
  }
  const shouldKeepSourceAsImportShell = isRootMiniProgramStyleOutputFile(file)
    && isRootMiniProgramStyleOutputFile(outputFile)
    && shouldKeepRootMiniProgramStyleAsImportShell(
      cssPipelineStrategy?.shouldKeepRootMiniProgramStyleAsImportShell?.({
        ...pipelineContext,
        css: source,
        file,
      }),
    )
  const importShellSource = shouldKeepSourceAsImportShell
    ? createCssImportShell(file, outputFile)
    : undefined
  if (bundle[file] === originalSource && originalSource.originalFileNames?.includes(assetSourceFile)) {
    plan.write(outputFile, source)
    plan.write(file, importShellSource ?? '')
    applyViteAssetEmissionPlan(plan, {
      bundle,
      emitOrReplayAsset: emitOrReplayCssAsset,
      writeTargets,
    })
    return
  }
  plan.write(outputFile, source)
  if (!viteProcessedCssAsset && SOURCE_STYLE_OUTPUT_EXT_RE.test(file)) {
    plan.remove(file)
  }
  else {
    plan.write(file, importShellSource ?? '')
  }
  applyViteAssetEmissionPlan(plan, {
    bundle,
    emitOrReplayAsset: emitOrReplayCssAsset,
    writeTargets,
  })
}
