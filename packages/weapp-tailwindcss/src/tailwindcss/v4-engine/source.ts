import type { TailwindV4ResolvedSource, TailwindV4SourceOptions, TailwindV4SourceOptionsWithSources } from './types'
import type { TailwindcssRuntimeLike } from '@/types'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import {
  resolveTailwindV4Source as resolveEngineTailwindV4Source,
} from '@weapp-tailwindcss/engine'
import { collectRpxThemeVariables, normalizeConfigDirective, normalizeEmptyTailwindCustomVariants, normalizeTailwindConfigDirectives, parseCssImportSpecifier, postcss, resolveCssEntrySource, rewriteCssImportSpecifiers } from '@weapp-tailwindcss/postcss/transform'
import { resolveTailwindcssOptions } from '@/tailwindcss/runtime-options'
import { filterTailwindV4CssSourceRoots } from '@/tailwindcss/v4/css-sources'
import { omitUndefined } from '@/utils/object'

const require = createRequire(import.meta.url)

function isCssEntryPoint(file: string | undefined) {
  return typeof file === 'string'
    && path.basename(file) === 'index.css'
    && existsSync(file)
}

function resolvePackageCssEntryPoint(specifier: string) {
  try {
    const resolved = require.resolve(specifier)
    if (isCssEntryPoint(resolved)) {
      return resolved
    }
  }
  catch {
  }

  const packageName = specifier.replace(/\/index\.css$/, '')
  if (packageName !== 'tailwindcss') {
    return undefined
  }

  try {
    const packageJson = require.resolve(`${packageName}/package.json`)
    const cssEntry = path.resolve(path.dirname(packageJson), 'index.css')
    if (isCssEntryPoint(cssEntry)) {
      return cssEntry
    }
  }
  catch {
  }

  try {
    const engineRequire = createRequire(require.resolve('@weapp-tailwindcss/engine'))
    const packageJson = engineRequire.resolve('tailwindcss/package.json')
    const cssEntry = path.resolve(path.dirname(packageJson), 'index.css')
    if (isCssEntryPoint(cssEntry)) {
      return cssEntry
    }
  }
  catch {
  }

  return undefined
}

function isPostcssPluginImportTarget(value: string | undefined) {
  if (!value) {
    return false
  }
  return value === '@tailwindcss/postcss'
    || value.includes('/postcss')
}

function uniqueDefined(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))]
}

function resolveCssImportFile(base: string, specifier: string) {
  const normalizedSpecifier = path.sep === '\\'
    ? specifier.replaceAll('/', '\\')
    : specifier.replaceAll('\\', '/')
  return path.resolve(base, normalizedSpecifier)
}

function getProjectRoot(runtime: TailwindcssRuntimeLike) {
  return runtime.options?.projectRoot ?? process.cwd()
}

function resolveBase(value: string | undefined, fallback: string) {
  return value === undefined
    ? fallback
    : path.isAbsolute(value)
      ? path.resolve(value)
      : path.resolve(fallback, value)
}

function resolveConfigDir(config: string | undefined, projectRoot: string) {
  if (!config) {
    return undefined
  }
  const configPath = path.isAbsolute(config) ? config : path.resolve(projectRoot, config)
  return path.dirname(configPath)
}

function isBarePackageSpecifier(specifier: string) {
  return !specifier.startsWith('.')
    && !specifier.startsWith('/')
    && !specifier.startsWith('#')
    && !specifier.includes('\\')
    && !/^[a-z][a-z\d+.-]*:/i.test(specifier)
}

function isPackageJsonImportSpecifier(specifier: string | undefined) {
  return typeof specifier === 'string' && specifier.startsWith('#')
}

function createTailwindV4CssImportSpecifierSet(packageName: string | undefined) {
  const specifiers = new Set(['tailwindcss'])
  if (packageName && isBarePackageSpecifier(packageName)) {
    specifiers.add(packageName)
  }
  return specifiers
}

function normalizeTailwindV4CssPackageImports(css: string, packageName: string | undefined) {
  if (!css.includes('tailwindcss')) {
    return css
  }

  const importSpecifiers = createTailwindV4CssImportSpecifierSet(packageName)
  return rewriteCssImportSpecifiers(css, (specifier) => {
    return importSpecifiers.has(specifier) ? resolvePackageCssEntryPoint(`${specifier}/index.css`) : undefined
  }, { atRuleNames: ['import', 'reference'], tolerateInvalidCss: true })
}

function normalizeTailwindV4CssSources(
  cssSources: TailwindV4SourceOptions['cssSources'],
  packageName: string | undefined,
  projectRoot: string | undefined,
) {
  if (!cssSources?.length) {
    return cssSources
  }

  let changed = false
  const normalizedCssSources = cssSources.map((cssSource) => {
    const file = typeof cssSource.file === 'string' && cssSource.file.length > 0
      ? path.isAbsolute(cssSource.file)
        ? path.resolve(cssSource.file)
        : path.resolve(projectRoot ?? process.cwd(), cssSource.file)
      : undefined
    const base = typeof cssSource.base === 'string' && cssSource.base.length > 0
      ? path.isAbsolute(cssSource.base)
        ? path.resolve(cssSource.base)
        : path.resolve(projectRoot ?? process.cwd(), cssSource.base)
      : file
        ? path.dirname(file)
        : undefined
    if (typeof cssSource.css !== 'string') {
      if (file === cssSource.file && base === cssSource.base) {
        return cssSource
      }
      changed = true
      return {
        ...cssSource,
        ...(base === undefined ? {} : { base }),
        ...(file === undefined ? {} : { file }),
      }
    }
    const configBase = base ?? projectRoot ?? process.cwd()
    const css = normalizeTailwindV4CssPackageImports(
      normalizeEmptyTailwindCustomVariants(normalizeTailwindConfigDirectives(cssSource.css, configBase)),
      packageName,
    )
    if (css === cssSource.css && file === cssSource.file && base === cssSource.base) {
      return cssSource
    }
    changed = true
    return {
      ...cssSource,
      css,
      ...(base === undefined ? {} : { base }),
      ...(file === undefined ? {} : { file }),
    }
  })

  return changed ? normalizedCssSources : cssSources
}

function normalizeTailwindV4CssEntrySources(
  cssEntries: TailwindV4SourceOptions['cssEntries'],
  packageName: string | undefined,
) {
  if (!cssEntries?.length) {
    return undefined
  }

  const remainingCssEntries: string[] = []
  const cssSources: NonNullable<TailwindV4SourceOptions['cssSources']> = []
  const graphs = new Map<string, Set<string>>()
  const themeVariables = new Map<string, string[]>()
  const collectCssGraph = (file: string, visiting = new Set<string>()): Set<string> => {
    const normalizedFile = path.resolve(file)
    const cached = graphs.get(normalizedFile)
    if (cached) {
      return cached
    }
    const graph = new Set<string>([normalizedFile])
    graphs.set(normalizedFile, graph)
    if (visiting.has(normalizedFile) || !existsSync(normalizedFile)) {
      return graph
    }
    const nextVisiting = new Set(visiting).add(normalizedFile)
    let root: postcss.Root
    try {
      root = postcss.parse(readFileSync(normalizedFile, 'utf8'))
    }
    catch {
      return graph
    }
    themeVariables.set(normalizedFile, collectRpxThemeVariables(root))
    const base = path.dirname(normalizedFile)
    root.walkAtRules('import', (rule) => {
      const parsed = parseCssImportSpecifier(rule.params)
      if (!parsed || !parsed.specifier.startsWith('.')) {
        return
      }
      const importedFile = resolveCssImportFile(base, parsed.specifier)
      const candidates = path.extname(importedFile)
        ? [importedFile]
        : [importedFile, `${importedFile}.css`, `${importedFile}.pcss`, `${importedFile}.scss`, `${importedFile}.sass`]
      const resolved = candidates.find(candidate => existsSync(candidate))
      if (!resolved) {
        return
      }
      for (const dependency of collectCssGraph(resolved, nextVisiting)) {
        graph.add(dependency)
      }
    })
    return graph
  }
  const createCssSource = (file: string, dependencies: Set<string>) => {
    const normalizedFile = path.resolve(file)
    const base = path.dirname(normalizedFile)
    const rawCss = readFileSync(normalizedFile, 'utf8')
    const entrySource = resolveCssEntrySource(rawCss, base, {
      removeConfig: false,
    })
    const config = entrySource?.config && existsSync(entrySource.config)
      ? entrySource.config
      : entrySource?.configRequest && !path.isAbsolute(entrySource.configRequest) && !isPackageJsonImportSpecifier(entrySource.configRequest)
        ? path.resolve(base, entrySource.configRequest)
        : entrySource?.config
    const css = normalizeTailwindV4CssPackageImports(
      normalizeEmptyTailwindCustomVariants(normalizeConfigDirective(rawCss, config)),
      packageName,
    )
    return {
      file: normalizedFile,
      base,
      css,
      dependencies: [...dependencies],
      rpxThemeVariables: [...new Set([...dependencies].flatMap(dependency => themeVariables.get(dependency) ?? []))],
    }
  }
  const rootEntries: string[] = []
  for (const cssEntry of cssEntries) {
    const normalizedCssEntry = cssEntry.replace(/[?#].*$/, '')
    const file = path.resolve(normalizedCssEntry)
    if (!existsSync(file)) {
      remainingCssEntries.push(normalizedCssEntry)
      continue
    }
    rootEntries.push(file)
  }

  const entryGraphs = rootEntries.map(entry => [entry, collectCssGraph(entry)] as const)
  const nestedEntries = new Set<string>()
  for (const [entry] of entryGraphs) {
    for (const [otherEntry, otherGraph] of entryGraphs) {
      if (entry !== otherEntry && otherGraph.has(entry)) {
        nestedEntries.add(entry)
        break
      }
    }
  }
  const selectedEntries = entryGraphs.filter(([entry]) => !nestedEntries.has(entry))
  const roots = selectedEntries.length > 0
    ? selectedEntries
    : entryGraphs.slice(0, 1)
  for (const [rootEntry, dependencies] of roots) {
    cssSources.push(createCssSource(rootEntry, dependencies))
  }

  return {
    cssEntries: remainingCssEntries,
    cssSources,
  }
}

export function normalizeTailwindV4SourceOptions(options: TailwindV4SourceOptions | undefined) {
  if (!options) {
    return options
  }

  const cssBase = resolveBase(options.base, options.projectRoot ?? options.cwd ?? process.cwd())
  const css = options.css === undefined
    ? undefined
    : normalizeTailwindV4CssPackageImports(
        normalizeEmptyTailwindCustomVariants(normalizeTailwindConfigDirectives(options.css, cssBase)),
        options.packageName,
      )
  const entrySources = normalizeTailwindV4CssEntrySources(options.cssEntries, options.packageName)
  const configuredCssSources = filterTailwindV4CssSourceRoots(options.cssSources)
  const combinedCssSources = configuredCssSources || entrySources?.cssSources
    ? [
        ...(configuredCssSources ?? []),
        ...(entrySources?.cssSources ?? []),
      ]
    : undefined
  const cssSources = normalizeTailwindV4CssSources(
    combinedCssSources,
    options.packageName,
    options.projectRoot,
  )
  const cssEntries = entrySources?.cssEntries ?? options.cssEntries
  if (css === options.css && cssSources === options.cssSources && cssEntries === options.cssEntries) {
    return options
  }

  return {
    ...options,
    ...(css === undefined ? {} : { css }),
    ...(cssEntries === undefined ? {} : { cssEntries }),
    ...(cssSources === undefined ? {} : { cssSources }),
  }
}

function resolveTailwindCssImportTarget(runtime: TailwindcssRuntimeLike) {
  const tailwindOptions = resolveTailwindcssOptions(runtime.options)
  const configuredPackageName = tailwindOptions?.packageName
  if (
    typeof configuredPackageName === 'string'
    && configuredPackageName.length > 0
    && !isPostcssPluginImportTarget(configuredPackageName)
  ) {
    return configuredPackageName
  }

  const packageName = runtime.packageInfo?.name
  if (
    typeof packageName === 'string'
    && packageName.length > 0
    && !isPostcssPluginImportTarget(packageName)
  ) {
    return packageName
  }

  return 'tailwindcss'
}

function readTailwindV4Options(runtime: TailwindcssRuntimeLike) {
  const tailwindOptions = resolveTailwindcssOptions(runtime.options)
  return tailwindOptions?.v4 ?? (runtime.options as any)?.tailwind?.v4
}

function isRawTailwindcssPatchOptions(options: TailwindcssRuntimeLike['options']) {
  return Boolean(options && 'tailwindcss' in options)
}

function resolveEngineTailwindV4SourceOptions(runtime: TailwindcssRuntimeLike): TailwindV4SourceOptions {
  if (runtime.options) {
    const projectRoot = getProjectRoot(runtime)
    const tailwindOptions = resolveTailwindcssOptions(runtime.options)
    const tailwindV4Options = readTailwindV4Options(runtime)
    const cwd = resolveBase(tailwindOptions?.cwd, projectRoot)
    const configuredBase = (tailwindV4Options as { configuredBase?: string } | undefined)?.configuredBase
      ?? (isRawTailwindcssPatchOptions(runtime.options) ? tailwindV4Options?.base : undefined)
    const configDir = resolveConfigDir(tailwindOptions?.config, projectRoot)
    const baseFallbacks = uniqueDefined([
      configuredBase,
      cwd,
      projectRoot,
      configDir,
    ])
    return {
      projectRoot,
      cwd,
      ...(configuredBase === undefined ? {} : { base: configuredBase }),
      baseFallbacks,
      ...(tailwindV4Options?.cssSources === undefined ? {} : { cssSources: tailwindV4Options.cssSources }),
      ...(tailwindV4Options?.cssEntries === undefined ? {} : { cssEntries: tailwindV4Options.cssEntries }),
      packageName: resolveTailwindCssImportTarget(runtime),
    }
  }

  return {
    projectRoot: getProjectRoot(runtime),
    packageName: resolveTailwindCssImportTarget(runtime),
  }
}

export function resolveTailwindV4SourceOptionsFromRuntime(
  runtime: TailwindcssRuntimeLike,
): TailwindV4SourceOptionsWithSources {
  const tailwindV4Options = readTailwindV4Options(runtime)
  return normalizeTailwindV4SourceOptions(omitUndefined({
    ...resolveEngineTailwindV4SourceOptions(runtime),
    sources: tailwindV4Options?.sources,
  }) as TailwindV4SourceOptionsWithSources) as TailwindV4SourceOptionsWithSources
}

export async function resolveTailwindV4Source(options?: TailwindV4SourceOptions): Promise<TailwindV4ResolvedSource> {
  const normalizedOptions = normalizeTailwindV4SourceOptions(options)
  const source = await resolveEngineTailwindV4Source(normalizedOptions) as TailwindV4ResolvedSource
  const variables = normalizedOptions?.cssSources?.flatMap(cssSource =>
    (cssSource as { rpxThemeVariables?: string[] }).rpxThemeVariables ?? [],
  ) ?? []
  if (variables.length) {
    source.rpxThemeVariables = [...new Set(variables)]
  }
  return source
}

export function resolveTailwindV4SourceFromRuntimeOptions(options?: {
  projectRoot?: string
  tailwindcss?: {
    cwd?: string
    packageName?: string
    config?: string
    v4?: TailwindV4SourceOptions
  }
}) {
  const projectRoot = options?.projectRoot ?? process.cwd()
  const tailwindOptions = options?.tailwindcss
  const v4Options = tailwindOptions?.v4
  return resolveTailwindV4Source({
    projectRoot,
    cwd: resolveBase(tailwindOptions?.cwd, projectRoot),
    packageName: tailwindOptions?.packageName ?? 'tailwindcss',
    ...(v4Options ?? {}),
  })
}

export async function resolveTailwindV4SourceFromRuntime(
  runtime: TailwindcssRuntimeLike,
) {
  return resolveTailwindV4Source(resolveTailwindV4SourceOptionsFromRuntime(runtime))
}
