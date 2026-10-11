import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createTailwindV4CompiledSourceEntries,
  createTailwindV4DefaultIgnoreSources,
  createTailwindV4SourceEntryMatcher,
  createTailwindV4SourceExclusionMatcher,
  expandTailwindV4SourceEntries,
  expandTailwindV4SourceEntryBraces,
  groupTailwindV4SourceEntriesByBase,
  isFileExcludedByTailwindV4SourceEntries,
  isFileMatchedByTailwindV4SourceEntries,
  mergeTailwindV4SourceEntries,
  normalizeGlobPattern,
  normalizeTailwindV4ScannerSources,
  normalizeTailwindV4SourceEntries,
  resolveSourceScanPath,
  resolveTailwindV4SourceBaseCandidates,
  resolveTailwindV4SourceEntry,
  toPosixPath,
} from '@/v4'

const tempDirs: string[] = []

async function createTempDir(prefix: string) {
  const tempDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), prefix)))
  tempDirs.push(tempDir)
  return tempDir
}

async function writeTempFile(file: string, content = '') {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, content, 'utf8')
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(tempDir => fs.rm(tempDir, { recursive: true, force: true })))
})

describe('Tailwind v4 source scan helpers', () => {
  it('normalizes @source directory, glob, file, and not entries like Tailwind v4 public sources', async () => {
    const root = await createTempDir('tw-engine-v4-source-scan-')
    await fs.mkdir(path.join(root, 'src'), { recursive: true })
    await writeTempFile(path.join(root, 'templates/card.html'))

    await expect(Promise.all([
      resolveTailwindV4SourceEntry('./src', root, false),
      resolveTailwindV4SourceEntry('./src/**/*.{html,js}', root, false),
      resolveTailwindV4SourceEntry('./templates/card.html', root, false),
      resolveTailwindV4SourceEntry('./src/legacy', root, true),
    ])).resolves.toEqual([
      { base: path.join(root, 'src'), pattern: '**/*', negated: false },
      { base: path.join(root, 'src'), pattern: '**/*.{html,js}', negated: false },
      { base: root, pattern: 'templates/card.html', negated: false },
      { base: root, pattern: 'src/legacy', negated: true },
    ])
  })

  it('merges source(none), source roots, and @source entries from compiled CSS metadata', () => {
    const root = '/project'

    expect(createTailwindV4CompiledSourceEntries('none', [{ base: root, pattern: './admin', negated: false }], root))
      .toEqual([{ base: root, pattern: './admin', negated: false }])

    expect(createTailwindV4CompiledSourceEntries(null, [], root))
      .toEqual([{ base: root, pattern: '**/*', negated: false }])

    expect(createTailwindV4CompiledSourceEntries(
      { base: root, pattern: './src' },
      [{ base: root, pattern: './legacy', negated: true }],
      root,
    )).toEqual([
      { base: root, pattern: './src', negated: false },
      { base: root, pattern: './legacy', negated: true },
    ])
  })

  it('expands brace source patterns before they are passed to the oxide scanner', () => {
    const root = '/project'

    expect(normalizeTailwindV4ScannerSources([
      { base: root, pattern: 'src/**/*.{html,tsx}', negated: false },
    ], root)).toEqual([
      { base: root, pattern: 'src/**/*.html', negated: false },
      { base: root, pattern: 'src/**/*.tsx', negated: false },
    ])
  })

  it('matches files with positive sources and excludes negative entries', async () => {
    const root = await createTempDir('tw-engine-v4-source-match-')
    const srcFile = path.join(root, 'src/page.html')
    const ignoredFile = path.join(root, 'src/legacy/page.html')
    const outsideFile = path.join(root, 'outside/page.html')
    await writeTempFile(srcFile)
    await writeTempFile(ignoredFile)
    await writeTempFile(outsideFile)

    const entries = await normalizeTailwindV4SourceEntries([
      { base: root, pattern: './src', negated: false },
      { base: root, pattern: './src/legacy', negated: true },
    ], { cwd: root })
    const matcher = createTailwindV4SourceEntryMatcher(entries)

    expect(matcher?.(srcFile)).toBe(true)
    expect(matcher?.(ignoredFile)).toBe(false)
    expect(matcher?.(outsideFile)).toBe(false)
    expect(isFileMatchedByTailwindV4SourceEntries(srcFile, entries)).toBe(true)
    expect(isFileExcludedByTailwindV4SourceEntries(ignoredFile, entries)).toBe(true)
  })

  it('keeps explicit @source paths capable of entering otherwise ignored content directories', async () => {
    const root = await createTempDir('tw-engine-v4-source-external-')
    const sourceFile = path.join(root, 'node_modules/design-system/button.html')
    await writeTempFile(sourceFile, '<button class="text-green-500"></button>')

    const files = await expandTailwindV4SourceEntries([
      { base: path.join(root, 'node_modules/design-system'), pattern: '**/*', negated: false },
    ], async ({ sources }) => {
      expect(sources).toEqual([
        { base: path.join(root, 'node_modules/design-system'), pattern: '**/*', negated: false },
      ])
      return [sourceFile]
    })

    expect(files).toEqual([sourceFile])
  })

  it('exposes official Tailwind v4 default ignored directory, extension, and file rules', () => {
    const root = '/project'
    const ignoredSources = createTailwindV4DefaultIgnoreSources(root)

    expect(ignoredSources).toEqual(expect.arrayContaining([
      { base: root, pattern: '**/node_modules/**', negated: true },
      { base: root, pattern: '**/.git/**', negated: true },
      { base: root, pattern: '**/*.scss', negated: true },
      { base: root, pattern: '**/package-lock.json', negated: true },
      { base: root, pattern: '**/.env.*', negated: true },
    ]))
  })

  it('normalizes path helpers and missing realpath fallbacks', async () => {
    const root = await createTempDir('tw-engine-v4-source-paths-')
    const existing = path.join(root, 'src')
    const missing = path.join(root, 'missing')
    await fs.mkdir(existing, { recursive: true })

    expect(toPosixPath(`a${path.sep}b${path.sep}c`)).toBe('a/b/c')
    expect(normalizeGlobPattern('./src/**/*.html')).toBe('src/**/*.html')
    expect(resolveSourceScanPath(existing)).toBe(await fs.realpath(existing))
    expect(resolveSourceScanPath(missing)).toBe(path.resolve(missing))
  })

  it('normalizes entries without explicit bases and with custom default patterns', async () => {
    const root = await createTempDir('tw-engine-v4-source-defaults-')
    await fs.mkdir(path.join(root, 'components'), { recursive: true })

    const entries = await normalizeTailwindV4SourceEntries([
      { base: '', pattern: './components', negated: false },
    ], {
      cwd: root,
      defaultPattern: '**/*.vue',
    })

    expect(entries).toEqual([
      {
        base: path.join(root, 'components'),
        pattern: '**/*.vue',
        negated: false,
      },
    ])
  })

  it('handles absolute file source entries', async () => {
    const root = await createTempDir('tw-engine-v4-source-absolute-')
    const file = path.join(root, 'pages/index.html')
    await writeTempFile(file)

    await expect(resolveTailwindV4SourceEntry(file, root, false)).resolves.toEqual({
      base: path.dirname(file),
      pattern: path.basename(file),
      negated: false,
    })
  })

  it('expands nested and escaped brace source patterns', () => {
    const root = '/project'

    expect(expandTailwindV4SourceEntryBraces([
      { base: root, pattern: 'src/{pages,{components,widgets}}/**/*.{vue,tsx}', negated: false },
      { base: root, pattern: 'src/\\{literal\\}.html', negated: false },
      { base: root, pattern: 'src/{unclosed.html', negated: false },
    ])).toEqual([
      { base: root, pattern: 'src/pages/**/*.vue', negated: false },
      { base: root, pattern: 'src/pages/**/*.tsx', negated: false },
      { base: root, pattern: 'src/components/**/*.vue', negated: false },
      { base: root, pattern: 'src/components/**/*.tsx', negated: false },
      { base: root, pattern: 'src/widgets/**/*.vue', negated: false },
      { base: root, pattern: 'src/widgets/**/*.tsx', negated: false },
      { base: root, pattern: 'src/\\{literal\\}.html', negated: false },
      { base: root, pattern: 'src/{unclosed.html', negated: false },
    ])
  })

  it('keeps unmatched brace patterns and escaped separators stable', () => {
    const root = '/project'

    expect(expandTailwindV4SourceEntryBraces([
      { base: root, pattern: 'src/{foo\\,bar,baz}.html', negated: false },
      { base: root, pattern: 'src/{foo,{bar,baz}.html', negated: false },
    ])).toEqual([
      { base: root, pattern: 'src/foo\\,bar.html', negated: false },
      { base: root, pattern: 'src/baz.html', negated: false },
      { base: root, pattern: 'src/{foo,{bar,baz}.html', negated: false },
    ])
  })

  it('returns permissive and empty matchers for omitted source entries', () => {
    expect(isFileMatchedByTailwindV4SourceEntries('/project/src/page.html', undefined)).toBe(true)
    expect(isFileExcludedByTailwindV4SourceEntries('/project/src/page.html', undefined)).toBe(false)
    expect(createTailwindV4SourceEntryMatcher(undefined)).toBeUndefined()
    expect(createTailwindV4SourceExclusionMatcher(undefined)).toBeUndefined()
  })

  it('requires at least one positive source entry for matching', () => {
    const entries = [
      { base: '/project', pattern: '**/*.html', negated: true },
    ]

    expect(isFileMatchedByTailwindV4SourceEntries('/project/src/page.html', entries)).toBe(false)
    expect(createTailwindV4SourceExclusionMatcher(entries)?.('/project/src/page.html')).toBe(true)
  })

  it('groups, merges, dedupes, and expands source entries by resolved base', async () => {
    const root = await createTempDir('tw-engine-v4-source-group-')
    const srcBase = path.join(root, 'src')
    const adminBase = path.join(root, 'admin')
    const entries = [
      { base: srcBase, pattern: './**/*.html', negated: false },
      { base: srcBase, pattern: '**/*.html', negated: false },
      { base: adminBase, pattern: '**/*.vue', negated: false },
      { base: root, pattern: 'src/legacy/**', negated: true },
    ]

    expect(groupTailwindV4SourceEntriesByBase(entries)).toEqual(new Map([
      [path.resolve(srcBase), [
        { base: path.resolve(srcBase), pattern: '**/*.html', negated: false },
        { base: path.resolve(srcBase), pattern: '**/*.html', negated: false },
      ]],
      [path.resolve(adminBase), [
        { base: path.resolve(adminBase), pattern: '**/*.vue', negated: false },
      ]],
      [path.resolve(root), [
        { base: path.resolve(root), pattern: 'src/legacy/**', negated: true },
      ]],
    ]))

    expect(mergeTailwindV4SourceEntries(entries, undefined)).toEqual([
      { base: path.resolve(srcBase), pattern: '**/*.html', negated: false },
      { base: path.resolve(adminBase), pattern: '**/*.vue', negated: false },
      { base: path.resolve(root), pattern: 'src/legacy/**', negated: true },
    ])

    const expanded = await expandTailwindV4SourceEntries(entries, async ({ cwd, sources }) => {
      if (cwd === path.resolve(srcBase)) {
        expect(sources).toEqual([
          { base: path.resolve(srcBase), pattern: '**/*.html', negated: false },
          { base: path.resolve(srcBase), pattern: '**/*.html', negated: false },
        ])
        return [
          path.join(srcBase, 'page.html'),
          path.join(srcBase, 'legacy/page.html'),
        ]
      }
      if (cwd === path.resolve(adminBase)) {
        return [path.join(adminBase, 'panel.vue')]
      }
      return []
    })

    expect(expanded.sort()).toEqual([
      path.resolve(adminBase, 'panel.vue'),
      path.resolve(srcBase, 'page.html'),
    ].sort())
    await expect(expandTailwindV4SourceEntries([], async () => [])).resolves.toEqual([])
  })

  it('dedupes source base candidates while preserving useful fallbacks', () => {
    const root = path.resolve('/project')
    const fallback = path.resolve('/fallback')

    expect(resolveTailwindV4SourceBaseCandidates(root, root, ['', fallback, fallback])).toEqual([
      root,
      fallback,
    ])
  })
})
