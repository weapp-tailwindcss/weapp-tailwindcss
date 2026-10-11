import { afterEach, describe, expect, it, vi } from 'vitest'

function createGeneratorModule(generate: ReturnType<typeof vi.fn>) {
  const resolveSource = vi.fn(async (options: any = {}) => ({
    projectRoot: '/workspace',
    base: '/workspace/src',
    baseFallbacks: [],
    css: options.css ?? '@import "tailwindcss";',
    dependencies: ['/workspace/src/app.css'],
  }))
  return {
    createWeappTailwindcssGenerator: vi.fn((source: any) => ({
      source,
      generate,
      validateCandidates: vi.fn(),
    })),
    normalizeWeappTailwindcssGeneratorOptions: vi.fn((options: any = {}) => ({
      enabled: true,
      target: options.target ?? 'web',
      importFallback: false,
      hmr: {
        preserveDeletedCss: options.hmr?.preserveDeletedCss ?? true,
      },
    })),
    resolveTailwindV4Source: resolveSource,
    resolveTailwindV4SourceFromRuntime: resolveSource,
    resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
      projectRoot: '/workspace',
      baseFallbacks: [],
    })),
  }
}

function createOptions(runtimeState: object, candidates: string[]) {
  return {
    opts: {
      generator: {
        target: 'web',
        hmr: { preserveDeletedCss: false },
      },
    } as any,
    runtimeState: runtimeState as any,
    runtime: new Set(candidates),
    sourceCandidates: new Set(candidates),
    rawSource: '@import "tailwindcss";',
    file: '/workspace/src/app.css',
    outputFile: 'app.css',
    cssHandlerOptions: { isMainChunk: true, majorVersion: 4 } as any,
    cssUserHandlerOptions: {} as any,
    styleHandler: vi.fn(async (css: string) => ({ css })),
    debug: vi.fn(),
    forceGenerator: true,
    disableSourceScan: true,
  }
}

describe('graph generation compilation session', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.doUnmock('@/generator')
    vi.resetModules()
  })

  it('generates from session-owned candidates and commits classSet to the same revision', async () => {
    vi.stubEnv('WEAPP_TAILWINDCSS_COMPILER', 'graph')
    const generate = vi.fn(async (options: any) => {
      const classSet = new Set<string>(options.candidates)
      const css = [...classSet].map(candidate => `.${candidate}{display:block}`).join('\n')
      return {
        css,
        rawCss: css,
        target: 'web',
        classSet,
        rawCandidates: classSet,
        dependencies: ['/workspace/src/app.css'],
        sources: [],
        root: null,
      }
    })
    vi.doMock('@/generator', () => createGeneratorModule(generate))
    const { generateTailwindV4Css } = await import('@/generation/service')
    const runtimeState = {
      tailwindRuntime: { majorVersion: 4 },
      readyPromise: Promise.resolve(),
    }

    const first = await generateTailwindV4Css(createOptions(runtimeState, ['p-4']))
    const second = await generateTailwindV4Css(createOptions(runtimeState, ['m-2']))

    expect(generate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      candidates: new Set(['p-4']),
    }))
    expect(generate).toHaveBeenNthCalledWith(2, expect.objectContaining({
      candidates: new Set(['m-2']),
    }))
    expect(first?.snapshot).toBeDefined()
    expect([...(first?.snapshot?.classSet ?? [])]).toEqual(['p-4'])
    expect(second?.snapshot).toBeDefined()
    expect([...(second?.snapshot?.classSet ?? [])]).toEqual(['m-2'])
    expect(first?.metadata.revision).toBe(1)
    expect(first?.artifact?.revision).toBe(1)
    expect(second?.metadata.revision).toBe(2)
    expect(second?.artifact?.revision).toBe(2)
    expect(second?.classSet).toEqual(new Set(['m-2']))
  })

  it('discards a stale generation result after a newer revision commits', async () => {
    vi.stubEnv('WEAPP_TAILWINDCSS_COMPILER', 'graph')
    let releaseFirst: (() => void) | undefined
    let markFirstStarted: (() => void) | undefined
    const firstPending = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve
    })
    const generate = vi.fn(async (options: any) => {
      const classSet = new Set<string>(options.candidates)
      if (classSet.has('p-4')) {
        markFirstStarted?.()
        await firstPending
      }
      const css = [...classSet].map(candidate => `.${candidate}{display:block}`).join('\n')
      return {
        css,
        rawCss: css,
        target: 'web',
        classSet,
        rawCandidates: classSet,
        dependencies: ['/workspace/src/app.css'],
        sources: [],
        root: null,
      }
    })
    vi.doMock('@/generator', () => createGeneratorModule(generate))
    const { generateTailwindV4Css } = await import('@/generation/service')
    const runtimeState = {
      tailwindRuntime: { majorVersion: 4 },
      readyPromise: Promise.resolve(),
    }

    const staleResult = generateTailwindV4Css(createOptions(runtimeState, ['p-4']))
    await firstStarted
    const currentResult = await generateTailwindV4Css(createOptions(runtimeState, ['m-2']))
    releaseFirst?.()

    expect(currentResult?.metadata.revision).toBe(2)
    expect(currentResult?.classSet).toEqual(new Set(['m-2']))
    await expect(staleResult).resolves.toBeUndefined()
  })

  it('consumes dependency changes once and disables stale incremental css append', async () => {
    vi.stubEnv('WEAPP_TAILWINDCSS_COMPILER', 'graph')
    const dependency = '/workspace/tailwind.config.ts'
    const generate = vi.fn(async (options: any) => {
      const classSet = new Set<string>(options.candidates)
      return {
        css: '.fresh{display:block}',
        rawCss: '.fresh{display:block}',
        incrementalCss: '.incremental{display:block}',
        target: 'web',
        classSet,
        rawCandidates: classSet,
        dependencies: [dependency],
        sources: [],
        root: null,
      }
    })
    vi.doMock('@/generator', () => createGeneratorModule(generate))
    const compiler = await import('@/compiler')
    const { generateTailwindV4Css } = await import('@/generation/service')
    const runtimeState = {
      tailwindRuntime: { majorVersion: 4 },
      readyPromise: Promise.resolve(),
    }

    await generateTailwindV4Css(createOptions(runtimeState, ['block']))
    compiler.recordCompilationDependencyChanges(
      runtimeState,
      compiler.createCompilationDependencyChanges([dependency]),
    )
    const result = await generateTailwindV4Css({
      ...createOptions(runtimeState, ['block']),
      previousClassSet: new Set(['stale']),
      previousCss: '.stale{display:none}',
    })

    expect(result?.css).toBe('.fresh{display:block}')
    expect(result?.css).not.toContain('stale')
    expect(result?.css).not.toContain('incremental')
    expect(result?.metadata.revision).toBe(2)
    expect(compiler.consumeCompilationScopeChanges(runtimeState, 'app.css')).toBeUndefined()
  })

  it('在 graph 模式下使用 compiler 完整 CSS，不回放 legacy previousCss', async () => {
    vi.stubEnv('WEAPP_TAILWINDCSS_COMPILER', 'graph')
    const generate = vi.fn(async (options: any) => ({
      css: `.${[...options.candidates][0]}{display:block}`,
      rawCss: `.${[...options.candidates][0]}{display:block}`,
      incrementalCss: '',
      target: 'web',
      classSet: new Set(options.candidates),
      rawCandidates: new Set(options.candidates),
      dependencies: [],
      sources: [],
      root: null,
    }))
    vi.doMock('@/generator', () => createGeneratorModule(generate))
    const { generateTailwindV4Css } = await import('@/generation/service')
    const runtimeState = {
      tailwindRuntime: { majorVersion: 4 },
      readyPromise: Promise.resolve(),
    }

    const result = await generateTailwindV4Css({
      ...createOptions(runtimeState, ['new']),
      previousCss: '.old{display:none}',
      previousClassSet: new Set(['old']),
    })

    expect(result?.css).toBe('.new{display:block}')
    expect(result?.classSet).toEqual(new Set(['new']))
  })
})
