import type { OutputBundle } from 'rollup'
import type { ResolvedConfig } from 'vite'
import process from 'node:process'
import { describe, expect, it, vi } from 'vitest'
import { uniAppCssPipelineStrategy } from '@/bundlers/vite/frameworks/uni-app'
import { createGenerateBundleHook } from '@/bundlers/vite/generate-bundle'
import { createContext, createRollupChunk } from './vite-plugin.testkit'

describe('framework bundle asset demand', () => {
  it.each([2, 4, 8].flatMap(count => [false, true].map(transformJs => ({ count, transformJs }))))('does not copy metadata for $count Uni script chunks (transform: $transformJs)', async ({ count, transformJs }) => {
    const context = createContext({ platform: 'mp-weixin' })
    const sourcesContent = vi.fn(() => ['original source'])
    const getServeJsHandlerOptions = vi.fn(uniAppCssPipelineStrategy.sources!.getServeJsHandlerOptions!)
    const generateBundle = createGenerateBundleHook({
      opts: context as any,
      runtimeState: { tailwindRuntime: context.tailwindRuntime as any, readyPromise: Promise.resolve() },
      ensureRuntimeClassSet: vi.fn(async () => new Set(['alpha'])),
      ensureBundleRuntimeClassSet: vi.fn(async () => new Set(['alpha'])),
      debug: vi.fn(),
      getResolvedConfig: () => ({
        command: 'build',
        root: process.cwd(),
        build: { outDir: process.cwd(), watch: {} },
        css: { postcss: { plugins: [] } },
      }) as ResolvedConfig,
      cssPipelineStrategy: {
        ...uniAppCssPipelineStrategy,
        sources: { ...uniAppCssPipelineStrategy.sources, getServeJsHandlerOptions },
      },
    })
    const script = (changed: boolean) => `${transformJs ? 'element.className = "alpha"; ' : ''}console.log('alpha', ${changed ? 1 : 0})`
    const expectedCode = (changed: boolean) => `${transformJs ? 'js:' : ''}${script(changed)}`
    const createBundle = (changed: boolean): OutputBundle => Object.fromEntries(Array.from({ length: count }, (_, index) => [
      `entry-${index}.js`,
      {
        ...createRollupChunk(script(changed && index === 0)),
        fileName: `entry-${index}.js`,
        map: { get sourcesContent() { return sourcesContent() } },
      },
    ])) as OutputBundle
    const bundle = createBundle(false)
    await generateBundle.call({ addWatchFile: vi.fn() }, {}, bundle)
    expect(getServeJsHandlerOptions).toHaveBeenCalledTimes(count)
    expect(getServeJsHandlerOptions.mock.results.every(result => result.value === undefined)).toBe(true)
    expect(sourcesContent).not.toHaveBeenCalled()
    expect(context.jsHandler).toHaveBeenCalledTimes(transformJs ? count : 0)
    expect(bundle['entry-0.js']).toHaveProperty('code', expectedCode(false))

    const updated = createBundle(true)
    await generateBundle.call({ addWatchFile: vi.fn() }, {}, updated)
    expect(sourcesContent).not.toHaveBeenCalled()
    expect(context.jsHandler).toHaveBeenCalledTimes(transformJs ? count + 1 : 0)
    expect(updated['entry-0.js']).toHaveProperty('code', expectedCode(true))
    expect(updated['entry-1.js']).toHaveProperty('code', expectedCode(false))
  })
})
