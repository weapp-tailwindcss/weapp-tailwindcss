import type { Plugin, ResolvedConfig } from 'vite'
import type { InternalUserDefinedOptions } from '@/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createViteRuntimeClassSet } from '@/bundlers/vite/runtime-class-set'
import { createUniAppXPlugins } from '@/uni-app-x/vite'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function setup() {
  const extract = vi.fn(async () => ({ classSet: new Set(['flex']) }))
  const runtime = { majorVersion: 4, options: {}, extract }
  const refresh = vi.fn(async () => runtime)
  const manager = createViteRuntimeClassSet({
    opts: { appType: 'uni-app-x' } as InternalUserDefinedOptions,
    initialTailwindRuntime: runtime as any,
    refreshTailwindcssRuntime: refresh as any,
    uniAppXEnabled: true,
    customAttributesEntities: [],
    disabledDefaultTemplateHandler: false,
    debug: () => {},
  })
  return { manager, extract, refresh, runtime }
}

function hook(plugin: Plugin, name: 'transform' | 'buildStart') {
  const value = plugin[name] as any
  return typeof value === 'function' ? value : value?.handler
}

afterEach(() => vi.unstubAllEnvs())

describe('uni-app x runtime refresh ownership (issue 1245)', () => {
  it.each(['sequential', 'concurrent'])('shares one baseline for 108 %s SFC transforms', async (mode) => {
    const { manager, extract, refresh } = setup()
    const registerModuleGraphCandidates = vi.fn(async () => new Set(['flex']))
    const plugins = createUniAppXPlugins({
      appType: 'uni-app-x',
      customAttributesEntities: [],
      disabledDefaultTemplateHandler: false,
      mainCssChunkMatcher: () => false,
      runtimeState: manager.runtimeState,
      styleHandler: vi.fn(),
      jsHandler: ((code: string) => ({ code })) as any,
      ensureRuntimeClassSet: manager.ensureRuntimeClassSet,
      registerModuleGraphCandidates,
      getResolvedConfig: () => ({ command: 'build', build: {} } as ResolvedConfig),
      uniAppX: { enabled: true, componentLocalStyles: false },
    })
    const plugin = plugins.find(item => item.name === 'weapp-tailwindcss:uni-app-x:nvue')!
    await hook(plugin, 'buildStart').call({})
    const transform = (index: number) => hook(plugin, 'transform').call({}, '<template><view class="flex" /></template>', `pages/page-${index}.uvue`)
    if (mode === 'concurrent') {
      await Promise.all(Array.from({ length: 108 }, (_, index) => transform(index)))
    }
    else {
      for (let index = 0; index < 108; index++) {
        await transform(index)
      }
    }
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(extract).toHaveBeenCalledTimes(1)
    expect(registerModuleGraphCandidates).toHaveBeenCalledTimes(108)
  })

  it('shares initialization while refresh is still pending', async () => {
    const { manager, refresh, runtime, extract } = setup()
    const pending = deferred<any>()
    refresh.mockReturnValueOnce(pending.promise)
    const calls = Array.from({ length: 108 }, () => manager.ensureRuntimeClassSet())
    pending.resolve(runtime)
    const values = await Promise.all(calls)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(extract).toHaveBeenCalledTimes(1)
    expect(values.every(value => value === values[0])).toBe(true)
  })

  it('coalesces invalidations and removes deleted candidates', async () => {
    const { manager, extract, refresh } = setup()
    expect(await manager.ensureRuntimeClassSet()).toEqual(new Set(['flex']))
    extract.mockResolvedValue({ classSet: new Set(['grid']) })
    for (let index = 0; index < 108; index++) {
      manager.invalidateRuntimeClassSet()
    }
    expect(refresh).toHaveBeenCalledTimes(1)
    const values = await Promise.all(Array.from({ length: 108 }, () => manager.ensureRuntimeClassSet()))
    expect(values.every(value => value.has('grid') && !value.has('flex'))).toBe(true)
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(extract).toHaveBeenCalledTimes(2)
  })

  it('never publishes results from an invalidated in-flight extraction', async () => {
    const { manager, extract } = setup()
    const pending = deferred<{ classSet: Set<string> }>()
    extract.mockReturnValueOnce(pending.promise)
    const first = manager.ensureRuntimeClassSet()
    await vi.waitFor(() => expect(extract).toHaveBeenCalledTimes(1))
    manager.invalidateRuntimeClassSet()
    extract.mockResolvedValue({ classSet: new Set(['grid']) })
    const second = manager.ensureRuntimeClassSet()
    pending.resolve({ classSet: new Set(['flex']) })
    expect(await first).toEqual(new Set(['grid']))
    expect(await second).toEqual(new Set(['grid']))
    expect(await manager.ensureRuntimeClassSet()).toEqual(new Set(['grid']))
    expect(extract).toHaveBeenCalledTimes(2)
  })

  it('retries a failed runtime refresh instead of caching its failure', async () => {
    const { manager, refresh } = setup()
    refresh.mockRejectedValueOnce(new Error('refresh failed'))
    await expect(manager.ensureRuntimeClassSet()).rejects.toThrow('refresh failed')
    expect(await manager.ensureRuntimeClassSet()).toEqual(new Set(['flex']))
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('keeps independent runtime owners isolated', async () => {
    const first = setup()
    const second = setup()
    second.extract.mockResolvedValue({ classSet: new Set(['grid']) })
    expect(await first.manager.ensureRuntimeClassSet()).toEqual(new Set(['flex']))
    expect(await second.manager.ensureRuntimeClassSet()).toEqual(new Set(['grid']))
    first.manager.invalidateRuntimeClassSet()
    await first.manager.ensureRuntimeClassSet()
    await second.manager.ensureRuntimeClassSet()
    expect(first.extract).toHaveBeenCalledTimes(2)
    expect(second.extract).toHaveBeenCalledTimes(1)
  })

  it('does not retain an extraction completed after disposal', async () => {
    const { manager, extract } = setup()
    const pending = deferred<{ classSet: Set<string> }>()
    extract.mockReturnValueOnce(pending.promise)
    const result = manager.ensureRuntimeClassSet()
    const rejected = expect(result).rejects.toThrow('disposed')
    await vi.waitFor(() => expect(extract).toHaveBeenCalledTimes(1))
    manager.runtimeState.dispose()
    pending.resolve({ classSet: new Set(['flex']) })
    await rejected
    await expect(manager.ensureRuntimeClassSet()).rejects.toThrow('disposed')
  })

  it('retains the explicit forced refresh diagnostic override', async () => {
    const { manager, extract } = setup()
    await manager.ensureRuntimeClassSet()
    vi.stubEnv('WEAPP_TW_VITE_FORCE_RUNTIME_REFRESH', '1')
    await manager.ensureRuntimeClassSet()
    await manager.ensureRuntimeClassSet()
    expect(extract).toHaveBeenCalledTimes(3)
  })
})
