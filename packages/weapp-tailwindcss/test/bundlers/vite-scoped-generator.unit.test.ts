import { describe, expect, it } from 'vitest'
import {
  createScopedGeneratorCandidateSignature,
  createScopedGeneratorRuntime,
  createScopedGeneratorSourceTraceMap,
} from '@/bundlers/vite/generate-bundle/scoped-generator'
import { hasScopedSourceDirectives } from '@/bundlers/vite/generate-bundle/scoped-generator-sources'
import { createCandidateSignature } from '@/bundlers/vite/generate-bundle/signatures'
import type { TailwindSourceEntry } from '@/tailwindcss/source-scan'

describe('bundlers/vite scoped generator runtime', () => {
  it('仅在多来源中存在显式 source 配置时启用隔离路径', () => {
    expect(hasScopedSourceDirectives([
      { outputFile: 'app.wxss', rawSource: '@import "tailwindcss";', sourceFile: '/project/app.css' },
      { outputFile: 'app.wxss', rawSource: '.author { color: red; }', sourceFile: '/project/author.css' },
    ])).toBe(false)
    expect(hasScopedSourceDirectives([
      { outputFile: 'app.wxss', rawSource: '@source "./pages/**/*.{wxml,vue}";', sourceFile: '/project/app.css' },
      { outputFile: 'app.wxss', rawSource: '.author { color: red; }', sourceFile: '/project/author.css' },
    ])).toBe(true)
  })

  it.each([
    ['/project/styles/a.css', '/project/styles'],
    [String.raw`C:\project\styles\a.css`, 'C:/project/styles'],
    ['/a.css', '/'],
  ])('扫描目录保留来源路径语义：%s', async (sourceFile, expectedBase) => {
    const getter = vi.fn((_entries: TailwindSourceEntry[] | undefined) => new Set(['owned']))
    await createScopedGeneratorCandidateSignature('@source "./template.vue";', sourceFile, 'fallback', getter)
    const entries = getter.mock.calls[0]?.[0] as TailwindSourceEntry[] | undefined
    expect(entries?.[0]?.base.replaceAll('\\', '/')).toBe(expectedBase)
  })

  it('keeps runtime-confirmed custom variant conditional comment candidates when css has @source', async () => {
    const rawSource = [
      '@custom-variant wx {',
      '  /* #ifdef MP-WEIXIN */',
      '  @slot;',
      '  /* #endif */',
      '}',
      '@source "./pages/**/*.{wxml,vue}";',
    ].join('\n')
    const fallbackRuntime = new Set(['wx:bg-blue-500', 'not-wx:bg-red-500'])
    const sourceCandidates = new Set(['text-white'])

    const runtime = await createScopedGeneratorRuntime({
      cssHandlerOptions: {
        isMainChunk: true,
      },
      fallbackRuntime,
      getSourceCandidatesForEntries: () => sourceCandidates,
      majorVersion: 4,
      outputFile: 'app.wxss',
      rawSource,
      scopedSourceCandidateGetter: undefined,
      shouldExcludeSubpackageSourceCandidates: () => false,
      sourceFile: '/project/src/tailwind.css',
    })

    expect(runtime.has('text-white')).toBe(true)
    expect(runtime.has('wx:bg-blue-500')).toBe(true)
    expect(runtime.has('not-wx:bg-red-500')).toBe(true)
  })

  it('merges fallback runtime for main css import wrappers', async () => {
    const fallbackRuntime = new Set(['wx:bg-blue-500'])
    const sourceCandidates = new Set(['text-white'])

    const runtime = await createScopedGeneratorRuntime({
      cssHandlerOptions: {
        isMainChunk: true,
      },
      fallbackRuntime,
      getSourceCandidatesForEntries: () => sourceCandidates,
      majorVersion: 4,
      outputFile: 'app.wxss',
      rawSource: '@import "./tailwind.css";',
      scopedSourceCandidateGetter: () => sourceCandidates,
      shouldExcludeSubpackageSourceCandidates: () => false,
      sourceFile: '/project/src/App.vue?vue&type=style&index=0',
    })

    expect(runtime.has('text-white')).toBe(true)
    expect(runtime.has('wx:bg-blue-500')).toBe(true)
  })

  it('preserves candidates from every explicit Tailwind source root', async () => {
    const rawSource = [
      '@import "tailwindcss";',
      '@source "./**/*.{wxml,ts,js,vue}";',
      '@source "../../../packages/ui/src/**/*.{wxml,ts,js,vue}";',
      '@source not "../dist/**";',
    ].join('\n')
    const sourceFile = '/project/apps/template/src/app.css'
    const appCandidate = 'bg-[#123457]'
    const packageCandidate = 'text-[#456789]'
    const allCandidates = new Set([appCandidate, packageCandidate])
    const appCandidates = new Set([appCandidate])
    const packageSource = '/project/packages/ui/src/button.wxml'
    const getSourceCandidatesForEntries = vi.fn((entries: TailwindSourceEntry[] | undefined) => {
      return entries?.some(entry => entry.base === '/project/packages/ui/src')
        ? allCandidates
        : appCandidates
    })
    const getSourceCandidateSourcesForEntries = vi.fn((entries: TailwindSourceEntry[] | undefined) => {
      return entries?.some(entry => entry.base === '/project/packages/ui/src')
        ? new Map([
            [appCandidate, new Set(['/project/apps/template/src/page.wxml'])],
            [packageCandidate, new Set([packageSource])],
          ])
        : new Map([
            [appCandidate, new Set(['/project/apps/template/src/page.wxml'])],
          ])
    })

    const runtime = await createScopedGeneratorRuntime({
      cssHandlerOptions: {
        isMainChunk: true,
      },
      fallbackRuntime: allCandidates,
      getSourceCandidatesForEntries,
      majorVersion: 4,
      outputFile: 'app.wxss',
      rawSource,
      scopedSourceCandidateGetter: undefined,
      shouldExcludeSubpackageSourceCandidates: () => false,
      sourceFile,
    })
    const signature = await createScopedGeneratorCandidateSignature(
      rawSource,
      sourceFile,
      'fallback',
      getSourceCandidatesForEntries,
    )
    const sourceTrace = await createScopedGeneratorSourceTraceMap(
      rawSource,
      sourceFile,
      getSourceCandidateSourcesForEntries,
    )

    expect(runtime).toEqual(allCandidates)
    expect(signature).toBe(createCandidateSignature(allCandidates))
    expect(sourceTrace?.get(packageCandidate)).toEqual(new Set([packageSource]))
  })

  it('intersects explicit Tailwind source roots with the current output scope', async () => {
    const appCandidate = 'bg-[#123457]'
    const packageCandidate = 'text-[#456789]'
    const runtime = await createScopedGeneratorRuntime({
      cssHandlerOptions: {
        isMainChunk: false,
      },
      fallbackRuntime: new Set([appCandidate, packageCandidate]),
      getSourceCandidatesForEntries: () => new Set([appCandidate, packageCandidate]),
      majorVersion: 4,
      outputFile: 'sub-package/app.wxss',
      rawSource: [
        '@import "tailwindcss";',
        '@source "./pages/**/*.{wxml,ts}";',
        '@source "../../../packages/ui/src/**/*.{wxml,ts}";',
      ].join('\n'),
      scopedSourceCandidateGetter: entries => entries === undefined
        ? new Set([packageCandidate])
        : new Set([appCandidate, packageCandidate]),
      shouldExcludeSubpackageSourceCandidates: () => false,
      sourceFile: '/project/apps/template/src/app.css',
    })

    expect(runtime).toEqual(new Set([packageCandidate]))
  })

  it('uses the current output scope when positive @source entries resolve no candidates', async () => {
    const outputCandidates = new Set([
      'bg-explicit-entry',
      "before:content-['explicit_entry']",
    ])
    const runtime = await createScopedGeneratorRuntime({
      cssHandlerOptions: {
        isMainChunk: false,
      },
      fallbackRuntime: new Set(['global-entry']),
      getSourceCandidatesForEntries: entries => entries === undefined
        ? outputCandidates
        : new Set<string>(),
      majorVersion: 4,
      outputFile: 'features/entry.wxss',
      rawSource: '@import "tailwindcss" source(none);\n@source "./**/*.{wxml,js,ts}";',
      scopedSourceCandidateGetter: entries => entries === undefined
        ? outputCandidates
        : new Set<string>(),
      shouldExcludeSubpackageSourceCandidates: () => false,
      sourceFile: '/project/dist/features/entry.wxss',
    })

    expect(runtime).toEqual(outputCandidates)
    expect(runtime).not.toContain('global-entry')
  })
})
