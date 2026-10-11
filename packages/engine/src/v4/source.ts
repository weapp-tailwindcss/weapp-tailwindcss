import type { TailwindV4CssSource, TailwindV4ResolvedSource, TailwindV4SourceOptions } from './types.ts'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

function resolveBase(value: string | undefined, fallback: string) {
  return value === undefined
    ? fallback
    : path.isAbsolute(value)
      ? path.resolve(value)
      : path.resolve(fallback, value)
}

function uniquePaths(values: Iterable<string | undefined>) {
  const result: string[] = []
  for (const value of values) {
    if (!value) {
      continue
    }
    const resolved = path.resolve(value)
    if (!result.includes(resolved)) {
      result.push(resolved)
    }
  }
  return result
}

function toCssImportPath(value: string) {
  return value.replaceAll('\\', '/')
}

function quoteCssImport(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

function isPostcssPluginSpecifier(packageName: string) {
  return packageName === '@tailwindcss/postcss'
    || /(?:^|[/\\])@tailwindcss[/\\]postcss(?:[/\\]|$)/.test(packageName)
    || /(?:^|[/\\])postcss(?:[/\\]|$)/i.test(packageName)
    || /postcss\.config\.[cm]?[jt]s$/i.test(packageName)
}

function createDefaultCss(packageName: string | undefined) {
  const cssPackageName = packageName && !isPostcssPluginSpecifier(packageName)
    ? packageName
    : 'tailwindcss'
  return `@import "${quoteCssImport(toCssImportPath(cssPackageName))}";`
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath)
    return true
  }
  catch {
    return false
  }
}

async function resolveCssEntries(entries: string[], projectRoot: string, base: string | undefined) {
  const resolvedEntries = entries.map(entry => ({
    original: entry,
    absolute: path.isAbsolute(entry) ? path.resolve(entry) : path.resolve(projectRoot, entry),
  }))
  const resolvedBase = base ?? path.dirname(resolvedEntries[0]?.absolute ?? projectRoot)
  const dependencies = resolvedEntries.map(entry => entry.absolute)
  const cssParts: string[] = []

  for (const entry of resolvedEntries) {
    if (await pathExists(entry.absolute)) {
      cssParts.push(await fs.readFile(entry.absolute, 'utf8'))
      continue
    }

    const importPath = path.isAbsolute(entry.original)
      ? entry.absolute
      : path.relative(resolvedBase, entry.absolute)
    cssParts.push(`@import "${quoteCssImport(toCssImportPath(importPath))}";`)
  }

  return {
    base: resolvedBase,
    css: cssParts.join('\n'),
    dependencies,
  }
}

function resolveCssSources(sources: TailwindV4CssSource[], projectRoot: string, base: string | undefined) {
  const resolvedSources = sources.map(source => ({
    ...source,
    base: source.base === undefined ? undefined : resolveBase(source.base, projectRoot),
    file: source.file === undefined
      ? undefined
      : path.isAbsolute(source.file)
        ? path.resolve(source.file)
        : path.resolve(projectRoot, source.file),
    dependencies: source.dependencies?.map(dependency =>
      path.isAbsolute(dependency) ? path.resolve(dependency) : path.resolve(projectRoot, dependency),
    ) ?? [],
  }))
  const firstSource = resolvedSources[0]
  const resolvedBase = base
    ?? firstSource?.base
    ?? (firstSource?.file ? path.dirname(firstSource.file) : projectRoot)
  const dependencies = resolvedSources.flatMap(source => [
    source.file,
    ...source.dependencies,
  ]).filter((dependency): dependency is string => Boolean(dependency))

  return {
    base: resolvedBase,
    css: resolvedSources.map(source => source.css).join('\n'),
    dependencies,
  }
}

function normalizeResolvedSource(
  source: {
    projectRoot: string
    cwd: string
    base: string
    baseFallbacks: string[]
    css: string
    dependencies: string[]
  },
): TailwindV4ResolvedSource {
  const baseFallbacks = uniquePaths([
    ...source.baseFallbacks,
    source.projectRoot,
    source.cwd,
  ]).filter(base => base !== source.base)

  return {
    projectRoot: source.projectRoot,
    base: source.base,
    baseFallbacks,
    css: source.css,
    dependencies: Array.from(new Set(source.dependencies.map(dependency => path.resolve(dependency)))),
  }
}

export async function resolveTailwindV4Source(options: TailwindV4SourceOptions = {}): Promise<TailwindV4ResolvedSource> {
  const projectRoot = resolveBase(options.projectRoot, process.cwd())
  const cwd = resolveBase(options.cwd, projectRoot)
  const configuredBase = options.base === undefined ? undefined : resolveBase(options.base, projectRoot)
  const baseFallbacks = uniquePaths(options.baseFallbacks?.map(base => resolveBase(base, projectRoot)) ?? [])

  if (options.css !== undefined) {
    return normalizeResolvedSource({
      projectRoot,
      cwd,
      base: configuredBase ?? cwd,
      baseFallbacks,
      css: options.css,
      dependencies: [],
    })
  }

  if (options.cssEntries?.length || options.cssSources?.length) {
    const entries = options.cssEntries?.length
      ? await resolveCssEntries(options.cssEntries, projectRoot, configuredBase)
      : undefined
    const sources = options.cssSources?.length
      ? resolveCssSources(options.cssSources, projectRoot, configuredBase)
      : undefined
    const css = [
      entries?.css,
      sources?.css,
    ].filter(Boolean).join('\n')
    return normalizeResolvedSource({
      projectRoot,
      cwd,
      base: configuredBase ?? entries?.base ?? sources?.base ?? cwd,
      baseFallbacks,
      css,
      dependencies: [
        ...(entries?.dependencies ?? []),
        ...(sources?.dependencies ?? []),
      ],
    })
  }

  return normalizeResolvedSource({
    projectRoot,
    cwd,
    base: configuredBase ?? cwd,
    baseFallbacks,
    css: createDefaultCss(options.packageName),
    dependencies: [],
  })
}
