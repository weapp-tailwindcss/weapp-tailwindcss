import type { TailwindV4CssSource } from '@weapp-tailwindcss/engine'
import type { UserDefinedOptions } from '@/types'
import path from 'node:path'
import { omitUndefined } from '@/utils/object'
import { isTailwindV4CssEntry } from './css-entries'

function hasCssEntriesValue(value: unknown) {
  if (typeof value === 'string') {
    return isTailwindV4CssEntry(value)
  }
  return Array.isArray(value) && value.some(isTailwindV4CssEntry)
}

export function hasCssSourcesValue(value: unknown) {
  return Array.isArray(value) && value.some((source) => {
    const file = (source as { file?: unknown } | null)?.file
    return typeof source === 'object'
      && source !== null
      && typeof file === 'string'
      && isTailwindV4CssEntry(file)
      && typeof (source as { css?: unknown }).css === 'string'
      && (source as { css: string }).css.trim().length > 0
  })
}

export function isTailwindV4CssSourceRoot(source: unknown): source is TailwindV4CssSource {
  return typeof source === 'object'
    && source !== null
    && typeof (source as { file?: unknown }).file === 'string'
    && isTailwindV4CssEntry((source as { file: string }).file)
}

export function filterTailwindV4CssSourceRoots(
  sources: TailwindV4CssSource[] | undefined,
) {
  const filtered = sources?.filter(isTailwindV4CssSourceRoot)
  return filtered && filtered.length > 0 ? filtered : undefined
}

export function hasConfiguredTailwindV4CssRoots(
  options: Pick<UserDefinedOptions, 'cssEntries' | 'tailwindcss' | 'tailwindcssRuntimeOptions'>,
) {
  return hasCssEntriesValue(options.cssEntries)
    || hasCssEntriesValue(options.tailwindcss?.v4?.cssEntries)
    || hasCssEntriesValue((options.tailwindcssRuntimeOptions as any)?.tailwindcss?.v4?.cssEntries)
    || hasCssSourcesValue(options.tailwindcss?.v4?.cssSources)
    || hasCssSourcesValue((options.tailwindcssRuntimeOptions as any)?.tailwindcss?.v4?.cssSources)
}

function normalizeCssSourceFile(file: string | undefined) {
  if (!file) {
    return undefined
  }
  return path.isAbsolute(file) ? path.normalize(file) : file
}

function normalizeCssSourceBase(base: string | undefined) {
  if (!base) {
    return undefined
  }
  return path.resolve(base)
}

function normalizeDependencies(dependencies: string[] | undefined) {
  return dependencies
    ?.map(normalizeCssSourceFile)
    .filter((dependency): dependency is string => typeof dependency === 'string' && dependency.length > 0)
}

function isSameCssSource(a: TailwindV4CssSource, b: TailwindV4CssSource) {
  return a.css === b.css
    && normalizeCssSourceBase(a.base) === normalizeCssSourceBase(b.base)
    && normalizeCssSourceFile(a.file) === normalizeCssSourceFile(b.file)
    && JSON.stringify(normalizeDependencies(a.dependencies)) === JSON.stringify(normalizeDependencies(b.dependencies))
}

export function upsertTailwindV4CssSource(
  opts: UserDefinedOptions,
  source: TailwindV4CssSource,
) {
  if (!isTailwindV4CssEntry(source.file)) {
    return false
  }
  const normalizedSource: TailwindV4CssSource = omitUndefined({
    ...source,
    ...(source.base === undefined ? {} : { base: normalizeCssSourceBase(source.base) }),
    ...(source.file === undefined ? {} : { file: normalizeCssSourceFile(source.file) }),
    ...(source.dependencies === undefined ? {} : { dependencies: normalizeDependencies(source.dependencies) }),
  }) as TailwindV4CssSource
  const tailwindcss = opts.tailwindcss ?? {}
  const v4 = tailwindcss.v4 ?? {}
  const cssSources = [...(v4.cssSources ?? [])]
  const sourceFile = normalizeCssSourceFile(normalizedSource.file)
  const existingIndex = cssSources.findIndex(candidate => normalizeCssSourceFile(candidate.file) === sourceFile)
  if (existingIndex >= 0) {
    const existing = cssSources[existingIndex]
    if (!existing) {
      cssSources[existingIndex] = normalizedSource
      return true
    }
    const nextSource = {
      ...existing,
      ...normalizedSource,
    }
    if (isSameCssSource(existing, nextSource)) {
      return false
    }
    cssSources[existingIndex] = nextSource
  }
  else {
    cssSources.push(normalizedSource)
  }
  opts.tailwindcss = {
    ...tailwindcss,
    v4: {
      ...v4,
      cssSources,
    },
  }
  return true
}

export function removeTailwindV4CssSource(
  opts: UserDefinedOptions,
  file: string,
) {
  const tailwindcss = opts.tailwindcss
  const v4 = tailwindcss?.v4
  const cssSources = v4?.cssSources
  if (!cssSources || cssSources.length === 0) {
    return false
  }
  const sourceFile = normalizeCssSourceFile(file)
  const nextCssSources = cssSources.filter(
    source => normalizeCssSourceFile(source.file) !== sourceFile,
  )
  if (nextCssSources.length === cssSources.length) {
    return false
  }
  opts.tailwindcss = {
    ...tailwindcss,
    v4: {
      ...v4,
      cssSources: nextCssSources,
    },
  }
  return true
}
