import type { NormalizedInputOptions, PluginContext } from 'rollup'
import { describe, expect, it } from 'vitest'
import { createFrameworkSourceCandidatesPlugin } from '@/bundlers/vite/shared/framework-source-candidates-plugin'
import { createCompilerRuntimeState } from '@/compiler/runtime-state'

describe('Vite 文件型 source 的监听生命周期', () => {
  it.each([true, false])('Web=%s 按正确输出阶段处理来源 revision', async (isWeb) => {
    const runtimeState = createCompilerRuntimeState({ tailwindRuntime: {} as any, refreshTailwindcssRuntime: async () => ({} as any) })
    const plugin = createFrameworkSourceCandidatesPlugin({
      shouldOwnTailwindGeneration: true,
      resolveCurrentGeneratorBranch: () => ({ isWeb }),
      runtimeState,
      invalidateRecordedGeneratorCandidates: () => {},
      prepareTailwindGeneration: async () => {},
      hmrTimingRecorder: { measure: async (_name: string, task: () => Promise<void>) => task() },
      sourceScanSession: { isDependency: () => false, queueChangedFile: () => {}, flushChangedFiles: async () => new Map(), getWatchFiles: () => [] },
      tailwindRootCssModuleIds: new Set(['virtual:tailwind-entry']),
    })
    const invoke = (name: keyof typeof plugin, ...args: any[]) => {
      const hook = plugin[name] as any
      return (typeof hook === 'function' ? hook : hook.handler).call({ addWatchFile: () => {} }, ...args)
    }
    await invoke('buildStart')
    expect(await invoke('shouldTransformCachedModule', { id: 'virtual:tailwind-entry' })).toBeNull()
    await invoke('watchChange', '/project/content.html', { event: 'update' })
    await invoke('buildStart')
    expect(await invoke('shouldTransformCachedModule', { id: 'virtual:tailwind-entry' })).toBe(isWeb ? true : null)
    expect(await invoke('shouldTransformCachedModule', { id: 'unrelated.js' })).toBeNull()
    await invoke('buildEnd', new Error('failed'))
    await invoke('buildStart')
    expect(await invoke('shouldTransformCachedModule', { id: 'virtual:tailwind-entry' })).toBe(isWeb ? true : null)
    await invoke('buildEnd')
    await invoke('buildStart')
    expect(await invoke('shouldTransformCachedModule', { id: 'virtual:tailwind-entry' })).toBeNull()
    runtimeState.dispose()
  })
  it.each([
    '/project/source.vue',
    String.raw`C:\project\source.vue`,
    '/source.vue',
    'source.vue',
  ])('每轮构建都向本轮上下文注册仍然有效的扫描文件：%s', async (file) => {
    let files = new Set([file])
    const roots = new Set<string>()
    let hasCssConsumer = true
    const plugin = createFrameworkSourceCandidatesPlugin({
      prepareTailwindGeneration: async () => {},
      hmrTimingRecorder: { measure: async (_name: string, task: () => Promise<void>) => task() },
      sourceScanSession: { getWatchFiles: () => files },
      tailwindRootCssModuleIds: roots,
    })
    const buildStart = typeof plugin.buildStart === 'function' ? plugin.buildStart : plugin.buildStart?.handler
    const moduleParsed = typeof plugin.moduleParsed === 'function' ? plugin.moduleParsed : plugin.moduleParsed?.handler
    const cached = typeof plugin.shouldTransformCachedModule === 'function' ? plugin.shouldTransformCachedModule : plugin.shouldTransformCachedModule?.handler
    const generateBundle = typeof plugin.generateBundle === 'function' ? plugin.generateBundle : plugin.generateBundle?.handler
    expect(buildStart).toBeTypeOf('function')
    const build = async (reuse = false) => {
      const registered = new Set<string>()
      const context = {
        addWatchFile: (id: string) => registered.add(id),
        getModuleInfo: (id: string) => hasCssConsumer && id === 'virtual:tailwind-entry' ? { id } : null,
      } as PluginContext
      await buildStart!.call(context, {} as NormalizedInputOptions)
      // 首轮 transform 后才知道 CSS 消费者，辅助构建图不能在 buildStart 扫描阶段抢占监听。
      roots.add('virtual:tailwind-entry')
      const info = { id: hasCssConsumer ? 'virtual:tailwind-entry' : 'virtual:empty-auxiliary' } as any
      if (reuse) {
        expect(await cached!.call(context, info)).toBeNull()
      }
      else {
        await moduleParsed!.call(context, info)
      }
      await generateBundle!.call(context, {} as any, {}, false)
      return registered
    }
    expect(await build(true)).toEqual(new Set([file]))
    expect(await build()).toEqual(new Set([file]))
    files = new Set()
    expect(await build()).toEqual(new Set())
    files = new Set([file])
    expect(await build(true)).toEqual(new Set([file]))
    hasCssConsumer = false
    // 移除消费入口这一轮仍持有上轮依赖，下一轮图已确认不消费时清除注册。
    await build()
    expect(await build(true)).toEqual(new Set())
    hasCssConsumer = true
    expect(await build()).toEqual(new Set([file]))
  })
})
