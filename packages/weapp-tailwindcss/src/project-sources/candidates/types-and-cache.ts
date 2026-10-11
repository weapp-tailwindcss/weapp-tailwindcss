import type { TailwindInlineSourceCandidates, TailwindSourceEntry } from '@/tailwindcss/source-scan'
import type { ICustomAttributesEntities } from '@/types'
import type { IArbitraryValues } from '@/types/shared'
import { LRUCache } from 'lru-cache'
import { md5Hash } from '@/cache/md5'
import { extractCandidatesFromSource } from '@/tailwindcss/candidates'
import { FULL_SOURCE_SCAN_EXTENSION_RE, resolveSourceScanPath } from '@/tailwindcss/source-scan'

export interface SourceCandidateStore {
  syncSource: (id: string, source: string) => Promise<void>
  sync: (id: string, source: string) => Promise<void>
  syncCss: (id: string, source: string) => Promise<void>
  syncModuleSource: (id: string, source: string, extension?: string) => Promise<Set<string>>
  merge: (id: string, source: string) => Promise<void>
  syncFile: (id: string) => Promise<void>
  syncCurrentSource: (id: string, source: string) => Promise<SourceCandidateChange>
  syncCurrentFile: (id: string) => Promise<SourceCandidateChange>
  resolveScanFiles: (options: ScanSourceCandidateRootOptions) => Promise<string[]>
  scanRoot: (options: ScanSourceCandidateRootOptions) => Promise<void>
  syncInline: (inlineCandidates: TailwindInlineSourceCandidates | undefined) => void
  remove: (id: string) => SourceCandidateChange
  source: (id: string) => string | undefined
  sources: () => IterableIterator<[string, string]>
  values: () => Set<string>
  valuesForEntries: (entries: TailwindSourceEntry[] | undefined, options?: SourceCandidateFilterOptions) => Set<string>
  sourcesForEntries: (entries: TailwindSourceEntry[] | undefined, options?: SourceCandidateFilterOptions) => Map<string, Set<string>>
  snapshot: () => SourceCandidateCollectorSnapshot
  restore: (snapshot: SourceCandidateCollectorSnapshot) => void
  clearScan: () => void
  resetScan: () => void
  clear: () => void
  getRevision: () => number
}

export interface SourceCandidateCollector extends SourceCandidateStore {}

export interface SourceCandidateChange {
  addedCandidates: Set<string>
  removedCandidates: Set<string>
}

export interface SourceCandidateCollectorSnapshot {
  candidatesById: Array<[string, string[]]>
  cssCandidatesById?: Array<[string, string[]]> | undefined
  cssSourceById?: Array<[string, string]> | undefined
  moduleCandidatesById?: Array<[string, string[]]> | undefined
  moduleSourceById?: Array<[string, string]> | undefined
  scanCandidatesById?: Array<[string, string[]]> | undefined
  scanSourceById?: Array<[string, string]> | undefined
  sourceById?: Array<[string, string]> | undefined
  transformCandidatesById?: Array<[string, string[]]> | undefined
  transformSourceById?: Array<[string, string]> | undefined
  inlineExcludedCandidates: string[]
  inlineIncludedCandidates: string[]
}

export interface SourceCandidateFilterOptions {
  excludeEntries?: TailwindSourceEntry[] | undefined
}

export interface ScanSourceCandidateRootOptions {
  root: string
  outDir?: string | undefined
  entries?: TailwindSourceEntry[] | undefined
  explicit?: boolean | undefined
  onFilesResolved?: ((files: string[]) => void) | undefined
}

export interface SourceCandidateCollectorOptions {
  /**
   * 是否补充 UnoCSS 风格裸任意值候选。
   */
  bareArbitraryValues?: IArbitraryValues['bareArbitraryValues'] | undefined
  customAttributesEntities?: ICustomAttributesEntities | undefined
  disabledDefaultTemplateHandler?: boolean | undefined
  extractor?: ((source: string, extension: string) => Promise<Iterable<string>> | Iterable<string>) | undefined
}

const CLEAN_URL_RE = /[?#].*$/
export const SOURCE_CANDIDATE_CONTENT_CACHE_MAX = 128
export const sourceCandidateContentCache = new LRUCache<string, string[]>({
  max: SOURCE_CANDIDATE_CONTENT_CACHE_MAX,
})

export function cleanUrl(id: string) {
  return resolveSourceScanPath(id.replace(CLEAN_URL_RE, ''))
}

export function resolveSourceCandidateExtension(id: string) {
  const normalized = cleanUrl(id)
  const match = /\.([^.\\/]+)$/.exec(normalized)
  return match?.[1] ?? 'html'
}

export function createSourceCandidateContentCacheKey(
  extension: string,
  source: string,
  bareArbitraryValues: IArbitraryValues['bareArbitraryValues'] | undefined,
  customAttributesEntities: ICustomAttributesEntities | undefined,
  disabledDefaultTemplateHandler: boolean | undefined,
  extractor: SourceCandidateCollectorOptions['extractor'],
) {
  return [
    extension,
    JSON.stringify(bareArbitraryValues ?? false),
    createCustomAttributesCacheSignature(customAttributesEntities),
    disabledDefaultTemplateHandler === true ? 'default-template:off' : 'default-template:on',
    extractor ? 'custom' : 'default',
    md5Hash(source),
  ].join('\0')
}

function createCustomAttributesCacheSignature(customAttributesEntities: ICustomAttributesEntities | undefined) {
  return JSON.stringify(
    (customAttributesEntities ?? []).map(([selector, props]) => [
      stringifyCustomAttributeToken(selector),
      Array.isArray(props)
        ? props.map(stringifyCustomAttributeToken)
        : stringifyCustomAttributeToken(props),
    ]),
  )
}

function stringifyCustomAttributeToken(token: string | RegExp) {
  return typeof token === 'string'
    ? `s:${token}`
    : `r:${token.source}/${token.flags}`
}

export async function extractCandidates(
  source: string,
  extension: string,
  options: SourceCandidateCollectorOptions,
) {
  return extractCandidatesFromSource(source, extension, options)
}

export function isSourceCandidateRequest(id: string) {
  return FULL_SOURCE_SCAN_EXTENSION_RE.test(cleanUrl(id))
}

export function removeCandidateSet(
  candidateCount: Map<string, number>,
  candidates: Set<string>,
) {
  for (const candidate of candidates) {
    const count = candidateCount.get(candidate)
    if (count == null) {
      continue
    }
    if (count <= 1) {
      candidateCount.delete(candidate)
      continue
    }
    candidateCount.set(candidate, count - 1)
  }
}

export function addCandidateSet(
  candidateCount: Map<string, number>,
  candidates: Set<string>,
) {
  for (const candidate of candidates) {
    candidateCount.set(candidate, (candidateCount.get(candidate) ?? 0) + 1)
  }
}

export function diffCandidateSets(previous: Set<string>, next: Set<string>): SourceCandidateChange {
  const addedCandidates = new Set<string>()
  const removedCandidates = new Set<string>()
  for (const candidate of next) {
    if (!previous.has(candidate)) {
      addedCandidates.add(candidate)
    }
  }
  for (const candidate of previous) {
    if (!next.has(candidate)) {
      removedCandidates.add(candidate)
    }
  }
  return {
    addedCandidates,
    removedCandidates,
  }
}
