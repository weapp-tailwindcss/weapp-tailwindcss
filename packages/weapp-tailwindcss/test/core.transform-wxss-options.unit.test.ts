import { beforeEach, describe, expect, it, vi } from 'vitest'

const styleHandler = vi.fn(async () => ({ css: '', map: undefined }))
const templateHandler = vi.fn()
const jsHandler = vi.fn()
const refreshTailwindcssRuntime = vi.fn()
const ensureRuntimeClassSet = vi.fn(async () => new Set<string>())
const createTailwindRuntimeReadyPromise = vi.fn(() => Promise.resolve())
const createCompilerContext = vi.fn(() => ({
  templateHandler,
  styleHandler,
  jsHandler,
  tailwindRuntime: {
    majorVersion: 4,
  },
  tailwindcssBasedir: '/tmp',
  refreshTailwindcssRuntime,
}))

vi.mock('@/context', () => ({
  createCompilerContext,
}))

vi.mock('@/tailwindcss/runtime', () => ({
  createTailwindRuntimeReadyPromise,
  ensureRuntimeClassSet,
}))

const { createContext } = await import('@/core')

describe('core transformWxss option reuse', () => {
  beforeEach(() => {
    styleHandler.mockClear()
    templateHandler.mockClear()
    jsHandler.mockClear()
    refreshTailwindcssRuntime.mockClear()
    ensureRuntimeClassSet.mockClear()
    createTailwindRuntimeReadyPromise.mockClear()
    createCompilerContext.mockClear()
  })

  it('reuses the default main chunk options object when overrides are omitted', async () => {
    const ctx = createContext()

    await ctx.transformWxss('.foo{}')
    await ctx.transformWxss('.bar{}')

    const firstOptions = styleHandler.mock.calls[0]?.[1]
    const secondOptions = styleHandler.mock.calls[1]?.[1]

    expect(firstOptions).toBe(secondOptions)
    expect(firstOptions).toEqual({ isMainChunk: true })
  })

  it('passes through caller options when isMainChunk is already true', async () => {
    const ctx = createContext()
    const options = {
      isMainChunk: true,
      postcssOptions: {
        options: {
          from: 'app.wxss',
        },
      },
    }

    await ctx.transformWxss('.foo{}', options)

    expect(styleHandler.mock.calls[0]?.[1]).toBe(options)
  })

  it('adds isMainChunk only when caller did not specify it', async () => {
    const ctx = createContext()
    const options = {
      postcssOptions: {
        options: {
          from: 'app.wxss',
        },
      },
    }

    await ctx.transformWxss('.foo{}', options)

    const resolvedOptions = styleHandler.mock.calls[0]?.[1]
    expect(resolvedOptions).not.toBe(options)
    expect(resolvedOptions).toMatchObject({
      isMainChunk: true,
      postcssOptions: {
        options: {
          from: 'app.wxss',
        },
      },
    })
  })
})

describe('core transformWxml option reuse', () => {
  beforeEach(() => {
    styleHandler.mockClear()
    templateHandler.mockClear()
    jsHandler.mockClear()
    refreshTailwindcssRuntime.mockClear()
    ensureRuntimeClassSet.mockClear()
    createTailwindRuntimeReadyPromise.mockClear()
    createCompilerContext.mockClear()
  })

  it('reuses the default template options object when runtimeSet is stable', async () => {
    ensureRuntimeClassSet.mockResolvedValue(new Set(['mt-[8px]']))
    templateHandler.mockResolvedValue('<view class="mt-_b8px_B"></view>')
    const ctx = createContext()

    await ctx.transformWxml('<view class="mt-[8px]"></view>')
    await ctx.transformWxml('<view class="mb-[8px]"></view>')

    const firstOptions = templateHandler.mock.calls[0]?.[1]
    const secondOptions = templateHandler.mock.calls[1]?.[1]

    expect(firstOptions).toBe(secondOptions)
    expect(firstOptions?.runtimeSet).toBe(secondOptions?.runtimeSet)
    expect(firstOptions?.jsHandler).toBe(secondOptions?.jsHandler)
  })

  it('creates a new default template options object after runtimeSet changes', async () => {
    ensureRuntimeClassSet.mockResolvedValue(new Set(['mt-[8px]']))
    templateHandler.mockResolvedValue('<view class="mt-_b8px_B"></view>')
    const ctx = createContext()

    await ctx.transformWxml('<view class="mt-[8px]"></view>')
    await ctx.transformJs('const cls = "text-[12px]"', {
      runtimeSet: new Set(['text-[12px]']),
    })
    await ctx.transformWxml('<view class="text-[12px]"></view>')

    const firstOptions = templateHandler.mock.calls[0]?.[1]
    const secondOptions = templateHandler.mock.calls[1]?.[1]

    expect(firstOptions).not.toBe(secondOptions)
    expect(firstOptions?.runtimeSet).not.toBe(secondOptions?.runtimeSet)
  })

  it('reuses the runtimeSet-only template options object when caller runtimeSet is stable', async () => {
    templateHandler.mockResolvedValue('<view class="text-_b12px_B"></view>')
    const ctx = createContext()
    const runtimeSet = new Set(['text-[12px]'])

    await ctx.transformWxml('<view class="text-[12px]"></view>', {
      runtimeSet,
    })
    await ctx.transformWxml('<view class="text-[12px]"></view>', {
      runtimeSet,
    })

    const firstOptions = templateHandler.mock.calls[0]?.[1]
    const secondOptions = templateHandler.mock.calls[1]?.[1]

    expect(firstOptions).toBe(secondOptions)
    expect(firstOptions).toEqual({
      runtimeSet,
      jsHandler: expect.any(Function),
    })
  })
})

describe('core transformJs option reuse', () => {
  beforeEach(() => {
    styleHandler.mockClear()
    templateHandler.mockClear()
    jsHandler.mockClear()
    refreshTailwindcssRuntime.mockClear()
    ensureRuntimeClassSet.mockClear()
    createTailwindRuntimeReadyPromise.mockClear()
    createCompilerContext.mockClear()
  })

  it('reuses the default js handler options object when overrides are omitted', async () => {
    ensureRuntimeClassSet.mockResolvedValue(new Set(['text-[12px]']))
    const ctx = createContext()

    await ctx.transformJs('const a = "text-[12px]"')
    await ctx.transformJs('const b = "text-[14px]"')

    const firstOptions = jsHandler.mock.calls[0]?.[2]
    const secondOptions = jsHandler.mock.calls[1]?.[2]

    expect(firstOptions).toBe(secondOptions)
    expect(firstOptions).toEqual({
      tailwindcssMajorVersion: 4,
    })
  })

  it('reuses the default js handler options object when caller only provides runtimeSet', async () => {
    const ctx = createContext()

    await ctx.transformJs('const a = "text-[12px]"', {
      runtimeSet: new Set(['text-[12px]']),
    })
    await ctx.transformJs('const b = "text-[14px]"', {
      runtimeSet: new Set(['text-[14px]']),
    })

    const firstOptions = jsHandler.mock.calls[0]?.[2]
    const secondOptions = jsHandler.mock.calls[1]?.[2]

    expect(firstOptions).toBe(secondOptions)
    expect(firstOptions).toEqual({
      tailwindcssMajorVersion: 4,
    })
    expect(firstOptions).not.toHaveProperty('runtimeSet')
  })

  it('passes through explicit js handler options when caller already provides a tailwind major version', async () => {
    const ctx = createContext()
    const options = {
      tailwindcssMajorVersion: 3,
      generateMap: true,
    }

    await ctx.transformJs('const a = "text-[12px]"', options)

    expect(jsHandler.mock.calls[0]?.[2]).toBe(options)
  })
})
