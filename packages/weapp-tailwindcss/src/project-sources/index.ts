import type { TailwindInlineSourceCandidates, TailwindSourceEntry } from '@/tailwindcss/source-scan'
import type { TailwindcssRuntimeLike, UserDefinedOptions } from '@/types'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  createTailwindSourceEntryMatcher,
  resolveTailwindV4CssSourceBase,
} from '@/tailwindcss/source-scan'
import { resolveTailwindV4SourceFromRuntime, resolveTailwindV4SourceOptionsFromRuntime } from '@/tailwindcss/v4-engine'
import {
  collectConfiguredCssSources,
  collectExistingCssEntries,
  discoverTailwindV4CssEntries,
  mergeTailwindInlineSourceCandidates,
  resolveTailwindV4EntriesFromCssCached,
} from './css-entries'
import { addSourceScanDependencies, addSourceScanDependency } from './dependencies'

export {
  discoverTailwindV4CssEntries,
  resolveTailwindConfigEntriesFromCssCached,
  resolveTailwindV4CssDependencies,
  resolveTailwindV4EntriesFromCss,
  resolveTailwindV4EntriesFromCssCached,
} from './css-entries'

export type { ResolvedTailwindV4CssEntries } from './css-entries'

export interface ResolvedSourceScan {
  dependencies?: string[] | undefined
  entries?: TailwindSourceEntry[] | undefined
  explicit?: boolean | undefined
  inlineCandidates?: TailwindInlineSourceCandidates | undefined
}

export interface ResolveSourceScanOptions {
  root?: string | undefined
  outDir?: string | undefined
}

function createResolvedSourceScan(input: ResolvedSourceScan, dependencies: Set<string>): ResolvedSourceScan {
  return {
    ...input,
    ...(dependencies.size > 0 ? { dependencies: [...dependencies].sort() } : {}),
  }
}

function createMergedCssEntrySourceScanEntries(
  entries: TailwindSourceEntry[],
  options: {
    sourceCount: number
  },
) {
  if (options.sourceCount <= 1) {
    return entries
  }
  const positiveEntries = entries.filter(entry => !entry.negated)
  return positiveEntries.length > 0 ? positiveEntries : entries
}

function resolveExplicitSourceScanEntries(
  entries: TailwindSourceEntry[],
  explicit: boolean,
) {
  if (!explicit) {
    return entries.length > 0 ? entries : undefined
  }

  return entries.some(entry => !entry.negated) ? entries : []
}

function createResolvedV4CssScanInput(
  entries: TailwindSourceEntry[],
  inlineCandidates: TailwindInlineSourceCandidates | undefined,
  explicit: boolean,
): Pick<ResolvedSourceScan, 'entries' | 'explicit' | 'inlineCandidates'> {
  return {
    entries: resolveExplicitSourceScanEntries(entries, explicit),
    explicit,
    inlineCandidates,
  }
}

export async function resolveSourceScanEntries(
  options: UserDefinedOptions,
  runtime: TailwindcssRuntimeLike,
  scanOptions: ResolveSourceScanOptions = {},
): Promise<ResolvedSourceScan | undefined> {
  const sourceOptions = resolveTailwindV4SourceOptionsFromRuntime(runtime)
  const configuredSourceEntries = sourceOptions.sources ?? []
  const cssEntries = collectExistingCssEntries(options)
  if (cssEntries.length === 0 && !sourceOptions.css && !sourceOptions.cssSources?.length) {
    const scanRoot = scanOptions.root
    const sourceProjectRoot = sourceOptions.projectRoot
    if (scanRoot && sourceProjectRoot && path.resolve(scanRoot) === path.resolve(sourceProjectRoot)) {
      const discoveredCssEntries = await discoverTailwindV4CssEntries(
        scanRoot,
        scanOptions.outDir,
      )
      cssEntries.push(...discoveredCssEntries)
    }
  }
  const entries: TailwindSourceEntry[] = []
  const cssInlineCandidates: TailwindInlineSourceCandidates[] = []
  const dependencies = new Set<string>()
  let explicit = configuredSourceEntries.length > 0
  let readableCssEntryCount = 0
  for (const cssEntry of cssEntries) {
    addSourceScanDependency(dependencies, cssEntry)
    let css: string
    try {
      css = readFileSync(cssEntry, 'utf8')
    }
    catch {
      // 自动发现或 bundler transform 记录的 CSS 入口可能在测试或临时构建清理后消失。
      continue
    }
    readableCssEntryCount++
    const resolved = await resolveTailwindV4EntriesFromCssCached(css, path.dirname(cssEntry))
    if (resolved) {
      entries.push(...resolved.entries)
      cssInlineCandidates.push(resolved.inlineCandidates)
      addSourceScanDependencies(dependencies, resolved.dependencies)
      explicit ||= resolved.explicit
    }
  }
  const inlineCandidates = mergeTailwindInlineSourceCandidates(cssInlineCandidates)
  const scanEntries = createMergedCssEntrySourceScanEntries(entries, {
    sourceCount: readableCssEntryCount,
  })
  if (scanEntries.length > 0 || inlineCandidates || explicit || readableCssEntryCount > 0) {
    return createResolvedSourceScan({
      entries: resolveExplicitSourceScanEntries([...configuredSourceEntries, ...scanEntries], explicit),
      explicit,
      inlineCandidates,
    }, dependencies)
  }

  if (typeof sourceOptions.css === 'string' && sourceOptions.css.length > 0) {
    const resolved = await resolveTailwindV4EntriesFromCssCached(sourceOptions.css, sourceOptions.base ?? sourceOptions.projectRoot ?? process.cwd())
    return resolved
      ? createResolvedSourceScan(
          createResolvedV4CssScanInput([...configuredSourceEntries, ...resolved.entries], resolved.inlineCandidates, explicit || resolved.explicit),
          new Set(resolved.dependencies),
        )
      : undefined
  }

  const sourceOptionBase = sourceOptions.base ?? sourceOptions.projectRoot ?? process.cwd()
  const configuredCssSources = collectConfiguredCssSources(options)
  for (const cssSource of [
    ...configuredCssSources,
    ...(sourceOptions.cssSources ?? []),
  ]) {
    if (typeof cssSource.css !== 'string' || cssSource.css.length === 0) {
      continue
    }
    addSourceScanDependency(dependencies, cssSource.file)
    addSourceScanDependencies(dependencies, cssSource.dependencies)
    const resolved = await resolveTailwindV4EntriesFromCssCached(
      cssSource.css,
      resolveTailwindV4CssSourceBase(cssSource, sourceOptionBase),
    )
    if (resolved) {
      entries.push(...resolved.entries)
      cssInlineCandidates.push(resolved.inlineCandidates)
      addSourceScanDependencies(dependencies, resolved.dependencies)
      explicit ||= resolved.explicit
    }
  }
  const cssSourceInlineCandidates = mergeTailwindInlineSourceCandidates(cssInlineCandidates)
  const cssSourceCount = (sourceOptions.cssSources?.length ?? 0) + configuredCssSources.length
  const cssSourceScanEntries = createMergedCssEntrySourceScanEntries(entries, {
    sourceCount: cssSourceCount,
  })
  if (cssSourceScanEntries.length > 0 || cssSourceInlineCandidates || explicit) {
    return createResolvedSourceScan({
      entries: resolveExplicitSourceScanEntries([...configuredSourceEntries, ...cssSourceScanEntries], explicit),
      explicit,
      inlineCandidates: cssSourceInlineCandidates,
    }, dependencies)
  }
  if (cssSourceCount > 0) {
    return undefined
  }

  const source = await resolveTailwindV4SourceFromRuntime(runtime)
  addSourceScanDependency(dependencies, (source as { file?: string }).file)
  addSourceScanDependencies(dependencies, (source as { dependencies?: string[] }).dependencies)
  const resolved = await resolveTailwindV4EntriesFromCssCached(source.css, source.base)
  return resolved
    ? createResolvedSourceScan(
        createResolvedV4CssScanInput(
          resolved.entries.length > 0 ? [...configuredSourceEntries, ...resolved.entries] : configuredSourceEntries,
          resolved.inlineCandidates,
          explicit || (resolved.entries.length > 0 ? resolved.explicit : false),
        ),
        new Set([...dependencies, ...resolved.dependencies]),
      )
    : undefined
}

export function createSourceScanMatcher(entries: TailwindSourceEntry[] | undefined) {
  if (entries?.length === 0) {
    return () => false
  }
  return createTailwindSourceEntryMatcher(entries)
}
