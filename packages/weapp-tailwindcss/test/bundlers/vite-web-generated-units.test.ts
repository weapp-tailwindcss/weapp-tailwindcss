import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { OutputAsset } from 'rollup'
import type { CssFinalizerContext } from '@/bundlers/vite/css-finalizer/options'
import type { InternalUserDefinedOptions } from '@/types'
import { createStyleHandler } from '@weapp-tailwindcss/postcss/transform'
import { describe, expect, it, vi } from 'vitest'
import { createViteCssCalcStage } from '@/bundlers/vite/css-calc-stage'
import { finalizeWebCssCalc } from '@/bundlers/vite/css-finalizer/css-calc'
import { resolveStyleOptionsFromContext } from '@/context/style-options'
import { createTailwindV4Engine, resolveTailwindV4Source } from '@/tailwindcss/v4-engine'

describe('Vite 生成阶段与最终单位处理的分工', () => {
  it.each([{ cssCalc: false }, { cssCalc: ['--spacing'] }] as const)('cssCalc=$cssCalc 时同单位与闭环转换在复用资产后仍只执行一次', async ({ cssCalc }) => {
    const cases: Array<{ options: Partial<IStyleHandlerOptions>, expected: string }> = [
      { options: { unitConversion: { rules: [{ from: 'rem', to: 'rem', factor: 2 }] } }, expected: '4rem' },
      { options: { unitsToPx: { unitMap: { rem: 10 } }, unitConversion: { rules: [{ from: 'px', to: 'rem', factor: 0.5 }] } }, expected: '10rem' },
    ]
    for (const { options, expected } of cases) {
      const original = {
        cssOptions: { ...options, cssCalc, rem2rpx: false },
        cssMatcher: (file: string) => file.endsWith('.css'),
        htmlMatcher: () => false,
        tailwindRuntime: { majorVersion: 4 },
        generator: { target: 'web' },
        onUpdate: vi.fn(),
      } as unknown as InternalUserDefinedOptions
      original.styleHandler = createStyleHandler(original)
      const stage = createViteCssCalcStage(original, () => true)
      const source = await resolveTailwindV4Source({ css: '@theme default { --spacing: 2rem; } @tailwind utilities;', base: process.cwd() })
      const engine = createTailwindV4Engine(source)
      try {
        const generated = await engine.generate({
          candidates: ['p-[2rem]', 'mt-2'],
          scanSources: false,
          target: 'web',
          styleOptions: resolveStyleOptionsFromContext(stage.options),
        })
        expect(generated.css).toContain(`padding: ${cssCalc ? '2rem' : expected}`)
        const asset: OutputAsset = { type: 'asset', fileName: 'theme.css', source: generated.css, names: [], originalFileNames: [] }
        const bundle = { 'theme.css': asset }
        const context = { opts: stage.options, getFinalCssCalcOptions: stage.getFinalOptions } as CssFinalizerContext
        await finalizeWebCssCalc(bundle, context)
        expect(String(asset.source)).toContain(`padding: ${expected}`)
        const first = String(asset.source)
        await finalizeWebCssCalc(bundle, context)
        expect(String(asset.source)).toBe(first)
      }
      finally {
        await engine.dispose?.()
      }
    }
  })
})
