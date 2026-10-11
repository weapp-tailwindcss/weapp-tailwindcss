import type { SourceEntry } from '@tailwindcss/oxide'
import type { TailwindV4CompiledSourceRoot, TailwindV4SourcePattern } from '../types.ts'
import path from 'node:path'
import process from 'node:process'
import { createSourceScanPlan, expandSourceEntryBraces as expandTailwindV4SourceEntryBraces, resolveTailwindSourceEntry } from '@weapp-tailwindcss/source-scan'

export { expandSourceEntryBraces as expandTailwindV4SourceEntryBraces, normalizeGlobPattern, resolveSourceScanPath, toPosixPath } from '@weapp-tailwindcss/source-scan'

export const TAILWIND_V4_IGNORED_CONTENT_DIRS = [
  '.git',
  '.hg',
  '.jj',
  '.next',
  '.parcel-cache',
  '.pnpm-store',
  '.svelte-kit',
  '.svn',
  '.turbo',
  '.venv',
  '.vercel',
  '.yarn',
  '__pycache__',
  'node_modules',
  'venv',
]

export const TAILWIND_V4_IGNORED_EXTENSIONS = [
  'less',
  'lock',
  'sass',
  'scss',
  'styl',
  'log',
]

export const TAILWIND_V4_IGNORED_FILES = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'bun.lockb',
  '.gitignore',
  '.env',
  '.env.*',
]

export const TAILWIND_V4_AUTO_SOURCE_SCAN_PATTERN = '**/*'

function uniqueResolvedPaths(values: Iterable<string | undefined>) {
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

export function createTailwindV4DefaultIgnoreSources(base: string): TailwindV4SourcePattern[] {
  return [
    ...TAILWIND_V4_IGNORED_CONTENT_DIRS.map(pattern => ({
      base,
      pattern: `**/${pattern}/**`,
      negated: true,
    })),
    ...TAILWIND_V4_IGNORED_EXTENSIONS.map(extension => ({
      base,
      pattern: `**/*.${extension}`,
      negated: true,
    })),
    ...TAILWIND_V4_IGNORED_FILES.map(pattern => ({
      base,
      pattern: `**/${pattern}`,
      negated: true,
    })),
  ]
}

export function createTailwindV4RootSources(
  root: TailwindV4CompiledSourceRoot,
  fallbackBase: string,
): TailwindV4SourcePattern[] {
  return createSourceScanPlan({
    base: fallbackBase,
    mode: root === 'none' ? 'disabled' : root === null ? 'auto' : 'explicit',
    entries: root && root !== 'none' ? [{ ...root, negated: false }] : [],
  })
}

export function createTailwindV4CompiledSourceEntries(
  root: TailwindV4CompiledSourceRoot,
  sources: TailwindV4SourcePattern[],
  fallbackBase: string,
) {
  return [
    ...createTailwindV4RootSources(root, fallbackBase),
    ...sources,
  ]
}

export function resolveTailwindV4SourceEntry(sourcePath: string, base: string, negated: boolean, defaultPattern = TAILWIND_V4_AUTO_SOURCE_SCAN_PATTERN) {
  return resolveTailwindSourceEntry(sourcePath, base, negated, defaultPattern)
}

export async function normalizeTailwindV4SourceEntries(
  sources: TailwindV4SourcePattern[],
  options: {
    cwd?: string
    defaultPattern?: string
  } = {},
) {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd()
  return Promise.all(sources.map(source =>
    resolveTailwindV4SourceEntry(
      source.pattern,
      source.base ? path.resolve(source.base) : cwd,
      source.negated,
      options.defaultPattern,
    )))
}

export function normalizeTailwindV4ScannerSources(
  sources: TailwindV4SourcePattern[] | undefined,
  cwd: string,
  ignoredSources: TailwindV4SourcePattern[] = [],
): SourceEntry[] {
  const baseSources = sources?.length
    ? sources
    : [
        {
          base: cwd,
          pattern: TAILWIND_V4_AUTO_SOURCE_SCAN_PATTERN,
          negated: false,
        },
      ]

  return expandTailwindV4SourceEntryBraces([...baseSources, ...ignoredSources])
}

export function resolveTailwindV4SourceBaseCandidates(
  projectRoot: string,
  base: string,
  baseFallbacks: string[],
) {
  return uniqueResolvedPaths([base, projectRoot, ...baseFallbacks])
}
