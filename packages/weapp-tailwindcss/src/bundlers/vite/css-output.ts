import type { InternalUserDefinedOptions } from '@/types'
import { existsSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { canProcessSourceStyleAsCss } from '@weapp-tailwindcss/postcss/transform'
import { normalizeOutputPathKey } from '../shared/module-graph'
import { isCSSRequest } from './utils'

export const SOURCE_STYLE_OUTPUT_EXT_RE = /\.(?:less|sass|scss|styl|stylus|pcss|postcss)$/i
export const CSS_SOURCE_OUTPUT_EXT_RE = /\.(?:css|less|sass|scss|styl|stylus|pcss|postcss)$/i

const FALLBACK_STYLE_OUTPUT_EXTENSION = '.css'
const COMMON_MINI_PROGRAM_STYLE_OUTPUT_EXTENSIONS = ['.wxss', '.acss', '.ttss', '.qss', '.jxss', '.tyss']

function resolveCssOutputRealPath(value: string) {
  const resolved = path.resolve(value)
  let current = resolved
  const pendingSegments: string[] = []
  while (!existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) {
      return resolved
    }
    pendingSegments.unshift(path.basename(current))
    current = parent
  }
  try {
    const realPath = realpathSync.native(current)
    return pendingSegments.length > 0
      ? path.join(realPath, ...pendingSegments)
      : realPath
  }
  catch {
    return resolved
  }
}

function normalizeStyleOutputExtension(value: string | undefined) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined
  }
  const normalized = value.trim().toLowerCase()
  return normalized.startsWith('.') ? normalized : `.${normalized}`
}

function getMatchedStyleOutputExtension(
  file: string,
  cssMatcher: ((file: string) => boolean) | undefined,
) {
  const cleanFile = file.replace(/[?#].*$/, '')
  if (!cssMatcher?.(cleanFile)) {
    return undefined
  }
  const ext = path.extname(cleanFile)
  if (!ext || ext === '.css') {
    return undefined
  }
  return ext
}

function resolveStyleOutputExtensionFromFiles(
  files: Iterable<string> | undefined,
  cssMatcher: ((file: string) => boolean) | undefined,
  stem?: string | undefined,
) {
  let extension: string | undefined
  for (const file of files ?? []) {
    const cleanFile = file.replace(/[?#].*$/, '')
    const matchedExtension = getMatchedStyleOutputExtension(cleanFile, cssMatcher)
    if (!matchedExtension) {
      continue
    }
    if (stem && cleanFile.slice(0, -matchedExtension.length) !== stem) {
      continue
    }
    if (extension && extension !== matchedExtension) {
      return undefined
    }
    extension = matchedExtension
  }
  return extension
}

function resolveStyleOutputExtensionFromMatcher(
  cssMatcher: ((file: string) => boolean) | undefined,
  stem: string | undefined,
) {
  if (!cssMatcher || !stem) {
    return undefined
  }
  const extensions = COMMON_MINI_PROGRAM_STYLE_OUTPUT_EXTENSIONS.filter(extension => cssMatcher(`${stem}${extension}`))
  return extensions.length === 1 ? extensions[0] : undefined
}

function resolveStyleOutputFileFromFiles(
  files: Iterable<string> | undefined,
  cssMatcher: ((file: string) => boolean) | undefined,
  stem: string,
) {
  const cleanStem = normalizeOutputPathKey(stem)
  const stemSuffix = `/${cleanStem}`
  const matchedFiles = new Set<string>()
  for (const file of files ?? []) {
    const cleanFile = normalizeOutputPathKey(file.replace(/[?#].*$/, ''))
    if (!cssMatcher?.(cleanFile)) {
      continue
    }
    const extension = path.extname(cleanFile)
    if (!extension || extension === '.css') {
      continue
    }
    const outputStem = cleanFile.slice(0, -extension.length)
    const outputStemSuffix = `/${outputStem}`
    if (
      outputStem === cleanStem
      || outputStem.endsWith(stemSuffix)
      || cleanStem.endsWith(outputStemSuffix)
      || cleanStem.endsWith(`/${outputStem}`)
    ) {
      matchedFiles.add(cleanFile)
    }
  }
  return matchedFiles.size === 1 ? [...matchedFiles][0] : undefined
}

export function resolveMiniProgramStyleOutputExtension(options: {
  cssMatcher?: ((file: string) => boolean) | undefined
  fallback?: string | undefined
  files?: Iterable<string> | undefined
  stem?: string | undefined
} = {}) {
  return resolveStyleOutputExtensionFromFiles(options.files, options.cssMatcher, options.stem)
    ?? resolveStyleOutputExtensionFromFiles(options.files, options.cssMatcher)
    ?? resolveStyleOutputExtensionFromMatcher(options.cssMatcher, options.stem)
    ?? normalizeStyleOutputExtension(options.fallback)
    ?? FALLBACK_STYLE_OUTPUT_EXTENSION
}

export function resolveReplayCssOutputFile(rootDir: string, file: string) {
  const cleanFile = file.replace(/[?#].*$/, '')
  const nextFile = path.isAbsolute(cleanFile)
    ? path.relative(resolveCssOutputRealPath(rootDir), resolveCssOutputRealPath(cleanFile))
    : cleanFile
  const normalizedFile = normalizeOutputPathKey(nextFile)
  if (
    normalizedFile.length === 0
    || normalizedFile === '.'
    || normalizedFile === '..'
    || normalizedFile.startsWith('../')
  ) {
    return normalizeOutputPathKey(path.basename(cleanFile))
  }
  return normalizedFile
}

function normalizeViteSourceRoot(rootDir: string, sourceRoot: string | undefined) {
  if (typeof sourceRoot !== 'string' || sourceRoot.trim().length === 0) {
    return undefined
  }
  return normalizeOutputPathKey(path.isAbsolute(sourceRoot)
    ? path.relative(rootDir, sourceRoot)
    : sourceRoot)
    .replace(/\/+$/, '')
}

export function resolveReplayCssOutputFileFromSourceRoot(rootDir: string, file: string, sourceRoot: string | undefined) {
  const outputFile = resolveReplayCssOutputFile(rootDir, file)
  const normalizedSourceRoot = normalizeViteSourceRoot(rootDir, sourceRoot)
  if (!normalizedSourceRoot) {
    return outputFile
  }
  if (outputFile === normalizedSourceRoot) {
    return path.posix.basename(outputFile)
  }
  if (outputFile.startsWith(`${normalizedSourceRoot}/`)) {
    return outputFile.slice(normalizedSourceRoot.length + 1)
  }
  return outputFile
}

export function resolveViteCssOutputFile(
  file: string,
  opts: InternalUserDefinedOptions,
  isWebGeneratorTarget: boolean,
  preserveCssExtension = false,
  styleOutputExtension?: string | undefined,
  styleOutputFiles?: Iterable<string> | undefined,
) {
  const cleanFile = file.replace(/[?#].*$/, '')
  if (
    isWebGeneratorTarget
    || preserveCssExtension
    || opts.cssMatcher(cleanFile)
    || !CSS_SOURCE_OUTPUT_EXT_RE.test(cleanFile)
    || !isCSSRequest(file)
  ) {
    return cleanFile
  }
  const stem = cleanFile.replace(CSS_SOURCE_OUTPUT_EXT_RE, '')
  return cleanFile.replace(CSS_SOURCE_OUTPUT_EXT_RE, resolveMiniProgramStyleOutputExtension({
    cssMatcher: opts.cssMatcher,
    fallback: styleOutputExtension,
    files: styleOutputFiles,
    stem,
  }))
}

export function resolveViteCssPipelineOutputFile(
  file: string,
  opts: Pick<InternalUserDefinedOptions, 'cssMatcher' | 'platform'>,
  rootDir: string,
  isWebGeneratorTarget = false,
  preserveCssExtension = false,
  sourceRoot?: string | undefined,
  styleOutputExtension?: string | undefined,
  styleOutputFiles?: Iterable<string> | undefined,
) {
  const sourceStyleRequest = isCSSRequest(file)
  const normalizedFile = resolveReplayCssOutputFileFromSourceRoot(rootDir, file, sourceRoot)
  const cleanFile = normalizedFile.replace(/[?#].*$/, '')
  const sourceExtension = path.extname(cleanFile)
  if (
    sourceStyleRequest
    && !isWebGeneratorTarget
    && !preserveCssExtension
    && sourceExtension.length > 0
    && !CSS_SOURCE_OUTPUT_EXT_RE.test(cleanFile)
  ) {
    const stem = cleanFile.slice(0, -sourceExtension.length)
    return `${stem}${resolveMiniProgramStyleOutputExtension({
      cssMatcher: opts.cssMatcher,
      fallback: styleOutputExtension,
      files: styleOutputFiles,
      stem,
    })}`
  }
  const stem = cleanFile.replace(CSS_SOURCE_OUTPUT_EXT_RE, '')
  const matchedStyleExtension = !isWebGeneratorTarget && !preserveCssExtension
    ? resolveStyleOutputExtensionFromFiles(styleOutputFiles, opts.cssMatcher, stem)
    : undefined
  if (matchedStyleExtension && CSS_SOURCE_OUTPUT_EXT_RE.test(cleanFile) && sourceStyleRequest) {
    return cleanFile.replace(CSS_SOURCE_OUTPUT_EXT_RE, matchedStyleExtension)
  }
  if (
    isWebGeneratorTarget
    || preserveCssExtension
    || opts.cssMatcher(cleanFile)
    || !CSS_SOURCE_OUTPUT_EXT_RE.test(cleanFile)
    || !sourceStyleRequest
  ) {
    return cleanFile
  }
  const fallbackExtension = normalizeStyleOutputExtension(styleOutputExtension)
  if (!fallbackExtension && !SOURCE_STYLE_OUTPUT_EXT_RE.test(cleanFile)) {
    return cleanFile
  }
  return cleanFile.replace(CSS_SOURCE_OUTPUT_EXT_RE, fallbackExtension ?? FALLBACK_STYLE_OUTPUT_EXTENSION)
}

export function resolveViteCssPipelineOutputFileFromSourceFile(
  sourceFile: string,
  opts: Pick<InternalUserDefinedOptions, 'cssMatcher' | 'platform'>,
  rootDir: string,
  isWebGeneratorTarget = false,
  preserveCssExtension = false,
  sourceRoot?: string | undefined,
  styleOutputExtension?: string | undefined,
  styleOutputFiles?: Iterable<string> | undefined,
) {
  const sourceStyleRequest = isCSSRequest(sourceFile)
  const normalizedFile = resolveReplayCssOutputFileFromSourceRoot(rootDir, sourceFile, sourceRoot)
  const cleanFile = normalizedFile.replace(/[?#].*$/, '')
  const sourceExtension = path.extname(cleanFile)
  if (
    sourceStyleRequest
    && !isWebGeneratorTarget
    && !preserveCssExtension
    && sourceExtension.length > 0
    && !CSS_SOURCE_OUTPUT_EXT_RE.test(cleanFile)
  ) {
    const stem = cleanFile.slice(0, -sourceExtension.length)
    return resolveStyleOutputFileFromFiles(styleOutputFiles, opts.cssMatcher, stem)
      ?? `${stem}${resolveMiniProgramStyleOutputExtension({
        cssMatcher: opts.cssMatcher,
        fallback: styleOutputExtension,
        files: styleOutputFiles,
        stem,
      })}`
  }
  if (
    isWebGeneratorTarget
    || preserveCssExtension
    || !CSS_SOURCE_OUTPUT_EXT_RE.test(cleanFile)
    || !sourceStyleRequest
  ) {
    return cleanFile
  }
  const stem = cleanFile.replace(CSS_SOURCE_OUTPUT_EXT_RE, '')
  const matchedStyleFile = resolveStyleOutputFileFromFiles(styleOutputFiles, opts.cssMatcher, stem)
  if (matchedStyleFile) {
    return matchedStyleFile
  }
  const styleExtension = resolveStyleOutputExtensionFromFiles(styleOutputFiles, opts.cssMatcher, stem)
    ?? resolveMiniProgramStyleOutputExtension({
      cssMatcher: opts.cssMatcher,
      fallback: styleOutputExtension,
      files: styleOutputFiles,
      stem,
    })
    ?? normalizeStyleOutputExtension(styleOutputExtension)
  return cleanFile.replace(CSS_SOURCE_OUTPUT_EXT_RE, styleExtension)
}

export function canProcessViteSourceStyleAsCss(source: string, file: string) {
  return canProcessSourceStyleAsCss(source, file)
}

export function normalizeCssSourceForCompare(css: string) {
  return css.trim()
}

export function stripStyleFileExtension(file: string) {
  const normalized = file.replace(/[?#].*$/, '')
  const ext = path.extname(normalized)
  return ext ? normalized.slice(0, -ext.length) : normalized
}
