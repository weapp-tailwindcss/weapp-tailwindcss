import { existsSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { stripStyleFileExtension } from '../css-output'
import { slash } from '../utils'

function resolveStyleMatchingRealPath(value: string) {
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

export function isMatchingCssSourceFile(
  outputFile: string,
  cssSourceFile: string,
  outputRoot: string,
) {
  const normalizedOutput = stripStyleFileExtension(path.resolve(outputRoot, outputFile))
  const normalizedSource = stripStyleFileExtension(path.resolve(cssSourceFile))
  return normalizedOutput === normalizedSource
}

export function collectStyleFileMatchBases(file: string, roots: Array<string | undefined>) {
  const normalizedFile = file.replace(/[?#].*$/, '')
  const bases = new Set<string>()
  const addBase = (candidate: string) => {
    const base = slash(stripStyleFileExtension(candidate))
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
      const relative = path.relative(resolveStyleMatchingRealPath(root), resolveStyleMatchingRealPath(normalizedFile))
      if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
        addBase(relative)
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

export function collectParentDirectories(file: string) {
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

export function hasMatchingStyleFileBase(outputFile: string, sourceFile: string, outputRoot: string, sourceRoot: string | undefined) {
  return scoreMatchingStyleFileBase(outputFile, sourceFile, outputRoot, sourceRoot) > 0
}

export function scoreMatchingStyleFileBase(outputFile: string, sourceFile: string, outputRoot: string, sourceRoot: string | undefined) {
  const outputBases = collectStyleFileMatchBases(outputFile, [outputRoot])
  const sourceBases = collectStyleFileMatchBases(sourceFile, [
    sourceRoot,
    ...collectParentDirectories(sourceFile),
  ])
  let bestScore = 0
  const hasDirectorySegment = (value: string) => slash(value).includes('/')
  for (const outputBase of outputBases) {
    for (const sourceBase of sourceBases) {
      if (outputBase === sourceBase) {
        bestScore = Math.max(bestScore, 100000 + outputBase.length)
      }
      else if (hasDirectorySegment(sourceBase) && outputBase.endsWith(`/${sourceBase}`)) {
        bestScore = Math.max(bestScore, 50000 + sourceBase.length)
      }
      else if (hasDirectorySegment(outputBase) && sourceBase.endsWith(`/${outputBase}`)) {
        bestScore = Math.max(bestScore, 1000 + outputBase.length)
      }
    }
  }
  return bestScore
}
