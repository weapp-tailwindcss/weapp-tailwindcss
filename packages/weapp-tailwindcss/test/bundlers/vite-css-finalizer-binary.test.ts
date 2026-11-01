import type { OutputAsset, OutputBundle } from 'rollup'
import type { CssFinalizerContext } from '@/bundlers/vite/css-finalizer/options'
import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { createViteCssFinalizerOutputPlugin } from '@/bundlers/vite/css-finalizer'

vi.mock('@/context/generation', () => ({
  generateTailwindV4Css: vi.fn(),
}))

const encodings = [
  ['string', (css: string) => css],
  ['Buffer', (css: string) => Buffer.from(css)],
  ['Uint8Array', (css: string) => new TextEncoder().encode(css)],
  ['子数组', (css: string) => new TextEncoder().encode(`xx${css}yy`).subarray(2, -2)],
] as const

describe.each(['web', 'weapp'] as const)('普通 %s CSS 资产的二进制读取', (target) => {
  describe.each([false, true])('允许 Web 快路径：%s', (allowWebProductionFastPath) => {
    it.each(encodings)('未登记的 %s 资产保留 UTF-8 内容并经过正常收尾', async (_label, encode) => {
      const original = '.authored::after{content:"中文";color:red}'
      const expected = original.replace('color:red', 'color:blue')
      const fileName = 'third-party.css'
      const output: OutputAsset = {
        type: 'asset',
        fileName,
        names: [],
        originalFileNames: [],
        source: encode(original),
      }
      const styleHandler = vi.fn(async (css: string) => ({ css: css.replace('color:red', 'color:blue') }))
      const transformGeneratedCss = vi.fn((css: string) => css.replace('color:red', 'color:blue'))
      const onUpdate = vi.fn()
      const isViteProcessedCssAsset = vi.fn(() => false)
      const context = {
        allowWebProductionFastPath,
        opts: {
          appType: 'native',
          cssMatcher: (file: string) => file.endsWith('.css'),
          htmlMatcher: () => false,
          mainCssChunkMatcher: () => false,
          styleHandler,
          onUpdate,
          generator: { target },
        },
        runtimeState: {
          readyPromise: Promise.resolve(),
          tailwindRuntime: { majorVersion: 4 },
        },
        cssPipelineStrategy: { generation: { transformGeneratedCss } },
        ensureRuntimeClassSet: vi.fn(async () => new Set()),
        isCssAssetProcessed: vi.fn(() => false),
        markCssAssetProcessed: vi.fn(),
        isViteProcessedCssAsset,
        getViteProcessedCssAssetResults: () => [],
        debug: vi.fn(),
        getResolvedConfig: () => ({ command: 'build', root: process.cwd(), build: { outDir: 'dist' } }),
      } as unknown as CssFinalizerContext
      const plugin = createViteCssFinalizerOutputPlugin(context)
      const hook = plugin.generateBundle
      if (!hook || typeof hook === 'function') {
        throw new Error('CSS finalizer 缺少 generateBundle handler')
      }
      const bundle: OutputBundle = { [fileName]: output }

      await hook.handler.call({} as never, {} as never, bundle, false)

      expect(output.source).toBe(expected)
      expect(onUpdate).toHaveBeenCalledWith(fileName, original, expected)
      expect(isViteProcessedCssAsset).toHaveBeenCalledWith(output, fileName)
      if (target === 'web') {
        expect(transformGeneratedCss).toHaveBeenCalledWith(original, expect.anything())
        expect(styleHandler).not.toHaveBeenCalled()
      }
      else {
        expect(styleHandler).toHaveBeenCalledWith(original, expect.anything())
        expect(transformGeneratedCss).not.toHaveBeenCalled()
      }
    })
  })
})
