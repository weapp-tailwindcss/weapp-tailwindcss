import type { SourceEntry } from '@tailwindcss/oxide'
import type {
  ExtractCandidateOptions,
  ExtractSourceCandidate,
  ExtractSourceCandidateWithContext,
  JsStringStaticRange,
} from '../types.ts'
import {
  extractBareArbitraryValueSourceCandidatesWithPositions,
} from '../../v4/bare-arbitrary-values.ts'
import { extractCssApplyCandidates } from '../css.ts'
import { mapCandidateFiles, readCandidateFile } from '../file-io.ts'
import { createJsStringStaticRanges } from '../js-string-ranges.ts'
import { getOxideModule } from '../oxide.ts'
import {
  toExtension,
} from '../project-report.ts'
import {
  createRawCandidateCacheKey,
  createRawCandidateFileFingerprint,
  getRawCandidateCacheEntry,
  setRawCandidateCacheEntry,
} from '../raw-candidate-cache.ts'
import {
  extractMixedSourceScriptCandidates,
  extractVueLikeSourceCandidates,
} from '../sfc.ts'
import {
  createLocalCandidate,
  CSS_LIKE_SOURCE_EXTENSION_RE,
  dedupeCandidatesWithPositions,
  JS_LIKE_SOURCE_EXTENSION_RE,
  MIXED_TEMPLATE_SOURCE_EXTENSION_RE,
  shouldKeepSourceCandidate,
  VUE_LIKE_SOURCE_EXTENSION_RE,
} from '../source-filters.ts'

export type { ExtractCandidateOptions, ExtractSourceCandidate } from '../types.ts'

export async function extractRawCandidatesWithPositions(
  content: string,
  extension: string = 'html',
  options?: ExtractCandidateOptions,
): Promise<ExtractSourceCandidate[]> {
  const { Scanner } = await getOxideModule()
  const scanner = new Scanner({})
  const result = scanner.getCandidatesWithPositions({ content, extension })

  const candidates = result.map(({ candidate, position }) => ({
    rawCandidate: candidate,
    start: position,
    end: position + candidate.length,
  }))
  candidates.push(...extractBareArbitraryValueSourceCandidatesWithPositions(content, options?.bareArbitraryValues))
  return dedupeCandidatesWithPositions(candidates)
}

export async function extractSourceCandidatesWithPositions(
  content: string,
  extension: string = 'html',
  options?: ExtractCandidateOptions,
): Promise<ExtractSourceCandidate[]> {
  const normalizedExtension = extension.replace(/^\./, '')
  const candidates: ExtractSourceCandidateWithContext[] = VUE_LIKE_SOURCE_EXTENSION_RE.test(normalizedExtension)
    ? await extractVueLikeSourceCandidates(content, extractRawCandidatesWithPositions, options)
    : CSS_LIKE_SOURCE_EXTENSION_RE.test(normalizedExtension)
      ? await extractCssApplyCandidates(content, normalizedExtension, extractRawCandidatesWithPositions, options)
      : (await extractRawCandidatesWithPositions(content, normalizedExtension, options))
          .map(candidate => ({
            ...candidate,
            content,
            extension: normalizedExtension,
            localStart: candidate.start,
          }))
  if (
    !VUE_LIKE_SOURCE_EXTENSION_RE.test(normalizedExtension)
    && MIXED_TEMPLATE_SOURCE_EXTENSION_RE.test(normalizedExtension)
  ) {
    candidates.push(...await extractMixedSourceScriptCandidates(content, extractRawCandidatesWithPositions, options))
  }
  const jsStringStaticRangesByContent = new Map<string, JsStringStaticRange[]>()
  function getJsStringStaticRanges(candidate: ExtractSourceCandidateWithContext) {
    if (!JS_LIKE_SOURCE_EXTENSION_RE.test(candidate.extension)) {
      return undefined
    }
    const cached = jsStringStaticRangesByContent.get(candidate.content)
    if (cached) {
      return cached
    }
    const ranges = createJsStringStaticRanges(candidate.content)
    jsStringStaticRangesByContent.set(candidate.content, ranges)
    return ranges
  }
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    if (!shouldKeepSourceCandidate(
      candidate.content,
      candidate.extension,
      createLocalCandidate(candidate),
      getJsStringStaticRanges(candidate),
      candidate.skipHtmlContextChecks,
    )) {
      return false
    }
    const key = `${candidate.start}:${candidate.end}:${candidate.rawCandidate}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  }).map(({ rawCandidate, start, end }) => ({ rawCandidate, start, end }))
}

export async function extractSourceCandidates(
  content: string,
  extension: string = 'html',
  options?: ExtractCandidateOptions,
): Promise<string[]> {
  const candidates = await extractSourceCandidatesWithPositions(content, extension, options)
  return [...new Set(candidates.map(candidate => candidate.rawCandidate))]
}

export async function extractRawCandidates(
  sources?: SourceEntry[],
  options?: ExtractCandidateOptions,
): Promise<string[]> {
  const { Scanner } = await getOxideModule()
  const scanner = new Scanner(sources === undefined ? {} : { sources })
  const files = scanner.files ?? []
  const cacheKey = createRawCandidateCacheKey(sources, options)
  const fingerprint = await createRawCandidateFileFingerprint(files)
  const cached = getRawCandidateCacheEntry(cacheKey, fingerprint)
  if (cached) {
    return [...cached.candidates]
  }

  const scannedCandidates = scanner.scan()
  if (scannedCandidates.length === 0 && files.length > 0) {
    const changedContents = (await mapCandidateFiles(files, async (file) => {
      try {
        return {
          content: await readCandidateFile(file),
          extension: toExtension(file),
        }
      }
      catch {
        return undefined
      }
    })).filter((entry): entry is { content: string, extension: string } => entry !== undefined)
    scannedCandidates.push(...scanner.scanFiles(changedContents))
  }
  const candidates = new Set(scannedCandidates)
  if (options?.bareArbitraryValues !== undefined && options.bareArbitraryValues !== false) {
    await mapCandidateFiles(files, async (file) => {
      try {
        const content = await readCandidateFile(file)

        const extension = toExtension(file)
        const jsStringStaticRanges = JS_LIKE_SOURCE_EXTENSION_RE.test(extension)
          ? createJsStringStaticRanges(content)
          : undefined
        for (const candidate of extractBareArbitraryValueSourceCandidatesWithPositions(content, options.bareArbitraryValues)) {
          if (shouldKeepSourceCandidate(content, extension, candidate, jsStringStaticRanges)) {
            candidates.add(candidate.rawCandidate)
          }
        }
      }
      catch {
        // 文件可能在扫描和读取之间被移除，保持与 Tailwind 原扫描结果一致。
      }
    })
  }
  const result = [...candidates]
  setRawCandidateCacheEntry(cacheKey, fingerprint, result)
  return [...result]
}
