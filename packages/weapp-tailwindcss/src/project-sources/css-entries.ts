import type { TailwindV4CssSource } from '@weapp-tailwindcss/engine'
import type { TailwindV4EntrySourceAnalysis } from '@weapp-tailwindcss/postcss/transform'
import type { TailwindInlineSourceCandidates, TailwindSourceEntry } from '@/tailwindcss/source-scan'
import type { UserDefinedOptions } from '@/types'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { analyzeTailwindV4EntrySource } from '@weapp-tailwindcss/postcss/transform'
import fg from 'fast-glob'
import { LRUCache } from 'lru-cache'
import { loadConfig } from 'tailwindcss-config'
import {
  FULL_SOURCE_SCAN_PATTERN,
  normalizeLegacyContentEntries,
  resolveTailwindSourceEntry,
} from '@/tailwindcss/source-scan'
import { isTailwindV4CssEntry } from '@/tailwindcss/v4/css-entries'
import { filterTailwindV4CssSourceRoots } from '@/tailwindcss/v4/css-sources'
import { readStaticConfigContent } from './static-config-content'

const SOURCE_CANDIDATE_PATTERN = FULL_SOURCE_SCAN_PATTERN
const TAILWIND_CSS_ENTRY_PATTERN = '**/*.css'
const tailwindV4CssEntriesCache = new LRUCache<string, Promise<ResolvedTailwindV4CssEntries | undefined>>({ max: 128 })
const tailwindConfigCssEntriesCache = new LRUCache<string, Promise<ResolvedTailwindV4CssEntries | undefined>>({ max: 128 })

interface ConfigDependencySignature {
  file: string
  mtimeMs: number
  size: number
}

export interface ResolvedTailwindV4CssEntries {
  entries: TailwindSourceEntry[]
  explicit: boolean
  includesPreflight: boolean
  inlineCandidates: TailwindInlineSourceCandidates
  dependencies: string[]
}

function resolveSourceBase(base: string, sourcePath: string) {
  return path.isAbsolute(sourcePath) ? sourcePath : path.resolve(base, sourcePath)
}

function resolveConfigPath(base: string, configPath: string) {
  if (path.isAbsolute(configPath)) {
    return path.resolve(configPath)
  }
  return path.resolve(base, configPath)
}

function createCssEntriesCacheKey(css: string, base: string, dependencies: ConfigDependencySignature[]) {
  return JSON.stringify({
    base: path.resolve(base),
    css,
    dependencies,
  })
}

function createDependencyExcludeEntries(files: Iterable<string>): TailwindSourceEntry[] {
  return [...files].map(file => ({
    base: path.dirname(file),
    negated: true,
    pattern: path.basename(file),
  }))
}

function statConfigDependency(file: string): ConfigDependencySignature {
  try {
    const stats = statSync(file)
    return {
      file,
      mtimeMs: stats.mtimeMs,
      size: stats.size,
    }
  }
  catch {
    return {
      file,
      mtimeMs: -1,
      size: -1,
    }
  }
}

function collectConfigDependencySignatures(requests: string[], base: string) {
  const configPaths = new Set(requests.map(request => resolveConfigPath(base, request)))
  // 元数据检查与同步 CSS 读取保持在同一轮，避免缓存命中仍排队等待构建器 I/O。
  return [...configPaths].sort().map(statConfigDependency)
}

export function mergeTailwindInlineSourceCandidates(
  allInlineCandidates: Array<TailwindInlineSourceCandidates | undefined>,
): TailwindInlineSourceCandidates | undefined {
  const merged: TailwindInlineSourceCandidates = {
    included: new Set(),
    excluded: new Set(),
  }
  for (const inlineCandidates of allInlineCandidates) {
    if (!inlineCandidates) {
      continue
    }
    for (const candidate of inlineCandidates.included) {
      if (!merged.excluded.has(candidate)) {
        merged.included.add(candidate)
      }
    }
    for (const candidate of inlineCandidates.excluded) {
      merged.excluded.add(candidate)
      merged.included.delete(candidate)
    }
  }
  return merged.included.size > 0 || merged.excluded.size > 0
    ? merged
    : undefined
}

async function resolveConfigContentEntries(requests: string[], base: string) {
  const configPaths = new Set(requests.map(request => resolveConfigPath(base, request)))

  const entries: TailwindSourceEntry[] = []
  for (const configPath of configPaths) {
    const staticContent = readStaticConfigContent(configPath)
    if (staticContent !== undefined) {
      entries.push(...normalizeLegacyContentEntries(staticContent, path.dirname(configPath), {
        relativeBase: path.dirname(configPath),
      }))
      continue
    }
    try {
      const loaded = await loadConfig({
        config: configPath,
        cwd: path.dirname(configPath),
      })
      entries.push(...normalizeLegacyContentEntries(loaded?.config.content, path.dirname(configPath), {
        relativeBase: path.dirname(configPath),
      }))
    }
    catch {
      // 依赖收集只负责补充 watch 签名，配置有效性由 Tailwind 生成阶段校验。
    }
  }

  return {
    dependencies: [...configPaths],
    entries,
  }
}

export async function resolveTailwindV4EntriesFromCss(css: string, base: string): Promise<ResolvedTailwindV4CssEntries | undefined> {
  const analysis = analyzeTailwindV4EntrySource(css)
  return analysis ? resolveTailwindV4EntriesFromAnalysis(analysis, base) : undefined
}

async function resolveTailwindV4EntriesFromAnalysis(
  analysis: TailwindV4EntrySourceAnalysis,
  base: string,
): Promise<ResolvedTailwindV4CssEntries | undefined> {
  const { hasSourceNone, hasTailwindCssImport, includesPreflight, inlineCandidates, sourceRequests, importSourcePath } = analysis.getSourceDirectives()
  const importSourceBase = importSourcePath
    ? resolveSourceBase(base, importSourcePath)
    : undefined
  const [sourceEntries, configEntries] = await Promise.all([
    Promise.all(sourceRequests.map(request =>
      resolveTailwindSourceEntry(request.sourcePath, base, request.negated, SOURCE_CANDIDATE_PATTERN))),
    resolveConfigContentEntries(analysis.configRequests, base),
  ])
  const entries = [
    ...configEntries.entries,
    ...sourceEntries,
  ]
  const hasPositiveEntries = entries.some(entry => !entry.negated)

  if (importSourceBase) {
    return {
      entries: [
        {
          base: importSourceBase,
          negated: false,
          pattern: SOURCE_CANDIDATE_PATTERN,
        },
        ...entries,
      ],
      explicit: true,
      includesPreflight,
      inlineCandidates,
      dependencies: configEntries.dependencies,
    }
  }

  if (hasSourceNone) {
    return {
      entries,
      explicit: true,
      includesPreflight,
      inlineCandidates,
      dependencies: configEntries.dependencies,
    }
  }

  if (hasPositiveEntries) {
    return {
      entries,
      explicit: true,
      includesPreflight,
      inlineCandidates,
      dependencies: configEntries.dependencies,
    }
  }

  if (inlineCandidates.included.size > 0 || inlineCandidates.excluded.size > 0) {
    return {
      entries: [],
      explicit: true,
      includesPreflight,
      inlineCandidates,
      dependencies: configEntries.dependencies,
    }
  }

  return hasTailwindCssImport
    ? {
        entries,
        explicit: false,
        includesPreflight,
        inlineCandidates,
        dependencies: configEntries.dependencies,
      }
    : undefined
}

export async function resolveTailwindV4CssDependencies(css: string, base: string) {
  const resolved = await resolveTailwindV4EntriesFromCss(css, base)
  return resolved?.dependencies ?? []
}

export function collectExistingCssEntries(options: UserDefinedOptions) {
  return [
    ...(options.cssEntries ?? []),
    ...(options.tailwindcss?.v4?.cssEntries ?? []),
    ...((options.tailwindcssRuntimeOptions as any)?.tailwindcss?.v4?.cssEntries ?? []),
  ]
    .filter((item): item is string => typeof item === 'string' && item.length > 0)
    .filter(isTailwindV4CssEntry)
    .map(item => path.resolve(item))
    .filter(item => existsSync(item))
}

async function pathExistsAsFile(file: string) {
  try {
    return (await stat(file)).isFile()
  }
  catch {
    return false
  }
}

export async function resolveTailwindV4EntriesFromCssCached(css: string, base: string) {
  const analysis = analyzeTailwindV4EntrySource(css)
  if (!analysis) {
    return undefined
  }
  const cacheKey = createCssEntriesCacheKey(
    css,
    base,
    collectConfigDependencySignatures(analysis.configRequests, base),
  )
  const cached = tailwindV4CssEntriesCache.get(cacheKey)
  if (cached) {
    return cached
  }
  const task = resolveTailwindV4EntriesFromAnalysis(analysis, base).catch((error) => {
    if (tailwindV4CssEntriesCache.peek(cacheKey) === task) {
      tailwindV4CssEntriesCache.delete(cacheKey)
    }
    throw error
  })
  tailwindV4CssEntriesCache.set(cacheKey, task)
  return task
}

export async function resolveTailwindConfigEntriesFromCssCached(css: string, base: string) {
  const analysis = analyzeTailwindV4EntrySource(css)
  if (!analysis) {
    return undefined
  }
  const dependencies = collectConfigDependencySignatures(analysis.configRequests, base)
  if (dependencies.length === 0) {
    return undefined
  }
  const cacheKey = createCssEntriesCacheKey(css, base, dependencies)
  const cached = tailwindConfigCssEntriesCache.get(cacheKey)
  if (cached) {
    return cached
  }
  const task = resolveConfigContentEntries(analysis.configRequests, base).then((resolved) => {
    return {
      entries: [
        ...resolved.entries,
        ...createDependencyExcludeEntries(resolved.dependencies),
      ],
      explicit: true,
      includesPreflight: false,
      inlineCandidates: {
        excluded: new Set<string>(),
        included: new Set<string>(),
      },
      dependencies: resolved.dependencies,
    }
  }).catch((error) => {
    if (tailwindConfigCssEntriesCache.peek(cacheKey) === task) {
      tailwindConfigCssEntriesCache.delete(cacheKey)
    }
    throw error
  })
  tailwindConfigCssEntriesCache.set(cacheKey, task)
  return task
}

export async function discoverTailwindV4CssEntries(root: string, outDir: string | undefined) {
  const resolvedRoot = path.resolve(root)
  const ignore = [
    '**/node_modules/**',
    '**/.git/**',
  ]
  const resolvedOutDir = outDir ? path.resolve(resolvedRoot, outDir) : undefined
  if (resolvedOutDir) {
    const relativeOutDir = path.relative(resolvedRoot, resolvedOutDir)
    if (relativeOutDir && !relativeOutDir.startsWith('..') && !path.isAbsolute(relativeOutDir)) {
      ignore.push(`${relativeOutDir.split(path.sep).join('/')}/**`)
    }
  }
  const candidates = await fg(TAILWIND_CSS_ENTRY_PATTERN, {
    absolute: true,
    cwd: resolvedRoot,
    ignore,
    onlyFiles: true,
    unique: true,
  })
  const entries: string[] = []
  for (const file of candidates) {
    if (!await pathExistsAsFile(file)) {
      continue
    }
    try {
      const css = readFileSync(file, 'utf8')
      if (css.includes('tailwindcss') || css.includes('@source') || css.includes('@config')) {
        const resolved = await resolveTailwindV4EntriesFromCssCached(css, path.dirname(file))
        if (resolved) {
          entries.push(file)
        }
      }
    }
    catch {
      // 自动发现只用于缩小 HMR 首轮扫描范围，读取失败时继续尝试其它入口。
    }
  }
  return entries
}

export function collectConfiguredCssSources(options: UserDefinedOptions) {
  return filterTailwindV4CssSourceRoots([
    ...(options.tailwindcss?.v4?.cssSources ?? []),
    ...(((options.tailwindcssRuntimeOptions as any)?.tailwindcss?.v4?.cssSources ?? []) as TailwindV4CssSource[]),
  ]) ?? []
}
