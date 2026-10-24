import type { TailwindV4GenerationCoreInput } from '@/context/generation'
import type { InternalUserDefinedOptions } from '@/types'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMPILER_MODE_ENV } from '@/compiler/mode'

function createGenerationOptions(): TailwindV4GenerationCoreInput {
  return {
    opts: { cssPreflight: false, generator: { target: 'web' } } as InternalUserDefinedOptions,
    compilerMode: 'shadow',
    runtimeState: {
      tailwindRuntime: { majorVersion: 4 } as any,
      readyPromise: Promise.resolve(),
    },
    runtime: new Set(['p-4']),
    rawSource: '@import "tailwindcss";',
    file: path.resolve('shadow-entry.css'),
    cssHandlerOptions: { isMainChunk: true, majorVersion: 4 },
    cssUserHandlerOptions: {},
    styleHandler: vi.fn(async (css: string) => ({ css })) as any,
    debug: vi.fn(),
  }
}

function generatedResult() {
  return {
    css: '.p-4 { padding: 1rem; }',
    target: 'web' as const,
    classSet: new Set(['p-4']),
    dependencies: [],
    source: 'generator' as const,
  }
}

async function loadServices() {
  const [generation, configuration, compiler] = await Promise.all([
    import('@/context/generation'),
    import('@/context/compilation-profile'),
    import('@/compiler'),
  ])
  return { ...generation, ...configuration, ...compiler }
}

afterEach(() => {
  vi.doUnmock('@/generation/index')
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('shadow 组合请求的配置 revision', () => {
  it('legacy 完成后等待 graph 期间配置失效，不返回旧 CSS 或发布报告', async () => {
    vi.stubEnv(COMPILER_MODE_ENV, 'legacy')
    const graphEntered = Promise.withResolvers<void>()
    const releaseGraph = Promise.withResolvers<void>()
    const generateCssByGenerator = vi.fn()
      .mockResolvedValueOnce(generatedResult())
      .mockImplementationOnce(async () => {
        graphEntered.resolve()
        await releaseGraph.promise
        return generatedResult()
      })
    vi.doMock('@/generation/index', () => ({ generateCssByGenerator }))
    const { disposeCompilerOwner, generateTailwindV4Css, getCompilerShadowRunSnapshot, resolveCompilationProfile } = await loadServices()
    const options = createGenerationOptions()
    const onCompilerShadowReport = vi.fn()
    const initial = resolveCompilationProfile(options.opts, options.runtimeState)
    expect(initial.profile.compilerMode).toBe('legacy')
    const pending = generateTailwindV4Css({ ...options, onCompilerShadowReport })
    try {
      await graphEntered.promise
      options.opts.cssPreflight = { border: false }
      const next = resolveCompilationProfile(options.opts, options.runtimeState)
      expect(next.profile.revision).toBe(initial.profile.revision + 1)
      releaseGraph.resolve()

      await expect(pending).resolves.toBeUndefined()
      expect(generateCssByGenerator).toHaveBeenCalledTimes(2)
      expect(onCompilerShadowReport).not.toHaveBeenCalled()
      expect(getCompilerShadowRunSnapshot(options.runtimeState).reports).toEqual([])
      expect(options.debug).not.toHaveBeenCalled()
    }
    finally {
      releaseGraph.resolve()
      await pending.catch(() => undefined)
      await disposeCompilerOwner(options.runtimeState)
    }
  })

  it('报告回调同步更新配置后，公开返回拒绝已过时的 CSS', async () => {
    const generateCssByGenerator = vi.fn(async () => generatedResult())
    vi.doMock('@/generation/index', () => ({ generateCssByGenerator }))
    const { disposeCompilerOwner, generateTailwindV4Css, getCompilerShadowRunSnapshot, resolveCompilationProfile } = await loadServices()
    const options = createGenerationOptions()
    const initial = resolveCompilationProfile(options.opts, options.runtimeState)
    const onCompilerShadowReport = vi.fn(() => {
      options.opts.cssPreflight = { border: false }
      resolveCompilationProfile(options.opts, options.runtimeState)
    })
    try {
      await expect(generateTailwindV4Css({ ...options, onCompilerShadowReport })).resolves.toBeUndefined()
      expect(generateCssByGenerator).toHaveBeenCalledTimes(2)
      expect(onCompilerShadowReport).toHaveBeenCalledTimes(1)
      expect(initial.isCurrent()).toBe(false)
      expect(getCompilerShadowRunSnapshot(options.runtimeState).summary).toMatchObject({ total: 1, matched: 1 })
    }
    finally {
      await disposeCompilerOwner(options.runtimeState)
    }
  })
})
