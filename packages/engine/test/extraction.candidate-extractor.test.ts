import { promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  extractProjectCandidatesWithPositions,
  extractRawCandidates,
  extractRawCandidatesWithPositions,
  extractSourceCandidates,
  extractSourceCandidatesWithPositions,
  extractValidCandidates,
  groupTokensByFile,
  resolveProjectSourceFiles,
} from '@/extraction/candidate-extractor'

const require = createRequire(import.meta.url)
const fixturesRoot = path.resolve(__dirname, 'fixtures')
const tokenFixturesRoot = path.resolve(fixturesRoot, 'token-scan')
const tailwindNodeBase = path.dirname(require.resolve('@tailwindcss/node'))
const v42FeaturePattern = 'v4/features-4.2.html'
const isWindows = process.platform === 'win32'

const v42UtilityCandidates = [
  'text-shadow-md',
  'inset-ring-2',
  'field-sizing-content',
  'font-stretch-120%',
  'inline-4',
  'min-inline-8',
  'max-inline-12',
  'block-4',
  'min-block-8',
  'max-block-12',
  'pbs-4',
  'pbe-6',
  'inset-bs-2',
  'inset-be-3',
  'ms-4',
  'me-6',
  'border-s',
  'border-e',
  'rounded-s',
  'rounded-e',
  'start-4',
  'end-4',
  'scheme-dark',
  'text-wrap',
  'text-pretty',
  'text-balance',
  'mask-none',
  'mask-linear-45',
  'mask-radial-at-center',
]

const v42VariantCandidates = [
  'inert:opacity-50',
  'nth-3:bg-red-500',
  'nth-last-2:bg-blue-500',
  'nth-of-type-4:text-green-500',
  'nth-last-of-type-5:underline',
]
const tempDirs: string[] = []

async function createTempDir(prefix: string) {
  const tempDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), prefix)))
  tempDirs.push(tempDir)
  return tempDir
}

async function writeTempFile(file: string, content: string) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, content, 'utf8')
}

describe('candidate extractor', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(tempDir => fs.rm(tempDir, { recursive: true, force: true })))
  })

  it('returns candidate positions for raw content', async () => {
    const html = '<div class="text-blue-500 font-bold"></div>'
    const result = await extractRawCandidatesWithPositions(html)
    const classes = result.map(item => item.rawCandidate)
    expect(classes).toContain('text-blue-500')
    expect(result[0]).toHaveProperty('start')
  })

  it('extracts source candidates without html attribute names', async () => {
    const result = await extractSourceCandidates(
      '<view class="text-[23px] bg-[#123456] !-mt-[1.5px]"></view>',
      'wxml',
    )

    expect(result).toEqual(expect.arrayContaining(['text-[23px]', 'bg-[#123456]', '!-mt-[1.5px]']))
    expect(result).not.toContain('class')
  })

  it('extracts UnoCSS-style bare arbitrary source candidates when enabled', async () => {
    const source = '<view class="text-var(--brand) w-calc(100%-1rem) bg-#fff text-rgb(255,0,0) hover:!p-2.5px sm:-top-1.5rem"></view>'

    await expect(extractSourceCandidates(source, 'wxml')).resolves.toEqual([
      'hover:!p-2.5px',
      'sm:-top-1.5rem',
    ])
    await expect(extractSourceCandidates(source, 'wxml', { bareArbitraryValues: true })).resolves.toEqual([
      'hover:!p-2.5px',
      'sm:-top-1.5rem',
      'text-var(--brand)',
      'w-calc(100%-1rem)',
      'bg-#fff',
      'text-rgb(255,0,0)',
    ])
  })

  it('extracts source candidates from JavaScript string content only', async () => {
    const result = await extractSourceCandidates(
      [
        'document.body.append(`<div class="$' + '{className}">className</div>`)',
        'const className = "flex bg-yellow-300/30 w-[100px]"',
        'const templateClass = `grid $' + '{invalidExpressionClass} gap-4 $' + '{condition ? "text-red-500" : "text-blue-500"} px-3`',
      ].join('\n'),
      'js',
    )

    expect(result).toEqual(expect.arrayContaining([
      'flex',
      'bg-yellow-300/30',
      'w-[100px]',
      'grid',
      'text-red-500',
      'text-blue-500',
      'gap-4',
      'px-3',
    ]))
    expect(result).not.toContain('className')
    expect(result).not.toContain('invalidExpressionClass')
  })

  it('extracts CSS @apply params without directive tokens', async () => {
    const result = await extractSourceCandidates(
      '.x { @apply flex bg-[#123456] px-[12px] !mt-[1.5px] hover:text-[13px] !important; }',
      'css',
    )

    expect(result).toEqual(['flex', 'bg-[#123456]', 'px-[12px]', '!mt-[1.5px]', 'hover:text-[13px]'])
    expect(result).not.toContain('x')
  })

  it('resolves project source files with Tailwind v4 scanner default ignores', async () => {
    const root = await createTempDir('tw-engine-source-files-')
    await writeTempFile(path.join(root, '.gitignore'), 'ignored-by-gitignore.html\n')
    await writeTempFile(path.join(root, 'src/page.html'), '<div class="text-green-500"></div>')
    await writeTempFile(path.join(root, 'node_modules/pkg/page.html'), '<div class="text-red-500"></div>')
    await writeTempFile(path.join(root, '.next/server/page.html'), '<div class="text-cyan-500"></div>')
    await writeTempFile(path.join(root, '.svelte-kit/page.html'), '<div class="text-orange-500"></div>')
    await writeTempFile(path.join(root, '.turbo/page.html'), '<div class="text-purple-500"></div>')
    await writeTempFile(path.join(root, 'ignored-by-gitignore.html'), '<div class="text-blue-500"></div>')
    await writeTempFile(path.join(root, 'src/ignored.scss'), '.x { @apply text-yellow-500; }')
    await writeTempFile(path.join(root, 'src/debug.log'), 'text-zinc-500')
    await writeTempFile(path.join(root, 'package-lock.json'), '{"class":"text-pink-500"}')
    await writeTempFile(path.join(root, 'pnpm-lock.yaml'), 'text-indigo-500')
    await writeTempFile(path.join(root, '.env.local'), 'text-rose-500')

    const files = await resolveProjectSourceFiles({ cwd: root })

    expect(files.map(file => path.relative(root, file)).sort()).toEqual(['src/page.html'])
  })

  it('expands brace source patterns before passing them to the Tailwind v4 scanner', async () => {
    const root = await createTempDir('tw-engine-source-files-brace-')
    await writeTempFile(path.join(root, 'src/page.ts'), 'export const cls = "text-green-500"')
    await writeTempFile(path.join(root, 'src/page.tsx'), 'export const cls = "text-blue-500"')
    await writeTempFile(path.join(root, 'src/page.vue'), '<template><div class="text-red-500"></div></template>')

    const files = await resolveProjectSourceFiles({
      cwd: root,
      sources: [{
        base: root,
        pattern: 'src/**/*.{ts,tsx}',
        negated: false,
      }],
    })

    expect(files.map(file => path.relative(root, file)).sort()).toEqual(['src/page.ts', 'src/page.tsx'])
  })

  it('lets explicit source patterns include extensions ignored by default', async () => {
    const root = await createTempDir('tw-engine-source-files-explicit-')
    const scssFile = path.join(root, 'src/explicit.scss')
    await writeTempFile(scssFile, '.x { @apply text-yellow-500; }')

    const files = await resolveProjectSourceFiles({
      cwd: root,
      sources: [{
        base: path.join(root, 'src'),
        pattern: 'explicit.scss',
        negated: false,
      }],
    })

    expect(files.map(file => path.normalize(file))).toEqual([path.normalize(scssFile)])
  })

  it('resolves Tailwind v4 @source paths and @source not paths from css like official integrations', async () => {
    const root = await createTempDir('tw-engine-source-files-css-')
    await writeTempFile(path.join(root, 'src/page.html'), '<div class="text-green-500"></div>')
    await writeTempFile(path.join(root, 'src/legacy/page.html'), '<div class="text-red-500"></div>')
    await writeTempFile(path.join(root, 'vendor/ui/button.html'), '<button class="text-blue-500"></button>')
    await writeTempFile(path.join(root, 'outside/page.html'), '<div class="text-pink-500"></div>')

    const files = await resolveProjectSourceFiles({
      cwd: root,
      base: root,
      baseFallbacks: [tailwindNodeBase],
      css: [
        '@import "tailwindcss" source("./src");',
        '@source not "./src/legacy";',
        '@source "./vendor/ui";',
      ].join('\n'),
    })

    expect(files.map(file => path.relative(root, file)).sort()).toEqual([
      'src/page.html',
      'vendor/ui/button.html',
    ])
  })

  it('respects @import "tailwindcss" source(none) when resolving css sources', async () => {
    const root = await createTempDir('tw-engine-source-files-none-')
    await writeTempFile(path.join(root, 'src/page.html'), '<div class="text-green-500"></div>')
    await writeTempFile(path.join(root, 'admin/page.html'), '<div class="text-red-500"></div>')
    await writeTempFile(path.join(root, 'shared/page.html'), '<div class="text-blue-500"></div>')

    const files = await resolveProjectSourceFiles({
      cwd: root,
      base: root,
      baseFallbacks: [tailwindNodeBase],
      css: [
        '@import "tailwindcss" source(none);',
        '@source "./admin";',
        '@source "./shared";',
      ].join('\n'),
    })

    expect(files.map(file => path.relative(root, file)).sort()).toEqual([
      'admin/page.html',
      'shared/page.html',
    ])
  })

  it('uses the Tailwind v4 default source root when css has no source override', async () => {
    const root = await createTempDir('tw-engine-source-files-default-root-')
    await writeTempFile(path.join(root, 'src/page.html'), '<div class="text-green-500"></div>')
    await writeTempFile(path.join(root, 'node_modules/pkg/page.html'), '<div class="text-red-500"></div>')

    const files = await resolveProjectSourceFiles({
      cwd: root,
      base: root,
      baseFallbacks: [tailwindNodeBase],
      css: '@import "tailwindcss";',
    })

    expect(files.map(file => path.relative(root, file)).sort()).toEqual(['src/page.html'])
  })

  it('invalidates raw candidate cache when scanned files change', async () => {
    const root = await createTempDir('tw-engine-raw-cache-')
    const file = path.join(root, 'src/page.html')
    const sources = [{
      base: root,
      pattern: 'src/**/*.html',
      negated: false,
    }]

    await writeTempFile(file, '<div class="text-red-500"></div>')
    await expect(extractRawCandidates(sources)).resolves.toContain('text-red-500')

    await new Promise(resolve => setTimeout(resolve, 5))
    await writeTempFile(file, '<div class="text-sky-500"></div>')
    const result = await extractRawCandidates(sources)
    expect(result).toContain('text-sky-500')
    expect(result).not.toContain('text-red-500')
  })

  it('keeps raw candidate cache bounded with lru eviction', async () => {
    const root = await createTempDir('tw-engine-raw-cache-lru-')
    for (let index = 0; index < 65; index++) {
      await writeTempFile(
        path.join(root, `src/page-${index}.html`),
        `<div class="text-red-${index === 0 ? '500' : '600'}"></div>`,
      )
    }

    for (let index = 0; index < 65; index++) {
      await extractRawCandidates([{
        base: root,
        pattern: `src/page-${index}.html`,
        negated: false,
      }])
    }

    const firstFile = path.join(root, 'src/page-0.html')
    await new Promise(resolve => setTimeout(resolve, 5))
    await writeTempFile(firstFile, '<div class="text-sky-500"></div>')

    const result = await extractRawCandidates([{
      base: root,
      pattern: 'src/page-0.html',
      negated: false,
    }])
    expect(result).toContain('text-sky-500')
    expect(result).not.toContain('text-red-500')
  })

  it.each(['vue', 'uvue', 'nvue'])('extracts source candidates from mixed %s template and script content', async (extension) => {
    const result = await extractSourceCandidates(
      [
        '<template><view class="bg-[#000020] text-[23.000020px]"></view></template>',
        '<script setup>',
        'const className = "flex w-[100px]"',
        '</script>',
      ].join('\n'),
      extension,
    )

    expect(result).toEqual(expect.arrayContaining([
      'bg-[#000020]',
      'text-[23.000020px]',
      'flex',
      'w-[100px]',
    ]))
    expect(result).not.toContain('class')
    expect(result).not.toContain('className')
  })

  it('extracts source candidates from Vue bound class attributes', async () => {
    const result = await extractSourceCandidates(
      [
        '<template>',
        '<view :class="[active && \'text-red-500\', { \'bg-blue-500\': ok }, `gap-4 $' + '{ignored}`]" hover-class="opacity-80" />',
        '</template>',
      ].join('\n'),
      'vue',
    )

    expect(result).toEqual(expect.arrayContaining([
      'text-red-500',
      'bg-blue-500',
      'gap-4',
      'opacity-80',
    ]))
    expect(result).not.toContain('active')
    expect(result).not.toContain('ok')
    expect(result).not.toContain('ignored')
  })

  it('extracts source candidates from Vue style @apply params', async () => {
    const result = await extractSourceCandidates(
      [
        '<template><view class="text-sky-500"></view></template>',
        '<style scoped>',
        '.primary { @apply inline-flex items-center !important; }',
        '</style>',
      ].join('\n'),
      'vue',
    )

    expect(result).toEqual(expect.arrayContaining([
      'text-sky-500',
      'inline-flex',
      'items-center',
    ]))
    expect(result).not.toContain('primary')
    expect(result).not.toContain('!important')
  })

  it('extracts Vue non-html template candidates using the template language preprocessor', async () => {
    const source = [
      '<template lang="pug">',
      '.bg-neutral-900.text-red-500 This is a test.',
      '</template>',
    ].join('\n')

    const result = await extractSourceCandidates(source, 'vue')
    const resultWithPositions = await extractSourceCandidatesWithPositions(source, 'vue')

    expect(result).toEqual(expect.arrayContaining([
      'bg-neutral-900',
      'text-red-500',
    ]))
    expect(result).not.toContain('lang')
    expect(result).not.toContain('pug')
    expect(result).not.toContain('is')
    expect(result).not.toContain('test')
    expect(resultWithPositions.find(candidate => candidate.rawCandidate === 'bg-neutral-900')?.start)
      .toBe(source.indexOf('bg-neutral-900'))
  })

  it('handles Vue template lang variants, unquoted attributes, and html template fast path', async () => {
    const htmlSource = [
      '<template lang=html>',
      '<view class = text-green-500 :class="`px-4 $' + '{active ? \'text-red-500\' : \'text-blue-500\'}`" bind:class="ok && \'font-bold\'" />',
      '</template>',
    ].join('\n')
    const pugSource = [
      '<template lang=\'pug\'>',
      '.bg-neutral-900.text-red-500',
      '</template>',
    ].join('\n')

    await expect(extractSourceCandidates(htmlSource, '.vue')).resolves.toEqual(expect.arrayContaining([
      'text-green-500',
      'px-4',
      'text-red-500',
      'text-blue-500',
      'font-bold',
    ]))
    await expect(extractSourceCandidates(pugSource, 'vue')).resolves.toEqual(expect.arrayContaining([
      'bg-neutral-900',
      'text-red-500',
    ]))
  })

  it('extracts script blocks from mixed non-vue SFC-like sources', async () => {
    const result = await extractSourceCandidates([
      '<script>',
      'const className = "grid grid-cols-2"',
      '</script>',
      '<template><div class="ignored-by-template-fast-path"></div></template>',
    ].join('\n'), 'svelte')

    expect(result).toEqual(expect.arrayContaining(['grid', 'grid-cols-2']))
    expect(result).not.toContain('className')
  })

  it('handles escaped and unterminated JavaScript string ranges', async () => {
    const result = await extractSourceCandidates([
      'const escaped = "text-red-500 \\"not-end\\""',
      'const template = `grid $' + '{(() => `ignored-template-expression`)} gap-4 $' + '{(() => ({ nested: "text-blue-500" }))()}`',
      'const unterminated = "font-bold',
    ].join('\n'), 'ts')

    expect(result).toEqual(expect.arrayContaining([
      'text-red-500',
      'grid',
      'text-blue-500',
      'font-bold',
      'ignored-template-expression',
    ]))
  })

  it('filters HTML tag text, CSS directives, and CSS tokens outside @apply', async () => {
    await expect(extractSourceCandidates('<view class="text-red-500">text-blue-500 <span></span></view>', 'html'))
      .resolves
      .toEqual(['text-red-500'])
    await expect(extractSourceCandidates('@tailwind utilities; .x { color: red; } .y { @apply text-green-500; }', 'css'))
      .resolves
      .toEqual(['text-green-500'])
  })

  it('filters valid Tailwind candidates using design system', async () => {
    const result = await extractValidCandidates({
      base: fixturesRoot,
      sources: [
        {
          base: fixturesRoot,
          pattern: 'hello-world.html',
          negated: false,
        },
      ],
    })

    expect(result).toContain('text-3xl')
    expect(result).toContain('font-bold')
    expect(result).toContain('underline')
  })

  it('keeps bare arbitrary values disabled by default', async () => {
    const result = await extractValidCandidates({
      base: tailwindNodeBase,
      sources: [
        {
          base: fixturesRoot,
          pattern: 'hello-world.html',
          negated: false,
        },
      ],
    })

    expect(result).not.toContain('p-10%')
  })

  it('can include UnoCSS-style bare arbitrary values when enabled', async () => {
    const result = await extractValidCandidates({
      base: tailwindNodeBase,
      bareArbitraryValues: true,
      sources: [
        {
          base: fixturesRoot,
          pattern: '**/*.html',
          negated: false,
        },
      ],
    })

    expect(result).toEqual(expect.arrayContaining([
      'p-10%',
      'p-2.5px',
      'm-4rem',
      'bg-#fff',
      'text-rgb(255,0,0)',
      'text-var(--brand)',
      'w-calc(100%-1rem)',
    ]))
  })

  it('ignores HTTP header literals when filtering candidates', async () => {
    const result = await extractValidCandidates({
      base: fixturesRoot,
      sources: [
        {
          base: fixturesRoot,
          pattern: 'http-headers.ts',
          negated: false,
        },
      ],
    })

    expect(result).toContain('text-red-500')
    expect(result).not.toContain('text/event-stream')
    expect(result).not.toContain('text/plain')
    expect(result).not.toContain('text/html')
  })

  it('supports Tailwind v4.2 utility families via @tailwindcss/node', async () => {
    const result = await extractValidCandidates({
      base: tailwindNodeBase,
      sources: [
        {
          base: fixturesRoot,
          pattern: v42FeaturePattern,
          negated: false,
        },
      ],
    })

    expect(result).toEqual(expect.arrayContaining(v42UtilityCandidates))
    expect(result).not.toContain('definitely-not-a-tailwind-class')
  })

  it('supports Tailwind v4.2 structural variants via @tailwindcss/node', async () => {
    const result = await extractValidCandidates({
      base: tailwindNodeBase,
      sources: [
        {
          base: fixturesRoot,
          pattern: v42FeaturePattern,
          negated: false,
        },
      ],
    })

    expect(result).toEqual(expect.arrayContaining(v42VariantCandidates))
  })

  it('falls back to secondary base directories when loading v4.2 design system', async () => {
    const result = await extractValidCandidates({
      base: path.join(fixturesRoot, '__missing-tailwind-base__'),
      baseFallbacks: [tailwindNodeBase],
      sources: [
        {
          base: fixturesRoot,
          pattern: v42FeaturePattern,
          negated: false,
        },
      ],
    })

    expect(result).toEqual(expect.arrayContaining(['text-shadow-md', 'inert:opacity-50']))
  })

  it('accepts @source inline() syntax with extra whitespace in css option', async () => {
    const result = await extractValidCandidates({
      base: tailwindNodeBase,
      css: [
        '@import "tailwindcss";',
        '@source inline(  "text-shadow-md"  );',
        '@source not inline( "text-shadow-2xs" );',
      ].join('\n'),
      sources: [
        {
          base: fixturesRoot,
          pattern: v42FeaturePattern,
          negated: false,
        },
      ],
    })

    expect(result).toContain('text-shadow-md')
    expect(result).toContain('text-pretty')
  })

  it('expands Tailwind v4 @source inline variants, ranges, and not inline exclusions', async () => {
    const result = await extractValidCandidates({
      base: tailwindNodeBase,
      css: [
        '@import "tailwindcss";',
        '@source inline("{hover:,focus:,}underline");',
        '@source inline("p-{2..6..2}");',
        '@source inline("bg-red-{50,{100..300..100},950}");',
        '@source not inline("bg-red-{200..300..100}");',
      ].join('\n'),
      sources: [],
    })

    expect(result).toEqual(expect.arrayContaining([
      'underline',
      'hover:underline',
      'focus:underline',
      'p-2',
      'p-4',
      'p-6',
      'bg-red-50',
      'bg-red-100',
      'bg-red-950',
    ]))
    expect(result).not.toContain('bg-red-200')
    expect(result).not.toContain('bg-red-300')
  })

  it('supports official @source inline whitespace, brace, range, and not inline syntax in css option', async () => {
    const result = await extractValidCandidates({
      base: tailwindNodeBase,
      css: [
        '@import "tailwindcss" source(none);',
        '@source inline( "underline" );',
        '@source inline(',
        '  "{hover:,focus:,}block"',
        ');',
        '@source inline("p-{2..6..2}");',
        '@source inline("bg-red-{50,{100..300..100},950}");',
        '@source not inline("bg-red-{200..300..100}");',
      ].join('\n'),
      sources: [],
    })

    expect(result).toEqual(expect.arrayContaining([
      'underline',
      'block',
      'hover:block',
      'focus:block',
      'p-2',
      'p-4',
      'p-6',
      'bg-red-50',
      'bg-red-100',
      'bg-red-950',
    ]))
    expect(result).not.toContain('bg-red-200')
    expect(result).not.toContain('bg-red-300')
  })

  it('scans project files for token metadata', async () => {
    const result = await extractProjectCandidatesWithPositions({
      cwd: tokenFixturesRoot,
      sources: [
        {
          base: tokenFixturesRoot,
          pattern: '**/*.{html,tsx}',
          negated: false,
        },
      ],
    })

    expect(result.filesScanned).toBe(2)
    expect(result.entries.length).toBeGreaterThan(0)

    const htmlMatch = result.entries.find(
      entry => entry.relativeFile.endsWith('page.html') && entry.rawCandidate === 'bg-blue-500',
    )
    const tsxMatch = result.entries.find(
      entry => entry.relativeFile.endsWith('button.tsx') && entry.rawCandidate === 'text-red-500',
    )

    expect(htmlMatch).toBeTruthy()
    expect(htmlMatch?.line).toBeGreaterThan(0)
    expect(htmlMatch?.column).toBeGreaterThan(0)
    expect(tsxMatch?.lineText).toContain('className')
  })

  it('reports skipped project files and omits files with no matches', async () => {
    const root = await createTempDir('tw-engine-token-skipped-')
    const readableFile = path.join(root, 'src/page.html')
    const emptyFile = path.join(root, 'src/empty.html')
    const unreadableFile = path.join(root, 'src/unreadable.html')
    await writeTempFile(readableFile, '<div class="text-red-500"></div>')
    await writeTempFile(emptyFile, '<div></div>')
    if (!isWindows) {
      await writeTempFile(unreadableFile, '<div class="text-blue-500"></div>')
      await fs.chmod(unreadableFile, 0o000)
    }

    const report = await extractProjectCandidatesWithPositions({
      cwd: root,
      sources: [
        { base: root, pattern: 'src/*.html', negated: false },
      ],
    })
    if (!isWindows) {
      await fs.chmod(unreadableFile, 0o600)
    }

    expect(report.filesScanned).toBe(isWindows ? 2 : 3)
    expect(report.entries.map(entry => entry.rawCandidate)).toContain('text-red-500')
    expect(report.entries.map(entry => entry.rawCandidate)).not.toContain('text-blue-500')
    if (isWindows) {
      expect(report.skippedFiles).toHaveLength(0)
    }
    else {
      expect(report.skippedFiles).toHaveLength(1)
      expect(report.skippedFiles[0]?.file).toBe(unreadableFile)
    }
  })

  it('resolves source files with explicit filters', async () => {
    const root = await createTempDir('tw-engine-source-files-filter-')
    await writeTempFile(path.join(root, 'src/page.html'), '<div class="text-green-500"></div>')
    await writeTempFile(path.join(root, 'src/page.tsx'), 'export const cls = "text-blue-500"')

    const files = await resolveProjectSourceFiles({
      cwd: root,
      sources: [{ base: root, pattern: 'src/**/*.{html,tsx}', negated: false }],
      filter: file => file.endsWith('.tsx'),
    })

    expect(files.map(file => path.relative(root, file))).toEqual(['src/page.tsx'])
  })

  it('groups token metadata by relative file path', async () => {
    const report = await extractProjectCandidatesWithPositions({
      cwd: tokenFixturesRoot,
      sources: [
        {
          base: tokenFixturesRoot,
          pattern: '**/*.{html,tsx}',
          negated: false,
        },
      ],
    })

    const grouped = groupTokensByFile(report)
    expect(Object.keys(grouped)).toEqual(expect.arrayContaining(['page.html', 'button.tsx']))
    const pageTokens = grouped['page.html']
    const buttonTokens = grouped['button.tsx']
    expect(pageTokens).toBeDefined()
    expect(buttonTokens).toBeDefined()
    expect(pageTokens?.length).toBeGreaterThan(0)
    expect(buttonTokens?.[0]?.relativeFile).toBe('button.tsx')
    expect(buttonTokens?.[0]?.file).toBe('button.tsx')

    const absoluteGrouped = groupTokensByFile(report, { key: 'absolute', stripAbsolutePaths: false })
    const absoluteKey = Object.keys(absoluteGrouped).find(key => key.endsWith('button.tsx'))
    expect(absoluteKey).toBeTruthy()
    if (absoluteKey) {
      expect(absoluteGrouped[absoluteKey]?.[0]?.file).toBe(absoluteKey)
    }

    const relativeWithAbsoluteFiles = groupTokensByFile(report, { key: 'relative', stripAbsolutePaths: false })
    expect(path.normalize(relativeWithAbsoluteFiles['button.tsx']?.[0]?.file ?? '')).toContain(path.normalize(tokenFixturesRoot))
  })

  it('generates the CLI token command output', async () => {
    const report = await extractProjectCandidatesWithPositions({
      cwd: tokenFixturesRoot,
      sources: [
        {
          base: tokenFixturesRoot,
          pattern: '**/*.{html,tsx}',
          negated: false,
        },
      ],
    })

    const lines = report.entries.map(
      entry => `${entry.relativeFile}:${entry.line}:${entry.column} ${entry.rawCandidate} (${entry.start}-${entry.end})`,
    )

    expect(lines.length).toBeGreaterThan(0)

    const cliCommand = 'pnpm dlx tw-patch tokens --format lines --no-write'
    const preview = `${cliCommand}\n${lines.join('\n')}`

    expect(preview.startsWith(cliCommand)).toBe(true)
    expect(preview.split('\n').length).toBe(lines.length + 1)
  })
})
