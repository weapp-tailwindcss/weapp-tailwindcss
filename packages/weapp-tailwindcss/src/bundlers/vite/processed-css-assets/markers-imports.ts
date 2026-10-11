import type { OutputAsset, OutputBundle } from 'rollup'
import type { ViteFrameworkCssPipelineContext, ViteFrameworkCssPipelineStrategy } from '../shared/framework-strategy'
import type { InternalUserDefinedOptions } from '@/types'
import { collectImportedCssFiles, isStyleImportRequest, normalizeInjectableCssWithImports } from '@weapp-tailwindcss/postcss/transform'
import path from 'pathe'
import { parseBundlerGeneratedCssMarkerBlocks, stripBundlerGeneratedCssMarkers } from '../../shared/generated-css-marker'
import { normalizeOutputPathKey } from '../../shared/module-graph'
import { isCssOutputFile, isMiniProgramStyleOutputFile, isRootStyleOutputFile } from './style-files'

export { isCssOutputFile } from './style-files'
export { hasNonCommentCss, isStyleImportRequest, removeTailwindEntryDirectivesFromCss } from '@weapp-tailwindcss/postcss/transform'

export interface CssAssetMarkerMatcher {
  (asset: OutputAsset, file?: string): boolean
}

interface CssAssetProcessedMarker {
  (asset: OutputAsset, file?: string): void
}

interface CssAssetResultRecordOptions {
  injectIntoMain?: boolean | undefined
  outputFile?: string | undefined
}

export interface CssAssetResultRecorder {
  (file: string, css: string, options?: CssAssetResultRecordOptions): void
}

interface CssAssetResultsGetter {
  (): Iterable<[string, string | { css: string, injectIntoMain?: boolean | undefined, outputFile?: string | undefined }]>
}

export interface CollectViteProcessedCssAssetOptions {
  opts?: InternalUserDefinedOptions | undefined
  cssPipelineStrategy?: ViteFrameworkCssPipelineStrategy | undefined
  createCssPipelineContext?: ((file: string) => ViteFrameworkCssPipelineContext) | undefined
  isViteProcessedCssAsset?: CssAssetMarkerMatcher | undefined
  markCssAssetProcessed?: CssAssetProcessedMarker | undefined
  recordCssAssetResult?: CssAssetResultRecorder | undefined
  recordViteProcessedCssAssetResult?: CssAssetResultRecorder | undefined
  resolveViteProcessedCssOutputFile?: ((file: string) => string | undefined) | undefined
  onAssetWrite?: ((file: string) => void) | undefined
  subpackageRoots?: Set<string> | undefined
  transformCss?: ((css: string, file: string) => string) | undefined
  debug?: ((format: string, ...args: unknown[]) => void) | undefined
}

export interface InjectViteProcessedCssAssetOptions {
  opts: InternalUserDefinedOptions
  cssPipelineStrategy?: ViteFrameworkCssPipelineStrategy | undefined
  createCssPipelineContext?: ((file: string) => ViteFrameworkCssPipelineContext) | undefined
  getViteProcessedCssAssetResults?: CssAssetResultsGetter | undefined
  markCssAssetProcessed?: CssAssetProcessedMarker | undefined
  recordCssAssetResult?: CssAssetResultRecorder | undefined
  shouldRemoveInjectedSourceAsset?: ((file: string, record: { file: string, css: string, injectIntoMain?: boolean | undefined, outputFile?: string | undefined }) => boolean) | undefined
  transformCss?: ((css: string, file: string) => string) | undefined
  debug?: ((format: string, ...args: unknown[]) => void) | undefined
  onUpdate?: ((file: string, original: string, generated: string) => void) | undefined
  recordTimingDetail?: ((name: string, startedAt: number) => void) | undefined
}

export function createCssAssetPipelineContext(
  options: Pick<CollectViteProcessedCssAssetOptions & InjectViteProcessedCssAssetOptions, 'createCssPipelineContext'>,
  file: string,
  bundle: OutputBundle,
) {
  const context = options.createCssPipelineContext?.(file)
  return context ? { ...context, bundle } : undefined
}

export function getAssetFile(bundleFile: string, asset: OutputAsset) {
  return asset.fileName || bundleFile
}

export function readAssetSource(asset: OutputAsset) {
  return typeof asset.source === 'string'
    ? asset.source
    : asset.source.toString()
}

export function clearAssetSource(asset: OutputAsset) {
  asset.source = ''
}

export function appendCss(baseCss: string, css: string) {
  if (baseCss.length === 0) {
    return css
  }
  if (css.length === 0) {
    return baseCss
  }
  return `${baseCss}\n${css}`
}

function normalizeCssRecordIdentity(css: string) {
  return css.trim()
}

export function dedupeViteCssResults<T extends { css: string, outputFile?: string | undefined }>(records: T[]) {
  const seen = new Set<string>()
  return records.filter((record) => {
    const key = `${normalizeOutputPathKey(record.outputFile ?? '')}\0${normalizeCssRecordIdentity(record.css)}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

export function normalizeInjectableCssForTarget(css: string, file: string) {
  return normalizeInjectableCssForTargetWithImports(css, file).css
}

export function normalizeInjectableCssForTargetWithImports(css: string, file: string) {
  return normalizeInjectableCssWithImports(css, isMiniProgramStyleOutputFile(file), request => resolveImportedStyleFile(file, request))
}

function stripStyleExtension(file: string) {
  return file.replace(/[?#].*$/, '').replace(/\.(?:css|wxss|acss|ttss|qss|jxss|tyss|scss|sass|less|styl|stylus|pcss|postcss)$/i, '')
}

function resolveImportedStyleFile(targetFile: string, request: string | undefined) {
  if (!isStyleImportRequest(request)) {
    return
  }
  const cleanRequest = request!.replace(/[?#].*$/, '')
  if (cleanRequest.startsWith('/')) {
    return normalizeOutputPathKey(cleanRequest.slice(1))
  }
  const targetDir = path.posix.dirname(normalizeOutputPathKey(targetFile))
  return normalizeOutputPathKey(path.posix.join(targetDir === '.' ? '' : targetDir, cleanRequest))
}

export function collectImportedStyleFiles(css: string, targetFile: string) {
  return collectImportedCssFiles(css, request => resolveImportedStyleFile(targetFile, request))
}

export function normalizeMarkerOutputFile(
  markerFile: string,
  resolveViteProcessedCssOutputFile: ((file: string) => string | undefined) | undefined,
) {
  return resolveViteProcessedCssOutputFile?.(markerFile) ?? markerFile
}

export function isMatchingGeneratedCssMarkerFile(
  targetFile: string,
  markerFile: string | undefined,
  resolveViteProcessedCssOutputFile: ((file: string) => string | undefined) | undefined,
) {
  if (!markerFile) {
    return false
  }
  const targetKey = normalizeOutputPathKey(stripStyleExtension(targetFile))
  const markerKey = normalizeOutputPathKey(stripStyleExtension(normalizeMarkerOutputFile(
    markerFile,
    resolveViteProcessedCssOutputFile,
  )))
  return targetKey === markerKey
}

export function resolveViteProcessedCssAssetSource(
  file: string,
  rawSource: string,
  resolveViteProcessedCssOutputFile: ((file: string) => string | undefined) | undefined,
) {
  const blocks = parseBundlerGeneratedCssMarkerBlocks(rawSource)
    .filter(block => block.bundler === 'vite')
  if (blocks.length <= 1) {
    return stripBundlerGeneratedCssMarkers(rawSource)
  }
  const matchedCss = blocks
    .filter(block => isMatchingGeneratedCssMarkerFile(file, block.file, resolveViteProcessedCssOutputFile))
    .map(block => block.css)
  return matchedCss.length > 0
    ? matchedCss.join('\n')
    : stripBundlerGeneratedCssMarkers(rawSource)
}

export function collectMatchingGeneratedCssMarkerFiles(
  file: string,
  rawSource: string,
  resolveViteProcessedCssOutputFile: ((file: string) => string | undefined) | undefined,
) {
  return parseBundlerGeneratedCssMarkerBlocks(rawSource)
    .filter(block => block.bundler === 'vite')
    .filter(block => isMatchingGeneratedCssMarkerFile(file, block.file, resolveViteProcessedCssOutputFile))
    .map(block => block.file)
    .filter((markerFile): markerFile is string => typeof markerFile === 'string' && markerFile.length > 0)
}

export function collectRootStyleBundleCssSources(bundle: OutputBundle, excludedFile: string) {
  const sources: string[] = []
  const excludedFileKey = normalizeOutputPathKey(excludedFile)
  for (const [bundleFile, output] of Object.entries(bundle)) {
    if (output.type !== 'asset') {
      continue
    }
    const file = normalizeOutputPathKey(getAssetFile(bundleFile, output))
    if (file === excludedFileKey || !isRootStyleOutputFile(file)) {
      continue
    }
    const source = stripBundlerGeneratedCssMarkers(readAssetSource(output)).trim()
    if (source.length > 0) {
      sources.push(source)
    }
  }
  return sources
}

function isHtmlOutputFile(file: string) {
  return /\.html(?:$|[?#])/i.test(file)
}

function stripQueryAndHash(file: string) {
  return file.replace(/[?#].*$/, '')
}

function resolveHtmlLinkedStyleFile(htmlFile: string, request: string) {
  if (!isStyleImportRequest(request)) {
    return
  }
  const cleanRequest = stripQueryAndHash(request)
  if (cleanRequest.startsWith('/')) {
    return normalizeOutputPathKey(cleanRequest.slice(1))
  }
  const htmlDir = path.posix.dirname(normalizeOutputPathKey(stripQueryAndHash(htmlFile)))
  return normalizeOutputPathKey(path.posix.join(htmlDir === '.' ? '' : htmlDir, cleanRequest))
}

function collectHtmlLinkedStyleFiles(bundle: OutputBundle) {
  const linkedFiles = new Set<string>()
  const linkedBasenames = new Set<string>()
  const linkHrefRE = /<link\s[^>]*href\s*=\s*(["'])([^"']+)\1[^>]*>/gi
  for (const [bundleFile, output] of Object.entries(bundle)) {
    if (output.type !== 'asset') {
      continue
    }
    const htmlFile = getAssetFile(bundleFile, output)
    if (!isHtmlOutputFile(htmlFile)) {
      continue
    }
    const html = readAssetSource(output)
    for (const match of html.matchAll(linkHrefRE)) {
      const href = match[2]
      if (!href) {
        continue
      }
      const linkedFile = resolveHtmlLinkedStyleFile(htmlFile, href)
      if (!linkedFile || !isRootStyleOutputFile(linkedFile)) {
        continue
      }
      linkedFiles.add(linkedFile)
      linkedBasenames.add(path.posix.basename(linkedFile))
    }
  }
  return { linkedBasenames, linkedFiles }
}

function isLinkedStyleFile(file: string, linked: ReturnType<typeof collectHtmlLinkedStyleFiles>) {
  const fileKey = normalizeOutputPathKey(stripQueryAndHash(file))
  return linked.linkedFiles.has(fileKey)
    || (
      isRootStyleOutputFile(fileKey)
      && linked.linkedBasenames.has(path.posix.basename(fileKey))
    )
}

export function removeDuplicateUnlinkedRootCssAssetsReferencedByHtml(
  bundle: OutputBundle,
  options: {
    debug?: ((format: string, ...args: unknown[]) => void) | undefined
  } = {},
) {
  const linked = collectHtmlLinkedStyleFiles(bundle)
  if (linked.linkedFiles.size === 0 && linked.linkedBasenames.size === 0) {
    return 0
  }
  const linkedSources = new Set<string>()
  for (const [bundleFile, output] of Object.entries(bundle)) {
    if (output.type !== 'asset') {
      continue
    }
    const file = getAssetFile(bundleFile, output)
    if (!isCssOutputFile(file) || isMiniProgramStyleOutputFile(file) || !isLinkedStyleFile(file, linked)) {
      continue
    }
    const source = stripBundlerGeneratedCssMarkers(readAssetSource(output)).trim()
    if (source.length > 0) {
      linkedSources.add(source)
    }
  }
  if (linkedSources.size === 0) {
    return 0
  }
  let removed = 0
  for (const [bundleFile, output] of Object.entries(bundle)) {
    if (output.type !== 'asset') {
      continue
    }
    const file = getAssetFile(bundleFile, output)
    if (
      !isRootStyleOutputFile(file)
      || isMiniProgramStyleOutputFile(file)
      || isLinkedStyleFile(file, linked)
    ) {
      continue
    }
    const source = stripBundlerGeneratedCssMarkers(readAssetSource(output)).trim()
    if (!linkedSources.has(source)) {
      continue
    }
    delete bundle[bundleFile]
    options.debug?.('remove duplicate unlinked root css asset referenced by html: %s', file)
    removed++
  }
  return removed
}
