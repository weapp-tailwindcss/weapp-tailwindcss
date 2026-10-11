import type { RememberedCssSource } from './generate-bundle'
import path from 'node:path'
import { isSourceStyleRequest, stripRequestQuery } from '../../generation/style-requests'
import { normalizeOutputPathKey } from '../shared/module-graph'
import { pruneMapToMaxSize, touchMapEntry } from './map-cache'
import { parseVueRequest } from './query'
import { getActiveViteSourceOutputRelationOwner } from './source-output-relations'
import { cleanUrl, isWeappViteSidecarRequest } from './utils'

const VITE_REMEMBERED_CSS_CACHE_MAX = 96
const VITE_KNOWN_SFC_SOURCE_CACHE_MAX = 128
const SFC_STYLE_BLOCK_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi
const SFC_COMPONENT_FILE_RE = /\.(?:vue|uvue|nvue|svelte|mpx)$/i

function toMb(bytes: number) {
  return Math.round(bytes / 1024 / 1024)
}

function summarizeStringMapCache(map: Map<string, string>) {
  let bytes = 0
  for (const value of map.values()) {
    bytes += value.length
  }
  return {
    bytes,
    mb: toMb(bytes),
    size: map.size,
  }
}

function summarizeRememberedCssSources(map: Map<string, RememberedCssSource>) {
  let bytes = 0
  for (const value of map.values()) {
    bytes += value.rawSource.length
  }
  return {
    bytes,
    mb: toMb(bytes),
    size: map.size,
  }
}

function stripSourceHash(sourceFile: string) {
  const hashIndex = sourceFile.indexOf('#')
  return hashIndex === -1 ? sourceFile : sourceFile.slice(0, hashIndex)
}

export function normalizeCssSourceIdentity(sourceFile: string) {
  const cleanSourceFile = stripSourceHash(sourceFile)
  const { filename, query } = parseVueRequest(cleanSourceFile)
  const normalizedFile = normalizeOutputPathKey(filename)
  if (query.type === 'style') {
    return `${normalizedFile}?type=style&index=${query.index ?? 0}`
  }
  return normalizeOutputPathKey(stripRequestQuery(cleanSourceFile))
}

function hasSfcStyleBlocks(source: string) {
  SFC_STYLE_BLOCK_RE.lastIndex = 0
  return SFC_STYLE_BLOCK_RE.test(source)
}

function extractSfcStyleBlock(source: string, index: number | undefined) {
  const targetIndex = index ?? 0
  SFC_STYLE_BLOCK_RE.lastIndex = 0
  let currentIndex = 0
  let match = SFC_STYLE_BLOCK_RE.exec(source)
  while (match !== null) {
    if (currentIndex === targetIndex) {
      return match[1] ?? ''
    }
    currentIndex++
    match = SFC_STYLE_BLOCK_RE.exec(source)
  }
  return undefined
}

function extractSfcStyleSource(source: string, index: number | undefined) {
  if (index !== undefined) {
    return extractSfcStyleBlock(source, index)
  }
  const styleSources: string[] = []
  SFC_STYLE_BLOCK_RE.lastIndex = 0
  let match = SFC_STYLE_BLOCK_RE.exec(source)
  while (match !== null) {
    styleSources.push(match[1] ?? '')
    match = SFC_STYLE_BLOCK_RE.exec(source)
  }
  return styleSources.length > 0 ? styleSources.join('\n') : undefined
}

function normalizeKnownSfcSourceKey(file: string) {
  return normalizeOutputPathKey(path.resolve(cleanUrl(file)))
}

export function shouldCollectTransformedSourceCandidates(id: string) {
  if (isWeappViteSidecarRequest(id)) {
    return false
  }
  const queryIndex = id.search(/[?#]/)
  if (queryIndex < 0) {
    return true
  }
  const file = cleanUrl(id)
  return !SFC_COMPONENT_FILE_RE.test(file)
}

export function createViteCssMemory(options: {
  debug: (format: string, ...args: unknown[]) => void
  getSourceCandidateSource: (file: string) => string | undefined
}) {
  const rememberedCssSources = new Map<string, RememberedCssSource>()
  const rememberedCssSignatureByFile = new Map<string, string>()
  const knownCssSources = new Map<string, string>()
  const knownSfcSources = new Map<string, string>()

  const rememberKnownSfcSource = (id: string, code: string) => {
    if (id.search(/[?#]/) >= 0) {
      return
    }
    const file = cleanUrl(id)
    if (!SFC_COMPONENT_FILE_RE.test(file)) {
      return
    }
    if (!hasSfcStyleBlocks(code)) {
      return
    }
    touchMapEntry(knownSfcSources, normalizeKnownSfcSourceKey(file), code)
    pruneMapToMaxSize(knownSfcSources, VITE_KNOWN_SFC_SOURCE_CACHE_MAX)
  }

  const getKnownSfcSource = (file: string) => {
    const scanSource = options.getSourceCandidateSource(file)
    if (scanSource && hasSfcStyleBlocks(scanSource)) {
      return scanSource
    }
    const key = normalizeKnownSfcSourceKey(file)
    const source = knownSfcSources.get(key)
    if (source != null) {
      touchMapEntry(knownSfcSources, key, source)
    }
    return source
  }

  const getKnownCssSource = (file: string) => {
    const source = knownCssSources.get(normalizeCssSourceIdentity(file))
    if (source != null) {
      touchMapEntry(knownCssSources, normalizeCssSourceIdentity(file), source)
    }
    return source
  }

  const rememberCssSource = (entry: RememberedCssSource, cssRuntimeSignature?: string) => {
    getActiveViteSourceOutputRelationOwner()?.recordOwnedOutput(entry.sourceFile, entry.outputFile)
    const outputKey = normalizeOutputPathKey(entry.outputFile)
    const normalizedSourceFile = normalizeCssSourceIdentity(entry.sourceFile)
    const previousOutputEntry = rememberedCssSources.get(outputKey)
    const key = previousOutputEntry != null && normalizeCssSourceIdentity(previousOutputEntry.sourceFile) !== normalizedSourceFile
      ? `${outputKey}\0${normalizedSourceFile}`
      : outputKey
    const previous = rememberedCssSources.get(key)
    touchMapEntry(rememberedCssSources, key, entry)
    const relatedRememberedEntries = [...rememberedCssSources].filter(([rememberedKey, remembered]) =>
      rememberedKey !== key && normalizeCssSourceIdentity(remembered.sourceFile) === normalizedSourceFile,
    )
    for (const [rememberedKey, remembered] of relatedRememberedEntries) {
      touchMapEntry(rememberedCssSources, rememberedKey, {
        ...remembered,
        outputFile: entry.outputFile,
        rawSource: entry.rawSource,
        sourceFile: entry.sourceFile,
      })
      rememberedCssSignatureByFile.delete(rememberedKey)
    }
    if (cssRuntimeSignature) {
      rememberedCssSignatureByFile.set(key, cssRuntimeSignature)
    }
    else if (previous?.rawSource !== entry.rawSource || previous?.sourceFile !== entry.sourceFile) {
      rememberedCssSignatureByFile.delete(key)
    }
    pruneMapToMaxSize(rememberedCssSources, VITE_REMEMBERED_CSS_CACHE_MAX, (rememberedKey) => {
      rememberedCssSignatureByFile.delete(String(rememberedKey))
    })
  }

  const refreshRememberedCssSourceEntry = (
    rememberedKey: string,
    remembered: RememberedCssSource,
    sourceFile: string,
    rawSource: string,
  ) => {
    if (remembered.rawSource === rawSource && remembered.sourceFile === sourceFile) {
      return remembered
    }
    const nextRemembered = {
      ...remembered,
      rawSource,
      sourceFile,
    }
    touchMapEntry(rememberedCssSources, rememberedKey, nextRemembered)
    rememberedCssSignatureByFile.delete(rememberedKey)
    return nextRemembered
  }

  const refreshRememberedCssSourceBySourceFile = (sourceFile: string, rawSource: string) => {
    touchMapEntry(knownCssSources, normalizeCssSourceIdentity(sourceFile), rawSource)
    const normalizedSourceFile = normalizeCssSourceIdentity(sourceFile)
    const relatedRememberedEntries = [...rememberedCssSources].filter(([, remembered]) =>
      normalizeCssSourceIdentity(remembered.sourceFile) === normalizedSourceFile,
    )
    for (const [rememberedKey, remembered] of relatedRememberedEntries) {
      refreshRememberedCssSourceEntry(rememberedKey, remembered, sourceFile, rawSource)
    }
  }

  const resolveCachedStyleSource = (sourceFile: string) => {
    const file = cleanUrl(stripRequestQuery(sourceFile))
    if (SFC_COMPONENT_FILE_RE.test(file)) {
      return getKnownSfcSource(file)
    }
    if (isSourceStyleRequest(file)) {
      return options.getSourceCandidateSource(file)
    }
    return undefined
  }

  const resolveCurrentStyleSource = (sourceFile: string) => {
    const cached = resolveCachedStyleSource(sourceFile)
    if (cached != null) {
      return cached
    }
    const file = cleanUrl(stripRequestQuery(sourceFile))
    const knownSource = knownCssSources.get(normalizeCssSourceIdentity(sourceFile))
    if (knownSource != null) {
      return knownSource
    }
    const candidateSource = options.getSourceCandidateSource(file)
    if (candidateSource != null) {
      return candidateSource
    }
    return undefined
  }

  const refreshRememberedCssSourceByCurrentFile = async (sourceFile: string) => {
    const file = cleanUrl(sourceFile)
    const normalizedSourceFile = normalizeOutputPathKey(file)
    const matchedRememberedSources = [...rememberedCssSources.values()].filter(remembered =>
      normalizeOutputPathKey(stripRequestQuery(cleanUrl(remembered.sourceFile))) === normalizedSourceFile,
    )
    if (matchedRememberedSources.length === 0) {
      return
    }
    const source = await resolveCurrentStyleSource(file)
    if (source == null) {
      options.debug('refresh remembered css source skipped: missing cached source for %s', file)
      return
    }
    if (SFC_COMPONENT_FILE_RE.test(file)) {
      for (const remembered of matchedRememberedSources) {
        const { query } = parseVueRequest(remembered.sourceFile)
        const styleSource = extractSfcStyleSource(source, query.type === 'style' ? query.index : undefined)
        if (styleSource !== undefined) {
          refreshRememberedCssSourceBySourceFile(remembered.sourceFile, styleSource)
        }
      }
      return
    }
    if (isSourceStyleRequest(file)) {
      refreshRememberedCssSourceBySourceFile(file, source)
    }
  }

  const prune = (pruneOptions: {
    activeFiles: Set<string>
    activeKnownSfcFiles?: Set<string> | undefined
  }) => {
    const activeFiles = new Set([...pruneOptions.activeFiles].map(normalizeOutputPathKey))
    for (const [key, remembered] of rememberedCssSources) {
      const outputKey = normalizeOutputPathKey(remembered.outputFile)
      const sourceKey = normalizeOutputPathKey(remembered.sourceFile)
      if (!activeFiles.has(key) && !activeFiles.has(outputKey) && !activeFiles.has(sourceKey)) {
        rememberedCssSources.delete(key)
        rememberedCssSignatureByFile.delete(key)
      }
    }
    if (pruneOptions.activeKnownSfcFiles) {
      const activeKnownSfcFiles = new Set(
        [...pruneOptions.activeKnownSfcFiles]
          .map(file => normalizeKnownSfcSourceKey(file))
          .filter(file => SFC_COMPONENT_FILE_RE.test(file)),
      )
      for (const key of knownSfcSources.keys()) {
        if (!activeKnownSfcFiles.has(key)) {
          knownSfcSources.delete(key)
        }
      }
    }
    pruneMapToMaxSize(rememberedCssSources, VITE_REMEMBERED_CSS_CACHE_MAX, (rememberedKey) => {
      rememberedCssSignatureByFile.delete(String(rememberedKey))
    })
    pruneMapToMaxSize(knownCssSources, VITE_REMEMBERED_CSS_CACHE_MAX)
    pruneMapToMaxSize(knownSfcSources, VITE_KNOWN_SFC_SOURCE_CACHE_MAX)
  }

  return {
    dispose() {
      rememberedCssSources.clear()
      rememberedCssSignatureByFile.clear()
      knownCssSources.clear()
      knownSfcSources.clear()
    },
    getKnownSfcSource,
    getKnownCssSource,
    getRememberedCssSignature: (file: string) => rememberedCssSignatureByFile.get(normalizeOutputPathKey(file)),
    getRememberedCssSourceEntry: (file: string) => rememberedCssSources.get(normalizeOutputPathKey(file)),
    getRememberedCssSources: () => rememberedCssSources,
    getStats: () => ({
      rememberedCssSources: rememberedCssSources.size,
      rememberedCssSourcesRaw: summarizeRememberedCssSources(rememberedCssSources),
      rememberedCssSignatureByFile: rememberedCssSignatureByFile.size,
      knownCssSources: knownCssSources.size,
      knownCssSourcesRaw: summarizeStringMapCache(knownCssSources),
      knownSfcSources: knownSfcSources.size,
      knownSfcSourcesRaw: summarizeStringMapCache(knownSfcSources),
    }),
    rememberCssSource,
    rememberKnownSfcSource,
    refreshRememberedCssSourceByCurrentFile,
    refreshRememberedCssSourceBySourceFile,
    setRememberedCssSignature: (file: string, cssRuntimeSignature: string) => {
      rememberedCssSignatureByFile.set(normalizeOutputPathKey(file), cssRuntimeSignature)
    },
    prune,
  }
}
