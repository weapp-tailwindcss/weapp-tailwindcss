import type { Plugin } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { createViteServeJsTransformPlugin } from '@/bundlers/vite/serve-js-transform'
import { createJsHandler } from '@/js'

function getTransformHandler(plugin: Plugin) {
  const hook = plugin.transform as any
  return typeof hook === 'object' ? hook.handler : hook
}

describe('bundlers/vite serve JS transform', () => {
  it('transforms source class literals during serve mode when enabled', async () => {
    const runtimeSet = new Set(['text-[32px]', 'grid-cols-2'])
    const jsHandler = vi.fn(() => ({
      code: 'export const vnode = { props: { className: "text-_b32px_B grid-cols-2" } }',
    }))
    const plugin = createViteServeJsTransformPlugin({
      createHandlerOptions: filename => ({
        filename,
        tailwindcssMajorVersion: 4,
      }),
      getCommand: () => 'serve',
      jsHandler,
      shouldTransform: () => true,
      transformRuntime: vi.fn(async () => runtimeSet),
    })

    const transform = getTransformHandler(plugin)
    const result = await transform?.call(
      plugin,
      'export const vnode = { props: { className: "text-[32px] grid-cols-2" } }',
      '/repo/src/main.tsx',
    )

    expect(jsHandler).toHaveBeenCalledWith(
      'export const vnode = { props: { className: "text-[32px] grid-cols-2" } }',
      runtimeSet,
      expect.objectContaining({ filename: '/repo/src/main.tsx' }),
    )
    expect(result?.code).toContain('text-_b32px_B')
    expect(result?.code).toContain('grid-cols-2')
  })

  it('does not transform source class literals when disabled', async () => {
    const plugin = createViteServeJsTransformPlugin({
      createHandlerOptions: filename => ({ filename }),
      getCommand: () => 'serve',
      jsHandler: createJsHandler({}),
      shouldTransform: () => false,
      transformRuntime: vi.fn(async () => new Set(['text-[32px]'])),
    })

    const transform = getTransformHandler(plugin)
    const result = await transform?.call(
      plugin,
      'export const cls = "text-[32px]"',
      '/repo/src/main.tsx',
    )

    expect(result).toBeUndefined()
  })

  it('skips non-JS serve requests and no-op JS transforms', async () => {
    const jsHandler = vi.fn((code: string) => ({ code }))
    const transformRuntime = vi.fn(async () => new Set(['text-[32px]']))
    const plugin = createViteServeJsTransformPlugin({
      createHandlerOptions: filename => ({ filename }),
      getCommand: () => 'serve',
      jsHandler,
      shouldTransform: () => true,
      transformRuntime,
    })

    const transform = getTransformHandler(plugin)

    await expect(transform?.call(
      plugin,
      '.text-_b32px_B { font-size: 32px }',
      '/repo/src/app.css',
    )).resolves.toBeUndefined()
    expect(jsHandler).not.toHaveBeenCalled()

    await expect(transform?.call(
      plugin,
      'export const cls = "text-[32px]"',
      '/repo/src/main.ts',
    )).resolves.toBeUndefined()
    expect(transformRuntime).toHaveBeenCalledTimes(1)
    expect(transformRuntime).toHaveBeenCalledWith('/repo/src/main.ts', 'export const cls = "text-[32px]"')
    expect(jsHandler).toHaveBeenCalledWith(
      'export const cls = "text-[32px]"',
      expect.any(Set),
      expect.objectContaining({ filename: '/repo/src/main.ts' }),
    )
  })
})
