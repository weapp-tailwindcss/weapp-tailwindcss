import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBundlerGeneratedCssMarker } from '@/bundlers/shared/generated-css-marker'

const sourceCss = '@layer utilities{.rounded-full{border-radius:calc(infinity * 1px)}.w-4{width:16px}}'
const generateTailwindV4Css = vi.hoisted(() => vi.fn())
vi.mock('@/generation/service', () => ({ generateTailwindV4Css }))

describe('webpack infinite radius handoff', () => {
  afterEach(() => vi.clearAllMocks())

  it.each(['weapp', 'web'] as const)('only normalizes radius before registering and returning %s CSS', async (target) => {
    const { default: loader } = await import('@/bundlers/webpack/loaders/weapp-tw-css-generation-loader')
    const file = path.resolve('styles/entry.css')
    const classSet = new Set(['rounded-full', 'w-4'])
    generateTailwindV4Css.mockResolvedValue({
      css: sourceCss,
      target,
      classSet,
      dependencies: [],
      metadata: { majorVersion: 4 },
    })
    const registerGeneratedCss = vi.fn()
    const styleHandler = vi.fn()
    const result = await loader.call({
      resourcePath: file,
      rootContext: path.dirname(file),
      getOptions: () => ({
        tailwindcssImportRewrite: {
          pkgDir: path.resolve('packages/weapp-tailwindcss'),
          compilerOptions: {
            appType: 'taro',
            generator: { target },
            mainCssChunkMatcher: () => true,
            styleHandler,
          },
          runtimeState: {
            readyPromise: Promise.resolve(),
            tailwindRuntime: { majorVersion: 4 },
          },
          getRuntimeSet: async () => classSet,
          registerGeneratedCss,
        },
      }),
    } as any, '@import "tailwindcss" source(none);')

    const expectedCss = target === 'weapp' ? sourceCss.replace('calc(infinity * 1px)', '9999px') : sourceCss
    expect(result).toBe(`${createBundlerGeneratedCssMarker('webpack', file)}\n${expectedCss}`)
    expect(registerGeneratedCss).toHaveBeenCalledWith({ css: expectedCss, classSet, dependencies: [], file })
    expect(generateTailwindV4Css).toHaveBeenCalledWith(expect.objectContaining({
      deferCssAdaptation: target === 'weapp',
    }))
    expect(styleHandler).not.toHaveBeenCalled()
  })
})
