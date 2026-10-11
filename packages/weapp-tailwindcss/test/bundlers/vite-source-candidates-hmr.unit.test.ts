import type { HmrContext, ModuleNode } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { createFrameworkSourceCandidatesPlugin } from '../../src/bundlers/vite/shared/framework-source-candidates-plugin'

function getHandleHotUpdateHandler(plugin: ReturnType<typeof createFrameworkSourceCandidatesPlugin>) {
  const hook = plugin.handleHotUpdate as any
  return typeof hook === 'object' ? hook.handler : hook
}

function getTransformHandler(plugin: ReturnType<typeof createFrameworkSourceCandidatesPlugin>) {
  const hook = plugin.transform as any
  return typeof hook === 'object' ? hook.handler : hook
}

describe('Vite source candidate HMR transactions', () => {
  it('skips source candidate lifecycle work after Generic Web production profile resolves', async () => {
    const prepareTailwindGeneration = vi.fn()
    const preGenerateBundleHook = vi.fn()
    const plugin = createFrameworkSourceCandidatesPlugin({
      hmrTimingRecorder: { measure: (_name: string, task: () => unknown) => task() },
      preGenerateBundleHook,
      prepareTailwindGeneration,
      shouldSkipSourceCandidateState: () => true,
    })

    await plugin.buildStart?.call(plugin)
    await plugin.generateBundle?.call(plugin, {}, {})
    await expect(getTransformHandler(plugin)?.call(plugin, 'const cls = "text-red-500"', '/project/src/page.ts')).resolves.toBeUndefined()
    await plugin.watchChange?.('/project/src/page.ts', { event: 'update' } as any)
    await getHandleHotUpdateHandler(plugin)?.call(plugin, { file: '/project/src/page.ts' } as any)

    expect(prepareTailwindGeneration).not.toHaveBeenCalled()
    expect(preGenerateBundleHook).not.toHaveBeenCalled()
  })

  it('keeps weapp-vite sidecar requests out of source candidate memory', async () => {
    const rememberKnownSfcSource = vi.fn()
    const rememberTailwindRootCssModule = vi.fn()
    const plugin = createFrameworkSourceCandidatesPlugin({
      cssMemory: { rememberKnownSfcSource },
      hasUserCssLayerBlocks: () => false,
      rememberOriginalCssLayerSource: vi.fn(),
      rememberTailwindRootCssModule,
      resolveCurrentGeneratorBranch: () => ({ isWeb: false }),
      resolveCurrentGeneratorOptions: () => ({ importFallback: false }),
      shouldOwnTailwindGeneration: true,
      transformEarlyMiniProgramCss: (code: string) => code,
    })
    const id = '/project/app.wxss?weapp-vite-sidecar-owner=app&weapp-vite-sidecar=style&lang.css'

    await expect(getTransformHandler(plugin)?.call(plugin, '@import "tailwindcss";', id)).resolves.toBeUndefined()
    expect(rememberKnownSfcSource).not.toHaveBeenCalled()
    expect(rememberTailwindRootCssModule).not.toHaveBeenCalled()
  })

  it('refreshes only the changed Tailwind root and its importers for a root CSS update', async () => {
    const cssFile = '/project/main.css'
    const siblingCssFile = '/project/sub-package.css'
    const cssModule = { file: cssFile, id: `${cssFile}?direct`, importers: new Set(), url: '/main.css?direct' } as ModuleNode
    const siblingCssModule = { file: siblingCssFile, id: `${siblingCssFile}?direct`, importers: new Set(), url: '/sub-package.css?direct' } as ModuleNode
    const invalidateModule = vi.fn()
    const plugin = createFrameworkSourceCandidatesPlugin({
      hmrCandidateState: {
        armTargets: vi.fn(),
        clear: vi.fn(),
        hasPendingCandidateAppend: () => false,
        hasPendingChange: () => false,
        queueFullRegeneration: vi.fn(),
        reconcileRuntimeCandidates: vi.fn(),
      },
      hmrTimingRecorder: { measure: (_name: string, task: () => unknown) => task() },
      invalidateRecordedGeneratorCandidates: vi.fn(),
      isCurrentWebLikeStylePlatform: () => true,
      isNuxtPageHotModule: () => false,
      isUniViteProject: () => true,
      rememberOriginalCssLayerSource: vi.fn(),
      rememberTailwindRootCssModule: vi.fn(),
      refreshTailwindRootCssSource: vi.fn(),
      resolveCurrentGeneratorOptions: () => ({ hmr: { preserveDeletedCss: true } }),
      runtimeState: {},
      shouldOwnTailwindGeneration: true,
      sourceCandidateCollector: { values: () => new Set<string>() },
      sourceScanSession: {
        consumeHotUpdateChange: vi.fn(),
        syncChangedFile: vi.fn(async () => undefined),
        sync: vi.fn(),
        waitForPendingSyncs: vi.fn(),
      },
      tailwindRootCssModuleIds: new Set([cssModule.id!, siblingCssModule.id!]),
      viteProcessedCssSourceFiles: new Set<string>(),
    })
    const result = await getHandleHotUpdateHandler(plugin)?.call(plugin, {
      file: cssFile,
      modules: [cssModule],
      read: vi.fn(async () => '@import "tailwindcss";'),
      timestamp: 122,
      server: {
        config: { root: '/project' },
        moduleGraph: {
          getModuleById: vi.fn((id: string) => id === cssModule.id ? cssModule : id === siblingCssModule.id ? siblingCssModule : undefined),
          getModulesByFile: vi.fn((file: string) => file === cssFile ? new Set([cssModule]) : file === siblingCssFile ? new Set([siblingCssModule]) : undefined),
          invalidateModule,
        },
        ws: { send: vi.fn() },
      },
    } as HmrContext)

    expect(result).toEqual([cssModule])
    expect(invalidateModule).toHaveBeenCalledWith(cssModule)
    expect(invalidateModule).not.toHaveBeenCalledWith(siblingCssModule)
  })

  it('merges root CSS after Vue has selected the uni-app x source module', async () => {
    const pageFile = '/project/pages/index.uvue'
    const cssFile = '/project/main.css'
    const cssId = `${cssFile}?direct`
    const pageModule = { id: pageFile, isSelfAccepting: true, url: '/pages/index.uvue' } as ModuleNode
    const cssModule = { file: cssFile, id: cssId, url: '/main.css?direct' } as ModuleNode
    const invalidateModule = vi.fn()
    const wsSend = vi.fn()
    const plugin = createFrameworkSourceCandidatesPlugin({
      hmrCandidateState: {
        armTargets: vi.fn(),
        clear: vi.fn(),
        hasPendingCandidateAppend: () => false,
        hasPendingChange: () => true,
        queueFullRegeneration: vi.fn(),
        reconcileRuntimeCandidates: vi.fn(),
      },
      hmrTimingRecorder: { measure: (_name: string, task: () => unknown) => task() },
      invalidateRecordedGeneratorCandidates: vi.fn(),
      isCurrentWebLikeStylePlatform: () => true,
      isNuxtPageHotModule: () => false,
      isUniViteProject: () => true,
      rememberOriginalCssLayerSource: vi.fn(),
      rememberTailwindRootCssModule: vi.fn(),
      resolveCurrentGeneratorOptions: () => ({ hmr: { preserveDeletedCss: true } }),
      runtimeState: {},
      shouldOwnTailwindGeneration: true,
      sourceCandidateCollector: { values: () => new Set(['mt-200']) },
      sourceScanSession: {
        consumeHotUpdateChange: vi.fn(),
        syncChangedFile: vi.fn(async () => ({
          addedCandidates: new Set(['mt-200']),
          file: pageFile,
          removedCandidates: new Set(),
          runtimeAffecting: true,
        })),
        sync: vi.fn(),
        waitForPendingSyncs: vi.fn(),
      },
      tailwindRootCssModuleIds: new Set([cssFile, cssId]),
      viteProcessedCssSourceFiles: new Set<string>(),
    })
    expect(plugin.handleHotUpdate).toMatchObject({ order: 'post' })
    const result = await getHandleHotUpdateHandler(plugin)?.call(plugin, {
      file: pageFile,
      modules: [pageModule],
      read: vi.fn(async () => '<view class="mt-200" />'),
      timestamp: 123,
      server: {
        config: { root: '/project' },
        moduleGraph: {
          getModuleById: vi.fn((id: string) => id === cssId ? cssModule : id === pageFile ? pageModule : undefined),
          getModulesByFile: vi.fn(() => undefined),
          invalidateModule,
        },
        ws: { send: wsSend },
      },
    } as HmrContext)

    expect(result).toEqual([pageModule, cssModule])
    expect(invalidateModule).toHaveBeenCalledWith(cssModule)
    await Promise.resolve()
    expect(wsSend).not.toHaveBeenCalledWith({
      type: 'update',
      updates: expect.arrayContaining([
        expect.objectContaining({ path: '/pages/index.uvue' }),
      ]),
    })
    expect(wsSend).not.toHaveBeenCalled()
  })

  it('keeps a regular candidate update in the same Web source and CSS transaction', async () => {
    const pageFile = '/project/pages/index.uvue'
    const cssFile = '/project/main.css'
    const pageModule = { id: pageFile, isSelfAccepting: true, url: '/pages/index.uvue' } as ModuleNode
    const cssModule = { file: cssFile, id: `${cssFile}?direct`, url: '/main.css?direct' } as ModuleNode
    const wsSend = vi.fn()
    const plugin = createFrameworkSourceCandidatesPlugin({
      hmrCandidateState: {
        armTargets: vi.fn(),
        clear: vi.fn(),
        hasPendingCandidateAppend: () => true,
        hasPendingChange: () => true,
        queueFullRegeneration: vi.fn(),
        reconcileRuntimeCandidates: vi.fn(),
      },
      hmrTimingRecorder: { measure: (_name: string, task: () => unknown) => task() },
      invalidateRecordedGeneratorCandidates: vi.fn(),
      isCurrentWebLikeStylePlatform: () => true,
      isNuxtPageHotModule: () => false,
      isUniViteProject: () => true,
      rememberOriginalCssLayerSource: vi.fn(),
      rememberTailwindRootCssModule: vi.fn(),
      resolveCurrentGeneratorOptions: () => ({ hmr: { preserveDeletedCss: true } }),
      runtimeState: {},
      shouldOwnTailwindGeneration: true,
      sourceCandidateCollector: { values: () => new Set(['bg-issue-1021-hmr', 'w-[188px]']) },
      sourceScanSession: {
        consumeHotUpdateChange: vi.fn(),
        syncChangedFile: vi.fn(async () => ({
          addedCandidates: new Set(['bg-issue-1021-hmr', 'w-[188px]']),
          file: pageFile,
          removedCandidates: new Set(['bg-[#102938]', 'w-[173px]']),
          runtimeAffecting: false,
        })),
        sync: vi.fn(),
        waitForPendingSyncs: vi.fn(),
      },
      tailwindRootCssModuleIds: new Set([cssFile, `${cssFile}?direct`]),
      viteProcessedCssSourceFiles: new Set<string>(),
    })
    const result = await getHandleHotUpdateHandler(plugin)?.call(plugin, {
      file: pageFile,
      modules: [pageModule],
      read: vi.fn(async () => '<view class="bg-issue-1021-hmr w-[188px]" />'),
      timestamp: 456,
      server: {
        config: { root: '/project' },
        moduleGraph: {
          getModuleById: vi.fn((id: string) => id === `${cssFile}?direct` ? cssModule : id === pageFile ? pageModule : undefined),
          getModulesByFile: vi.fn(() => undefined),
          invalidateModule: vi.fn(),
        },
        ws: { send: wsSend },
      },
    } as HmrContext)

    expect(result).toEqual([pageModule, cssModule])
    await Promise.resolve()
    expect(wsSend).not.toHaveBeenCalled()
  })

  it('falls back to a full reload for a Nuxt route transaction without the page module', async () => {
    const pageFile = '/project/app/pages/index.vue'
    const cssFile = '/project/main.css'
    const routeModule = {
      id: 'virtual:nuxt:.nuxt/routes.mjs',
      isSelfAccepting: true,
      url: '/@id/virtual:nuxt:.nuxt%2Froutes.mjs',
    } as ModuleNode
    const cssModule = {
      file: cssFile,
      id: `${cssFile}?direct`,
      url: '/main.css?direct',
    } as ModuleNode
    const wsSend = vi.fn()
    const plugin = createFrameworkSourceCandidatesPlugin({
      hmrCandidateState: {
        armTargets: vi.fn(),
        clear: vi.fn(),
        hasPendingCandidateAppend: () => false,
        hasPendingChange: () => false,
        queueFullRegeneration: vi.fn(),
        reconcileRuntimeCandidates: vi.fn(),
      },
      hmrTimingRecorder: { measure: (_name: string, task: () => unknown) => task() },
      invalidateRecordedGeneratorCandidates: vi.fn(),
      isCurrentWebLikeStylePlatform: () => true,
      isNuxtPageHotModule: (id: string) => id.includes('virtual:nuxt:'),
      isUniViteProject: () => false,
      rememberOriginalCssLayerSource: vi.fn(),
      rememberTailwindRootCssModule: vi.fn(),
      resolveCurrentGeneratorOptions: () => ({ hmr: { preserveDeletedCss: true } }),
      runtimeState: {},
      shouldOwnTailwindGeneration: true,
      sourceCandidateCollector: { values: () => new Set(['bg-issue-1021-hmr']) },
      sourceScanSession: {
        consumeHotUpdateChange: vi.fn(),
        syncChangedFile: vi.fn(async () => ({
          addedCandidates: new Set(['bg-issue-1021-hmr']),
          file: pageFile,
          removedCandidates: new Set(['bg-[#102938]']),
          runtimeAffecting: false,
        })),
        sync: vi.fn(),
        waitForPendingSyncs: vi.fn(),
      },
      tailwindRootCssModuleIds: new Set([cssFile]),
      viteProcessedCssSourceFiles: new Set<string>(),
    })
    const result = await getHandleHotUpdateHandler(plugin)?.call(plugin, {
      file: pageFile,
      modules: [routeModule],
      read: vi.fn(async () => '<view class="bg-issue-1021-hmr" />'),
      timestamp: 789,
      server: {
        config: { root: '/project' },
        moduleGraph: {
          getModuleById: vi.fn((id: string) => id === `${cssFile}?direct` ? cssModule : undefined),
          getModuleByUrl: vi.fn(async () => undefined),
          getModulesByFile: vi.fn(() => undefined),
          invalidateModule: vi.fn(),
        },
        ws: { send: wsSend },
      },
    } as HmrContext)

    expect(result).toEqual([])
    expect(wsSend).toHaveBeenCalledWith({
      path: '*',
      triggeredBy: pageFile,
      type: 'full-reload',
    })
  })

  it('falls back to a full reload when only a uni-app script proxy remains', async () => {
    const pageFile = '/project/pages/index.uvue'
    const scriptModule = {
      id: `${pageFile}?import&vue&type=script&lang.uts`,
      isSelfAccepting: true,
      url: '/pages/index.uvue?import&vue&type=script&lang.uts',
    } as ModuleNode
    const cssModule = {
      file: '/project/main.css',
      id: '/project/main.css?direct',
      url: '/main.css?direct',
    } as ModuleNode
    const wsSend = vi.fn()
    const plugin = createFrameworkSourceCandidatesPlugin({
      hmrCandidateState: {
        armTargets: vi.fn(),
        clear: vi.fn(),
        hasPendingCandidateAppend: () => false,
        hasPendingChange: () => false,
        queueFullRegeneration: vi.fn(),
        reconcileRuntimeCandidates: vi.fn(),
      },
      hmrTimingRecorder: { measure: (_name: string, task: () => unknown) => task() },
      invalidateRecordedGeneratorCandidates: vi.fn(),
      isCurrentWebLikeStylePlatform: () => true,
      isNuxtPageHotModule: () => false,
      isUniViteProject: () => true,
      rememberOriginalCssLayerSource: vi.fn(),
      rememberTailwindRootCssModule: vi.fn(),
      resolveCurrentGeneratorOptions: () => ({ hmr: { preserveDeletedCss: true } }),
      runtimeState: {},
      shouldOwnTailwindGeneration: true,
      sourceCandidateCollector: { values: () => new Set(['w-[188px]']) },
      sourceScanSession: {
        consumeHotUpdateChange: vi.fn(),
        syncChangedFile: vi.fn(async () => ({
          addedCandidates: new Set(['w-[188px]']),
          file: pageFile,
          removedCandidates: new Set(['w-[173px]']),
          runtimeAffecting: false,
        })),
        sync: vi.fn(),
        waitForPendingSyncs: vi.fn(),
      },
      tailwindRootCssModuleIds: new Set(['/project/main.css?direct']),
      viteProcessedCssSourceFiles: new Set<string>(),
    })
    const result = await getHandleHotUpdateHandler(plugin)?.call(plugin, {
      file: pageFile,
      modules: [scriptModule],
      read: vi.fn(async () => '<view class="w-[188px]" />'),
      timestamp: 790,
      server: {
        config: { root: '/project' },
        moduleGraph: {
          getModuleById: vi.fn((id: string) => id === cssModule.id ? cssModule : undefined),
          getModuleByUrl: vi.fn(async () => undefined),
          getModulesByFile: vi.fn(() => undefined),
          invalidateModule: vi.fn(),
        },
        ws: { send: wsSend },
      },
    } as HmrContext)

    expect(result).toEqual([])
    expect(wsSend).toHaveBeenCalledWith({ path: '*', triggeredBy: pageFile, type: 'full-reload' })
  })
})
