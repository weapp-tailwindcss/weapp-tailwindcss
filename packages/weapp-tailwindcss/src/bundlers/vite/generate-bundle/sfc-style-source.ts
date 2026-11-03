import type { OutputChunk } from 'rollup'
import type { BundleSnapshot } from '../bundle-state'
import type { RememberedCssSource } from './types'
import type { SfcStyleBlock } from '@/utils/sfc'
import path from 'node:path'
import { isTailwindV4CssEntry } from '@/tailwindcss/v4/css-entries'
import { extractSfcStyleBlocks, isSfcSourceFile } from '@/utils/sfc'
import { hasTailwindApplyDirective, hasTailwindNonRootGenerationDirectives, hasTailwindRootDirectives, hasTailwindSourceDirectives } from '../../../generation/directives'
import { scoreTailwindV4CssSourceFileMatch } from '../../../generation/source-resolver/matching'
import { normalizeOutputPathKey } from '../../shared/module-graph'
import { CSS_SOURCE_OUTPUT_EXT_RE } from '../css-output'
import { scoreMatchingStyleFileBase } from './style-matching'

export { extractSfcStyleBlocks } from '@/utils/sfc'
export type { SfcStyleBlock } from '@/utils/sfc'

export const isSfcStyleSourceFile = isSfcSourceFile

export function extractSfcStyleSources(source: string, filename: string) {
  return extractSfcStyleBlocks(source, filename).map(style => style.source)
}

export function hasSfcStyleSources(source: string, filename: string) {
  return extractSfcStyleSources(source, filename).length > 0
}

function resolveSfcStyleHandlerSourceFile(sourceFile: string, styleBlocks: SfcStyleBlock[]) {
  const scopedStyleBlock = styleBlocks.find(style => style.scoped)
  return scopedStyleBlock
    ? [
        `${sourceFile}?vue&type=style&index=${scopedStyleBlock.index}&scoped=true`,
        ...scopedStyleBlock.lang
          ? [`lang=${encodeURIComponent(scopedStyleBlock.lang!)}`]
          : [],
      ].join('&')
    : sourceFile
}

function normalizeSfcStyleSourceForCompare(source: string) {
  return source.replace(/\r\n?/g, '\n').trim()
}

function createSfcStyleRequest(sourceFile: string, styleBlock: Readonly<SfcStyleBlock>) {
  const params = new URLSearchParams()
  params.set('vue', '')
  params.set('type', 'style')
  params.set('index', String(styleBlock.index))
  if (styleBlock.scoped) {
    params.set('scoped', 'true')
  }
  const lang = styleBlock.lang
  if (lang) {
    params.set('lang', lang)
  }
  return `${sourceFile}?${params.toString()}`
}

export function resolveSfcStyleRequestFromKnownSource(
  sourceFile: string,
  sfcSource: string | undefined,
  styleSource: string,
  currentRequest?: string,
) {
  if (!sfcSource) {
    return sourceFile
  }
  return resolveSfcStyleRequestFromBlocks(sourceFile, extractSfcStyleBlocks(sfcSource, sourceFile), styleSource, currentRequest)
}

export function resolveSfcStyleRequestFromBlocks(
  sourceFile: string,
  styleBlocks: readonly Readonly<SfcStyleBlock>[],
  styleSource: string,
  currentRequest?: string,
) {
  if (styleBlocks.length === 0) {
    return sourceFile
  }
  const normalizedStyleSource = normalizeSfcStyleSourceForCompare(styleSource)
  const matchedBlocks = styleBlocks.filter((styleBlock) => {
    const normalizedBlockSource = normalizeSfcStyleSourceForCompare(styleBlock.source)
    return normalizedBlockSource === normalizedStyleSource
      || normalizedBlockSource.includes(normalizedStyleSource)
      || normalizedStyleSource.includes(normalizedBlockSource)
  })
  const requestIndex = currentRequest
    ? Number.parseInt(new URLSearchParams(currentRequest.split('?', 2)[1] ?? '').get('index') ?? '', 10)
    : Number.NaN
  const indexedBlock = Number.isInteger(requestIndex)
    ? styleBlocks.find(styleBlock => styleBlock.index === requestIndex)
    : undefined
  const styleBlock = indexedBlock ?? (matchedBlocks.length === 1
    ? matchedBlocks[0]
    : styleBlocks.length === 1
      ? styleBlocks[0]
      : undefined)
  return styleBlock ? createSfcStyleRequest(sourceFile, styleBlock) : sourceFile
}

export function hasTailwindGenerationSource(
  source: string,
  options: { allowRootDirectives?: boolean | undefined } = {},
) {
  const allowRootDirectives = options.allowRootDirectives !== false
  return hasTailwindNonRootGenerationDirectives(source, { importFallback: true })
    || (allowRootDirectives && hasTailwindSourceDirectives(source, { importFallback: true }))
    || (allowRootDirectives && hasTailwindRootDirectives(source, { importFallback: true }))
    || hasTailwindApplyDirective(source)
}

function hasTailwindGenerationSourceForFile(file: string, source: string) {
  if (isTailwindV4CssEntry(file)) {
    return hasTailwindGenerationSource(source)
  }
  return hasTailwindGenerationSource(source, { allowRootDirectives: false })
}

export async function resolveSfcStyleSourceFromOutputFile(
  outputFile: string,
  snapshot: BundleSnapshot,
  outputRoot: string,
  sourceRoot: string | undefined,
  cssMatcher: ((file: string) => boolean) | undefined,
  getSfcSource: ((file: string) => string | undefined) | undefined,
  debug: (format: string, ...args: unknown[]) => void,
): Promise<RememberedCssSource | undefined> {
  const sourceFile = resolveSfcStyleFileFromSiblingChunk(outputFile, snapshot, outputRoot, sourceRoot, cssMatcher, debug)
  if (!sourceFile) {
    debug('sfc style source infer skipped: no source file for %s', outputFile)
    return undefined
  }
  const source = getSfcSource?.(sourceFile)
  if (source == null) {
    debug('sfc style source infer skipped: missing known source for %s -> %s', outputFile, sourceFile)
    return undefined
  }
  const styleBlocks = extractSfcStyleBlocks(source, sourceFile)
  const rawSource = styleBlocks.map(style => style.source).join('\n')
  if (!rawSource || !hasTailwindGenerationSourceForFile(sourceFile, rawSource)) {
    debug('sfc style source infer skipped: no tailwind generation source for %s -> %s', outputFile, sourceFile)
    return undefined
  }
  debug('sfc style source inferred: %s -> %s', outputFile, sourceFile)
  return {
    outputFile,
    rawSource,
    sourceFile: resolveSfcStyleHandlerSourceFile(sourceFile, styleBlocks),
    sourceInputs: styleBlocks.map(style => ({ rawSource: style.source, sourceFile: createSfcStyleRequest(sourceFile, style) })),
  }
}

export function normalizeSfcSourceFileForCompare(file: string) {
  return normalizeOutputPathKey(file.replace(/[?#].*$/, ''))
}

export function collectChunkModuleIds(output: OutputChunk) {
  const moduleIds = Array.isArray(output.moduleIds) ? output.moduleIds : []
  return [
    output.facadeModuleId,
    ...moduleIds,
    ...Object.keys(output.modules ?? {}),
  ].filter((id, index, ids): id is string => typeof id === 'string' && id.length > 0 && ids.indexOf(id) === index)
}

function normalizeSourceStyleModuleId(id: string) {
  const file = id.replace(/[?#].*$/, '')
  if (!CSS_SOURCE_OUTPUT_EXT_RE.test(file)) {
    return undefined
  }
  if (!path.isAbsolute(file)) {
    return undefined
  }
  return path.resolve(file)
}

function resolveSiblingJsChunkFile(outputFile: string, cssMatcher: ((file: string) => boolean) | undefined) {
  const normalizedOutputFile = outputFile.replace(/[?#].*$/, '')
  if (cssMatcher?.(normalizedOutputFile)) {
    const extension = path.extname(normalizedOutputFile)
    return extension ? `${normalizedOutputFile.slice(0, -extension.length)}.js` : undefined
  }
  if (CSS_SOURCE_OUTPUT_EXT_RE.test(normalizedOutputFile)) {
    return normalizedOutputFile.replace(CSS_SOURCE_OUTPUT_EXT_RE, '.js')
  }
  return undefined
}

function normalizeSfcModuleId(id: string) {
  const file = id.replace(/[?#].*$/, '')
  if (!isSfcStyleSourceFile(file)) {
    return undefined
  }
  if (!path.isAbsolute(file)) {
    return undefined
  }
  return path.resolve(file)
}

function resolveSfcStyleFileFromSiblingChunk(
  outputFile: string,
  snapshot: BundleSnapshot,
  outputRoot: string,
  sourceRoot: string | undefined,
  cssMatcher: ((file: string) => boolean) | undefined,
  debug: (format: string, ...args: unknown[]) => void,
) {
  const siblingJsFile = resolveSiblingJsChunkFile(outputFile, cssMatcher)
  if (!siblingJsFile) {
    debug('sfc style sibling chunk skipped: no sibling js for %s', outputFile)
    return undefined
  }
  const normalizedSiblingJsFile = normalizeOutputPathKey(siblingJsFile)
  const siblingChunk = snapshot.entries.find(entry =>
    entry.type === 'js'
    && entry.output.type === 'chunk'
    && normalizeOutputPathKey(entry.file) === normalizedSiblingJsFile,
  )
  if (!siblingChunk || siblingChunk.output.type !== 'chunk') {
    debug('sfc style sibling chunk skipped: missing chunk for %s -> %s', outputFile, siblingJsFile)
    return undefined
  }
  const sourceFiles = collectChunkModuleIds(siblingChunk.output)
    .map(normalizeSfcModuleId)
    .filter((file, index, files): file is string => Boolean(file) && files.indexOf(file) === index)
  if (sourceFiles.length === 0) {
    debug('sfc style sibling chunk skipped: no sfc modules for %s -> %s', outputFile, siblingJsFile)
    return undefined
  }
  const scoredSources = sourceFiles
    .map(sourceFile => ({
      sourceFile,
      score: scoreMatchingStyleFileBase(outputFile, sourceFile, outputRoot, sourceRoot),
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
  debug('sfc style sibling chunk candidates: %s -> %s %O', outputFile, siblingJsFile, scoredSources)
  const bestScore = scoredSources[0]?.score
  if (!bestScore) {
    return undefined
  }
  const bestSources = scoredSources.filter(item => item.score === bestScore)
  if (bestSources.length !== 1) {
    debug('sfc style sibling chunk skipped: ambiguous best sources for %s %O', outputFile, bestSources)
    return undefined
  }
  return bestSources[0]?.sourceFile
}

function resolveSourceStyleFileFromSiblingChunk(
  outputFile: string,
  snapshot: BundleSnapshot,
  outputRoot: string,
  sourceRoot: string | undefined,
  debug: (format: string, ...args: unknown[]) => void,
) {
  const siblingJsFile = resolveSiblingJsChunkFile(outputFile, undefined)
  if (!siblingJsFile) {
    debug('source style sibling chunk skipped: no sibling js for %s', outputFile)
    return undefined
  }
  const normalizedSiblingJsFile = normalizeOutputPathKey(siblingJsFile)
  const siblingChunk = snapshot.entries.find(entry =>
    entry.type === 'js'
    && entry.output.type === 'chunk'
    && normalizeOutputPathKey(entry.file) === normalizedSiblingJsFile,
  )
  if (!siblingChunk || siblingChunk.output.type !== 'chunk') {
    debug('source style sibling chunk skipped: missing chunk for %s -> %s', outputFile, siblingJsFile)
    return undefined
  }
  const sourceFiles = collectChunkModuleIds(siblingChunk.output)
    .map(normalizeSourceStyleModuleId)
    .filter((file, index, files): file is string => Boolean(file) && files.indexOf(file) === index)
  if (sourceFiles.length === 0) {
    debug('source style sibling chunk skipped: no source style modules for %s -> %s', outputFile, siblingJsFile)
    return undefined
  }
  if (sourceFiles.length === 1) {
    debug('source style sibling chunk inferred from single css module: %s -> %s', outputFile, sourceFiles[0])
    return sourceFiles[0]
  }
  const scoredSources = sourceFiles
    .map(sourceFile => ({
      sourceFile,
      score: scoreMatchingStyleFileBase(outputFile, sourceFile, outputRoot, sourceRoot),
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
  debug('source style sibling chunk candidates: %s -> %s %O', outputFile, siblingJsFile, scoredSources)
  const bestScore = scoredSources[0]?.score
  if (!bestScore) {
    return undefined
  }
  const bestSources = scoredSources.filter(item => item.score === bestScore)
  if (bestSources.length !== 1) {
    debug('source style sibling chunk skipped: ambiguous best sources for %s %O', outputFile, bestSources)
    return undefined
  }
  return bestSources[0]?.sourceFile
}

export function resolveSourceStyleSourceFromOutputFile(
  outputFile: string,
  snapshot: BundleSnapshot,
  outputRoot: string,
  sourceRoot: string | undefined,
  getSourceStyleSource: ((file: string) => string | undefined) | undefined,
  getSourceStyleSources: (() => Iterable<[string, string]>) | undefined,
  configuredSourceEntries: Iterable<readonly [string, string]> | undefined,
  debug: (format: string, ...args: unknown[]) => void,
): RememberedCssSource | undefined {
  let sourceFile = resolveSourceStyleFileFromSiblingChunk(outputFile, snapshot, outputRoot, sourceRoot, debug)
  let rawSource = sourceFile ? getSourceStyleSource?.(sourceFile) : undefined
  if (!sourceFile || !rawSource || !hasTailwindGenerationSourceForFile(sourceFile, rawSource)) {
    const cachedSources = [...(getSourceStyleSources?.() ?? [])]
      .filter(([file, source]) => CSS_SOURCE_OUTPUT_EXT_RE.test(file) && hasTailwindGenerationSourceForFile(file, source))
      .map(([file, source]) => ({
        file,
        source,
        score: scoreTailwindV4CssSourceFileMatch(outputFile, file, {
          outputRoot,
          projectRoot: sourceRoot,
        }),
      }))
    const configuredSources = [...(configuredSourceEntries ?? [])]
      .filter(([file, source]) => CSS_SOURCE_OUTPUT_EXT_RE.test(file) && hasTailwindGenerationSourceForFile(file, source))
      .map(([file, source]) => ({
        file,
        source,
        score: scoreTailwindV4CssSourceFileMatch(outputFile, file, {
          outputRoot,
          projectRoot: sourceRoot,
        }),
      }))
    const scoredSources = [
      ...cachedSources,
      ...configuredSources,
    ]
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
    const bestScore = scoredSources[0]?.score
    const bestSources = bestScore ? scoredSources.filter(item => item.score === bestScore) : []
    if (bestSources.length === 1) {
      sourceFile = bestSources[0]!.file
      rawSource = bestSources[0]!.source
      debug('source style source inferred from cache: %s -> %s', outputFile, sourceFile)
    }
  }
  if (!sourceFile || !rawSource) {
    return undefined
  }
  if (!hasTailwindGenerationSourceForFile(sourceFile, rawSource)) {
    debug('source style source infer skipped: no tailwind generation source for %s -> %s', outputFile, sourceFile)
    return undefined
  }
  return {
    outputFile,
    rawSource,
    sourceFile,
  }
}
