import type { InputOptions, PluginContext } from 'rollup'
import type { Plugin, ResolvedConfig } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { getViteHookHandler } from '@/bundlers/vite/plugin-hook'
import { createBuiltinViteStyleInjectorPlugins } from '@/style-injector/internal'
import { normalizeStyleInjectorOptions, resolveStyleInjectorSubPackages } from '@/style-injector/options'

describe('style injector hook contracts', () => {
  it('preserves object hooks, their contexts and the actual build options', async () => {
    const configResolved = vi.fn()
    const buildStart = vi.fn()
    const load = vi.fn(() => 'virtual style')
    const delegate: Plugin = {
      name: 'object-hooks',
      configResolved: { handler: configResolved },
      buildStart: { handler: buildStart },
      load: { handler: load },
    }
    const plugins = createBuiltinViteStyleInjectorPlugins(true, () => () => [delegate])
    const pre = plugins[0]!
    const config = { root: process.cwd() } as ResolvedConfig
    const context = { addWatchFile: vi.fn() } as unknown as PluginContext
    const buildOptions: InputOptions = { input: 'virtual:entry', treeshake: false }
    await getViteHookHandler(pre.configResolved)!.call(context, config)
    await getViteHookHandler(pre.buildStart)!.call(context, buildOptions)
    expect(configResolved).toHaveBeenCalledExactlyOnceWith(config)
    expect(configResolved.mock.contexts[0]).toBe(context)
    expect(buildStart).toHaveBeenCalledExactlyOnceWith(buildOptions)
    expect(buildStart.mock.contexts[0]).toBe(context)
    await expect(getViteHookHandler(pre.load)!.call(context, 'virtual:style', {})).resolves.toBe('virtual style')
    expect(load.mock.contexts[0]).toBe(context)
  })

  it('validates subpackage configuration for the selected framework', () => {
    const config = { pagesJsonPath: 'config/pages.json' }
    expect(resolveStyleInjectorSubPackages(config, 'pagesJsonPath')).toEqual([config])
    expect(() => resolveStyleInjectorSubPackages(config, 'appConfigPath')).toThrow('appConfigPath')
    expect(resolveStyleInjectorSubPackages(undefined, 'pagesJsonPath')).toBeUndefined()
  })

  it('omits undefined options without mutating user configuration', () => {
    const options = { include: undefined, preprocess: false }
    expect(normalizeStyleInjectorOptions(options)).toEqual({ preprocess: false })
    expect(Object.hasOwn(options, 'include')).toBe(true)
  })
})
