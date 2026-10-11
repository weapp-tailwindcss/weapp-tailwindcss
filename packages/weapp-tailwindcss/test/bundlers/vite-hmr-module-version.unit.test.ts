import type { HmrContext, ModuleNode } from 'vite'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createViteHmrCssModuleVersionFilterPlugin, createViteHmrCssModuleVersionTracker } from '@/bundlers/vite/shared/framework-hmr-module-version'
import { createUniAppXWebLocalStyleBridge } from '@/uni-app-x/vite/web-local-style'

describe('Vite CSS HMR module versions', () => {
  it('replaces and clears Web local style rules for repeated SFC transforms', () => {
    const bridge = createUniAppXWebLocalStyleBridge(() => true)
    const styleId = '/project/pages/index/index.uvue?vue&type=style&index=0&scoped=abc'

    bridge.remember('/project/pages/index/index.uvue', '.wtu-p-0 { @apply p-0!; }')
    expect(bridge.appendToStyle('.author {}', styleId)).toContain('@apply p-0!;')

    bridge.remember('/project/pages/index/index.uvue', '.wtu-p-10 { @apply p-10!; }')
    const replaced = bridge.appendToStyle('.author {}', styleId)
    expect(replaced).toContain('@apply p-10!;')
    expect(replaced).not.toContain('@apply p-0!;')

    bridge.remember('/project/pages/index/index.uvue', '')
    expect(bridge.appendToStyle('.author {}', styleId)).toBe('.author {}')
  })

  it('rejects an older transaction for the same normalized style module', () => {
    const root = path.resolve('/project')
    const pageFile = path.join(root, 'pages/index.uvue')
    const tracker = createViteHmrCssModuleVersionTracker()
    const currentModule = {
      file: pageFile,
      id: `${pageFile}?vue&type=style&index=0&scoped=abc&lang.scss`,
      url: '/pages/index.uvue?vue&type=style&index=0&scoped=abc&lang.scss',
    } as ModuleNode
    const staleModule = { ...currentModule } as ModuleNode

    expect(tracker.filterModules([currentModule], 200, root)).toEqual([currentModule])
    expect(tracker.filterModules([staleModule], 100, root)).toEqual([])
    expect(tracker.filterIds([currentModule.id!], 100, root)).toEqual([])

    tracker.clear()
    expect(tracker.filterModules([staleModule], 100, root)).toEqual([staleModule])
  })

  it('keeps a stale uni-app x page transaction from re-adding its style module', () => {
    const root = path.resolve('/project')
    const pageFile = path.join(root, 'pages/index.uvue')
    const tracker = createViteHmrCssModuleVersionTracker()
    const pageModule = { id: pageFile, url: '/pages/index.uvue' } as ModuleNode
    const styleModule = {
      file: pageFile,
      id: `${pageFile}?vue&type=style&index=0&scoped=abc&lang.scss`,
      url: '/pages/index.uvue?vue&type=style&index=0&scoped=abc&lang.scss',
    } as ModuleNode
    const invalidateModule = vi.fn()
    const bridge = createUniAppXWebLocalStyleBridge(() => true, tracker)
    const createContext = (timestamp: number) => ({
      file: pageFile,
      modules: [pageModule],
      timestamp,
      server: {
        config: { root },
        moduleGraph: {
          getModulesByFile: () => new Set([pageModule, styleModule]),
          invalidateModule,
        },
      },
    }) as unknown as HmrContext

    tracker.filterModules([styleModule], 200, root)
    expect(bridge.handleHotUpdate(createContext(100))).toBeUndefined()
    expect(invalidateModule).not.toHaveBeenCalled()

    expect(bridge.handleHotUpdate(createContext(201))).toEqual([pageModule, styleModule])
    expect(invalidateModule).toHaveBeenCalledWith(styleModule)
  })

  it('removes stale style modules already returned by an earlier HMR hook', () => {
    const root = path.resolve('/project')
    const pageFile = path.join(root, 'pages/index.uvue')
    const tracker = createViteHmrCssModuleVersionTracker()
    const pageModule = { id: pageFile, url: '/pages/index.uvue' } as ModuleNode
    const styleModule = {
      file: pageFile,
      id: `${pageFile}?vue&type=style&index=0&scoped=abc&lang.scss`,
      url: '/pages/index.uvue?vue&type=style&index=0&scoped=abc&lang.scss',
    } as ModuleNode
    const bridge = createUniAppXWebLocalStyleBridge(() => true, tracker)

    tracker.filterModules([styleModule], 200, root)
    const result = bridge.handleHotUpdate({
      file: pageFile,
      modules: [pageModule, styleModule],
      timestamp: 100,
      server: {
        config: { root },
        moduleGraph: {
          getModulesByFile: () => new Set([pageModule, styleModule]),
          invalidateModule: vi.fn(),
        },
      },
    } as unknown as HmrContext)

    expect(result).toEqual([pageModule])
  })

  it('refreshes stale CSS with a timestamp newer than the superseding transaction', async () => {
    const root = path.resolve('/project')
    const pageFile = path.join(root, 'pages/index.uvue')
    const tracker = createViteHmrCssModuleVersionTracker()
    const plugin = createViteHmrCssModuleVersionFilterPlugin(tracker)
    const pageModule = { id: pageFile, url: '/pages/index.uvue' } as ModuleNode
    const styleModule = {
      file: pageFile,
      id: `${pageFile}?vue&type=style&index=0&scoped=abc&lang.scss`,
      url: '/pages/index.uvue?vue&type=style&index=0&scoped=abc&lang.scss',
    } as ModuleNode
    const invalidateModule = vi.fn()
    const send = vi.fn()
    const hook = plugin.handleHotUpdate as { handler: (ctx: HmrContext) => ModuleNode[] | undefined }

    tracker.filterModules([styleModule], 200, root)
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(150)
    let result: ModuleNode[] | undefined
    try {
      result = hook.handler({
        file: pageFile,
        modules: [pageModule, styleModule],
        timestamp: 100,
        server: {
          config: { root },
          moduleGraph: { invalidateModule },
          ws: { send },
        },
      } as unknown as HmrContext)
      await Promise.resolve()
    }
    finally {
      dateNow.mockRestore()
    }

    expect(plugin.handleHotUpdate).toMatchObject({ order: 'post' })
    expect(result).toEqual([pageModule])
    expect(invalidateModule).toHaveBeenCalledWith(styleModule)
    expect(send).toHaveBeenCalledWith({
      type: 'update',
      updates: [{
        type: 'js-update',
        timestamp: 201,
        path: styleModule.url,
        acceptedPath: styleModule.url,
        explicitImportRequired: false,
        isWithinCircularImport: false,
      }],
    })
    expect(tracker.filterModules([styleModule], 200, root)).toEqual([])
    expect(tracker.filterModules([styleModule], 201, root)).toEqual([styleModule])
  })
})
