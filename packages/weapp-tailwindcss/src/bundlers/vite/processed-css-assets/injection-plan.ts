import type { OutputBundle } from 'rollup'
import type { InjectViteProcessedCssAssetOptions } from './markers-imports'
import type { InternalUserDefinedOptions } from '@/types'
import { createCssRuleMatcher, removeCssRulesCoveredBySources } from '@weapp-tailwindcss/postcss/transform'
import { normalizeOutputPathKey } from '../../shared/module-graph'
import { shouldPreserveFrameworkRootMiniProgramImportShell } from '../generate-bundle/root-style-output'
import { isSubpackageOutputFile } from '../generate-bundle/subpackages'
import { isSourceRootPrefixedOutputFile, restoreCssImportAtRules } from './cleanup'
import { prepareImportedCssCoverage } from './coverage'
import { clearAssetSource, collectImportedStyleFiles, createCssAssetPipelineContext, getAssetFile, hasNonCommentCss, isCssOutputFile, readAssetSource } from './markers-imports'
import { isMiniProgramStyleOutputFile, isRootStyleOutputFile } from './style-files'

export { isMiniProgramStyleOutputFile, isRootStyleOutputFile } from './style-files'

export function shouldInjectViteProcessedCssResult(
  opts: InternalUserDefinedOptions,
  targetFile: string,
  sourceFile: string,
  options: {
    injectIntoMain?: boolean | undefined
    outputFile?: string | undefined
  },
) {
  if (options.injectIntoMain === true) {
    return isRootStyleOutputFile(targetFile)
      || (
        typeof options.outputFile === 'string'
        && normalizeOutputPathKey(options.outputFile) === normalizeOutputPathKey(targetFile)
      )
  }
  if (options.injectIntoMain === false) {
    return false
  }
  const targetFileKey = normalizeOutputPathKey(targetFile)
  if (
    typeof options.outputFile === 'string'
    && normalizeOutputPathKey(options.outputFile) === targetFileKey
  ) {
    return true
  }
  const sourceFileKey = normalizeOutputPathKey(sourceFile)
  return sourceFileKey !== targetFileKey
    && (
      opts.mainCssChunkMatcher(sourceFile, opts.appType)
      || (
        typeof options.outputFile === 'string'
        && normalizeOutputPathKey(options.outputFile) !== targetFileKey
        && opts.mainCssChunkMatcher(options.outputFile, opts.appType)
      )
    )
}

export function shouldReplayViteProcessedCssIntoMainCss(
  opts: InternalUserDefinedOptions,
  file: string,
  sourceFile: string | undefined,
  outputFile: string,
  subpackageRoots: Set<string> | undefined,
) {
  if (subpackageRoots) {
    const sourceIsSubpackage = isSubpackageOutputFile(sourceFile ?? file, subpackageRoots)
    const outputIsSubpackage = isSubpackageOutputFile(outputFile, subpackageRoots)
    if (sourceIsSubpackage || outputIsSubpackage) {
      return false
    }
  }
  return (
    isRootStyleOutputFile(file)
    && opts.mainCssChunkMatcher(file, opts.appType)
  )
  || (
    isSourceRootPrefixedOutputFile(file, outputFile)
    && isRootStyleOutputFile(outputFile)
    && opts.mainCssChunkMatcher(outputFile, opts.appType)
  )
}

export function shouldPreserveMiniProgramImportShell(
  options: Pick<InjectViteProcessedCssAssetOptions, 'cssPipelineStrategy' | 'createCssPipelineContext' | 'opts'>,
  bundle: OutputBundle,
  file: string,
  css: string,
) {
  const context = createCssAssetPipelineContext(options, file, bundle)
  return context !== undefined
    && shouldPreserveFrameworkRootMiniProgramImportShell({
      css,
      file,
      isWebGeneratorTarget: context.currentGeneratorBranch?.isWeb === true,
      matchesCss: options.opts.cssMatcher(file),
      shouldKeep: () => options.cssPipelineStrategy?.shouldKeepRootMiniProgramStyleAsImportShell?.({
        ...context,
        css,
        file,
      }),
    })
}

export function resolvePreservedImportShellInjectionTarget(
  options: Pick<InjectViteProcessedCssAssetOptions, 'cssPipelineStrategy' | 'createCssPipelineContext'>,
  bundle: OutputBundle,
  file: string,
  css: string,
) {
  const context = createCssAssetPipelineContext(options, file, bundle)
  if (
    context === undefined
    || options.cssPipelineStrategy?.shouldNormalizeRootMiniProgramImportShell?.(context) !== true
  ) {
    return
  }
  const importedStyleFiles = collectImportedStyleFiles(css, file)
  if (importedStyleFiles.size !== 1) {
    return
  }
  const [importedFile] = importedStyleFiles
  if (!importedFile) {
    return
  }
  if (!isRootStyleOutputFile(importedFile)) {
    return
  }
  for (const [bundleFile, output] of Object.entries(bundle)) {
    if (output.type !== 'asset') {
      continue
    }
    const outputFile = getAssetFile(bundleFile, output)
    if (normalizeOutputPathKey(outputFile) === normalizeOutputPathKey(importedFile)) {
      return outputFile
    }
  }
}

export function shouldUseCssAssetAsMainInjectionTarget(
  opts: InternalUserDefinedOptions,
  file: string,
  records: Array<{ injectIntoMain?: boolean | undefined, outputFile?: string | undefined }>,
  options: Pick<InjectViteProcessedCssAssetOptions, 'cssPipelineStrategy' | 'createCssPipelineContext'>,
  bundle: OutputBundle,
) {
  const context = createCssAssetPipelineContext(options, file, bundle)
  const fileKey = normalizeOutputPathKey(file)
  if (
    !isRootStyleOutputFile(file)
    && records.some(record =>
      typeof record.outputFile === 'string'
      && normalizeOutputPathKey(record.outputFile) === fileKey,
    )
  ) {
    return true
  }
  if (!isRootStyleOutputFile(file)) {
    return records.some(record =>
      record.injectIntoMain === true
      && typeof record.outputFile === 'string'
      && normalizeOutputPathKey(record.outputFile) === fileKey,
    )
  }
  const rootWebOutputTargets = records
    .map(record => typeof record.outputFile === 'string' ? normalizeOutputPathKey(record.outputFile) : undefined)
    .filter((outputFile): outputFile is string =>
      typeof outputFile === 'string'
      && isRootStyleOutputFile(outputFile)
      && !isMiniProgramStyleOutputFile(outputFile),
    )
  const matchedRootWebOutputTargets = rootWebOutputTargets.filter(outputFile =>
    opts.mainCssChunkMatcher(outputFile, opts.appType),
  )
  if (
    context !== undefined
    && options.cssPipelineStrategy?.shouldPreferMatchedRootWebOutputTarget?.({
      ...context,
      file,
      matchedRootWebOutputTargets,
    }) === true
    && !isMiniProgramStyleOutputFile(file)
    && matchedRootWebOutputTargets.length > 0
  ) {
    return matchedRootWebOutputTargets.includes(fileKey)
  }
  const explicitRootTargets = records
    .filter(record => record.injectIntoMain === true)
    .map(record => typeof record.outputFile === 'string' ? normalizeOutputPathKey(record.outputFile) : undefined)
    .filter((outputFile): outputFile is string =>
      typeof outputFile === 'string'
      && isRootStyleOutputFile(outputFile)
      && !isMiniProgramStyleOutputFile(outputFile),
    )
  const explicitWebCssTargets = records
    .filter(record => record.injectIntoMain === true)
    .map(record => typeof record.outputFile === 'string' ? normalizeOutputPathKey(record.outputFile) : undefined)
    .filter((outputFile): outputFile is string =>
      typeof outputFile === 'string'
      && isCssOutputFile(outputFile)
      && !isMiniProgramStyleOutputFile(outputFile),
    )
  const explicitStyleOutputTargets = records
    .filter(record => record.injectIntoMain === true)
    .map(record => typeof record.outputFile === 'string' ? normalizeOutputPathKey(record.outputFile) : undefined)
    .filter((outputFile): outputFile is string =>
      typeof outputFile === 'string'
      && isRootStyleOutputFile(outputFile),
    )
  if (
    context !== undefined
    && options.cssPipelineStrategy?.shouldPreferExplicitWebCssTargets?.({
      ...context,
      explicitRootTargets,
      explicitWebCssTargets,
      file,
    }) === true
    && !isMiniProgramStyleOutputFile(file)
    && explicitWebCssTargets.length > 0
  ) {
    return explicitRootTargets.includes(fileKey)
  }
  if (explicitRootTargets.length > 0) {
    return explicitRootTargets.includes(fileKey)
  }
  const explicitTargetMatched = records.some((record) => {
    if (record.injectIntoMain !== true) {
      return false
    }
    if (explicitStyleOutputTargets.length > 0) {
      return explicitStyleOutputTargets.includes(fileKey)
        || (
          isRootStyleOutputFile(file)
          && isViteProcessedRootStyleImportingTargets(bundle, file, explicitStyleOutputTargets)
        )
        || (
          isRootStyleOutputFile(file)
          && opts.mainCssChunkMatcher(file, opts.appType)
          && explicitStyleOutputTargets.some(outputFile => opts.mainCssChunkMatcher(outputFile, opts.appType))
        )
    }
    return isRootStyleOutputFile(file)
      || (
        typeof record.outputFile === 'string'
        && normalizeOutputPathKey(record.outputFile) === fileKey
      )
  })
  if (explicitTargetMatched) {
    return true
  }
  if (records.some(record => record.injectIntoMain === true)) {
    const matchedExplicitMiniProgramTargets = explicitStyleOutputTargets.filter(outputFile =>
      isMiniProgramStyleOutputFile(outputFile)
      && opts.mainCssChunkMatcher(outputFile, opts.appType),
    )
    if (matchedExplicitMiniProgramTargets.length > 0) {
      return matchedExplicitMiniProgramTargets.includes(fileKey)
    }
    return isRootStyleOutputFile(file) && isMiniProgramStyleOutputFile(file)
  }
  if (opts.mainCssChunkMatcher(file, opts.appType)) {
    return true
  }
  return isRootStyleOutputFile(file)
    && records.some(record => record.injectIntoMain === true)
}

function isViteProcessedRootStyleImportingTargets(
  bundle: OutputBundle,
  file: string,
  targetFiles: string[],
) {
  const targetFileSet = new Set(targetFiles.map(normalizeOutputPathKey))
  for (const [bundleFile, output] of Object.entries(bundle)) {
    if (output.type !== 'asset' || normalizeOutputPathKey(getAssetFile(bundleFile, output)) !== normalizeOutputPathKey(file)) {
      continue
    }
    const importedStyleFiles = collectImportedStyleFiles(readAssetSource(output), file)
    return [...importedStyleFiles].some(importedFile => targetFileSet.has(normalizeOutputPathKey(importedFile)))
  }
  return false
}

export function isViteProcessedCssResultImported(record: { file: string, outputFile?: string | undefined }, importedStyleFiles: Set<string>) {
  return importedStyleFiles.has(normalizeOutputPathKey(record.file))
    || (
      typeof record.outputFile === 'string'
      && importedStyleFiles.has(normalizeOutputPathKey(record.outputFile))
    )
}

export function isViteProcessedCssResultCoveredByImportedBundleAsset(
  record: { file: string, outputFile?: string | undefined },
  importedStyleFiles: Set<string>,
  assetFiles: Set<string>,
) {
  for (const candidate of [record.file, record.outputFile]) {
    if (typeof candidate !== 'string' || candidate.length === 0) {
      continue
    }
    const candidateKey = normalizeOutputPathKey(candidate)
    if (!importedStyleFiles.has(candidateKey)) {
      continue
    }
    if (assetFiles.has(candidateKey)) {
      return true
    }
  }
  return false
}

export function removeCoveredInjectedSourceAssets(
  bundle: OutputBundle,
  targetFile: string,
  targetCss: string,
  records: Array<{ file: string, css: string, injectIntoMain?: boolean | undefined, outputFile?: string | undefined }>,
  options: Pick<InjectViteProcessedCssAssetOptions, 'shouldRemoveInjectedSourceAsset' | 'debug'>,
) {
  const targetFileKey = normalizeOutputPathKey(targetFile)
  const targetIsRootWebStyle = isRootStyleOutputFile(targetFileKey) && !isMiniProgramStyleOutputFile(targetFileKey)
  const removableRecords = records.filter(record => options.shouldRemoveInjectedSourceAsset?.(targetFile, record) === true)
  if (removableRecords.length === 0) {
    return 0
  }
  const recordFileKeys = new Set(removableRecords.map(record => normalizeOutputPathKey(record.file)))
  const recordCss = new Set(removableRecords.map(record => record.css.trim()))
  const targetMatcher = createCssRuleMatcher(targetCss)
  let removed = 0
  for (const [candidateFile, candidateOutput] of Object.entries(bundle)) {
    if (candidateOutput.type !== 'asset') {
      continue
    }
    const candidateKey = normalizeOutputPathKey(getAssetFile(candidateFile, candidateOutput))
    if (candidateKey === targetFileKey || !isCssOutputFile(candidateKey)) {
      continue
    }
    const candidateIsRootWebStyle = isRootStyleOutputFile(candidateKey) && !isMiniProgramStyleOutputFile(candidateKey)
    if (candidateIsRootWebStyle && !targetIsRootWebStyle) {
      continue
    }
    const candidateSource = readAssetSource(candidateOutput).trim()
    const isProcessedSource = recordFileKeys.has(candidateKey)
      || (
        candidateSource.length > 0
        && (
          recordCss.has(candidateSource)
          || targetMatcher.contains(candidateSource)
          || (
            targetIsRootWebStyle
            && candidateIsRootWebStyle
            && !hasNonCommentCss(targetMatcher.filter(candidateSource).trim())
          )
        )
      )
    if (!isProcessedSource) {
      continue
    }
    if (candidateIsRootWebStyle) {
      delete bundle[candidateFile]
    }
    else {
      clearAssetSource(candidateOutput)
    }
    options.debug?.('remove injected vite-processed source css asset: %s -> %s', candidateKey, targetFile)
    removed++
  }
  return removed
}

export function removeCssCoveredByImportedViteResults(
  css: string,
  importedCssSources: string[],
  prepared = prepareImportedCssCoverage(importedCssSources),
) {
  if (!prepared) {
    return css
  }
  return restoreCssImportAtRules(
    css,
    removeCssRulesCoveredBySources(css, prepared.sources, { exactOnly: true }, prepared.coverage),
  )
}

export { removeCssRulesCoveredBySources } from '@weapp-tailwindcss/postcss/transform'
