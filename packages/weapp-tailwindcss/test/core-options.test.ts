import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const styleHandler = vi.fn(async (source: string, options: unknown) => ({
    css: source,
    map: null,
    options,
  }))
  const jsHandler = vi.fn(async (source: string, runtimeSet?: Set<string>, options?: unknown) => ({
    code: `js:${source}`,
    map: null,
    runtimeSet,
    options,
  }))
  const templateHandler = vi.fn(async (source: string, options: unknown) => `wxml:${source}`)
  const refreshTailwindcssRuntime = vi.fn()
  const tailwindRuntime = {
    majorVersion: 4 as number | undefined,
  }
  const createCompilerContext = vi.fn(() => ({
    templateHandler,
    styleHandler,
    jsHandler,
    tailwindRuntime,
    refreshTailwindcssRuntime,
    tailwindcssBasedir: '/project',
  }))
  const createTailwindRuntimeReadyPromise = vi.fn(() => Promise.resolve())
  const ensureRuntimeClassSet = vi.fn(async () => new Set(['runtime-[1px]']))
  const shouldSkipJsTransform = vi.fn(() => false)

  return {
    ensureRuntimeClassSet,
    createCompilerContext,
    jsHandler,
    refreshTailwindcssRuntime,
    createTailwindRuntimeReadyPromise,
    shouldSkipJsTransform,
    styleHandler,
    templateHandler,
    tailwindRuntime,
  }
})

vi.mock('@/context', () => ({
  createCompilerContext: mocks.createCompilerContext,
}))

vi.mock('@/tailwindcss/runtime', () => ({
  createTailwindRuntimeReadyPromise: mocks.createTailwindRuntimeReadyPromise,
  ensureRuntimeClassSet: mocks.ensureRuntimeClassSet,
}))

vi.mock('@/js/precheck', () => ({
  shouldSkipJsTransform: mocks.shouldSkipJsTransform,
}))

describe('core transform option resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tailwindRuntime.majorVersion = 4
    mocks.ensureRuntimeClassSet.mockResolvedValue(new Set(['runtime-[1px]']))
    mocks.shouldSkipJsTransform.mockReturnValue(false)
  })

  it('uses main chunk style defaults and reuses runtime cache after wxss transforms', async () => {
    const { createContext } = await import('@/core')
    const ctx = createContext()

    await ctx.transformWxss('.text { color: red; }')

    expect(mocks.createTailwindRuntimeReadyPromise).toHaveBeenCalledWith(mocks.tailwindRuntime)
    expect(mocks.styleHandler).toHaveBeenCalledWith('.text { color: red; }', {
      isMainChunk: true,
    })
    expect(mocks.ensureRuntimeClassSet).toHaveBeenCalledWith(expect.objectContaining({
      tailwindRuntime: mocks.tailwindRuntime,
      refreshTailwindcssRuntime: mocks.refreshTailwindcssRuntime,
    }))
    expect(mocks.ensureRuntimeClassSet.mock.calls[0]?.[1]).toBeUndefined()
  })

  it('preserves explicit main chunk style options and merges missing defaults', async () => {
    const { createContext } = await import('@/core')
    const ctx = createContext()
    const explicit = {
      isMainChunk: true,
      cssRemoveHoverPseudoClass: false,
    }

    await ctx.transformWxss('.a{}', explicit)
    await ctx.transformWxss('.b{}', {
      cssRemoveProperty: false,
    })

    expect(mocks.styleHandler.mock.calls[0]?.[1]).toBe(explicit)
    expect(mocks.styleHandler.mock.calls[1]?.[1]).toMatchObject({
      isMainChunk: true,
      cssRemoveProperty: false,
    })
  })

  it('injects the runtime Tailwind major version into default js handler options', async () => {
    const { createContext } = await import('@/core')
    const ctx = createContext()

    await ctx.transformJs('const cls = "runtime-[1px]"')
    await ctx.transformJs('const cls = "runtime-[1px]"')

    const firstOptions = mocks.jsHandler.mock.calls[0]?.[2]
    const secondOptions = mocks.jsHandler.mock.calls[1]?.[2]

    expect(firstOptions).toEqual({ tailwindcssMajorVersion: 4 })
    expect(secondOptions).toBe(firstOptions)
    expect(mocks.ensureRuntimeClassSet).toHaveBeenCalledTimes(1)
  })

  it('exposes and reuses the collected runtime set', async () => {
    const { createContext } = await import('@/core')
    const ctx = createContext()
    const collected = new Set(['runtime-[2px]'])
    mocks.ensureRuntimeClassSet.mockResolvedValue(collected)

    const runtimeSet = await ctx.getRuntimeSet({
      forceCollect: true,
    })
    await ctx.transformJs('const cls = "runtime-[2px]"')

    expect(runtimeSet).toBe(collected)
    expect(mocks.ensureRuntimeClassSet).toHaveBeenCalledTimes(1)
    expect(mocks.ensureRuntimeClassSet).toHaveBeenCalledWith(expect.any(Object), {
      forceCollect: true,
    })
    expect(mocks.jsHandler).toHaveBeenCalledWith('const cls = "runtime-[2px]"', collected, {
      tailwindcssMajorVersion: 4,
    })
  })

  it('lets transformWxml reuse the runtime set collected by getRuntimeSet', async () => {
    const { createContext } = await import('@/core')
    const ctx = createContext()
    const collected = new Set(['runtime-[2px]'])
    mocks.ensureRuntimeClassSet.mockResolvedValue(collected)

    await ctx.getRuntimeSet()
    await ctx.transformWxml('<view class="runtime-[2px]" />')

    expect(mocks.ensureRuntimeClassSet).toHaveBeenCalledTimes(1)
    expect(mocks.templateHandler.mock.calls[0]?.[1]).toMatchObject({
      runtimeSet: collected,
    })
  })

  it('strips runtimeSet from js options while preserving handler overrides', async () => {
    const { createContext } = await import('@/core')
    const ctx = createContext()
    const runtimeSet = new Set(['manual-[2px]'])

    await ctx.transformJs('const cls = "manual-[2px]"', {
      runtimeSet,
      generateMap: false,
    })

    expect(mocks.ensureRuntimeClassSet).not.toHaveBeenCalled()
    expect(mocks.jsHandler).toHaveBeenCalledWith('const cls = "manual-[2px]"', runtimeSet, {
      generateMap: false,
      tailwindcssMajorVersion: 4,
    })
  })

  it('preserves explicit js handler options that already contain a Tailwind major version', async () => {
    const { createContext } = await import('@/core')
    const ctx = createContext()
    const options = {
      tailwindcssMajorVersion: 3,
      needEscaped: false,
    }

    await ctx.transformJs('const cls = "runtime-[1px]"', options)

    expect(mocks.jsHandler.mock.calls[0]?.[2]).toBe(options)
  })

  it('returns raw js when the precheck decides the transform can be skipped', async () => {
    const { createContext } = await import('@/core')
    const ctx = createContext()
    mocks.shouldSkipJsTransform.mockReturnValue(true)

    const result = await ctx.transformJs('const value = 1')

    expect(result).toEqual({ code: 'const value = 1' })
    expect(mocks.jsHandler).not.toHaveBeenCalled()
  })

  it('reuses default and runtime-only template options', async () => {
    const { createContext } = await import('@/core')
    const ctx = createContext()
    const runtimeSet = new Set(['manual-[2px]'])

    await ctx.transformWxml('<view />')
    await ctx.transformWxml('<text />')
    await ctx.transformWxml('<view />', { runtimeSet })
    await ctx.transformWxml('<text />', { runtimeSet })

    const defaultOptions = mocks.templateHandler.mock.calls[0]?.[1] as any
    const defaultOptionsAgain = mocks.templateHandler.mock.calls[1]?.[1]
    const runtimeOnlyOptions = mocks.templateHandler.mock.calls[2]?.[1] as any
    const runtimeOnlyOptionsAgain = mocks.templateHandler.mock.calls[3]?.[1]

    expect(defaultOptions).toBe(defaultOptionsAgain)
    expect(defaultOptions.runtimeSet).toBeInstanceOf(Set)
    expect(runtimeOnlyOptions).toBe(runtimeOnlyOptionsAgain)
    expect(runtimeOnlyOptions.runtimeSet).toBe(runtimeSet)

    await runtimeOnlyOptions.jsHandler('const cls = "manual-[2px]"', runtimeSet, {
      needEscaped: true,
    })

    expect(mocks.jsHandler).toHaveBeenLastCalledWith('const cls = "manual-[2px]"', runtimeSet, {
      needEscaped: true,
      tailwindcssMajorVersion: 4,
    })

    await defaultOptions.jsHandler('const cls = "runtime-[1px]"')
    expect(mocks.jsHandler).toHaveBeenLastCalledWith('const cls = "runtime-[1px]"', undefined, {
      tailwindcssMajorVersion: 4,
    })

    const explicitMajorOptions = {
      tailwindcssMajorVersion: 3,
    }
    await defaultOptions.jsHandler('const cls = "runtime-[1px]"', undefined, explicitMajorOptions)
    expect(mocks.jsHandler.mock.calls.at(-1)?.[2]).toBe(explicitMajorOptions)
  })

  it('uses default template options for empty override objects', async () => {
    const { createContext } = await import('@/core')
    const ctx = createContext()

    await ctx.transformWxml('<view />')
    await ctx.transformWxml('<text />', {})

    expect(mocks.templateHandler.mock.calls[1]?.[1]).toBe(mocks.templateHandler.mock.calls[0]?.[1])
  })

  it('merges template overrides with the current runtime set and js handler', async () => {
    const { createContext } = await import('@/core')
    const ctx = createContext()
    const customRuntimeSet = new Set(['custom-[3px]'])
    const customJsHandler = vi.fn()

    await ctx.transformWxml('<view />', {
      runtimeSet: customRuntimeSet,
      jsHandler: customJsHandler,
      customAttributesEntities: [],
    })

    const options = mocks.templateHandler.mock.calls[0]?.[1] as any

    expect(options.runtimeSet).toBe(customRuntimeSet)
    expect(options.jsHandler).toBe(customJsHandler)
    expect(options.customAttributesEntities).toEqual([])
  })

  it('leaves handler options untouched when the runtime has no numeric major version', async () => {
    const { createContext } = await import('@/core')
    mocks.tailwindRuntime.majorVersion = undefined
    const ctx = createContext()
    const options = {
      generateMap: false,
    }

    await ctx.transformJs('const cls = "runtime-[1px]"', options)
    await ctx.transformJs('const cls = "runtime-[1px]"', {
      runtimeSet: new Set(['runtime-[1px]']),
    })

    expect(mocks.jsHandler.mock.calls[0]?.[2]).toBe(options)
    expect(mocks.jsHandler.mock.calls[1]?.[2]).toBeUndefined()
  })
})
