import { mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const createdDirs: string[] = []

async function createTempDir(prefix: string) {
  const dir = path.join(os.tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await mkdir(dir, { recursive: true })
  createdDirs.push(dir)
  return dir
}

async function writeTempFile(file: string, content: string) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, content, 'utf8')
}

describe('bundlers/vite source candidates', () => {
  afterEach(async () => {
    const mod = await import('@/bundlers/vite/source-candidates')
    mod.clearSourceCandidateContentCacheForTest()
    vi.resetModules()
    vi.restoreAllMocks()
    await Promise.all(
      createdDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })),
    )
  })

  it('reuses extracted candidates for identical source content', async () => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const collector = createSourceCandidateCollector()
    const source = '<view class="text-[23px] bg-[#123456]"></view>'

    await collector.sync('/project/pages/index.wxml', source)
    await collector.sync('/project/sub/pages/index.wxml', source)

    expect(collector.values()).toEqual(new Set(['text-[23px]', 'bg-[#123456]']))
  })

  it('reuses extraction across scan and transform layers for the same file source', async () => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const extractor = vi.fn((source: string) => source.split(/\s+/).filter(Boolean))
    const collector = createSourceCandidateCollector({ extractor })
    const file = '/project/pages/index.vue'
    const source = '<view class="text-red-500" />'

    await collector.sync(file, source)
    await collector.merge(file, source)
    await collector.syncCurrentSource(file, source)

    expect(extractor).toHaveBeenCalledTimes(1)
    expect(collector.getRevision()).toBeGreaterThan(0)
  })

  it('exposes a shared source candidate store API for bundlers', async () => {
    const { createSourceCandidateStore } = await import('@/bundlers/vite/source-candidates')
    const store = createSourceCandidateStore()

    await store.syncSource('/project/pages/index.wxml', '<view class="text-[24rpx]"></view>')
    await store.syncCss('/project/app.css', '.btn { @apply bg-[#123456]; }')

    expect(store.values()).toEqual(new Set(['text-[24rpx]', 'bg-[#123456]']))
    expect(store.source('/project/pages/index.wxml')).toBe('<view class="text-[24rpx]"></view>')
  })

  it('extracts compiled SFC modules as JavaScript while preserving their source identity', async () => {
    const { createSourceCandidateStore } = await import('@/bundlers/vite/source-candidates')
    const store = createSourceCandidateStore()
    const root = await realpath(await createTempDir('weapp-tw-compiled-sfc'))
    const file = path.join(root, 'page.vue')
    const source = 'export function render() { return "h-[64rpx] bg-white/70" }'
    expect(await store.syncModuleSource(file, source, 'js')).toEqual(new Set(['h-[64rpx]', 'bg-white/70']))
    expect(store.sourcesForEntries([]).get('h-[64rpx]')).toEqual(new Set([file]))
    store.remove(file)
    expect(store.values()).toEqual(new Set())
  })

  it('collects configured custom template attributes as Tailwind v4 source candidates', async () => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const collector = createSourceCandidateCollector({
      customAttributesEntities: [['*', [/^t-class(?:-.+)?$/]]],
    })

    await collector.sync('/project/pages/index.wxml', [
      '<t-button',
      '  t-class="bg-[#1677ff] text-[28rpx]"',
      '  t-class-content="px-[24rpx]"',
      '  data-other="ignored-token"',
      '></t-button>',
    ].join('\n'))

    const values = collector.values()
    expect(values.has('bg-[#1677ff]')).toBe(true)
    expect(values.has('text-[28rpx]')).toBe(true)
    expect(values.has('px-[24rpx]')).toBe(true)
  })

  it('collects configured t-class candidates during explicit Tailwind v4 @source scanning', async () => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const root = await createTempDir('weapp-tw-vite-source-t-class')
    await writeTempFile(path.join(root, 'pages/index.wxml'), [
      '<t-button',
      '  t-class="bg-[#0977ee] text-[31rpx]"',
      '  t-class-content="px-[29rpx]"',
      '  data-other="ignored-token"',
      '></t-button>',
    ].join('\n'))

    const collector = createSourceCandidateCollector({
      customAttributesEntities: [['*', [/^t-class(?:-.+)?$/]]],
    })
    await collector.scanRoot({
      root,
      explicit: true,
      entries: [{
        base: root,
        negated: false,
        pattern: 'pages/**/*.wxml',
      }],
    })

    const values = collector.values()
    expect(values.has('bg-[#0977ee]')).toBe(true)
    expect(values.has('text-[31rpx]')).toBe(true)
    expect(values.has('px-[29rpx]')).toBe(true)
  })

  it('separates source candidate cache entries by custom template attributes', async () => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const source = '<t-button t-class="issue-977-token" data-other="ignored-token"></t-button>'
    const extractor = (value: string) => value === 'issue-977-token' || value === 'ignored-token'
      ? [value]
      : []
    const defaultCollector = createSourceCandidateCollector({
      extractor,
    })
    const customCollector = createSourceCandidateCollector({
      customAttributesEntities: [['*', ['t-class']]],
      extractor,
    })

    await defaultCollector.sync('/project/pages/index.wxml', source)
    await customCollector.sync('/project/pages/index.wxml', source)

    expect(defaultCollector.values()).toEqual(new Set())
    expect(customCollector.values()).toEqual(new Set(['issue-977-token']))
  })

  it('bounds extracted candidate cache without retaining full hmr source text in keys', async () => {
    const {
      clearSourceCandidateContentCacheForTest,
      createSourceCandidateCollector,
      getSourceCandidateContentCacheStatsForTest,
    } = await import('@/bundlers/vite/source-candidates')
    clearSourceCandidateContentCacheForTest()
    const collector = createSourceCandidateCollector()

    for (let index = 0; index < 160; index++) {
      await collector.sync(
        `/project/pages/index-${index}.vue`,
        `<template><view class="bg-[#${String(index).padStart(6, '0')}]">unique-hmr-source-${index}</view></template>`,
      )
    }

    const stats = getSourceCandidateContentCacheStatsForTest()
    expect(stats.size).toBeLessThanOrEqual(stats.max)
    expect(stats.keys.some(key => key.includes('unique-hmr-source'))).toBe(false)
  })

  it('collects complex arbitrary source candidates with the lightweight HMR extractor', async () => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const collector = createSourceCandidateCollector()

    await collector.sync('/project/pages/index.wxml', [
      '<view class="w-[calc(100%_-_32px)] bg-[rgb(12,34,56)]">',
      '  <view class="group-[:nth-of-type(3)_&]:block [mask-type:luminance]"></view>',
      '</view>',
    ].join('\n'))

    const values = collector.values()
    expect(values.has('w-[calc(100%_-_32px)]')).toBe(true)
    expect(values.has('bg-[rgb(12,34,56)]')).toBe(true)
    expect(values.has('group-[:nth-of-type(3)_&]:block')).toBe(true)
    expect(values.has('[mask-type:luminance]')).toBe(true)
  })

  it('collects UnoCSS-style bare arbitrary source candidates only when enabled', async () => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const source = '<view class="text-var(--brand) w-calc(100%-1rem) bg-#fff"></view>'
    const disabledCollector = createSourceCandidateCollector()
    const enabledCollector = createSourceCandidateCollector({
      bareArbitraryValues: true,
    })

    await disabledCollector.sync('/project/pages/index.wxml', source)
    await enabledCollector.sync('/project/pages/index.wxml', source)

    expect(disabledCollector.values()).toEqual(new Set())
    expect(enabledCollector.values()).toEqual(new Set([
      'bg-#fff',
      'text-var(--brand)',
      'w-calc(100%-1rem)',
    ]))
  })

  it('does not collect html tag fragments from JavaScript template strings', async () => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const collector = createSourceCandidateCollector()

    await collector.sync(
      '/project/src/index.js',
      'document.body.append(`<div class="${className}">className</div>`)'
      + '\nconst className = "flex bg-yellow-300/30 w-[100px]"',
    )

    const values = collector.values()
    expect(values).toEqual(new Set(['flex', 'bg-yellow-300/30', 'w-[100px]']))
  })

  it('matches Tailwind v4 default extracted candidates with source entries', async () => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const root = await createTempDir('weapp-tw-vite-v4-source-entries')
    const file = path.join(root, 'src/subpackages/normal/pages/entry/index.wxml')
    await writeTempFile(file, '<view class="bg-normal"></view>')

    const collector = createSourceCandidateCollector()
    await collector.scanRoot({
      root,
      entries: [{
        base: root,
        negated: false,
        pattern: 'src/subpackages/normal/**/*.{wxml,js,ts}',
      }],
    })

    expect(collector.valuesForEntries([{
      base: root,
      negated: false,
      pattern: 'src/subpackages/normal/**/*.{wxml,js,ts}',
    }])).toEqual(new Set(['bg-normal']))
  })

  it('keeps active module graph candidates across positive source gaps and explicit exclusions', async () => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const createCollector = () => createSourceCandidateCollector({
      extractor: source => source.split(/\s+/).filter(Boolean),
    })
    const root = '/project'
    const pageFile = '/project/src/pages/index.uvue'
    const subpageFile = '/project/src/sub/tailwindcss/index.uvue'
    const excludedFile = '/project/uni_modules/example/index.uvue'
    const entries = [
      {
        base: root,
        negated: false,
        pattern: 'src/pages/**/*.{uts,uvue}',
      },
      {
        base: root,
        negated: true,
        pattern: 'uni_modules/**/*',
      },
    ]
    const collector = createCollector()

    await collector.sync(pageFile, 'bg-page')
    await collector.syncModuleSource(subpageFile, 'dark:bg-[#3498db]')
    await collector.syncModuleSource(excludedFile, 'bg-excluded')

    expect(collector.valuesForEntries(entries)).toEqual(new Set([
      'bg-page',
      'dark:bg-[#3498db]',
    ]))
    expect(collector.sourcesForEntries(entries).get('dark:bg-[#3498db]')).toEqual(new Set([subpageFile]))
    expect(collector.valuesForEntries([])).toEqual(new Set([
      'dark:bg-[#3498db]',
      'bg-excluded',
    ]))

    const restored = createCollector()
    restored.restore(collector.snapshot())
    expect(restored.valuesForEntries(entries)).toEqual(new Set([
      'bg-page',
      'dark:bg-[#3498db]',
    ]))
  })

  it('invalidates scoped candidate views after a source update', async () => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const collector = createSourceCandidateCollector({
      extractor: source => source.split(/\s+/).filter(Boolean),
    })
    const file = '/project/src/pages/index.wxml'
    const entries = [{
      base: '/project',
      negated: false,
      pattern: 'src/pages/**/*',
    }]

    await collector.sync(file, 'bg-before')
    expect(collector.valuesForEntries(entries)).toEqual(new Set(['bg-before']))
    expect(collector.sourcesForEntries(entries).get('bg-before')).toEqual(new Set([file]))

    await collector.sync(file, 'bg-after')
    expect(collector.valuesForEntries(entries)).toEqual(new Set(['bg-after']))
    expect(collector.sourcesForEntries(entries).get('bg-after')).toEqual(new Set([file]))
    expect(collector.sourcesForEntries(entries).has('bg-before')).toBe(false)
  })

  it('refreshes Tailwind v4 Vue arbitrary candidates after a source update', async () => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const root = await createTempDir('weapp-tw-vite-v4-vue-hmr-candidates')
    const file = path.join(root, 'src/components/sections/CapabilityShowcase.vue')
    const collector = createSourceCandidateCollector()

    await writeTempFile(file, '<template><view class="text-2xl font-semibold"></view></template>')
    await collector.syncCurrentFile(file)
    expect(collector.values().has('text-2xl')).toBe(true)
    expect(collector.values().has('text-[123rpx]')).toBe(false)

    await writeTempFile(file, '<template><view class="text-[123rpx] font-semibold"></view></template>')
    await collector.syncCurrentFile(file)

    expect(collector.values().has('text-2xl')).toBe(false)
    expect(collector.values().has('text-[123rpx]')).toBe(true)
  })

  it('reports only globally visible candidate changes during source updates', async () => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const collector = createSourceCandidateCollector({
      extractor: source => source.split(/\s+/).filter(Boolean),
    })

    await collector.sync('/project/src/pages/a.ts', 'shared old-a')
    await collector.sync('/project/src/pages/b.ts', 'shared keep-b')

    const change = await collector.syncCurrentSource('/project/src/pages/a.ts', 'shared next-a')

    expect(change).toEqual({
      addedCandidates: new Set(['next-a']),
      removedCandidates: new Set(['old-a']),
    })
    expect(collector.values()).toEqual(new Set(['shared', 'keep-b', 'next-a']))
  })

  it('keeps shared and inline candidates out of removal diffs', async () => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const collector = createSourceCandidateCollector({
      extractor: source => source.split(/\s+/).filter(Boolean),
    })

    await collector.sync('/project/src/pages/a.ts', 'shared inline-only old-a')
    await collector.sync('/project/src/pages/b.ts', 'shared')
    collector.syncInline({
      included: ['inline-only'],
      excluded: [],
    })

    const change = collector.remove('/project/src/pages/a.ts')

    expect(change).toEqual({
      addedCandidates: new Set(),
      removedCandidates: new Set(['old-a']),
    })
    expect(collector.values()).toEqual(new Set(['shared', 'inline-only']))
  })

  it('excludes candidates matched by source entries', async () => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const root = await createTempDir('weapp-tw-vite-source-exclude')
    const mainFile = path.join(root, 'src/pages/index.wxml')
    const subFile = path.join(root, 'src/sub-normal/pages/index.wxml')
    const collector = createSourceCandidateCollector({
      extractor: source => source.includes('111') ? ['text-[111px]'] : ['text-[222px]'],
    })

    await writeTempFile(mainFile, '<view class="text-[111px]"></view>')
    await writeTempFile(subFile, '<view class="text-[222px]"></view>')
    await collector.sync(mainFile, '<view class="text-[111px]"></view>')
    await collector.sync(subFile, '<view class="text-[222px]"></view>')

    expect(collector.valuesForEntries([{
      base: root,
      negated: false,
      pattern: '**/*',
    }], {
      excludeEntries: [{
        base: path.join(root, 'src/sub-normal'),
        negated: false,
        pattern: '**/*',
      }],
    })).toEqual(new Set(['text-[111px]']))
  })

  it('returns source files for matched candidates', async () => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const root = '/project'
    const mainFile = '/project/src/pages/index.tsx'
    const subFile = '/project/src/sub-normal/pages/index.tsx'
    const collector = createSourceCandidateCollector()

    await collector.sync(mainFile, 'export const cls = "rotate-y-90 bg-[#123456]"')
    await collector.sync(subFile, 'export const cls = "rotate-y-90 text-[20px]"')

    const sources = collector.sourcesForEntries([{
      base: root,
      negated: false,
      pattern: 'src/**/*.{tsx,wxml}',
    }], {
      excludeEntries: [{
        base: '/project/src/sub-normal',
        negated: false,
        pattern: '**/*',
      }],
    })

    expect(sources.get('rotate-y-90')).toEqual(new Set([mainFile]))
    expect(sources.get('bg-[#123456]')).toEqual(new Set([mainFile]))
    expect(sources.has('text-[20px]')).toBe(false)
  })

  it('merges transformed module candidates without dropping raw source candidates', async () => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const collector = createSourceCandidateCollector()
    const id = '/project/src/pages/index.tsx'

    await collector.sync(id, '<view class="bg-[#112233]"></view>')
    await collector.merge(id, 'export const cls = "text-[188rpx]"')

    expect(collector.values()).toEqual(new Set(['bg-[#112233]', 'text-[188rpx]']))
  })

  it('keeps current scan source when stale transform source is merged later', async () => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const collector = createSourceCandidateCollector()
    const id = '/project/pages/index.wxml'
    const currentSource = '<view class="bg-[#111111]"></view>'
    const staleTransformSource = '<view class="bg-[#f40909]"></view>'

    await collector.sync(id, currentSource)
    await collector.merge(id, staleTransformSource)

    expect(collector.values()).toEqual(new Set(['bg-[#111111]', 'bg-[#f40909]']))
    expect(collector.source(id)).toBe(currentSource)
    expect(new Map(collector.sources()).get(id)).toBe(currentSource)
  })

  it('drops the stale transform layer before the updated transform replaces it', async () => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const collector = createSourceCandidateCollector({
      extractor: source => source.split(/\s+/).filter(Boolean),
    })
    const id = '/project/pages/index.uvue'

    await collector.sync(id, 'raw-old')
    await collector.merge(id, 'transform-old')

    const change = await collector.syncCurrentSource(id, 'raw-new mt-200')
    expect(change).toEqual({
      addedCandidates: new Set(['raw-new', 'mt-200']),
      removedCandidates: new Set(['raw-old', 'transform-old']),
    })
    expect(collector.values()).toEqual(new Set(['raw-new', 'mt-200']))

    await collector.merge(id, 'transform-new')
    expect(collector.values()).toEqual(new Set(['raw-new', 'mt-200', 'transform-new']))
  })

  it('keeps generated css layers when a css root source is refreshed', async () => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const collector = createSourceCandidateCollector({
      extractor: source => source.split(/\s+/).filter(Boolean),
    })
    const id = '/project/main.css'

    await collector.sync(id, 'root-old')
    await collector.merge(id, 'generated-existing')

    const change = await collector.syncCurrentSource(id, 'root-new')
    expect(change).toEqual({
      addedCandidates: new Set(['root-new']),
      removedCandidates: new Set(['root-old']),
    })
    expect(collector.values()).toEqual(new Set(['root-new', 'generated-existing']))
  })

  it('collects TSX script string and template candidates from AST literals', async () => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const collector = createSourceCandidateCollector()

    await collector.sync('/project/src/pages/index.tsx', [
      'import { View } from "@tarojs/components"',
      'export default function Index() {',
      '  const complexExpression = "size > 4 ? keep-[business] : App.vue:4"',
      '  const __twWatchClass = "text-[23.000026px] space-y-2.5 w-[calc(100%_-_000026px)] bg-[#000026]"',
      '  const templateClass = `mt-[22rpx] ${active ? "px-[8px]" : "py-[4px]"} rounded-[999px]`',
      '  return <View className={__twWatchClass}>{templateClass}{complexExpression}</View>',
      '}',
    ].join('\n'))

    const values = collector.values()
    expect(values.has('text-[23.000026px]')).toBe(true)
    expect(values.has('space-y-2.5')).toBe(true)
    expect(values.has('w-[calc(100%_-_000026px)]')).toBe(true)
    expect(values.has('bg-[#000026]')).toBe(true)
    expect(values.has('mt-[22rpx]')).toBe(true)
    expect(values.has('px-[8px]')).toBe(true)
    expect(values.has('py-[4px]')).toBe(true)
    expect(values.has('rounded-[999px]')).toBe(true)
  })

  it('matches updated relative-path files against absolute @source entries', async () => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const collector = createSourceCandidateCollector()

    await collector.sync('src/pages/index.vue', '<view class="bg-[#000020] text-[23.000020px]"></view>')

    expect(collector.valuesForEntries([{
      base: process.cwd(),
      negated: false,
      pattern: 'src/**/*',
    }])).toEqual(new Set(['bg-[#000020]', 'text-[23.000020px]']))
  })

  it.each(['vue', 'uvue', 'nvue'])('collects %s template and script source candidates through the engine scanner', async (extension) => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const collector = createSourceCandidateCollector()

    await collector.sync(`src/pages/index.${extension}`, [
      '<template><view class="bg-[#000020] text-[23.000020px]"></view></template>',
      '<script setup>',
      'const className = "flex w-[100px]"',
      '</script>',
    ].join('\n'))

    expect(collector.values()).toEqual(new Set([
      'bg-[#000020]',
      'text-[23.000020px]',
      'flex',
      'w-[100px]',
    ]))
  })

  it('matches absolute source entry patterns against tracked source files', async () => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const collector = createSourceCandidateCollector()
    const root = '/project'
    const file = '/project/src/index.js'

    await collector.sync(file, 'export const cls = "flex grid w-[100px]"')

    expect(collector.valuesForEntries([{
      base: root,
      negated: false,
      pattern: '/project/src/*.{js,html,wxml}',
    }])).toEqual(new Set(['flex', 'grid', 'w-[100px]']))
  })

  it('uses Tailwind v4 scanner defaults for root source discovery', async () => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const root = await createTempDir('weapp-tw-vite-scanner-defaults')
    await writeTempFile(path.join(root, '.gitignore'), 'ignored-by-gitignore.js\n')
    await writeTempFile(path.join(root, 'src/page.wxml'), '<view class="bg-[#112233]"></view>')
    await writeTempFile(path.join(root, 'node_modules/pkg/index.js'), 'export const cls = "text-[#111111]"')
    await writeTempFile(path.join(root, 'ignored-by-gitignore.js'), 'export const cls = "text-[#222222]"')
    await writeTempFile(path.join(root, 'src/ignored.css'), '.btn { @apply text-[#333333]; }')
    await writeTempFile(path.join(root, 'src/ignored.scss'), '.btn { @apply text-[#333333]; }')
    await writeTempFile(path.join(root, 'package-lock.json'), '{"class":"text-[#444444]"}')

    const collector = createSourceCandidateCollector()
    await collector.scanRoot({ root })

    expect(collector.values()).toEqual(new Set(['bg-[#112233]']))
  })

  it('keeps Tailwind default ignores when css source entries only exclude paths', async () => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const root = await createTempDir('weapp-tw-vite-scanner-negated-defaults')
    await writeTempFile(path.join(root, 'src/page.vue'), '<template><view class="bg-[#112233]"></view></template>')
    await writeTempFile(path.join(root, 'node_modules/pkg/index.js'), 'export const cls = "text-[#111111]"')
    await writeTempFile(path.join(root, 'dist/app.js'), 'export const cls = "text-[#222222]"')

    const collector = createSourceCandidateCollector()
    await collector.scanRoot({
      root,
      outDir: 'dist',
      entries: [
        {
          base: path.join(root, 'dist'),
          pattern: '**/*',
          negated: true,
        },
      ],
    })

    expect(collector.values()).toEqual(new Set(['bg-[#112233]']))
  })

  it('does not scan root files when explicit Tailwind v4 entries only exclude paths', async () => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const root = await createTempDir('weapp-tw-vite-scanner-explicit-negated')
    await writeTempFile(path.join(root, 'src/page.vue'), '<template><view class="bg-[#112233]"></view></template>')
    await writeTempFile(path.join(root, 'src/generated/page.vue'), '<template><view class="text-[#111111]"></view></template>')

    const collector = createSourceCandidateCollector()
    await collector.scanRoot({
      root,
      explicit: true,
      entries: [
        {
          base: path.join(root, 'src/generated'),
          pattern: '**/*',
          negated: true,
        },
      ],
    })

    expect(collector.values()).toEqual(new Set())
  })

  it('lets explicit Tailwind v4 source patterns include default ignored extensions', async () => {
    const { createSourceCandidateCollector } = await import('@/bundlers/vite/source-candidates')
    const root = await createTempDir('weapp-tw-vite-scanner-explicit-source')
    await writeTempFile(path.join(root, 'src/explicit.scss'), '.btn { @apply text-[#333333]; }')

    const collector = createSourceCandidateCollector()
    await collector.scanRoot({
      root,
      explicit: true,
      entries: [{
        base: path.join(root, 'src'),
        pattern: 'explicit.scss',
        negated: false,
      }],
    })

    expect(collector.values()).toEqual(new Set(['text-[#333333]']))
  })
})
