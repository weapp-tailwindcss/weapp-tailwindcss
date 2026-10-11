import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createJsStringSourceSegments,
  createJsStringStaticRanges,
  isCandidateInsideJsStringStaticRanges,
} from '@/extraction/js-string-ranges'
import { createOxideRuntimeDependencyError, getOxideModule } from '@/extraction/oxide'
import {
  buildLineOffsets,
  createTokenLocation,
  resolveLineMeta,
  toExtension,
  toRelativeFile,
} from '@/extraction/project-report'
import {
  createRawCandidateCacheKey,
  createRawCandidateFileFingerprint,
  getRawCandidateCacheEntry,
  resolveRawCandidateCacheLimit,
  setRawCandidateCacheEntry,
} from '@/extraction/raw-candidate-cache'
import {
  createBareArbitraryValueCandidateContexts,
  extractBatchedSourceSegmentCandidates,
  findJoinedSourceSegment,
  joinSourceSegments,
} from '@/extraction/segments'
import { findAttributeValueStart } from '@/extraction/sfc'
import {
  createLocalCandidate,
  dedupeCandidatesWithPositions,
  isClassLikeCandidate,
  shouldKeepSourceCandidate,
} from '@/extraction/source-filters'

const tempDirs: string[] = []

async function createTempDir(prefix: string) {
  const tempDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), prefix)))
  tempDirs.push(tempDir)
  return tempDir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(tempDir => fs.rm(tempDir, { recursive: true, force: true })))
})

describe('extraction helper modules', () => {
  it('tracks JavaScript static string ranges through escapes, templates, and unterminated strings', () => {
    const content = [
      'const a = "text-red-500 \\"still-string\\""',
      'const b = `grid $' + '{condition ? "text-blue-500" : `gap-4`} px-4`',
      'const c = "font-bold',
    ].join('\n')
    const ranges = createJsStringStaticRanges(content)

    expect(ranges.map(range => content.slice(range.start, range.end))).toEqual([
      'text-red-500 \\"still-string\\"',
      'grid ',
      'grid $' + '{condition ? "text-blue-500" : `gap-4`} px-4',
      'font-bold',
    ])
    expect(isCandidateInsideJsStringStaticRanges(ranges, content.indexOf('text-red-500'))).toBe(true)
    expect(isCandidateInsideJsStringStaticRanges(ranges, content.indexOf('const b'))).toBe(false)
    expect(createJsStringSourceSegments(content, 10).at(-1)).toEqual({
      content: 'font-bold',
      start: 10 + content.indexOf('font-bold'),
    })
    expect(createJsStringStaticRanges('const tpl = `grid $' + '{(() => "unterminated")')).toEqual([
      {
        start: 'const tpl = `'.length,
        end: 'const tpl = `grid '.length,
      },
    ])
    expect(createJsStringStaticRanges('const tpl = `grid $' + '{"a\\"b"} px-4`')).toEqual([
      {
        start: 'const tpl = `'.length,
        end: 'const tpl = `grid '.length,
      },
      {
        start: 'const tpl = `'.length,
        end: ('const tpl = `grid $' + '{"a\\"b"} px-4').length,
      },
    ])
    expect(createJsStringStaticRanges('const tpl = `grid $' + '{"unterminated}')).toEqual([
      {
        start: 'const tpl = `'.length,
        end: 'const tpl = `grid '.length,
      },
    ])
    const sparseRanges = Array.from({ length: 2 }) as Array<{ start: number, end: number } | undefined>
    sparseRanges[1] = { start: 10, end: 20 }
    expect(isCandidateInsideJsStringStaticRanges(sparseRanges as never, 5)).toBe(false)
  })

  it('joins source segments and maps batched candidate offsets back to original segments', async () => {
    const segments = [
      { content: 'text-red-500', start: 100 },
      { content: 'bg-blue-500', start: 200 },
    ]
    const joined = joinSourceSegments(segments)

    expect(joined.content).toBe('text-red-500\nbg-blue-500')
    expect(findJoinedSourceSegment(joined.segments, 0)).toEqual({
      content: 'text-red-500',
      start: 100,
      joinedStart: 0,
    })
    expect(findJoinedSourceSegment(joined.segments, joined.content.length + 1)).toBeUndefined()
    const sparseSegments = Array.from({ length: 2 }) as Array<{ content: string, start: number, joinedStart: number } | undefined>
    sparseSegments[1] = { content: 'x', start: 0, joinedStart: 0 }
    expect(findJoinedSourceSegment(sparseSegments as never, 0)).toBeUndefined()

    const extractor = vi.fn(async () => [
      { rawCandidate: 'text-red-500', start: 0, end: 'text-red-500'.length },
      { rawCandidate: 'bg-blue-500', start: 'text-red-500\n'.length, end: joined.content.length },
      { rawCandidate: 'cross-boundary', start: 'text-red-500'.length - 2, end: 'text-red-500\nbg-blue-500'.length },
    ])
    await expect(extractBatchedSourceSegmentCandidates(segments, 'html', extractor)).resolves.toEqual([
      {
        content: joined.content,
        extension: 'html',
        localStart: 0,
        rawCandidate: 'text-red-500',
        skipHtmlContextChecks: true,
        start: 100,
        end: 112,
      },
      {
        content: joined.content,
        extension: 'html',
        localStart: 13,
        rawCandidate: 'bg-blue-500',
        skipHtmlContextChecks: true,
        start: 200,
        end: 211,
      },
    ])
    await expect(extractBatchedSourceSegmentCandidates([], 'html', extractor)).resolves.toEqual([])
    expect(createBareArbitraryValueCandidateContexts('p-10%', 'html', 5, { bareArbitraryValues: true })).toEqual([
      {
        content: 'p-10%',
        extension: 'html',
        localStart: 0,
        rawCandidate: 'p-10%',
        start: 5,
        end: 10,
      },
    ])
  })

  it('filters source candidates by HTML, CSS, and JS context', () => {
    expect(shouldKeepSourceCandidate('<div class="text-red-500"></div>', 'html', {
      rawCandidate: 'class',
      start: 5,
      end: 10,
    })).toBe(false)
    expect(shouldKeepSourceCandidate('<div>text-red-500<span></span></div>', 'html', {
      rawCandidate: 'text-red-500',
      start: 5,
      end: 17,
    })).toBe(false)
    expect(shouldKeepSourceCandidate('@tailwind utilities;', 'css', {
      rawCandidate: '@tailwind',
      start: 0,
      end: 9,
    })).toBe(false)
    expect(shouldKeepSourceCandidate('.x { color: red; }', 'css', {
      rawCandidate: 'red',
      start: 12,
      end: 15,
    })).toBe(false)
    expect(shouldKeepSourceCandidate('.x { @apply text-red-500; }', 'css', {
      rawCandidate: 'text-red-500',
      start: 12,
      end: 24,
    })).toBe(true)
    expect(shouldKeepSourceCandidate('const cls = "text-red-500"', 'js', {
      rawCandidate: 'cls',
      start: 6,
      end: 9,
    })).toBe(false)
    expect(shouldKeepSourceCandidate('const cls = "text-red-500"', 'js', {
      rawCandidate: 'text-red-500',
      start: 13,
      end: 25,
    })).toBe(true)
    expect(shouldKeepSourceCandidate('<div class="text-red-500"></div>', 'html', {
      rawCandidate: 'class',
      start: 5,
      end: 10,
    }, undefined, true)).toBe(true)
    expect(isClassLikeCandidate('hello')).toBe(false)
    expect(isClassLikeCandidate('text-red-500')).toBe(true)
    expect(createLocalCandidate({
      content: '',
      extension: 'html',
      localStart: 3,
      rawCandidate: 'text-red-500',
      start: 10,
      end: 22,
    })).toEqual({
      rawCandidate: 'text-red-500',
      start: 3,
      end: 15,
    })
    expect(dedupeCandidatesWithPositions([
      { rawCandidate: 'a', start: 0, end: 1 },
      { rawCandidate: 'a', start: 0, end: 1 },
      { rawCandidate: 'a', start: 1, end: 2 },
    ])).toEqual([
      { rawCandidate: 'a', start: 0, end: 1 },
      { rawCandidate: 'a', start: 1, end: 2 },
    ])
    expect(findAttributeValueStart('class', 'text-red-500')).toBe(-1)
    expect(findAttributeValueStart('class = "text-red-500"', 'text-red-500')).toBe(9)
  })

  it('builds project report line metadata and token locations', () => {
    const content = 'first\nsecond text-red-500\nthird'
    const offsets = buildLineOffsets(content)
    const position = content.indexOf('text-red-500')

    expect(offsets).toEqual([0, 6, 26, content.length])
    expect(resolveLineMeta(content, offsets, position)).toEqual({
      line: 2,
      column: 8,
      lineText: 'second text-red-500',
    })
    expect(resolveLineMeta(content, offsets, content.length + 5)).toEqual({
      line: 3,
      column: 11,
      lineText: 'third',
    })
    expect(resolveLineMeta('', [], 3)).toEqual({
      line: -1,
      column: 4,
      lineText: '',
    })
    const sparseOffsets = Array.from({ length: 2 }) as Array<number | undefined>
    sparseOffsets[1] = 2
    expect(resolveLineMeta('abc', sparseOffsets as never, 0)).toEqual({
      line: 1,
      column: 1,
      lineText: 'abc',
    })
    expect(toExtension('/project/component')).toBe('txt')
    expect(toExtension('/project/component.vue')).toBe('vue')
    expect(toRelativeFile('/project', '/project')).toBe('project')
    expect(toRelativeFile('/project', '/project/src/page.html')).toBe('src/page.html')
    expect(createTokenLocation({
      cwd: '/project',
      file: '/project/src/page.html',
      content,
      extension: 'html',
      candidate: 'text-red-500',
      position,
      offsets,
    })).toMatchObject({
      rawCandidate: 'text-red-500',
      file: '/project/src/page.html',
      relativeFile: 'src/page.html',
      extension: 'html',
      start: position,
      end: position + 'text-red-500'.length,
      length: 'text-red-500'.length,
      line: 2,
      column: 8,
      lineText: 'second text-red-500',
    })
  })

  it('keys, fingerprints, and evicts raw candidate cache entries', async () => {
    const root = await createTempDir('tw-engine-raw-helper-')
    const file = path.join(root, 'page.html')
    await fs.writeFile(file, '<div class="text-red-500"></div>', 'utf8')

    expect(createRawCandidateCacheKey(undefined)).toBe(JSON.stringify({
      sources: null,
      bareArbitraryValues: null,
    }))
    expect(resolveRawCandidateCacheLimit(undefined)).toBe(64)
    expect(resolveRawCandidateCacheLimit('0')).toBe(64)
    expect(resolveRawCandidateCacheLimit('bad')).toBe(64)
    expect(resolveRawCandidateCacheLimit('8')).toBe(8)
    expect(createRawCandidateCacheKey([{ base: root, pattern: '*.html', negated: false }], { bareArbitraryValues: true }))
      .toBe(JSON.stringify({
        sources: [{ base: root, pattern: '*.html', negated: false }],
        bareArbitraryValues: true,
      }))
    await expect(createRawCandidateFileFingerprint(undefined)).resolves.toBe('')
    await expect(createRawCandidateFileFingerprint([file, path.join(root, 'missing.html')]))
      .resolves
      .toContain(`${path.join(root, 'missing.html')}:missing`)

    setRawCandidateCacheEntry('cache-a', 'fingerprint-a', ['text-red-500'])
    expect(getRawCandidateCacheEntry('cache-a', 'fingerprint-b')).toBeUndefined()
    expect(getRawCandidateCacheEntry('cache-a', 'fingerprint-a')?.candidates).toEqual(['text-red-500'])

    for (let index = 0; index < 70; index++) {
      setRawCandidateCacheEntry(`cache-${index}`, 'fingerprint', [`text-${index}`])
    }
    expect(getRawCandidateCacheEntry('cache-a', 'fingerprint-a')).toBeUndefined()
  })

  it('creates an actionable oxide runtime dependency error', () => {
    const cause = new Error('missing optional dependency')
    const error = createOxideRuntimeDependencyError(cause)

    expect(error.message).toContain('could not load @tailwindcss/oxide')
    expect(error.message).toContain('install @tailwindcss/oxide')
    expect(error.cause).toBe(cause)
  })

  it('loads the oxide module through the cached loader', async () => {
    const oxide = await getOxideModule()
    const cached = await getOxideModule()

    expect(oxide).toBe(cached)
    expect(typeof oxide.Scanner).toBe('function')
  })
})
