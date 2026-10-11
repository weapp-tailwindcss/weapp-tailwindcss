import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  collectCssInlineSourceCandidates,
  createTailwindSourceEntryMatcher,
  expandTailwindSourceEntries,
  isFileExcludedByTailwindSourceEntries,
  isFileMatchedByTailwindSourceEntries,
  normalizeLegacyContentEntries,
  parseConfigParam,
  parseSourceFileParam,
  resolveTailwindV4CssSourceBase,
  resolveSourceScanPath,
  resolveTailwindSourceEntry,
  toPosixPath,
} from '@/tailwindcss/source-scan'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import postcss from 'postcss'

describe('tailwindcss source scan', () => {
  it('moves static relative glob prefixes into the scan base', async () => {
    const entry = await resolveTailwindSourceEntry(
      '../src/**/*.{vue,js,ts}',
      '/project/src',
      false,
    )

    expect(entry).toEqual({
      base: path.resolve('/project/src/../src'),
      negated: false,
      pattern: '**/*.{vue,js,ts}',
    })
  })

  it('keeps negated static relative glob prefixes matchable', async () => {
    const entry = await resolveTailwindSourceEntry(
      '../src/uni_modules/**/*',
      '/project/src',
      true,
    )

    expect(entry).toEqual({
      base: path.resolve('/project/src/../src/uni_modules'),
      negated: true,
      pattern: '**/*',
    })
  })

  it('normalizes legacy content entries with relative nested configs', () => {
    expect(normalizeLegacyContentEntries({
      files: ['./pages/**/*.vue'],
      relative: true,
    }, '/project', { relativeBase: '/project/app' })).toEqual([{
      base: '/project/app',
      negated: false,
      pattern: 'pages/**/*.vue',
    }])
  })

  it('parses source and config directives with not and quoted params', () => {
    expect(parseSourceFileParam(`not './src/pages/**/*.vue'`)).toEqual({
      negated: true,
      sourcePath: './src/pages/**/*.vue',
    })
    expect(parseSourceFileParam('inline("p-4")')).toBeUndefined()
    expect(parseConfigParam(`'./tailwind.config.ts'`)).toBe('./tailwind.config.ts')
  })

  it('keeps empty brace parts for Tailwind v4 inline source variants', () => {
    const inlineCandidates = collectCssInlineSourceCandidates(postcss.parse([
      '@source inline("{hover:,focus:,}underline p-{2..6..2}");',
      '@source not inline("p-4");',
    ].join('\n')))

    expect(inlineCandidates.included).toEqual(new Set([
      'hover:underline',
      'focus:underline',
      'underline',
      'p-2',
      'p-6',
    ]))
    expect(inlineCandidates.excluded).toEqual(new Set(['p-4']))
  })

  it('expands nested inline source groups, descending ranges, and ignores malformed directives', () => {
    const inlineCandidates = collectCssInlineSourceCandidates(postcss.parse([
      '@source inline("m-{3..1} gap-{1..5..-2} {sm:,md:}hover:{underline,focus:{block,hidden}} text-[url(https://x.test/a,b)]");',
      '@source inline("bad-{1..3..0}");',
      '@source inline(unquoted);',
      '@source "./src";',
      '@source not inline("md:hover:hidden");',
    ].join('\n')))

    expect(inlineCandidates.included).toEqual(new Set([
      'm-3',
      'm-2',
      'm-1',
      'gap-1',
      'gap-3',
      'gap-5',
      'sm:hover:underline',
      'sm:hover:focus:block',
      'sm:hover:focus:hidden',
      'md:hover:underline',
      'md:hover:focus:block',
      'md:hover:focus:hidden',
      'text-[url(https://x.test/a,b)]',
    ]))
    expect(inlineCandidates.excluded).toEqual(new Set(['md:hover:hidden']))
    expect(collectCssInlineSourceCandidates(postcss.parse('@source not inline("");')).included).toEqual(new Set())
  })

  it('keeps inline source separators inside quotes, brackets, parens, and escaped characters', () => {
    const inlineCandidates = collectCssInlineSourceCandidates(postcss.parse([
      String.raw`@source inline("content-['a b'] bg-[url\(a b\)] grid-cols-[repeat(2,_minmax(0,_1fr))] literal-\{x\}");`,
      '@source inline("broken-{1..3");',
      '@source inline("bad-{1..3..0}");',
    ].join('\n')))

    expect(inlineCandidates.included).toEqual(new Set([
      String.raw`content-['a b']`,
      String.raw`bg-[url\(a b\)]`,
      'grid-cols-[repeat(2,_minmax(0,_1fr))]',
      'literal-\\x\\',
      'broken-{1..3',
    ]))
  })

  it('matches source entries and resolves source bases across edge cases', async () => {
    const entries = [
      {
        base: '/project/src',
        negated: true,
        pattern: 'ignored/**',
      },
    ]

    expect(toPosixPath(path.join('a', 'b'))).toBe('a/b')
    expect(isFileExcludedByTailwindSourceEntries('/project/src/ignored/a.wxml', undefined)).toBe(false)
    expect(isFileExcludedByTailwindSourceEntries('/project/src/ignored/a.wxml', entries)).toBe(true)
    expect(isFileMatchedByTailwindSourceEntries('/project/src/index.wxml', undefined)).toBe(true)
    expect(isFileMatchedByTailwindSourceEntries('/project/src/ignored/a.wxml', entries)).toBe(false)
    const windowsEntries = [
      {
        base: 'C:\\workspace\\src',
        negated: false,
        pattern: '**/*.tsx',
      },
      {
        base: 'C:\\workspace\\src',
        negated: true,
        pattern: 'ignored/**',
      },
    ]
    expect(isFileMatchedByTailwindSourceEntries('C:\\workspace\\src\\pages\\index.tsx', windowsEntries)).toBe(true)
    expect(isFileMatchedByTailwindSourceEntries('C:\\workspace\\src\\ignored\\index.tsx', windowsEntries)).toBe(false)
    expect(isFileMatchedByTailwindSourceEntries('D:\\workspace\\src\\pages\\index.tsx', windowsEntries)).toBe(false)
    expect(createTailwindSourceEntryMatcher(undefined)).toBeUndefined()
    expect(createTailwindSourceEntryMatcher(entries)?.('/project/src/index.wxml')).toBe(true)
    expect(resolveTailwindV4CssSourceBase({ base: '/base', file: '/file.css' }, '/fallback')).toBe('/base')
    expect(resolveTailwindV4CssSourceBase({ base: '', file: '/project/src/app.css' }, '/fallback')).toBe('/project/src')
    expect(resolveTailwindV4CssSourceBase({ base: '', file: '' }, '/fallback')).toBe('/fallback')
    expect(normalizeLegacyContentEntries(['./pages/**/*.vue', '!./ignored/**'], '/project')).toEqual([
      { base: '/project', negated: false, pattern: 'pages/**/*.vue' },
      { base: '/project', negated: true, pattern: 'ignored/**' },
    ])
    expect(normalizeLegacyContentEntries(123, '/project')).toEqual([])

    const absolute = await resolveTailwindSourceEntry('/project/src/pages/**/*.wxml', '/fallback', false)
    expect(absolute).toEqual({
      base: path.resolve('/project/src/pages'),
      negated: false,
      pattern: '**/*.wxml',
    })
    const absoluteFile = await resolveTailwindSourceEntry('/project/src/app.wxml', '/fallback', false)
    expect(absoluteFile).toEqual({
      base: path.resolve('/project/src'),
      negated: false,
      pattern: 'app.wxml',
    })
  })

  it('keeps files resolved by grouped positive entries when applying final excludes', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'weapp-tw-source-scan-'))
    await mkdir(path.join(cwd, 'src'), { recursive: true })
    await writeFile(path.join(cwd, 'src/index.wxml'), '<view class="text-white"></view>')

    const files = await expandTailwindSourceEntries([{
      base: path.join(cwd, 'src'),
      negated: false,
      pattern: '**/*.wxml',
    }])

    expect(files).toEqual([resolveSourceScanPath(path.join(cwd, 'src/index.wxml'))])
  })

  it('removes files matching negated entries after grouped source expansion', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'weapp-tw-source-scan-'))
    await mkdir(path.join(cwd, 'src/ignored'), { recursive: true })
    await writeFile(path.join(cwd, 'src/index.wxml'), '<view class="text-white"></view>')
    await writeFile(path.join(cwd, 'src/ignored/index.wxml'), '<view class="text-red-500"></view>')

    const files = await expandTailwindSourceEntries([
      {
        base: path.join(cwd, 'src'),
        negated: false,
        pattern: '**/*.wxml',
      },
      {
        base: path.join(cwd, 'src'),
        negated: true,
        pattern: 'ignored/**',
      },
    ])

    expect(files).toEqual([resolveSourceScanPath(path.join(cwd, 'src/index.wxml'))])
  })

  it('treats absolute source entries and excluded files consistently', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'weapp-tw-source-scan-'))
    await mkdir(path.join(cwd, 'src/components'), { recursive: true })
    await writeFile(path.join(cwd, 'src/components/card.vue'), '<view class="text-white"></view>')

    const files = await expandTailwindSourceEntries([
      {
        base: cwd,
        negated: false,
        pattern: path.join(cwd, 'src/**/*.vue'),
      },
      {
        base: cwd,
        negated: true,
        pattern: 'src/components/**',
      },
    ])

    expect(files).toEqual([])
  })
})
