import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { postcss } from '@weapp-tailwindcss/postcss/transform'
import { extractSfcStyleBlocks, isSfcSourceFile } from '@/utils/sfc'
import {
  hasTailwindRootDirectives,
  hasTailwindSourceDirectives,
  parseImportRequest,
  resolveCssEntrySource,
} from './directives'

const STYLE_IMPORT_EXTENSIONS = ['.css', '.scss', '.sass', '.less', '.styl', '.stylus', '.pcss', '.postcss']

export interface SourceSideCssEntryOptions {
  projectRoot?: string | undefined
  cwd?: string | undefined
  outputRoot?: string | undefined
  sourceFile?: string | undefined
  sourceCss?: string | undefined
  cssSources?: Array<{
    file?: string | undefined
  }> | undefined
  cssEntries?: string[] | undefined
}

function stripStyleExtension(file: string) {
  const normalized = file.replace(/[?#].*$/, '')
  const ext = path.extname(normalized)
  return ext ? normalized.slice(0, -ext.length) : normalized
}

function normalizeMatchPath(file: string) {
  return file.split(path.sep).join('/')
}

function isPathWithinRoot(file: string, root: string) {
  const relative = path.relative(root, file)
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function collectOutputMatchBases(
  file: string,
  sourceOptions: Pick<SourceSideCssEntryOptions, 'projectRoot' | 'cwd' | 'outputRoot'>,
) {
  const normalizedFile = file.replace(/[?#].*$/, '')
  const roots = [
    sourceOptions.outputRoot,
    sourceOptions.projectRoot,
    sourceOptions.cwd,
  ].filter((item): item is string => typeof item === 'string' && item.length > 0)
  const bases = new Set<string>()
  const addBase = (candidate: string) => {
    const stripped = normalizeMatchPath(stripStyleExtension(candidate))
    if (stripped.length > 0) {
      bases.add(stripped)
    }
  }

  addBase(normalizedFile)
  if (path.isAbsolute(normalizedFile)) {
    for (const root of roots) {
      const normalizedRoot = path.resolve(root)
      if (isPathWithinRoot(normalizedFile, normalizedRoot)) {
        addBase(path.relative(normalizedRoot, normalizedFile))
      }
    }
  }
  else {
    for (const root of roots) {
      addBase(path.resolve(root, normalizedFile))
    }
  }

  return bases
}

function isMatchingSourceStyleFile(
  file: string,
  sourceFile: string,
  sourceOptions: Pick<SourceSideCssEntryOptions, 'projectRoot' | 'cwd' | 'outputRoot'>,
) {
  const outputBases = collectOutputMatchBases(file, sourceOptions)
  const normalizedSourceFile = sourceFile.replace(/[?#].*$/, '')
  const sourceBases = new Set<string>()
  const addSourceBase = (candidate: string) => {
    const stripped = normalizeMatchPath(stripStyleExtension(candidate))
    if (stripped.length > 0) {
      sourceBases.add(stripped)
    }
  }
  addSourceBase(normalizedSourceFile)
  if (path.isAbsolute(normalizedSourceFile)) {
    for (const root of [sourceOptions.projectRoot, sourceOptions.cwd]) {
      if (!root) {
        continue
      }
      const normalizedRoot = path.resolve(root)
      if (isPathWithinRoot(normalizedSourceFile, normalizedRoot)) {
        addSourceBase(path.relative(normalizedRoot, normalizedSourceFile))
      }
    }
  }

  for (const outputBase of outputBases) {
    for (const sourceBase of sourceBases) {
      if (
        outputBase === sourceBase
        || outputBase.endsWith(`/${sourceBase}`)
        || sourceBase.endsWith(`/${outputBase}`)
      ) {
        return true
      }
    }
  }
  return false
}

function scoreMatchingSourceStyleFile(
  file: string,
  sourceFile: string,
  sourceOptions: Pick<SourceSideCssEntryOptions, 'projectRoot' | 'cwd' | 'outputRoot'>,
) {
  const outputBases = collectOutputMatchBases(file, sourceOptions)
  const normalizedSourceFile = sourceFile.replace(/[?#].*$/, '')
  const sourceBases = new Set<string>()
  const addSourceBase = (candidate: string) => {
    const stripped = normalizeMatchPath(stripStyleExtension(candidate))
    if (stripped.length > 0) {
      sourceBases.add(stripped)
    }
  }
  addSourceBase(normalizedSourceFile)
  if (path.isAbsolute(normalizedSourceFile)) {
    for (const root of [sourceOptions.projectRoot, sourceOptions.cwd]) {
      if (!root) {
        continue
      }
      const normalizedRoot = path.resolve(root)
      if (isPathWithinRoot(normalizedSourceFile, normalizedRoot)) {
        addSourceBase(path.relative(normalizedRoot, normalizedSourceFile))
      }
    }
  }

  let bestScore = 0
  for (const outputBase of outputBases) {
    for (const sourceBase of sourceBases) {
      if (outputBase === sourceBase) {
        bestScore = Math.max(bestScore, 100000 + outputBase.length)
      }
      else if (outputBase.endsWith(`/${sourceBase}`)) {
        bestScore = Math.max(bestScore, 50000 + sourceBase.length)
      }
      else if (sourceBase.endsWith(`/${outputBase}`)) {
        bestScore = Math.max(bestScore, 1000 + outputBase.length)
      }
    }
  }
  return bestScore
}

function collectMatchedConfiguredSourceFiles(
  file: string,
  sourceOptions: SourceSideCssEntryOptions,
) {
  const configuredFiles = [
    ...(sourceOptions.cssSources ?? []).map(cssSource => cssSource.file),
    ...(sourceOptions.cssEntries ?? []),
  ]
    .filter((sourceFile): sourceFile is string =>
      typeof sourceFile === 'string'
      && path.isAbsolute(sourceFile))
    .map(sourceFile => path.resolve(sourceFile.replace(/[?#].*$/, '')))
    .filter((sourceFile, index, files) => files.indexOf(sourceFile) === index)
  const matches = configuredFiles
    .map(sourceFile => ({
      sourceFile,
      score: scoreMatchingSourceStyleFile(file, sourceFile, sourceOptions),
    }))
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score)
  const bestScore = matches[0]?.score ?? 0
  return matches
    .filter(match => match.score === bestScore)
    .map(match => match.sourceFile)
}

function hasConfiguredSourceFiles(
  sourceOptions: Pick<SourceSideCssEntryOptions, 'cssSources' | 'cssEntries'>,
) {
  return Boolean(sourceOptions.cssEntries?.length)
    || Boolean(sourceOptions.cssSources?.some(cssSource => typeof cssSource.file === 'string' && cssSource.file.length > 0))
}

function createSourceStylePathCandidates(
  file: string,
  sourceOptions: SourceSideCssEntryOptions,
) {
  const candidates = new Set<string>()
  const addCandidate = (candidate: string | undefined) => {
    if (candidate && path.isAbsolute(candidate)) {
      candidates.add(candidate.replace(/[?#].*$/, ''))
    }
  }

  const matchedConfiguredSourceFiles = collectMatchedConfiguredSourceFiles(file, sourceOptions)
  if (matchedConfiguredSourceFiles.length === 1) {
    addCandidate(matchedConfiguredSourceFiles[0])
  }
  else if (matchedConfiguredSourceFiles.length === 0) {
    for (const cssSource of sourceOptions.cssSources ?? []) {
      const sourceFile = cssSource.file
      if (
        typeof sourceFile === 'string'
        && path.isAbsolute(sourceFile)
        && isMatchingSourceStyleFile(file, sourceFile, sourceOptions)
      ) {
        addCandidate(sourceFile)
      }
    }
  }

  if (hasConfiguredSourceFiles(sourceOptions)) {
    return [...candidates]
  }

  if (!hasConfiguredSourceFiles(sourceOptions)) {
    addCandidate(sourceOptions.sourceFile)
  }

  return [...candidates]
}

function getStyleSources(source: string, sourceFile: string, isCss: boolean) {
  return !isCss && isSfcSourceFile(sourceFile)
    ? extractSfcStyleBlocks(source, sourceFile).map(style => style.source)
    : [source]
}

function isLocalStyleImportRequest(request: string | undefined) {
  return typeof request === 'string'
    && request.length > 0
    && (request.startsWith('.') || request.startsWith('/'))
}

function resolveLocalStyleImportFile(request: string, base: string) {
  const resolved = path.isAbsolute(request) ? request : path.resolve(base, request)
  const normalized = resolved.replace(/[?#].*$/, '')
  if (existsSync(normalized)) {
    return normalized
  }
  if (path.extname(normalized)) {
    return undefined
  }
  for (const extension of STYLE_IMPORT_EXTENSIONS) {
    const candidate = `${normalized}${extension}`
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return undefined
}

function collectLocalStyleImportFiles(sources: string[], sourceFile: string) {
  const files: string[] = []
  const base = path.dirname(sourceFile)
  for (const styleSource of sources) {
    try {
      const root = postcss.parse(styleSource)
      root.walkAtRules('import', (rule) => {
        const request = parseImportRequest(rule.params)
        if (!isLocalStyleImportRequest(request)) {
          return
        }
        const file = request ? resolveLocalStyleImportFile(request, base) : undefined
        if (file) {
          files.push(file)
        }
      })
    }
    catch {
    }
  }
  return files
}

function extractStyleDirectiveSourcesDeep(
  source: string,
  sourceFile: string,
  seen: Set<string>,
  isCss = false,
): Array<{ source: string, file: string }> {
  const styleSources = getStyleSources(source, sourceFile, isCss)
  const ownSources = styleSources.filter(styleSource => hasTailwindSourceDirectives(styleSource, { importFallback: true }))
  if (ownSources.some(styleSource => hasTailwindRootDirectives(styleSource, { importFallback: true }))) {
    return ownSources.map(styleSource => ({ source: styleSource, file: sourceFile }))
  }

  const sources: Array<{ source: string, file: string }> = []
  for (const importedFile of collectLocalStyleImportFiles(styleSources, sourceFile)) {
    const normalizedImportedFile = path.resolve(importedFile)
    if (seen.has(normalizedImportedFile)) {
      continue
    }
    seen.add(normalizedImportedFile)
    try {
      const importedSource = readFileSync(normalizedImportedFile, 'utf8')
      sources.push(...extractStyleDirectiveSourcesDeep(importedSource, normalizedImportedFile, seen))
    }
    catch {
    }
  }
  return sources.length > 0
    ? sources
    : ownSources.map(styleSource => ({ source: styleSource, file: sourceFile }))
}

export interface SourceSideCssEntrySource {
  css: string
  config?: string | undefined
  configRequest?: string | undefined
  base: string
  file: string
}

export function resolveSourceSideCssEntrySource(
  file: string,
  sourceOptions: SourceSideCssEntryOptions,
  resolveOptions: { removeConfig?: boolean } = {},
): SourceSideCssEntrySource | undefined {
  for (const sourceFile of createSourceStylePathCandidates(file, sourceOptions)) {
    try {
      const usingSourceCss = Boolean(sourceOptions.sourceFile
        && path.resolve(sourceOptions.sourceFile) === path.resolve(sourceFile)
        && typeof sourceOptions.sourceCss === 'string')
      const source = usingSourceCss
        ? sourceOptions.sourceCss
        : existsSync(sourceFile)
          ? readFileSync(sourceFile, 'utf8')
          : undefined
      if (source === undefined) {
        continue
      }
      const directiveSources = extractStyleDirectiveSourcesDeep(source, sourceFile, new Set([path.resolve(sourceFile)]), usingSourceCss)
      for (const styleSource of directiveSources) {
        const cssEntrySource = resolveCssEntrySource(styleSource.source, path.dirname(styleSource.file), resolveOptions)
        if (cssEntrySource) {
          return {
            ...cssEntrySource,
            file: styleSource.file,
          }
        }
      }
    }
    catch {
      continue
    }
  }
}
