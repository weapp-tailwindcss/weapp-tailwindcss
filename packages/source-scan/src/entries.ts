import type { TailwindSourceEntry } from './types'
import { stat } from 'node:fs/promises'
import nodePath from 'node:path'
import { sourcePathApi } from './paths'
import { createSourceScanPattern } from './patterns'

interface LegacyContentObject {
  files?: LegacyContentConfig
  relative?: boolean
}

type LegacyContentConfig
  = | string
    | string[]
    | LegacyContentObject
    | Array<string | LegacyContentObject>

function isLegacyContentObject(value: unknown): value is LegacyContentObject {
  return typeof value === 'object' && value !== null && 'files' in value
}

export function normalizeGlobPattern(pattern: string) {
  return pattern.startsWith('./') ? pattern.slice(2) : pattern
}

function hasGlobMagic(value: string) {
  return /[*?[\]{}()!+@]/.test(value)
}

function splitStaticGlobPrefix(pattern: string, windows: boolean) {
  const normalized = normalizeGlobPattern(pattern)
  const segments = windows ? normalized.split(/[\\/]+/) : normalized.split('/')
  const prefix: string[] = []
  const rest: string[] = []
  let reachedGlob = false
  for (const segment of segments) {
    if (!reachedGlob && segment && !hasGlobMagic(segment)) {
      prefix.push(segment)
      continue
    }
    reachedGlob = true
    rest.push(segment)
  }
  return {
    prefix,
    rest,
  }
}

export function normalizeLegacyContentEntries(
  content: unknown,
  base: string,
  options: { relativeBase?: string | undefined } = {},
): TailwindSourceEntry[] {
  if (typeof content === 'string') {
    const negated = content.startsWith('!')
    return [{
      base,
      negated,
      pattern: normalizeGlobPattern(negated ? content.slice(1) : content),
    }]
  }
  if (Array.isArray(content)) {
    return content.flatMap(item => normalizeLegacyContentEntries(item, base, options))
  }
  if (isLegacyContentObject(content)) {
    return normalizeLegacyContentEntries(content.files, content.relative && options.relativeBase ? options.relativeBase : base, options)
  }
  return []
}

async function pathExistsAsDirectory(file: string) {
  try {
    return (await stat(file)).isDirectory()
  }
  catch {
    return false
  }
}

export async function resolveTailwindSourceEntry(
  sourcePath: string,
  base: string,
  negated: boolean,
  defaultPattern = createSourceScanPattern(),
): Promise<TailwindSourceEntry> {
  const path = sourcePathApi(sourcePath, base)
  const windows = path === nodePath.win32
  const absoluteSource = path.isAbsolute(sourcePath) ? path.resolve(sourcePath) : path.resolve(base, sourcePath)
  if (await pathExistsAsDirectory(absoluteSource)) {
    return {
      base: absoluteSource,
      negated,
      pattern: normalizeGlobPattern(defaultPattern),
    }
  }

  if (path.isAbsolute(sourcePath) && hasGlobMagic(sourcePath)) {
    const root = path.parse(sourcePath).root
    const { prefix, rest } = splitStaticGlobPrefix(path.relative(root, sourcePath), windows)
    const normalizedPrefix = prefix[0] === '' ? prefix.slice(1) : prefix
    if (rest.length > 0) {
      return {
        base: path.resolve(root, ...normalizedPrefix),
        negated,
        pattern: normalizeGlobPattern(rest.join('/')),
      }
    }
  }

  if (path.isAbsolute(sourcePath)) {
    return {
      base: path.dirname(absoluteSource),
      negated,
      pattern: normalizeGlobPattern(path.basename(absoluteSource)),
    }
  }

  const { prefix, rest } = splitStaticGlobPrefix(sourcePath, windows)
  if (prefix.length > 0 && rest.length > 0) {
    return {
      base: path.resolve(base, ...prefix),
      negated,
      pattern: normalizeGlobPattern(rest.join('/')),
    }
  }

  return {
    base,
    negated,
    pattern: normalizeGlobPattern(sourcePath),
  }
}
