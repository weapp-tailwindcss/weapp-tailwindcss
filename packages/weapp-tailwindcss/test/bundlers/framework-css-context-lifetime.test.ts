import type { OutputAsset, OutputBundle } from 'rollup'
import type { ResolvedConfig } from 'vite'
import type { ViteFrameworkCssPipelineContext } from '@/bundlers/vite/shared/framework-strategy'
import process from 'node:process'
import { describe, expect, it, vi } from 'vitest'
import { createViteCssFinalizerOutputPlugin } from '@/bundlers/vite/css-finalizer'
import { createGenerateBundleHook } from '@/bundlers/vite/generate-bundle'
import { createCssAssetPipelineContext } from '@/bundlers/vite/processed-css-assets/markers-imports'
import { createContext, createRollupChunk } from './vite-plugin.testkit'

vi.mock('@/bundlers/vite/processed-css-assets/markers-imports', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/bundlers/vite/processed-css-assets/markers-imports')>()
  return {
    ...actual,
    createCssAssetPipelineContext: vi.fn(actual.createCssAssetPipelineContext),
  }
})

type FileContext = ViteFrameworkCssPipelineContext & { file: string }

function createBundle(round: string): OutputBundle {
  return Object.fromEntries(['one', 'two'].map((name) => {
    const fileName = `${round}-${name}.css`
    return [fileName, {
      type: 'asset',
      fileName,
      names: [],
      originalFileNames: [],
      source: `.${name}{color:red}`,
    } satisfies OutputAsset]
  }))
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function createFixture(stage: 'generateBundle' | 'finalizer') {
  const observed: FileContext[] = []
  let cssMatchAllowed = true
  const opts = createContext({
    appType: 'native',
    platform: 'mp-weixin',
    cssMatcher: (file: string) => cssMatchAllowed && file.endsWith('.css'),
    mainCssChunkMatcher: () => false,
    escapeMap: { alpha: 'initial' },
    generator: {
      target: 'weapp',
      config: 'initial.config.ts',
      styleOptions: { cssPreflight: { color: 'red' } },
    },
    tailwindRuntime: { majorVersion: 3, options: { tailwindcss: undefined } },
  })
  const waitForSourceCandidateSyncs = vi.fn(async () => {})
  const context = {
    opts: opts as any,
    runtimeState: { tailwindRuntime: opts.tailwindRuntime, readyPromise: Promise.resolve() },
    ensureRuntimeClassSet: vi.fn(async () => new Set(['alpha'])),
    ensureBundleRuntimeClassSet: vi.fn(async () => new Set(['alpha'])),
    isCssAssetProcessed: vi.fn(() => false),
    markCssAssetProcessed: vi.fn(),
    waitForSourceCandidateSyncs,
    debug: vi.fn(),
    getResolvedConfig: () => ({
      command: 'build',
      root: process.cwd(),
      build: { outDir: process.cwd(), watch: {} },
      css: { postcss: { plugins: [] } },
    }) as ResolvedConfig,
  }
  const assetContexts = vi.mocked(createCssAssetPipelineContext)
  assetContexts.mockClear()
  const finalizer = stage === 'finalizer'
    ? createViteCssFinalizerOutputPlugin({
        ...context,
        cssPipelineStrategy: {
          generation: {
            getCssHandlerExtraOptions(request) {
              observed.push(request)
              return {}
            },
          },
        },
      })
    : undefined
  const hook = finalizer
    ? (finalizer.generateBundle as { handler: (options: unknown, bundle: OutputBundle) => Promise<void> }).handler
    : createGenerateBundleHook(context)
  return {
    opts,
    waitForSourceCandidateSyncs,
    setCssMatchAllowed: (allowed: boolean) => { cssMatchAllowed = allowed },
    run: (bundle: OutputBundle) => hook.call({ addWatchFile: vi.fn() }, {}, bundle),
    requests: () => stage === 'finalizer'
      ? observed
      : assetContexts.mock.results.map(result => result.value as FileContext),
  }
}

function expectSnapshot(request: FileContext, version: 'initial' | 'updated') {
  expect(request.currentGeneratorOptions.config).toBe(`${version}.config.ts`)
  expect(request.currentGeneratorOptions.styleOptions?.cssPreflight).toEqual({ color: version === 'initial' ? 'red' : 'blue' })
  expect(request.escapeMap.alpha).toBe(version)
  expect(request.matchesCss('other.css')).toBe(version === 'initial')
  expect(request.matchesMainCss('other.css')).toBe(version === 'updated')
}

function updateConfiguration(opts: ReturnType<typeof createContext>) {
  opts.generator.config = 'updated.config.ts'
  opts.generator.styleOptions.cssPreflight.color = 'blue'
  opts.escapeMap.alpha = 'updated'
  opts.cssMatcher = (file: string) => file !== 'other.css' && file.endsWith('.css')
  opts.mainCssChunkMatcher = (file: string) => file === 'other.css'
}

describe.each(['generateBundle', 'finalizer'] as const)('%s CSS context lifetime', (stage) => {
  it('shares one readonly configuration snapshot while keeping file contexts distinct', async () => {
    const fixture = createFixture(stage)
    const bundle = createBundle('first')
    const sourcesContent = vi.fn(() => ['original source'])
    bundle['entry.js'] = {
      ...createRollupChunk('console.log(1)'),
      fileName: 'entry.js',
      map: { get sourcesContent() { return sourcesContent() } },
    } as OutputBundle[string]
    await fixture.run(bundle)
    expect(sourcesContent).not.toHaveBeenCalled()
    const requests = fixture.requests()
    expect(requests).toHaveLength(2)
    expect(requests.map(request => request.file)).toEqual(['first-one.css', 'first-two.css'])
    const [first, second] = requests as [FileContext, FileContext]
    expect(first).not.toBe(second)
    expect(first.currentGeneratorOptions).toBe(second.currentGeneratorOptions)
    expect(first.currentGeneratorBranch).toBe(second.currentGeneratorBranch)
    expect(first.escapeMap).toBe(second.escapeMap)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.currentGeneratorOptions.styleOptions?.cssPreflight)).toBe(true)
    expect(Object.isFrozen(fixture.opts.generator.styleOptions.cssPreflight)).toBe(false)
    expectSnapshot(first, 'initial')
    fixture.setCssMatchAllowed(false)
    expect(first.matchesCss('first-one.css')).toBe(false)
    expect(second.matchesCss('first-two.css')).toBe(false)
    fixture.setCssMatchAllowed(true)
    expect(first.matchesCss('first-one.css')).toBe(true)
    expect(first.assets!['entry.js']).toHaveProperty('map.sourcesContent', ['original source'])
    expect(sourcesContent).toHaveBeenCalled()
    expect(bundle['first-one.css']).toHaveProperty('source', 'css:.one{color:red}')
    expect(bundle['first-two.css']).toHaveProperty('source', 'css:.two{color:red}')
  })

  it('captures changed configuration in the next round without changing previous requests', async () => {
    const fixture = createFixture(stage)
    await fixture.run(createBundle('first'))
    const previous = [...fixture.requests()]
    updateConfiguration(fixture.opts)
    await fixture.run(createBundle('next'))
    const next = fixture.requests().slice(previous.length)
    expect(next).toHaveLength(2)
    for (const request of previous) {
      expectSnapshot(request, 'initial')
    }
    for (const request of next) {
      expectSnapshot(request, 'updated')
      expect(request.currentGeneratorOptions).not.toBe(previous[0]!.currentGeneratorOptions)
    }
    expect(next[0]!.currentGeneratorOptions).toBe(next[1]!.currentGeneratorOptions)
  })

  it('keeps overlapping output invocations bound to their own configuration and live assets', async () => {
    const fixture = createFixture(stage)
    const entered = deferred()
    const release = deferred()
    fixture.waitForSourceCandidateSyncs.mockImplementationOnce(async () => {
      entered.resolve()
      await release.promise
    })
    const firstBundle = createBundle('first')
    const nextBundle = createBundle('next')
    const firstRun = fixture.run(firstBundle)
    try {
      await entered.promise
      updateConfiguration(fixture.opts)
      await fixture.run(nextBundle)
    }
    finally {
      release.resolve()
      await firstRun
    }
    const requests = fixture.requests()
    expect(requests).toHaveLength(4)
    const first = requests.filter(request => request.file.startsWith('first-'))
    const next = requests.filter(request => request.file.startsWith('next-'))
    expect(first).toHaveLength(2)
    expect(next).toHaveLength(2)
    for (const request of first) {
      expectSnapshot(request, 'initial')
      expect(Object.keys(request.assets!)).toEqual(Object.keys(firstBundle))
    }
    for (const request of next) {
      expectSnapshot(request, 'updated')
      expect(Object.keys(request.assets!)).toEqual(Object.keys(nextBundle))
    }
    expect(first[0]!.currentGeneratorOptions).toBe(first[1]!.currentGeneratorOptions)
    expect(first[0]!.currentGeneratorOptions).not.toBe(next[0]!.currentGeneratorOptions)
    ;(firstBundle['first-one.css'] as OutputAsset).source = '.changed{color:green}'
    expect(first[0]!.assets!['first-one.css']).toHaveProperty('source', '.changed{color:green}')
    expect(next[0]!.assets!['next-one.css']).toHaveProperty('source', 'css:.one{color:red}')
    expect(next[0]!.assets!['first-one.css']).toBeUndefined()
  })
})
