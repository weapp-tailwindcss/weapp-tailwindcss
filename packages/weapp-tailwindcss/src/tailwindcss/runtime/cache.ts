import type { TailwindcssRuntimeLike } from '@/types'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { resolveTailwindV4EntriesFromCssCached } from '@/project-sources'
import { resolveTailwindcssOptions } from '@/tailwindcss/runtime-options'
import { expandTailwindSourceEntries } from '@/tailwindcss/source-scan'

interface RuntimeClassSetCacheEntry {
  value?: Set<string> | undefined
  promise?: Promise<Set<string>> | undefined
  signature?: string | undefined
}

const runtimeClassSetCache = new WeakMap<TailwindcssRuntimeLike, RuntimeClassSetCacheEntry>()
const runtimeFileSignatureCache = new Map<string, string>()
const runtimeTrackedSourceFilesCache = new Map<string, string[]>()
let runtimeFileSignatureCacheClearTimer: ReturnType<typeof setTimeout> | undefined

export const runtimeSignatureRuntimesSymbol = Symbol.for('weapp-tailwindcss.runtimeSignatureRuntimes')

function getCacheEntry(tailwindRuntime: TailwindcssRuntimeLike) {
  let entry = runtimeClassSetCache.get(tailwindRuntime)
  if (!entry) {
    entry = {}
    runtimeClassSetCache.set(tailwindRuntime, entry)
  }
  return entry
}

function scheduleRuntimeConfigSignatureCacheClear() {
  if (runtimeFileSignatureCacheClearTimer) {
    return
  }

  // 仅在当前事件循环内复用文件签名，避免同一热路径重复 statSync。
  // 下一轮事件循环自动清空，以保留后续增量构建对配置变更的探测能力。
  runtimeFileSignatureCacheClearTimer = setTimeout(() => {
    runtimeFileSignatureCache.clear()
    runtimeTrackedSourceFilesCache.clear()
    runtimeFileSignatureCacheClearTimer = undefined
  }, 0)
  runtimeFileSignatureCacheClearTimer.unref?.()
}

function getFileSignature(filePath: string) {
  const cached = runtimeFileSignatureCache.get(filePath)
  if (cached !== undefined) {
    return cached
  }

  let signature: string
  try {
    const stats = statSync(filePath)
    signature = `${filePath}:${stats.size}:${stats.mtimeMs}`
  }
  catch {
    signature = `${filePath}:missing`
  }
  runtimeFileSignatureCache.set(filePath, signature)
  scheduleRuntimeConfigSignatureCacheClear()
  return signature
}

function getTailwindTrackedFiles(tailwindRuntime: TailwindcssRuntimeLike) {
  const tailwindOptions = resolveTailwindcssOptions(tailwindRuntime.options)
  const tracked = new Set<string>()
  const configPath = tailwindOptions?.config
  if (typeof configPath === 'string' && configPath.length > 0) {
    tracked.add(configPath)
  }
  for (const entry of tailwindOptions?.v4?.cssEntries ?? []) {
    if (typeof entry === 'string' && entry.length > 0) {
      tracked.add(entry)
    }
  }
  for (const source of tailwindOptions?.v4?.cssSources ?? []) {
    if (typeof source.file === 'string' && source.file.length > 0) {
      tracked.add(source.file)
    }
    for (const dependency of source.dependencies ?? []) {
      if (typeof dependency === 'string' && dependency.length > 0) {
        tracked.add(dependency)
      }
    }
  }
  return tracked
}

function normalizeTrackedSourceSignature(cssEntries: string[] | undefined, cssSources: Array<{ file?: string, css?: string, dependencies?: string[] }> | undefined) {
  return normalizeSignatureValue({
    cssEntries: cssEntries?.map((entry) => {
      if (!existsSync(entry)) {
        return `${entry}:missing`
      }
      return getFileSignature(entry)
    }),
    cssSources,
  })
}

async function collectTailwindV4TrackedSourceFiles(tailwindRuntime: TailwindcssRuntimeLike) {
  const tailwindOptions = resolveTailwindcssOptions(tailwindRuntime.options)
  const signature = normalizeTrackedSourceSignature(
    tailwindOptions?.v4?.cssEntries,
    tailwindOptions?.v4?.cssSources,
  )
  const cached = runtimeTrackedSourceFilesCache.get(signature)
  if (cached) {
    return cached
  }

  const files = new Set<string>()
  for (const cssEntry of tailwindOptions?.v4?.cssEntries ?? []) {
    if (!existsSync(cssEntry)) {
      continue
    }
    const css = readFileSync(cssEntry, 'utf8')
    const resolved = await resolveTailwindV4EntriesFromCssCached(css, path.dirname(cssEntry))
    const expanded = resolved?.entries?.length
      ? await expandTailwindSourceEntries(resolved.entries)
      : []
    for (const file of expanded) {
      files.add(file)
    }
  }
  for (const cssSource of tailwindOptions?.v4?.cssSources ?? []) {
    if (typeof cssSource.css !== 'string' || cssSource.css.length === 0) {
      continue
    }
    const base = typeof cssSource.file === 'string' && cssSource.file.length > 0
      ? path.dirname(cssSource.file)
      : tailwindOptions?.v4?.base ?? tailwindOptions?.cwd ?? tailwindRuntime.options?.projectRoot ?? process.cwd()
    const resolved = await resolveTailwindV4EntriesFromCssCached(cssSource.css, base)
    const expanded = resolved?.entries?.length
      ? await expandTailwindSourceEntries(resolved.entries)
      : []
    for (const file of expanded) {
      files.add(file)
    }
  }

  const result = [...files].sort((a, b) => a.localeCompare(b))
  runtimeTrackedSourceFilesCache.set(signature, result)
  return result
}

function normalizeSignatureValue(value: unknown): string {
  if (value == null) {
    return 'null'
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => normalizeSignatureValue(item)).join(',')}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([key, item]) => `${key}:${normalizeSignatureValue(item)}`).join(',')}}`
  }
  return String(value)
}

function readOptionalProperty(value: unknown, key: string) {
  if (typeof value !== 'object' || value === null || !(key in value)) {
    return undefined
  }
  return (value as Record<string, unknown>)[key]
}

function getTailwindOptionsSignature(tailwindRuntime: TailwindcssRuntimeLike) {
  const options = tailwindRuntime.options
  const tailwindOptions = resolveTailwindcssOptions(options)
  return normalizeSignatureValue({
    projectRoot: options?.projectRoot,
    packageName: tailwindOptions?.packageName,
    versionHint: readOptionalProperty(tailwindOptions, 'versionHint'),
    cwd: tailwindOptions?.cwd,
    config: tailwindOptions?.config,
    v4: {
      base: tailwindOptions?.v4?.base,
      configuredBase: readOptionalProperty(tailwindOptions?.v4, 'configuredBase'),
      css: tailwindOptions?.v4?.css,
      cssEntries: tailwindOptions?.v4?.cssEntries,
      cssSources: tailwindOptions?.v4?.cssSources,
      hasUserDefinedSources: readOptionalProperty(tailwindOptions?.v4, 'hasUserDefinedSources'),
      sources: tailwindOptions?.v4?.sources,
    },
  })
}

function getRuntimeTargetSignature(tailwindRuntime: TailwindcssRuntimeLike) {
  const packageInfo = tailwindRuntime.packageInfo
  return [
    packageInfo?.name ?? 'missing',
    packageInfo?.rootPath ?? 'missing',
    packageInfo?.version ?? 'unknown',
    tailwindRuntime.majorVersion ?? 'unknown',
    getTailwindOptionsSignature(tailwindRuntime),
  ].join(':')
}

function getNestedRuntimes(tailwindRuntime: TailwindcssRuntimeLike) {
  const nested = (tailwindRuntime as TailwindcssRuntimeLike & {
    [runtimeSignatureRuntimesSymbol]?: TailwindcssRuntimeLike[]
  })[runtimeSignatureRuntimesSymbol]
  return Array.isArray(nested) && nested.length > 0 ? nested : undefined
}

function getOwnRuntimeClassSetSignature(tailwindRuntime: TailwindcssRuntimeLike) {
  const trackedFiles = [...getTailwindTrackedFiles(tailwindRuntime)]
    .sort((a, b) => a.localeCompare(b))
    .map(getFileSignature)
  const configSignature = trackedFiles.length > 0 ? trackedFiles.join('|') : 'files:missing'
  const runtimeTargetSignature = getRuntimeTargetSignature(tailwindRuntime)
  return `${configSignature}|runtime:${runtimeTargetSignature}`
}

export function invalidateRuntimeClassSet(tailwindRuntime?: TailwindcssRuntimeLike) {
  if (!tailwindRuntime) {
    return
  }
  const nestedRuntimes = getNestedRuntimes(tailwindRuntime)
  if (nestedRuntimes) {
    for (const runtime of nestedRuntimes) {
      invalidateRuntimeClassSet(runtime)
    }
  }
  for (const trackedFile of getTailwindTrackedFiles(tailwindRuntime)) {
    runtimeFileSignatureCache.delete(trackedFile)
  }
  runtimeTrackedSourceFilesCache.clear()
  runtimeClassSetCache.delete(tailwindRuntime)
}

export function getRuntimeClassSetCacheEntry(tailwindRuntime: TailwindcssRuntimeLike) {
  return getCacheEntry(tailwindRuntime)
}

export function getRuntimeClassSetSignature(tailwindRuntime: TailwindcssRuntimeLike) {
  const nestedRuntimes = getNestedRuntimes(tailwindRuntime)
  if (nestedRuntimes) {
    return nestedRuntimes
      .map(getOwnRuntimeClassSetSignature)
      .sort((a, b) => a.localeCompare(b))
      .join('||')
  }
  return getOwnRuntimeClassSetSignature(tailwindRuntime)
}

export async function getRuntimeClassSetSignatureWithSources(tailwindRuntime: TailwindcssRuntimeLike) {
  const baseSignature = getRuntimeClassSetSignature(tailwindRuntime)
  const trackedSourceFiles = await collectTailwindV4TrackedSourceFiles(tailwindRuntime)
  if (trackedSourceFiles.length === 0) {
    return baseSignature
  }
  return [
    baseSignature,
    trackedSourceFiles.map(getFileSignature).join('|'),
  ].join('|sources:')
}
