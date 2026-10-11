import os from 'node:os'
import path from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildBundleSnapshot, createBundleBuildState, updateBundleBuildState } from '@/bundlers/vite/bundle-state'
import { createBundleRuntimeClassSetManager } from '@/bundlers/vite/incremental-runtime-class-set'
import { createCache } from '@/cache'
import { createRollupAsset, createRollupChunk } from './vite-plugin.testkit'

function createOptions() {
  return {
    cache: createCache(),
    cssMatcher: (file: string) => file.endsWith('.css'),
    htmlMatcher: (file: string) => file.endsWith('.wxml'),
    jsMatcher: (file: string) => file.endsWith('.js'),
    wxsMatcher: () => false,
  } as any
}

function createRuntime(projectRoot: string) {
  return {
    majorVersion: 4,
    getClassSet: vi.fn(async () => new Set<string>()),
    extract: vi.fn(async () => ({ classSet: new Set<string>() })),
    options: {
      projectRoot,
      tailwind: {
        v4: {
          base: projectRoot,
        },
      },
    },
  } as any
}

function createV4Runtime() {
  return {
    majorVersion: 4,
    getClassSet: vi.fn(async () => new Set<string>()),
    extract: vi.fn(async () => ({ classSet: new Set<string>() })),
    options: {
      projectRoot: process.cwd(),
      tailwindcss: {
        v4: {
          cssSources: [{
            css: '@theme { --color-test: #000; }',
            base: process.cwd(),
          }],
          base: process.cwd(),
        },
      },
    },
  } as any
}

function createCandidateValidator(validCandidates: string[]) {
  const valid = new Set(validCandidates)
  return vi.fn(async (options?: { content?: string }) => {
    const source = options?.content ?? ''
    return source.split(/\s+/).filter(candidate => valid.has(candidate))
  })
}

describe('bundlers/vite incremental runtime class set', () => {
  let tempRoot = ''

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'weapp-tw-runtime-set-'))
  })

  afterEach(async () => {
    const manager = createBundleRuntimeClassSetManager({})
    await manager.reset()
    rmSync(tempRoot, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('only re-extracts changed runtime files and keeps union stable', async () => {
    const opts = createOptions()
    const outDir = '/project/dist'
    const state = createBundleBuildState()
    const runtime = createRuntime('/project')
    const extractCandidates = vi.fn(async (options) => {
      const source = options?.content ?? ''
      return source.split(/\s+/).filter(Boolean)
    })
    const extractRawCandidates = vi.fn(async (content: string) => {
      if (content.includes('foo bar')) {
        return [{ rawCandidate: 'foo' }, { rawCandidate: 'bar' }]
      }
      if (content.includes('"baz"')) {
        return [{ rawCandidate: 'baz' }]
      }
      if (content.includes('bar qux')) {
        return [{ rawCandidate: 'bar' }, { rawCandidate: 'qux' }]
      }
      return []
    })
    const manager = createBundleRuntimeClassSetManager({
      extractCandidates,
      extractRawCandidates,
    })

    const firstSnapshot = buildBundleSnapshot({
      'pages/index/index.wxml': {
        ...createRollupAsset('<view class="foo bar" />'),
        fileName: 'pages/index/index.wxml',
      },
      'assets/index.js': {
        ...createRollupChunk('const cls = "baz"'),
        fileName: 'assets/index.js',
      },
    }, opts, outDir, state)

    const firstRuntimeSet = await manager.sync(runtime, firstSnapshot)

    expect(firstRuntimeSet).toEqual(new Set(['foo', 'bar', 'baz']))
    expect(extractCandidates).toHaveBeenCalledTimes(1)

    updateBundleBuildState(state, firstSnapshot, new Map([
      ['assets/index.js', new Set<string>()],
    ]))

    extractCandidates.mockClear()

    const secondSnapshot = buildBundleSnapshot({
      'pages/index/index-next.wxml': {
        ...createRollupAsset('<view class="bar qux" />'),
        fileName: 'pages/index/index-next.wxml',
      },
      'assets/index.js': {
        ...createRollupChunk('const cls = "baz"'),
        fileName: 'assets/index.js',
      },
    }, opts, outDir, state)

    const secondRuntimeSet = await manager.sync(runtime, secondSnapshot)

    expect(secondRuntimeSet).toEqual(new Set(['bar', 'baz', 'qux']))
    expect(extractCandidates).toHaveBeenCalledTimes(1)
    expect(extractCandidates.mock.calls[0]?.[0]?.content).toBe('qux')
    expect(extractCandidates.mock.calls[0]?.[0]?.sources).toBeUndefined()
  })

  it('removes explicit deleted candidates from omitted incremental snapshots', async () => {
    const opts = createOptions()
    const outDir = '/project/dist'
    const state = createBundleBuildState()
    const runtime = createRuntime('/project')
    const extractCandidates = vi.fn(async (options) => String(options?.content ?? '').split(/\s+/).filter(Boolean))
    const extractRawCandidates = vi.fn(async (content: string) => {
      if (content.includes('old-only')) {
        return [{ rawCandidate: 'old-only' }]
      }
      if (content.includes('stable')) {
        return [{ rawCandidate: 'stable' }]
      }
      return []
    })
    const manager = createBundleRuntimeClassSetManager({
      extractCandidates,
      extractRawCandidates,
    })
    const removedFile = 'pages/removed/index.wxml'
    const stableFile = 'assets/index.js'
    const first = buildBundleSnapshot({
      [removedFile]: {
        ...createRollupAsset('<view class="old-only" />'),
        fileName: removedFile,
      },
      [stableFile]: {
        ...createRollupChunk('const cls = "stable"'),
        fileName: stableFile,
      },
    }, opts, outDir, state)
    const previousRuntime = await manager.sync(runtime, first, { baseClassSet: new Set(['baseline-only']) })
    expect(previousRuntime).toEqual(new Set(['baseline-only', 'old-only', 'stable']))
    updateBundleBuildState(state, first, new Map())

    const partial = buildBundleSnapshot({
      [stableFile]: {
        ...createRollupChunk('const cls = "stable"'),
        fileName: stableFile,
      },
    }, opts, outDir, state, false, {
      hasOmittedKnownFiles: true,
      removedFiles: [removedFile],
    })

    await expect(manager.sync(runtime, partial, { baseClassSet: previousRuntime })).resolves.toEqual(new Set(['baseline-only', 'stable']))
    updateBundleBuildState(state, partial, new Map(), { incremental: true })
    expect(state.sourceHashByFile.has(removedFile)).toBe(false)
  })

  it('passes bare arbitrary value options through runtime extraction', async () => {
    const opts = createOptions()
    const outDir = '/project/dist'
    const state = createBundleBuildState()
    const runtime = createRuntime('/project')
    const extractCandidates = vi.fn(async (options) => {
      expect(options?.bareArbitraryValues).toBe(true)
      return String(options?.content ?? '').split(/\s+/).filter(Boolean)
    })
    const extractRawCandidates = vi.fn(async () => [
      { rawCandidate: 'text-var(--brand)' },
      { rawCandidate: 'w-calc(100%-1rem)' },
    ])
    const manager = createBundleRuntimeClassSetManager({
      bareArbitraryValues: true,
      extractCandidates,
      extractRawCandidates,
    })
    const snapshot = buildBundleSnapshot({
      'pages/index/index.wxml': {
        ...createRollupAsset('<view class="text-var(--brand) w-calc(100%-1rem)" />'),
        fileName: 'pages/index/index.wxml',
      },
    }, opts, outDir, state)

    const runtimeSet = await manager.sync(runtime, snapshot)

    expect(runtimeSet).toEqual(new Set(['text-var(--brand)', 'w-calc(100%-1rem)']))
    expect(extractRawCandidates).toHaveBeenCalledWith(
      expect.any(String),
      'html',
      { bareArbitraryValues: true },
    )
  })

  it('extracts extensionless uni-app html assets as html content', async () => {
    const opts = {
      ...createOptions(),
      htmlMatcher: (file: string) => file.endsWith('wxml'),
    } as any
    const outDir = '/project/dist'
    const state = createBundleBuildState()
    const runtime = createRuntime('/project')
    const extractCandidates = vi.fn(async (options) => {
      const source = options?.content ?? ''
      return source.split(/\s+/).filter(Boolean)
    })
    const extractRawCandidates = vi.fn(async (_content: string, extension?: string) => {
      return extension === 'html'
        ? [
            { rawCandidate: 'h-[458rpx]' },
            { rawCandidate: 'w-[218rpx]' },
            { rawCandidate: 'inset-x-[30%]' },
          ]
        : []
    })
    const manager = createBundleRuntimeClassSetManager({
      extractCandidates,
      extractRawCandidates,
    })

    const snapshot = buildBundleSnapshot({
      'packages/activ-gift/indexwxml': {
        ...createRollupAsset('<view class="{{active ? \'h-[458rpx] w-[218rpx] inset-x-[30%]\' : \'\'}}" />'),
        fileName: 'packages/activ-gift/indexwxml',
      },
    }, opts, outDir, state)

    await expect(manager.sync(runtime, snapshot)).resolves.toEqual(new Set([
      'h-[458rpx]',
      'w-[218rpx]',
      'inset-x-[30%]',
    ]))
    expect(extractRawCandidates).toHaveBeenCalledWith(
      expect.any(String),
      'html',
    )
  })

  it('keeps current v4 high-confidence raw candidates even when base class set is stale', async () => {
    const opts = createOptions()
    const outDir = '/project/dist'
    const state = createBundleBuildState()
    const runtime = createV4Runtime()
    const jsSource = 'const n = "flex bg-yellow-300/30"; const bgObj = common_vendor.ref({ "bg-[#999998]": true });'
    const extractRawCandidates = vi.fn(async (content: string, extension?: string) => {
      if (extension === 'js' && content.includes('bg-[#999998]')) {
        return [
          { rawCandidate: 'flex', start: content.indexOf('flex') },
          { rawCandidate: 'bg-[#999998]' },
          { rawCandidate: 'bg-yellow-300/30', start: content.indexOf('bg-yellow-300/30') },
        ]
      }
      return []
    })
    const manager = createBundleRuntimeClassSetManager({
      extractCandidates: createCandidateValidator(['flex', 'bg-[#999998]', 'bg-yellow-300/30']),
      extractRawCandidates,
    })

    const snapshot = buildBundleSnapshot({
      'assets/index.js': {
        ...createRollupChunk(jsSource),
        fileName: 'assets/index.js',
      },
    }, opts, outDir, state)

    const runtimeSet = await manager.sync(runtime, snapshot, {
      baseClassSet: new Set(['bg-[#999999]']),
    })

    expect(runtimeSet).toEqual(new Set(['bg-[#999999]', 'flex', 'bg-[#999998]', 'bg-yellow-300/30']))
    expect(extractRawCandidates).toHaveBeenCalledWith(
      jsSource,
      'js',
    )
  })

  it('removes stale candidates when runtime files disappear from the bundle', async () => {
    const opts = createOptions()
    const outDir = '/project/dist'
    const state = createBundleBuildState()
    const runtime = createRuntime('/project')
    const extractCandidates = vi.fn(async (options) => {
      const source = options?.content ?? ''
      return source.split(/\s+/).filter(Boolean)
    })
    const extractRawCandidates = vi.fn(async (content: string) => {
      if (content.includes('"foo"') || content.includes('class="foo"')) {
        return [{ rawCandidate: 'foo' }]
      }
      if (content.includes('"bar"')) {
        return [{ rawCandidate: 'bar' }]
      }
      return []
    })
    const manager = createBundleRuntimeClassSetManager({
      extractCandidates,
      extractRawCandidates,
    })

    const firstSnapshot = buildBundleSnapshot({
      'pages/index/index.wxml': {
        ...createRollupAsset('<view class="foo" />'),
        fileName: 'pages/index/index.wxml',
      },
      'assets/index.js': {
        ...createRollupChunk('const cls = "bar"'),
        fileName: 'assets/index.js',
      },
    }, opts, outDir, state)

    await manager.sync(runtime, firstSnapshot)
    updateBundleBuildState(state, firstSnapshot, new Map([
      ['assets/index.js', new Set<string>()],
    ]))

    extractCandidates.mockClear()

    const nextSnapshot = buildBundleSnapshot({
      'assets/index.js': {
        ...createRollupChunk('const cls = "bar"'),
        fileName: 'assets/index.js',
      },
    }, opts, outDir, state)

    const nextRuntimeSet = await manager.sync(runtime, nextSnapshot)

    expect(nextRuntimeSet).toEqual(new Set(['bar']))
    expect(extractCandidates).not.toHaveBeenCalled()
  })

  it('drops candidates when changed runtime files become empty or invalid', async () => {
    const opts = createOptions()
    const outDir = '/project/dist'
    const state = createBundleBuildState()
    const runtime = createRuntime('/project')
    const extractCandidates = vi.fn(async (options) => {
      const source = options?.content ?? ''
      return source.split(/\s+/).filter(candidate => candidate === 'bar')
    })
    const extractRawCandidates = vi.fn(async (content: string) => {
      if (content.includes('"foo"')) {
        return [{ rawCandidate: 'foo' }]
      }
      if (content.includes('"bar"')) {
        return [{ rawCandidate: 'bar' }]
      }
      if (content.includes('"unknown"')) {
        return [{ rawCandidate: 'unknown' }]
      }
      return []
    })
    const manager = createBundleRuntimeClassSetManager({
      extractCandidates,
      extractRawCandidates,
    })

    const firstSnapshot = buildBundleSnapshot({
      'pages/index/index.wxml': {
        ...createRollupAsset('<view class="foo" />'),
        fileName: 'pages/index/index.wxml',
      },
      'assets/index.js': {
        ...createRollupChunk('const cls = "bar"'),
        fileName: 'assets/index.js',
      },
    }, opts, outDir, state)

    await manager.sync(runtime, firstSnapshot)
    updateBundleBuildState(state, firstSnapshot, new Map([
      ['assets/index.js', new Set<string>()],
    ]), { incremental: true })

    const emptyHtmlSnapshot = buildBundleSnapshot({
      'pages/index/index.wxml': {
        ...createRollupAsset('<view />'),
        fileName: 'pages/index/index.wxml',
      },
      'assets/index.js': {
        ...createRollupChunk('const cls = "bar"'),
        fileName: 'assets/index.js',
      },
    }, opts, outDir, state)

    await expect(manager.sync(runtime, emptyHtmlSnapshot)).resolves.toEqual(new Set(['bar']))
    updateBundleBuildState(state, emptyHtmlSnapshot, new Map([
      ['assets/index.js', new Set<string>()],
    ]), { incremental: true })

    const invalidJsSnapshot = buildBundleSnapshot({
      'pages/index/index.wxml': {
        ...createRollupAsset('<view />'),
        fileName: 'pages/index/index.wxml',
      },
      'assets/index.js': {
        ...createRollupChunk('const cls = "unknown"'),
        fileName: 'assets/index.js',
      },
    }, opts, outDir, state)

    await expect(manager.sync(runtime, invalidJsSnapshot)).resolves.toEqual(new Set<string>())
  })

  it('prefers cssEntries when building extract options for tailwind v4', async () => {
    const opts = createOptions()
    const projectRoot = path.join(tempRoot, 'css-entry-project')
    const outDir = path.join(projectRoot, 'dist')
    const state = createBundleBuildState()
    const runtime = createRuntime(projectRoot)
    const cssEntry = path.join(projectRoot, 'src/app.css')
    await mkdir(path.dirname(cssEntry), { recursive: true })
    await writeFile(cssEntry, '@import "tailwindcss";\n@theme { --color-brand: #123456; }\n', 'utf8')
    runtime.options.tailwind.v4.cssEntries = [cssEntry]
    runtime.options.tailwind.postcssPlugin = path.join(projectRoot, 'node_modules/@tailwindcss/postcss/dist/index.js')
    runtime.packageInfo = {
      name: '@tailwindcss/postcss',
      rootPath: path.join(projectRoot, 'node_modules/@tailwindcss/postcss'),
    }
    const extractCandidates = vi.fn(async () => ['foo'])
    const extractRawCandidates = vi.fn(async () => [{ rawCandidate: 'foo' }])
    const manager = createBundleRuntimeClassSetManager({
      extractCandidates,
      extractRawCandidates,
    })

    const snapshot = buildBundleSnapshot({
      'pages/index/index.wxml': {
        ...createRollupAsset('<view class="foo" />'),
        fileName: 'pages/index/index.wxml',
      },
    }, opts, outDir, state)

    await manager.sync(runtime, snapshot)

    expect(extractCandidates).toHaveBeenCalledTimes(1)
    expect(extractCandidates.mock.calls[0]?.[0]?.css).toContain('@theme { --color-brand: #123456; }')
  })

  it('falls back to importing tailwind package instead of postcss plugin targets', async () => {
    const opts = createOptions()
    const outDir = '/project/dist'
    const state = createBundleBuildState()
    const runtime = createRuntime('/project')
    runtime.options.tailwind.packageName = 'tailwindcss4'
    runtime.options.tailwind.postcssPlugin = '/project/node_modules/@tailwindcss/postcss/dist/index.js'
    runtime.packageInfo = {
      name: '@tailwindcss/postcss',
      rootPath: '/project/node_modules/@tailwindcss/postcss',
    }
    const extractCandidates = vi.fn(async () => ['foo'])
    const extractRawCandidates = vi.fn(async () => [{ rawCandidate: 'foo' }])
    const manager = createBundleRuntimeClassSetManager({
      extractCandidates,
      extractRawCandidates,
    })

    const snapshot = buildBundleSnapshot({
      'pages/index/index.wxml': {
        ...createRollupAsset('<view class="foo" />'),
        fileName: 'pages/index/index.wxml',
      },
    }, opts, outDir, state)

    await manager.sync(runtime, snapshot)

    expect(extractCandidates).toHaveBeenCalledTimes(1)
    expect(extractCandidates.mock.calls[0]?.[0]?.css).toBe('@import "tailwindcss4";')
  })

  it('keeps incremental runtime sync for extended length unit candidates', async () => {
    const opts = createOptions()
    const outDir = '/project/dist'
    const state = createBundleBuildState()
    const runtime = createRuntime('/project')
    const extractCandidates = vi.fn(async () => ['w-[200rpx]', 'h-[20upx]', 'bg-[#123456]'])
    const extractRawCandidates = vi.fn(async (content: string) => {
      if (content.includes('w-[200rpx]')) {
        return [
          { rawCandidate: 'w-[200rpx]' },
          { rawCandidate: 'h-[20upx]' },
          { rawCandidate: 'bg-[#123456]' },
        ]
      }
      return []
    })
    const manager = createBundleRuntimeClassSetManager({
      extractCandidates,
      extractRawCandidates,
    })

    const snapshot = buildBundleSnapshot({
      'pages/index/index.js': {
        ...createRollupChunk('const cls = "w-[200rpx] h-[20upx] bg-[#123456]"'),
        fileName: 'pages/index/index.js',
      },
    }, opts, outDir, state)

    await expect(manager.sync(runtime, snapshot)).resolves.toEqual(new Set([
      'w-[200rpx]',
      'h-[20upx]',
      'bg-[#123456]',
    ]))
    expect(extractCandidates).toHaveBeenCalledTimes(1)
  })

  it('extracts changed runtime files sequentially to avoid hmr peak memory spikes', async () => {
    const opts = createOptions()
    const outDir = '/project/dist'
    const state = createBundleBuildState()
    const runtime = createRuntime('/project')
    const events: string[] = []
    let releaseFirst: (() => void) | undefined
    const firstExtraction = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const extractCandidates = vi.fn(async (options) => {
      const source = options?.content ?? ''
      return source.split(/\s+/).filter(Boolean)
    })
    const extractRawCandidates = vi.fn(async (content: string) => {
      if (content.includes('"foo"')) {
        events.push('first:start')
        await firstExtraction
        events.push('first:end')
        return [{ rawCandidate: 'foo' }]
      }
      if (content.includes('"bar"')) {
        events.push('second:start')
        return [{ rawCandidate: 'bar' }]
      }
      return []
    })
    const manager = createBundleRuntimeClassSetManager({
      extractCandidates,
      extractRawCandidates,
    })

    const snapshot = buildBundleSnapshot({
      'pages/index/index.js': {
        ...createRollupChunk('const cls = "foo"'),
        fileName: 'pages/index/index.js',
      },
      'pages/list/index.js': {
        ...createRollupChunk('const cls = "bar"'),
        fileName: 'pages/list/index.js',
      },
    }, opts, outDir, state)

    const syncPromise = manager.sync(runtime, snapshot)
    await vi.waitFor(() => {
      expect(events).toEqual(['first:start'])
    })
    expect(extractRawCandidates).toHaveBeenCalledTimes(1)

    releaseFirst?.()

    await expect(syncPromise).resolves.toEqual(new Set(['foo', 'bar']))
    expect(events).toEqual(['first:start', 'first:end', 'second:start'])
    expect(extractRawCandidates).toHaveBeenCalledTimes(2)
  })

  it('restores escaped v4 runtime candidates from changed output files before validation', async () => {
    const opts = createOptions()
    const outDir = '/project/dist'
    const state = createBundleBuildState()
    const runtime = createRuntime('/project')
    const extractCandidates = vi.fn(async (options) => {
      const source = options?.content ?? ''
      return source.split(/\s+/).filter(candidate => [
        'text-[102.43rpx]',
        'text-[103.43rpx]',
        'grid-rows-[auto_minmax(0,_1fr)]',
        'bg-[#0000ff]',
      ].includes(candidate))
    })
    const extractRawCandidates = vi.fn(async () => [])
    const manager = createBundleRuntimeClassSetManager({
      extractCandidates,
      extractRawCandidates,
    })

    const firstSnapshot = buildBundleSnapshot({
      'pages/index/index.js': {
        ...createRollupChunk('const cls = "text-_b102_d43rpx_B grid-rows-_bauto_minmax_p0_m_1fr_P_B bg-_b_h0000ff_B"; const keep = common_vendor.ref(1)'),
        fileName: 'pages/index/index.js',
      },
    }, opts, outDir, state)

    const firstRuntimeSet = await manager.sync(runtime, firstSnapshot)

    expect(firstRuntimeSet).toEqual(new Set([
      'text-[102.43rpx]',
      'grid-rows-[auto_minmax(0,_1fr)]',
      'bg-[#0000ff]',
    ]))
    expect(firstRuntimeSet.has('grid-rows-[auto,minmax(0,_1fr)]')).toBe(false)
    expect(firstRuntimeSet.has('grid-rows-[auto,inmax(0,_1fr)]')).toBe(false)
    expect(firstRuntimeSet.has('common%endor')).toBe(false)
    expect(extractRawCandidates).toHaveBeenCalledWith(
      expect.stringContaining('text-_b102_d43rpx_B'),
      'js',
    )

    updateBundleBuildState(state, firstSnapshot, new Map([
      ['pages/index/index.js', new Set<string>()],
    ]), { incremental: true })

    const secondSnapshot = buildBundleSnapshot({
      'pages/index/index.js': {
        ...createRollupChunk('const cls = "text-_b103_d43rpx_B grid-rows-_bauto_minmax_p0_m_1fr_P_B bg-_b_h0000ff_B"; const keep = common_vendor.ref(1)'),
        fileName: 'pages/index/index.js',
      },
    }, opts, outDir, state)

    const secondRuntimeSet = await manager.sync(runtime, secondSnapshot)

    expect(secondRuntimeSet).toEqual(new Set([
      'text-[103.43rpx]',
      'grid-rows-[auto_minmax(0,_1fr)]',
      'bg-[#0000ff]',
    ]))
    expect(secondRuntimeSet.has('text-[102.43rpx]')).toBe(false)
  })

  it('restores escaped v4 runtime candidates from changed output files', async () => {
    const opts = createOptions()
    const outDir = '/project/dist'
    const state = createBundleBuildState()
    const runtime = createV4Runtime()
    const extractRawCandidates = vi.fn(async () => [])
    const manager = createBundleRuntimeClassSetManager({
      extractCandidates: createCandidateValidator([
        'text-[23.000025px]',
        'bg-[#000025]',
        'after:ml-[0.000025px]',
        'text-[23.000026px]',
        'bg-[#000026]',
        'after:ml-[0.000026px]',
      ]),
      extractRawCandidates,
    })

    const firstSnapshot = buildBundleSnapshot({
      'pages/index/index.js': {
        ...createRollupChunk('const cls = "text-_b23_d000025px_B bg-_b_h000025_B after_cml-_b0_d000025px_B";'),
        fileName: 'pages/index/index.js',
      },
    }, opts, outDir, state)

    const firstRuntimeSet = await manager.sync(runtime, firstSnapshot)

    expect(firstRuntimeSet).toEqual(new Set([
      'text-[23.000025px]',
      'bg-[#000025]',
      'after:ml-[0.000025px]',
    ]))
    expect(extractRawCandidates).toHaveBeenCalledWith(
      expect.stringContaining('bg-_b_h000025_B'),
      'js',
    )

    updateBundleBuildState(state, firstSnapshot, new Map([
      ['pages/index/index.js', new Set<string>()],
    ]), { incremental: true })

    const secondSnapshot = buildBundleSnapshot({
      'pages/index/index.js': {
        ...createRollupChunk('const cls = "text-_b23_d000026px_B bg-_b_h000026_B after_cml-_b0_d000026px_B";'),
        fileName: 'pages/index/index.js',
      },
    }, opts, outDir, state)

    const secondRuntimeSet = await manager.sync(runtime, secondSnapshot)

    expect(secondRuntimeSet).toEqual(new Set([
      'text-[23.000026px]',
      'bg-[#000026]',
      'after:ml-[0.000026px]',
    ]))
    expect(secondRuntimeSet.has('bg-[#000025]')).toBe(false)
  })

  it('restores only the canonical candidate for escaped arbitrary colors with alpha values', async () => {
    const opts = createOptions()
    const outDir = '/project/dist'
    const state = createBundleBuildState()
    const runtime = createV4Runtime()
    const extractCandidates = createCandidateValidator([
      'bg-[#31edd8]/[0.54]',
      'bg-[#31edd8_B/[0.54]',
    ])
    const manager = createBundleRuntimeClassSetManager({
      extractCandidates,
      extractRawCandidates: vi.fn(async () => []),
    })

    const snapshot = buildBundleSnapshot({
      'pages/index/index.js': {
        ...createRollupChunk('const cls = "bg-_b_h31edd8_B_f_b0_d54_B";'),
        fileName: 'pages/index/index.js',
      },
    }, opts, outDir, state)

    await expect(manager.sync(runtime, snapshot)).resolves.toEqual(new Set([
      'bg-[#31edd8]/[0.54]',
    ]))
    const validationSource = extractCandidates.mock.calls[0]?.[0]?.content ?? ''
    expect(validationSource).toContain('bg-[#31edd8]/[0.54]')
    expect(validationSource).not.toContain('bg-[#31edd8_B/[0.54]')
  })

  it('ignores dependency vendor chunks when collecting tailwind v4 runtime candidates', async () => {
    const opts = createOptions()
    const outDir = '/project/dist'
    const state = createBundleBuildState()
    const runtime = createRuntime('/project')
    const extractCandidates = vi.fn(async (options) => {
      const source = options?.content ?? ''
      return source.split(/\s+/).filter(Boolean)
    })
    const extractRawCandidates = vi.fn(async (content: string) => {
      if (content.includes('sr-only')) {
        return [
          { rawCandidate: 'sr-only' },
          { rawCandidate: 'not-sr-only' },
          { rawCandidate: 'sticky' },
          { rawCandidate: 'inline-table' },
        ]
      }
      if (content.includes('bg-[#123456]')) {
        return [{ rawCandidate: 'bg-[#123456]' }]
      }
      return []
    })
    const manager = createBundleRuntimeClassSetManager({
      extractCandidates,
      extractRawCandidates,
    })

    const vendorChunk = createRollupChunk('const mergeConfig = { sr: ["sr-only", "not-sr-only"], position: ["sticky"], display: ["inline-table"] }')
    vendorChunk.isEntry = false
    vendorChunk.fileName = 'common/vendor.js'
    vendorChunk.moduleIds = ['/project/node_modules/@weapp-tailwindcss/merge/dist/index.mjs']
    vendorChunk.modules = {
      '/project/node_modules/@weapp-tailwindcss/merge/dist/index.mjs': {
        code: null,
        originalLength: 100,
        removedExports: [],
        renderedExports: [],
        renderedLength: 100,
      },
    }

    const snapshot = buildBundleSnapshot({
      'common/vendor.js': vendorChunk,
      'pages/index/index.js': {
        ...createRollupChunk('const cls = "bg-[#123456]"'),
        fileName: 'pages/index/index.js',
      },
    }, opts, outDir, state)

    await expect(manager.sync(runtime, snapshot)).resolves.toEqual(new Set(['bg-[#123456]']))
    expect(extractRawCandidates).toHaveBeenCalledTimes(1)
    expect(extractRawCandidates).toHaveBeenCalledWith(
      expect.stringContaining('bg-[#123456]'),
      'js',
    )
    expect(extractRawCandidates).not.toHaveBeenCalledWith(
      expect.stringContaining('sr-only'),
      expect.any(String),
    )
  })

  it('resets incremental runtime state when css entry signature changes', async () => {
    const opts = createOptions()
    const outDir = path.join(tempRoot, 'dist')
    const state = createBundleBuildState()
    const projectRoot = path.join(tempRoot, 'project')
    const runtime = createRuntime(projectRoot)
    const cssEntry = path.join(projectRoot, 'src/app.css')
    await mkdir(path.dirname(cssEntry), { recursive: true })
    await writeFile(cssEntry, '@import "tailwindcss";', 'utf8')
    runtime.options.tailwind.v4.cssEntries = [cssEntry]

    const extractCandidates = vi.fn(async () => ['foo'])
    const extractRawCandidates = vi.fn(async () => [{ rawCandidate: 'foo' }])
    const manager = createBundleRuntimeClassSetManager({
      extractCandidates,
      extractRawCandidates,
    })

    const firstSnapshot = buildBundleSnapshot({
      'pages/index/index.wxml': {
        ...createRollupAsset('<view class="foo" />'),
        fileName: 'pages/index/index.wxml',
      },
    }, opts, outDir, state)

    await manager.sync(runtime, firstSnapshot)
    expect(extractCandidates).toHaveBeenCalledTimes(1)

    updateBundleBuildState(state, firstSnapshot, new Map([
      ['pages/index/index.wxml', new Set<string>()],
    ]))

    await writeFile(cssEntry, '@import "tailwindcss";\n@theme { --color-brand: #123456; }\n', 'utf8')
    await new Promise(resolve => setTimeout(resolve, 0))

    const secondSnapshot = buildBundleSnapshot({
      'pages/index/index.wxml': {
        ...createRollupAsset('<view class="foo" />'),
        fileName: 'pages/index/index.wxml',
      },
    }, opts, outDir, state)

    await manager.sync(runtime, secondSnapshot)
    expect(extractCandidates).toHaveBeenCalledTimes(2)
  })

  it('keeps v4 non-source baseline classes while replacing changed source candidates', async () => {
    const opts = createOptions()
    const outDir = '/project/dist'
    const state = createBundleBuildState()
    const runtime = createV4Runtime()
    const extractRawCandidates = vi.fn(async (content: string) => {
      if (content.includes('bg-blue-500')) {
        return [{ rawCandidate: 'bg-blue-500' }]
      }
      if (content.includes('bg-[#123455]')) {
        return [{ rawCandidate: 'bg-[#123455]' }]
      }
      return []
    })
    const manager = createBundleRuntimeClassSetManager({
      extractCandidates: createCandidateValidator(['bg-blue-500', 'bg-[#123455]']),
      extractRawCandidates,
    })

    const firstSnapshot = buildBundleSnapshot({
      'pages/index/index.wxml': {
        ...createRollupAsset('<view class="bg-blue-500" />'),
        fileName: 'pages/index/index.wxml',
      },
    }, opts, outDir, state)

    const firstRuntimeSet = await manager.sync(runtime, firstSnapshot, {
      baseClassSet: new Set(['bg-blue-500', 'safelist-only']),
    })

    expect(firstRuntimeSet).toEqual(new Set(['safelist-only', 'bg-blue-500']))

    updateBundleBuildState(state, firstSnapshot, new Map())

    const secondSnapshot = buildBundleSnapshot({
      'pages/index/index.wxml': {
        ...createRollupAsset('<view class="bg-[#123455]" />'),
        fileName: 'pages/index/index.wxml',
      },
    }, opts, outDir, state)

    const secondRuntimeSet = await manager.sync(runtime, secondSnapshot)

    expect(secondRuntimeSet).toEqual(new Set(['safelist-only', 'bg-[#123455]']))
    expect(secondRuntimeSet.has('bg-blue-500')).toBe(false)
    expect(extractRawCandidates).toHaveBeenCalledTimes(2)
  })

  it('uses v4 baseline runtime set without scanning clean files on first incremental sync', async () => {
    const opts = createOptions()
    const outDir = '/project/dist'
    const state = createBundleBuildState()
    const runtime = createV4Runtime()
    const extractRawCandidates = vi.fn(async (content: string) => {
      if (content.includes('bg-[red]')) {
        return [{ rawCandidate: 'bg-[red]' }]
      }
      if (content.includes('vendor-token')) {
        return [{ rawCandidate: 'vendor-token' }]
      }
      return []
    })
    const manager = createBundleRuntimeClassSetManager({
      extractCandidates: createCandidateValidator(['bg-[red]', 'vendor-token']),
      extractRawCandidates,
    })

    const firstSnapshot = buildBundleSnapshot({
      'common/vendor.js': {
        ...createRollupChunk('const vendor = "vendor-token"'),
        fileName: 'common/vendor.js',
      },
      'pages/index/index.js': {
        ...createRollupChunk('const cls = "bg-[#4268EA]"'),
        fileName: 'pages/index/index.js',
      },
    }, opts, outDir, state)

    updateBundleBuildState(state, firstSnapshot, new Map([
      ['common/vendor.js', new Set<string>()],
      ['pages/index/index.js', new Set<string>()],
    ]))

    const secondSnapshot = buildBundleSnapshot({
      'common/vendor.js': {
        ...createRollupChunk('const vendor = "vendor-token"'),
        fileName: 'common/vendor.js',
      },
      'pages/index/index.js': {
        ...createRollupChunk('const cls = "bg-[red]"'),
        fileName: 'pages/index/index.js',
      },
    }, opts, outDir, state)

    const runtimeSet = await manager.sync(runtime, secondSnapshot, {
      baseClassSet: new Set(['bg-[#4268EA]', 'bg-[red]', 'safelist-only']),
      skipInitialFullScanWithBase: true,
    })

    expect(runtimeSet).toEqual(new Set(['bg-[#4268EA]', 'safelist-only', 'bg-[red]']))
    expect(extractRawCandidates).toHaveBeenCalledTimes(1)
    expect(extractRawCandidates).toHaveBeenCalledWith(
      expect.stringContaining('bg-[red]'),
      'js',
    )
  })

  it('keeps v4 rollback arbitrary classes from changed JS literals when raw positions are missing', async () => {
    const opts = createOptions()
    const outDir = '/project/dist'
    const state = createBundleBuildState()
    const runtime = createV4Runtime()
    const extractRawCandidates = vi.fn(async (content: string) => {
      if (content.includes('bg-[red]')) {
        return [
          { rawCandidate: 'bg-[red]' },
          { rawCandidate: 'shadow-indigo-100' },
        ]
      }
      if (content.includes('bg-[#4268EA]')) {
        return [
          { rawCandidate: 'bg-[#4268EA]' },
          { rawCandidate: 'shadow-indigo-100' },
        ]
      }
      return []
    })
    const manager = createBundleRuntimeClassSetManager({
      extractCandidates: createCandidateValidator(['bg-[red]', 'bg-[#4268EA]']),
      extractRawCandidates,
    })

    const firstSnapshot = buildBundleSnapshot({
      'pages/index/index.js': {
        ...createRollupChunk('const cardsColor = ["bg-[red] shadow-indigo-100"]'),
        fileName: 'pages/index/index.js',
      },
    }, opts, outDir, state)

    updateBundleBuildState(state, firstSnapshot, new Map([
      ['pages/index/index.js', new Set<string>()],
    ]))

    await manager.sync(runtime, firstSnapshot, {
      baseClassSet: new Set(['bg-[red]', 'bg-[#4268EA]']),
      skipInitialFullScanWithBase: true,
    })
    updateBundleBuildState(state, firstSnapshot, new Map([
      ['pages/index/index.js', new Set<string>()],
    ]), { incremental: true })

    const rollbackSnapshot = buildBundleSnapshot({
      'pages/index/index.js': {
        ...createRollupChunk('const cardsColor = ["bg-[#4268EA] shadow-indigo-100"]'),
        fileName: 'pages/index/index.js',
      },
    }, opts, outDir, state)

    const runtimeSet = await manager.sync(runtime, rollbackSnapshot, {
      baseClassSet: new Set(['bg-[red]', 'bg-[#4268EA]']),
    })

    expect(runtimeSet.has('bg-[#4268EA]')).toBe(true)
    expect(runtimeSet.has('shadow-indigo-100')).toBe(false)
  })

  it('filters v4 raw text candidates by confirmed source candidates before JS transform', async () => {
    const opts = createOptions()
    const outDir = '/project/dist'
    const state = createBundleBuildState()
    const runtime = createV4Runtime()
    const extractRawCandidates = vi.fn(async (content: string) => {
      if (content.includes('Hello world!')) {
        return [
          { rawCandidate: 'bg-[red]' },
          { rawCandidate: 'flex' },
          { rawCandidate: 'world!' },
        ]
      }
      return []
    })
    const manager = createBundleRuntimeClassSetManager({
      extractCandidates: createCandidateValidator(['bg-[red]', 'flex']),
      extractRawCandidates,
    })

    const snapshot = buildBundleSnapshot({
      'pages/index/index.js': {
        ...createRollupChunk('const vnode = <View className="bg-[red] flex">Hello world!</View>'),
        fileName: 'pages/index/index.js',
      },
    }, opts, outDir, state)

    const runtimeSet = await manager.sync(runtime, snapshot, {
      baseClassSet: new Set(['bg-[red]', 'flex']),
    })

    expect(runtimeSet).toEqual(new Set(['bg-[red]', 'flex']))
    expect(runtimeSet.has('world!')).toBe(false)
  })

  it('keeps v4 bracket-like business text out of the runtime class set', async () => {
    const opts = createOptions()
    const outDir = '/project/dist'
    const state = createBundleBuildState()
    const runtime = createV4Runtime()
    const jsSource = [
      'const complexExpression = "size > 4 ? keep-[business] : App.vue:4"',
      'const view = <View className="bg-[red] before:content-[\\"111\\"] bg-yellow-300/30">Hello world!</View>',
    ].join('\n')
    const extractRawCandidates = vi.fn(async (content: string) => [
      { rawCandidate: 'keep-[business]', start: content.indexOf('keep-[business]') },
      { rawCandidate: 'App.vue:4', start: content.indexOf('App.vue:4') },
      { rawCandidate: 'bg-[red]', start: content.indexOf('bg-[red]') },
      { rawCandidate: 'before:content-[\\"111\\"]', start: content.indexOf('before:content') },
      { rawCandidate: 'bg-yellow-300/30', start: content.indexOf('bg-yellow-300/30') },
    ])
    const manager = createBundleRuntimeClassSetManager({
      extractCandidates: createCandidateValidator(['bg-[red]', 'before:content-[\\"111\\"]', 'bg-yellow-300/30']),
      extractRawCandidates,
    })

    const snapshot = buildBundleSnapshot({
      'pages/index/index.js': {
        ...createRollupChunk(jsSource),
        fileName: 'pages/index/index.js',
      },
    }, opts, outDir, state)

    const runtimeSet = await manager.sync(runtime, snapshot)

    expect(runtimeSet).toEqual(new Set([
      'bg-[red]',
      'before:content-[\\"111\\"]',
      'bg-yellow-300/30',
    ]))
    expect(runtimeSet.has('keep-[business]')).toBe(false)
    expect(runtimeSet.has('App.vue:4')).toBe(false)
  })
})
