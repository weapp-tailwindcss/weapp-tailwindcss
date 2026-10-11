import type { SourceStyleMatchOptions } from './types'
import path from 'node:path'
import {
  stripGeneratorPlaceholderMarkers,
  stripTailwindBanners,
} from '../markers'

export function normalizeCssSourceForCompare(css: string) {
  return stripGeneratorPlaceholderMarkers(stripTailwindBanners(css)).trim()
}

function getOutputFileWithoutExtension(file: string) {
  const normalized = file.replace(/[?#].*$/, '')
  const ext = path.extname(normalized)
  return ext ? normalized.slice(0, -ext.length) : normalized
}

function normalizeMatchPath(file: string) {
  return file.split(path.sep).join('/')
}

function stripBundlerContentHash(name: string) {
  return name.replace(/[._-]?[a-f0-9]{6,32}$/i, '')
}

function getMatchBasename(file: string) {
  return stripBundlerContentHash(path.basename(getOutputFileWithoutExtension(file.replace(/[?#].*$/, ''))))
}

function getMatchDirname(file: string) {
  const normalized = normalizeMatchPath(file)
  const dirname = path.posix.dirname(normalized)
  return dirname === '.' ? '' : dirname
}

function isPathWithinRoot(file: string, root: string) {
  const relative = path.relative(root, file)
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function collectParentDirectories(file: string) {
  const directories: string[] = []
  let current = path.dirname(path.resolve(file.replace(/[?#].*$/, '')))
  while (true) {
    directories.push(current)
    const parent = path.dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }
  return directories
}

function collectCssSourceMatchBases(
  file: string,
  roots: Array<string | undefined>,
) {
  const normalizedFile = file.replace(/[?#].*$/, '')
  const bases = new Set<string>()
  const addBase = (candidate: string) => {
    const base = normalizeMatchPath(getOutputFileWithoutExtension(candidate))
    if (base.length > 0) {
      bases.add(base)
    }
  }
  addBase(normalizedFile)

  const resolvedRoots = roots
    .filter((root): root is string => typeof root === 'string' && root.length > 0)
    .map(root => path.resolve(root))
  if (path.isAbsolute(normalizedFile)) {
    for (const root of resolvedRoots) {
      if (isPathWithinRoot(normalizedFile, root)) {
        addBase(path.relative(root, normalizedFile))
      }
    }
  }
  else {
    for (const root of resolvedRoots) {
      addBase(path.resolve(root, normalizedFile))
    }
  }
  return bases
}

export function scoreTailwindV4CssSourceFileMatch(
  file: string,
  cssSourceFile: string,
  sourceOptions: SourceStyleMatchOptions,
) {
  const outputBases = collectCssSourceMatchBases(file, [
    sourceOptions.outputRoot,
    sourceOptions.projectRoot,
    sourceOptions.cwd,
  ])
  const sourceBases = collectCssSourceMatchBases(cssSourceFile, [
    sourceOptions.projectRoot,
    sourceOptions.cwd,
  ])
  const sourceDirectoryIndexBases = collectCssSourceMatchBases(cssSourceFile, collectParentDirectories(cssSourceFile))
  const outputBasename = getMatchBasename(file)
  const sourceBasename = getMatchBasename(cssSourceFile)
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
      else if (
        getMatchBasename(sourceBase) === 'index'
        && getMatchDirname(sourceBase).length > 0
        && outputBase.startsWith(`${getMatchDirname(sourceBase)}/`)
      ) {
        bestScore = Math.max(bestScore, 25000 + getMatchDirname(sourceBase).length)
      }
    }
    for (const sourceBase of sourceDirectoryIndexBases) {
      if (
        getMatchBasename(sourceBase) === 'index'
        && getMatchDirname(sourceBase).length > 0
        && outputBase.startsWith(`${getMatchDirname(sourceBase)}/`)
      ) {
        bestScore = Math.max(bestScore, 25000 + getMatchDirname(sourceBase).length)
      }
    }
  }
  if (outputBasename && outputBasename === sourceBasename && outputBasename !== 'index') {
    bestScore = Math.max(bestScore, 100 + outputBasename.length)
  }
  return bestScore
}
