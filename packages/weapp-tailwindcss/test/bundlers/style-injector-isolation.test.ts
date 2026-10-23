import type { Plugin, ResolvedConfig } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { getViteHookHandler } from '@/bundlers/vite/plugin-hook'
import { createBuiltinViteStyleInjectorPlugins } from '@/style-injector/vite/runtime'

describe('框架 style injector 实例隔离', () => {
  it('交错配置和构建时仅调用所属实例的 delegate', async () => {
    const createInstance = (name: string) => {
      const configured = vi.fn()
      const started = vi.fn()
      const emitted = vi.fn()
      const factory = vi.fn((): Plugin[] => [{ name, configResolved: configured, buildStart: started, generateBundle: emitted }])
      return { factory, configured, started, emitted, plugins: createBuiltinViteStyleInjectorPlugins(true, () => factory) }
    }
    const first = createInstance('first-framework')
    const second = createInstance('second-framework')
    const firstConfig = { root: 'first-project' } as ResolvedConfig
    const secondConfig = { root: 'second-project' } as ResolvedConfig
    const context = {} as any
    await getViteHookHandler(first.plugins[0]!.configResolved)!.call(context, firstConfig)
    await getViteHookHandler(second.plugins[0]!.configResolved)!.call(context, secondConfig)
    await getViteHookHandler(second.plugins[0]!.buildStart)!.call(context, {} as any)
    await getViteHookHandler(first.plugins[0]!.buildStart)!.call(context, {} as any)
    await getViteHookHandler(second.plugins[1]!.generateBundle)!.call(context, {} as any, {}, false)
    expect(first.emitted).not.toHaveBeenCalled()
    expect(second.emitted).toHaveBeenCalledTimes(1)
    await getViteHookHandler(first.plugins[1]!.generateBundle)!.call(context, {} as any, {}, false)
    expect(first.configured).toHaveBeenCalledExactlyOnceWith(firstConfig)
    expect(second.configured).toHaveBeenCalledExactlyOnceWith(secondConfig)
    expect(first.factory).toHaveBeenCalledTimes(1)
    expect(second.factory).toHaveBeenCalledTimes(1)
    expect(first.started).toHaveBeenCalledTimes(1)
    expect(second.started).toHaveBeenCalledTimes(1)
    expect(first.emitted).toHaveBeenCalledTimes(1)
  })
})
