import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureFrameworkPostcssOptions } from '@/generation/framework-postcss'
import { COMPILER_MODE_ENV, resolveCompilerMode } from '@/compiler/mode'

function createGenerationOptions(debug = vi.fn()) {
  return {
    opts: {} as any,
    runtimeState: {
      tailwindRuntime: { majorVersion: 4 } as any,
      readyPromise: Promise.resolve(),
    },
    runtime: new Set(['p-4']),
    rawSource: '@import "tailwindcss";',
    file: '/workspace/src/app.css',
    outputFile: 'app.css',
    cssHandlerOptions: { isMainChunk: true, majorVersion: 4 } as any,
    cssUserHandlerOptions: {} as any,
    styleHandler: vi.fn(async (css: string) => ({ css })),
    debug,
  }
}

function createGeneratedResult(css: string, target = 'web') {
  return {
    css,
    target,
    classSet: new Set(['p-4']),
    dependencies: [],
    source: 'generator' as const,
    metadata: {
      file: '/workspace/src/app.css',
      outputFile: 'app.css',
    },
  }
}

describe('compiler mode', () => {
  const originalMode = process.env[COMPILER_MODE_ENV]

  afterEach(() => {
    if (originalMode === undefined) {
      delete process.env[COMPILER_MODE_ENV]
    }
    else {
      process.env[COMPILER_MODE_ENV] = originalMode
    }
    vi.doUnmock('@/generation/index')
    vi.resetModules()
  })

  it('defaults to graph and accepts explicit modes', () => {
    expect(resolveCompilerMode({})).toBe('graph')
    expect(resolveCompilerMode({ [COMPILER_MODE_ENV]: 'legacy' })).toBe('legacy')
    expect(resolveCompilerMode({ [COMPILER_MODE_ENV]: 'shadow' })).toBe('shadow')
    expect(resolveCompilerMode({ [COMPILER_MODE_ENV]: 'graph' })).toBe('graph')
  })

  it('uses graph compilation by default', async () => {
    delete process.env[COMPILER_MODE_ENV]
    const generateCssByGenerator = vi.fn(async (options: { compilation?: { enabled: boolean } }) => {
      expect(options.compilation?.enabled).toBe(true)
      return createGeneratedResult('.p-4 { padding: 1rem; }')
    })
    vi.doMock('@/generation/index', () => ({ generateCssByGenerator }))
    const { generateTailwindV4Css } = await import('@/generation/service')

    const result = await generateTailwindV4Css(createGenerationOptions())

    expect(generateCssByGenerator).toHaveBeenCalledTimes(1)
    expect(result?.artifact).toBeDefined()
  })

  it('keeps the explicit legacy fallback free of graph artifacts', async () => {
    process.env[COMPILER_MODE_ENV] = 'legacy'
    const generateCssByGenerator = vi.fn(async (options: { compilation?: unknown }) => {
      expect(options.compilation).toBeUndefined()
      return createGeneratedResult('.p-4 { padding: 1rem; }')
    })
    vi.doMock('@/generation/index', () => ({ generateCssByGenerator }))
    const { generateTailwindV4Css } = await import('@/generation/service')

    const result = await generateTailwindV4Css(createGenerationOptions())

    expect(generateCssByGenerator).toHaveBeenCalledTimes(1)
    expect(result?.artifact).toBeUndefined()
  })

  it.each([
    [
      '/workspace/src/app.wxss?weapp-vite-sidecar-owner=app&weapp-vite-sidecar=style&lang.css',
      '/workspace/src/app.wxss',
    ],
    [
      'C:\\workspace\\src\\app.wxss?weapp-vite-sidecar=style#virtual',
      'C:\\workspace\\src\\app.wxss',
    ],
  ])('normalizes the physical generation file for bundler request %s', async (file, physicalFile) => {
    process.env[COMPILER_MODE_ENV] = 'legacy'
    const generateCssByGenerator = vi.fn(async (options: { file: string }) => {
      expect(options.file).toBe(physicalFile)
      return {
        ...createGeneratedResult('.p-4 { padding: 1rem; }'),
        metadata: {
          file: physicalFile,
          outputFile: 'app.css',
        },
      }
    })
    vi.doMock('@/generation/index', () => ({ generateCssByGenerator }))
    const { generateTailwindV4Css } = await import('@/generation/service')

    const result = await generateTailwindV4Css({
      ...createGenerationOptions(),
      file,
    })

    expect(generateCssByGenerator).toHaveBeenCalledTimes(1)
    expect(result?.metadata.file).toBe(physicalFile)
  })

  it.each(['weapp', 'web'])('uses the %s framework adapter in graph mode', async (target) => {
    process.env[COMPILER_MODE_ENV] = 'graph'
    const generateCssByGenerator = vi.fn(async (options: { deferCssAdaptation?: boolean }) => {
      expect(options.deferCssAdaptation).toBe(target === 'weapp')
      return createGeneratedResult('.token { color: framework-token; }', target)
    })
    vi.doMock('@/generation/index', () => ({ generateCssByGenerator }))
    const { generateTailwindV4Css } = await import('@/generation/service')
    const transformRoot = vi.fn(async (root: any) => {
      root.walkDecls((decl: any) => {
        decl.value = decl.value.replace('framework-token', 'processed-token')
      })
      return root.toResult()
    })
    const styleHandler = Object.assign(
      vi.fn(async (css: string) => ({ css })),
      { transformRoot },
    )
    const owner = {
      cssPreflight: false,
      generator: { target },
      styleHandler,
    } as any
    captureFrameworkPostcssOptions(owner, {
      plugins: [{
        postcssPlugin: 'framework-plugin',
        Declaration(decl: any) {
          decl.value = decl.value.replace('framework-token', 'processed-token')
        },
      }],
    })

    const result = await generateTailwindV4Css({
      ...createGenerationOptions(),
      opts: owner,
      frameworkPostcssOwner: owner,
      cssStage: 'framework-processed',
      styleHandler,
    })

    expect(transformRoot).toHaveBeenCalledTimes(target === 'weapp' ? 1 : 0)
    expect(styleHandler).not.toHaveBeenCalled()
    expect(result?.css).toContain('processed-token')
    expect(result?.artifact.fragments[0]?.root.toString()).toContain('processed-token')
  })

  it('does not replay framework PostCSS for raw CSS stages', async () => {
    process.env[COMPILER_MODE_ENV] = 'graph'
    const generateCssByGenerator = vi.fn(async (options: { deferCssAdaptation?: boolean }) => {
      expect(options.deferCssAdaptation).toBeUndefined()
      return createGeneratedResult('.token { color: raw-token; }')
    })
    vi.doMock('@/generation/index', () => ({ generateCssByGenerator }))
    const { generateTailwindV4Css } = await import('@/generation/service')
    const transformRoot = vi.fn()
    const styleHandler = Object.assign(
      vi.fn(async (css: string) => ({ css })),
      { transformRoot },
    )
    const owner = {
      generator: { target: 'weapp' },
      styleHandler,
    } as any
    captureFrameworkPostcssOptions(owner, {
      plugins: [{ postcssPlugin: 'framework-plugin' }],
    })

    const result = await generateTailwindV4Css({
      ...createGenerationOptions(),
      opts: owner,
      frameworkPostcssOwner: owner,
      cssStage: 'raw',
      styleHandler,
    })

    expect(transformRoot).not.toHaveBeenCalled()
    expect(result?.css).toContain('raw-token')
    expect(result?.artifact.fragments[0]?.stage).toBe('adapted')
  })

  it('runs both implementations in shadow mode and returns legacy output', async () => {
    process.env[COMPILER_MODE_ENV] = 'shadow'
    const generateCssByGenerator = vi.fn(async () => createGeneratedResult('.p-4 { padding: 1rem; }'))
    vi.doMock('@/generation/index', () => ({ generateCssByGenerator }))
    const { generateTailwindV4Css } = await import('@/generation/service')
    const { getCompilerShadowRunSnapshot } = await import('@/compiler')
    const debug = vi.fn()
    const onCompilerShadowReport = vi.fn()
    const generationOptions = createGenerationOptions(debug)

    const result = await generateTailwindV4Css({
      ...generationOptions,
      onCompilerShadowReport,
    })

    expect(generateCssByGenerator).toHaveBeenCalledTimes(2)
    expect(result?.css).toContain('padding')
    expect(result?.artifact.fragments).toHaveLength(1)
    expect(onCompilerShadowReport).toHaveBeenCalledWith(expect.objectContaining({
      file: '/workspace/src/app.css',
      equal: true,
      differences: [],
    }))
    expect(getCompilerShadowRunSnapshot(generationOptions.runtimeState).summary).toEqual({
      total: 1,
      matched: 1,
      mismatched: 0,
      truncated: 0,
      dropped: 0,
    })
    expect(debug).not.toHaveBeenCalledWith(expect.stringContaining('semantic mismatch'), expect.anything())
  })

  it('reports semantic differences in shadow mode', async () => {
    process.env[COMPILER_MODE_ENV] = 'shadow'
    const generateCssByGenerator = vi.fn()
      .mockResolvedValueOnce(createGeneratedResult('.p-4 { padding: 1rem; }'))
      .mockResolvedValueOnce(createGeneratedResult('.p-4 { padding: 2rem; }'))
    vi.doMock('@/generation/index', () => ({ generateCssByGenerator }))
    const { generateTailwindV4Css } = await import('@/generation/service')
    const debug = vi.fn()
    const onCompilerShadowReport = vi.fn()

    const result = await generateTailwindV4Css({
      ...createGenerationOptions(debug),
      onCompilerShadowReport,
    })

    expect(result?.css).toContain('1rem')
    expect(debug).toHaveBeenCalledWith('compiler shadow semantic mismatch: %s', '/workspace/src/app.css')
    expect(debug).toHaveBeenCalledWith(
      'compiler shadow semantic report: %O',
      expect.objectContaining({ equal: false }),
    )
    expect(onCompilerShadowReport).toHaveBeenCalledWith(expect.objectContaining({
      file: '/workspace/src/app.css',
      equal: false,
      differences: expect.arrayContaining([
        expect.objectContaining({
          path: '$.fragments[0].root[0].nodes[0].value',
          left: '1rem',
          right: '2rem',
        }),
      ]),
    }))
  })
})
