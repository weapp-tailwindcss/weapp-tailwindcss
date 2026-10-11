import type { InternalUserDefinedOptions } from '@/types'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { rewriteCssConfigRequests } from '@weapp-tailwindcss/postcss/transform'
import { resolveTailwindV4CssSourceBase } from '@/tailwindcss/source-scan'
import { normalizeCssSourceForCompare } from '../css-output'
import { slash } from '../utils'
import { collectConfiguredTailwindV4CssSources } from './configured-css-sources'
import { hasMatchingStyleFileBase, isMatchingCssSourceFile } from './style-matching'

function isPackageJsonImportRequest(request: string) {
  return request.startsWith('#')
}

function normalizeMatchedCssSourcePath(file: string | undefined) {
  if (!file || !path.isAbsolute(file)) {
    return undefined
  }
  return path.resolve(file.replace(/[?#].*$/, ''))
}

function collectConfiguredCssEntries(opts: InternalUserDefinedOptions) {
  const runtimeCssEntries = ((opts.tailwindcssRuntimeOptions as any)?.tailwindcss?.v4?.cssEntries ?? []) as string[] | undefined
  return [
    ...(opts.cssEntries ?? []),
    ...(opts.tailwindcss?.v4?.cssEntries ?? []),
    ...(runtimeCssEntries ?? []),
  ].filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
}

function collectCssConfigBaseCandidates(
  source: string,
  file: string,
  outputRoot: string,
  opts: InternalUserDefinedOptions,
) {
  const candidates: string[] = []
  const seen = new Set<string>()
  const addCandidate = (candidate: string | undefined) => {
    if (!candidate) {
      return
    }
    const normalized = path.resolve(candidate)
    if (seen.has(normalized)) {
      return
    }
    seen.add(normalized)
    candidates.push(normalized)
  }

  addCandidate(path.dirname(path.resolve(outputRoot, file.replace(/[?#].*$/, ''))))

  const normalizedSource = normalizeCssSourceForCompare(source)
  const runtimeProjectRoot = typeof opts.tailwindcssRuntimeOptions?.projectRoot === 'string'
    ? opts.tailwindcssRuntimeOptions.projectRoot
    : undefined
  const sourceBaseFallback = opts.tailwindcss?.v4?.base
    ?? runtimeProjectRoot
    ?? opts.tailwindcssBasedir
    ?? outputRoot
  const sourceRoot = opts.tailwindcssBasedir ?? runtimeProjectRoot
  const configuredCssEntries = collectConfiguredCssEntries(opts)
  for (const cssEntry of configuredCssEntries) {
    const resolvedCssEntry = path.resolve(cssEntry)
    if (
      configuredCssEntries.length === 1
      || isMatchingCssSourceFile(file, resolvedCssEntry, outputRoot)
      || hasMatchingStyleFileBase(file, resolvedCssEntry, outputRoot, sourceRoot)
    ) {
      addCandidate(path.dirname(resolvedCssEntry))
    }
  }
  for (const cssSource of collectConfiguredTailwindV4CssSources(opts)) {
    const cssSourceFile = normalizeMatchedCssSourcePath(cssSource.file)
    const cssSourceCss = typeof cssSource.css === 'string'
      ? normalizeCssSourceForCompare(cssSource.css)
      : undefined
    if (
      cssSourceFile
      && !isMatchingCssSourceFile(file, cssSourceFile, outputRoot)
      && cssSourceCss !== normalizedSource
    ) {
      continue
    }
    addCandidate(cssSourceFile ? path.dirname(cssSourceFile) : undefined)
    addCandidate(resolveTailwindV4CssSourceBase(cssSource, sourceBaseFallback))
  }

  return candidates
}

export function normalizeRelativeCssConfigDirectives(
  source: string,
  file: string,
  outputRoot: string,
  opts: InternalUserDefinedOptions,
) {
  if (!source.includes('@config')) {
    return source
  }

  const baseCandidates = collectCssConfigBaseCandidates(source, file, outputRoot, opts)

  return rewriteCssConfigRequests(source, (request) => {
    if (path.isAbsolute(request) || isPackageJsonImportRequest(request)) {
      return undefined
    }

    for (const base of baseCandidates) {
      const configFile = path.resolve(base, request)
      if (existsSync(configFile)) {
        return slash(configFile)
      }
    }

    return undefined
  })
}
