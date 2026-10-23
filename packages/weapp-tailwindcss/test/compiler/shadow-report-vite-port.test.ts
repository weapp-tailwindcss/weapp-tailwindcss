import { afterEach, describe, expect, it, vi } from 'vitest'
import process from 'node:process'

describe('vite compiler shadow run boundary', () => {
  afterEach(() => {
    vi.doUnmock('@/bundlers/vite/generate-bundle/runtime')
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('starts one report run for every generateBundle execution', async () => {
    const runtimeHandler = vi.fn(async () => undefined)
    vi.doMock('@/bundlers/vite/generate-bundle/runtime', () => ({
      createGenerateBundleHook: vi.fn(() => runtimeHandler),
    }))
    const { createGenerateBundleHook } = await import('@/bundlers/vite/generate-bundle')
    const { getCompilerShadowRunSnapshot } = await import('@/compiler')
    const runtimeState = {
      tailwindRuntime: { majorVersion: 4 },
      readyPromise: Promise.resolve(),
    }
    const handler = createGenerateBundleHook({ runtimeState } as any)
    const hookContext = { addWatchFile: vi.fn() }

    await handler.call(hookContext, {}, {})
    expect(getCompilerShadowRunSnapshot(runtimeState).revision).toBe(1)
    await handler.call(hookContext, {}, {})
    expect(getCompilerShadowRunSnapshot(runtimeState).revision).toBe(2)
    expect(runtimeHandler).toHaveBeenCalledTimes(2)
  })

  it('keeps compiler sessions between watch builds until the lifecycle owner closes', async () => {
    const { getTailwindGenerationSessionPool } = await import('@/compiler')
    const { createViteCssFinalizerOutputPlugin } = await import('@/bundlers/vite/css-finalizer/plugin')
    const runtimeState = {
      tailwindRuntime: { majorVersion: 4 },
      readyPromise: Promise.resolve(),
    }
    const generationPool = getTailwindGenerationSessionPool(runtimeState)
    const plugin = createViteCssFinalizerOutputPlugin({
      runtimeState,
      getResolvedConfig: () => ({
        command: 'build',
        build: { watch: {} },
      }),
    } as any)

    await plugin.closeBundle?.()
    expect(getTailwindGenerationSessionPool(runtimeState)).toBe(generationPool)

    const { disposeCompilerOwner } = await import('@/compiler')
    await disposeCompilerOwner(runtimeState)
    expect(() => getTailwindGenerationSessionPool(runtimeState)).toThrow('已释放')
  })

  it('completes the current shadow run after the post css finalizer', async () => {
    const {
      beginCompilerShadowRun,
      COMPILER_MODE_ENV,
      COMPILER_SHADOW_GATE_ENV,
      getCompilerShadowReportSession,
      getCompilerShadowRunSnapshot,
    } = await import('@/compiler')
    vi.stubEnv(COMPILER_MODE_ENV, 'shadow')
    vi.stubEnv(COMPILER_SHADOW_GATE_ENV, 'report')
    const { createViteCssFinalizerOutputPlugin } = await import('@/bundlers/vite/css-finalizer/plugin')
    const runtimeState = {
      tailwindRuntime: { majorVersion: 4, options: {} },
      readyPromise: Promise.resolve(),
    }
    const debug = vi.fn()
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    beginCompilerShadowRun(runtimeState)
    const plugin = createViteCssFinalizerOutputPlugin({
      opts: {
        cssMatcher: () => true,
        generator: { target: 'weapp' },
        onUpdate: vi.fn(),
        styleHandler: vi.fn(async (css: string) => ({ css })),
      } as any,
      runtimeState: runtimeState as any,
      ensureRuntimeClassSet: vi.fn(async () => new Set<string>()),
      isCssAssetProcessed: () => false,
      markCssAssetProcessed: vi.fn(),
      debug,
      getResolvedConfig: () => ({
        command: 'build',
        root: '/workspace',
        build: { outDir: 'dist' },
      } as any),
    })
    const generateBundle = plugin.generateBundle as { handler: (this: object, options: unknown, bundle: object) => Promise<void> }

    await generateBundle.handler.call({}, {}, {})

    expect(getCompilerShadowRunSnapshot(runtimeState).completed).toBe(true)
    expect(write).toHaveBeenCalledWith(expect.stringContaining(
      '[weapp-tailwindcss:compiler-shadow] {"mode":"report","passed":true',
    ))

    const shadowSession = getCompilerShadowReportSession(runtimeState)
    const { disposeCompilerOwner } = await import('@/compiler')
    await disposeCompilerOwner(runtimeState)
    expect(() => shadowSession.snapshot()).toThrow('已释放')
    expect(() => getCompilerShadowReportSession(runtimeState)).toThrow('已释放')
  })
})
