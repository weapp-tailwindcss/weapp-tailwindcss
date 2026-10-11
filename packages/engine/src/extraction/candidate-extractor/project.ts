import type { SourceEntry } from '@tailwindcss/oxide'
import type { TailwindTokenByFileMap, TailwindTokenFileKey, TailwindTokenLocation, TailwindTokenReport } from '../../types.ts'
import path from 'node:path'
import process from 'node:process'
import { compileTailwindV4Source } from '../../v4/node-adapter.ts'
import { createTailwindV4CompiledSourceEntries, normalizeTailwindV4ScannerSources } from '../../v4/source-scan.ts'
import { readCandidateFile } from '../file-io.ts'
import { getOxideModule } from '../oxide.ts'
import { buildLineOffsets, createTokenLocation, toExtension } from '../project-report.ts'

export interface ExtractProjectCandidatesOptions {
  cwd?: string
  sources?: SourceEntry[]
  base?: string
  baseFallbacks?: string[]
  css?: string
}

export interface ResolveProjectSourceFilesOptions {
  cwd?: string
  sources?: SourceEntry[]
  ignoredSources?: SourceEntry[]
  base?: string
  baseFallbacks?: string[]
  css?: string
  filter?: (file: string) => boolean
}

async function resolveScannerSources(options?: ResolveProjectSourceFilesOptions) {
  const cwd = options?.cwd ? path.resolve(options.cwd) : process.cwd()
  if (options?.sources?.length || options?.css === undefined) {
    return {
      cwd,
      sources: normalizeTailwindV4ScannerSources(options?.sources, cwd, options?.ignoredSources),
    }
  }

  const base = options.base ? path.resolve(options.base) : cwd
  const { compiled } = await compileTailwindV4Source({
    projectRoot: cwd,
    base,
    baseFallbacks: options.baseFallbacks?.map(baseFallback => path.resolve(baseFallback)) ?? [],
    css: options.css,
    dependencies: [],
  })
  return {
    cwd,
    sources: normalizeTailwindV4ScannerSources(
      createTailwindV4CompiledSourceEntries(compiled.root, compiled.sources, base),
      cwd,
      options.ignoredSources,
    ),
  }
}

export async function resolveProjectSourceFiles(options?: ResolveProjectSourceFilesOptions): Promise<string[]> {
  const { sources } = await resolveScannerSources(options)
  const { Scanner } = await getOxideModule()
  const scanner = new Scanner({
    sources,
  })
  const files = scanner.files ?? []
  return options?.filter
    ? files.filter(options.filter)
    : files
}

export async function extractProjectCandidatesWithPositions(
  options?: ExtractProjectCandidatesOptions,
): Promise<TailwindTokenReport> {
  const { cwd, sources } = await resolveScannerSources(options)
  const { Scanner } = await getOxideModule()
  const scanner = new Scanner({
    sources,
  })

  const files = scanner.files ?? []
  const entries: TailwindTokenLocation[] = []
  const skipped: TailwindTokenReport['skippedFiles'] = []

  // 分批读取避免串行 I/O 被构建任务反复打断，同时限制打开文件数和源码占用。
  const batchSize = 32
  for (let start = 0; start < files.length; start += batchSize) {
    const batch = files.slice(start, start + batchSize)
    const contents = await Promise.allSettled(batch.map(readCandidateFile))
    for (const [index, file] of batch.entries()) {
      const result = contents[index]!
      if (result.status === 'rejected') {
        skipped.push({
          file,
          reason: result.reason instanceof Error ? result.reason.message : 'Unknown error',
        })
        continue
      }
      const content = result.value
      const extension = toExtension(file)
      const matches = scanner.getCandidatesWithPositions({
        file,
        content,
        extension,
      })

      if (!matches.length) {
        continue
      }

      const offsets = buildLineOffsets(content)

      for (const match of matches) {
        entries.push(createTokenLocation({
          cwd,
          file,
          content,
          extension,
          candidate: match.candidate,
          position: match.position,
          offsets,
        }))
      }
    }
  }

  return {
    entries,
    filesScanned: files.length,
    skippedFiles: skipped,
    sources,
  }
}

export function groupTokensByFile(
  report: TailwindTokenReport,
  options?: { key?: TailwindTokenFileKey, stripAbsolutePaths?: boolean },
): TailwindTokenByFileMap {
  const key = options?.key ?? 'relative'
  const stripAbsolute = options?.stripAbsolutePaths ?? key !== 'absolute'

  return report.entries.reduce<TailwindTokenByFileMap>((acc, entry) => {
    const bucketKey = key === 'absolute' ? entry.file : entry.relativeFile
    const bucket = acc[bucketKey] ?? (acc[bucketKey] = [])
    const value = stripAbsolute
      ? {
          ...entry,
          file: entry.relativeFile,
        }
      : entry
    bucket.push(value)
    return acc
  }, {})
}
