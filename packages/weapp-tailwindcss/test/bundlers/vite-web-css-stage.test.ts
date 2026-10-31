import type { OutputBundle } from 'rollup'
import path from 'node:path'
import { postcss } from '@weapp-tailwindcss/postcss/transform'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { collectViteProcessedCssAssetResults, injectViteProcessedCssIntoMainCssAssets } from '@/bundlers/vite/processed-css-assets'
import { createFrameworkCssAssets } from '@/bundlers/vite/shared/framework-css-assets'
import { createWebRpxFinalizerPlugin } from '@/generation/web-rpx-finalizer'
import { createWatchCssGenerator } from './helpers/css-watch-generator'

const { generateTailwindV4Css } = vi.hoisted(() => ({ generateTailwindV4Css: vi.fn() }))
vi.mock('@/context/generation', async importOriginal => ({
  ...await importOriginal<typeof import('@/context/generation')>(),
  generateTailwindV4Css,
}))

const generatedCss = '.radius{border-radius:20rpx}.copy{font-size:24rpx}.author{margin:3rem;color:purple}button::after{display:none}'

function asset(fileName: string, source: string) {
  return { type: 'asset' as const, fileName, names: [], originalFileNames: [], source }
}

function values(css: string, property: string) {
  const result: string[] = []
  postcss.parse(css).walkDecls(property, (declaration) => {
    result.push(declaration.value)
  })
  return result
}

describe('Web CSS 的生成缓存与框架产物边界', () => {
  beforeEach(() => {
    generateTailwindV4Css.mockReset().mockResolvedValue({
      css: generatedCss,
      classSet: new Set(['radius', 'copy', 'author']),
      dependencies: [],
    })
  })

  it.each([false, true])('框架改名产物只重放真实转换结果，自定义单位策略=%s', async (customUnits) => {
    const assets = createFrameworkCssAssets({ debug: vi.fn(), getSourceCandidateSource: () => undefined })
    const generate = createWatchCssGenerator(assets)
    const sourceFile = path.resolve('/repo', 'theme.css')
    const outputFile = 'device-output.css'
    const opts = {
      appType: 'uni-app-vite',
      cssEntries: [sourceFile],
      cssMatcher: (file: string) => file.endsWith('.css'),
      mainCssChunkMatcher: (file: string) => file === outputFile,
    } as any
    try {
      const moduleCss = await generate(sourceFile, '@import "tailwindcss";')
      expect(moduleCss).toContain('20rpx')
      expect(assets.cleanGeneratedCssByFile.get(sourceFile)).toBe(generatedCss)
      expect(assets.tracedGeneratedCssByFile.get(sourceFile)).toBe(generatedCss)
      expect(assets.processedCssRegistry.matchesIdentity(sourceFile)).toBe(true)

      const frameworkUnits = vi.fn((root: postcss.Root) => {
        root.walkDecls((declaration) => {
          // 使用与通用兜底不同的比例，证明最终合成尊重框架结果而非重算原单位。
          if (declaration.value === '20rpx') {
            declaration.value = '2rem'
          }
          if (declaration.value === '24rpx') {
            declaration.value = '2.4rem'
          }
        })
      })
      const frameworkSelectors = {
        postcssPlugin: 'framework-selector-policy',
        Rule(rule: postcss.Rule) {
          if (rule.selector === 'button::after') {
            rule.selector = 'uni-button::after'
          }
        },
      }
      const plugins = [
        frameworkSelectors,
        ...(customUnits ? [{ postcssPlugin: 'framework-unit-policy', Once: frameworkUnits }] : []),
        createWebRpxFinalizerPlugin(),
      ]
      const processed = await postcss(plugins).process(moduleCss!, { from: sourceFile })
      const expectedRadius = customUnits ? '2rem' : '0.625rem'
      const expectedCopy = customUnits ? '2.4rem' : '0.75rem'
      expect(values(processed.css, 'border-radius')).toEqual([expectedRadius])
      expect(values(processed.css, 'font-size')).toEqual([expectedCopy])
      if (customUnits) {
        expect(frameworkUnits).toHaveBeenCalledTimes(1)
      }
      const bundle: OutputBundle = { [outputFile]: asset(outputFile, processed.css) }
      const common = {
        opts,
        markCssAssetProcessed: assets.markCssAssetProcessed,
        recordCssAssetResult: assets.recordCssAssetResult,
        debug: vi.fn(),
      }
      collectViteProcessedCssAssetResults(bundle, {
        ...common,
        isViteProcessedCssAsset: () => true,
        recordViteProcessedCssAssetResult: assets.recordViteProcessedCssAssetResult,
        replaceViteProcessedCssAssetOutputs: assets.replaceViteProcessedCssAssetOutputs,
        // 模拟框架将 theme.css 合成至 device-output.css，来源仍由 marker 与 bundle 表达。
        resolveViteProcessedCssOutputFile: file => file === sourceFile ? 'theme.css' : file,
      })
      injectViteProcessedCssIntoMainCssAssets(bundle, {
        ...common,
        getViteProcessedCssAssetResults: assets.getViteProcessedCssAssetResults,
      })
      const css = String((bundle[outputFile] as any).source)
      expect(values(css, 'border-radius')).toEqual([expectedRadius])
      expect(values(css, 'font-size')).toEqual([expectedCopy])
      expect(values(css, 'margin')).toEqual(['3rem'])
      expect(values(css, 'color')).toEqual(['purple'])
      const selectors: string[] = []
      postcss.parse(css).walkRules((rule) => {
        selectors.push(rule.selector)
      })
      expect(selectors.filter(selector => selector === 'uni-button::after')).toEqual(['uni-button::after'])
      expect(selectors).not.toContain('button::after')
      expect(values(css, 'display')).toEqual(['none'])
      expect(css).not.toContain('rpx')
      expect([...assets.getViteProcessedCssAssetResults()].every(([, record]) => !record.css.includes('rpx'))).toBe(true)
    }
    finally {
      await generate.dispose()
      assets.dispose()
    }
  })

  it('未产生框架资产时保留模块缓存而不将它注入另一个 Web 输出', async () => {
    const assets = createFrameworkCssAssets({ debug: vi.fn(), getSourceCandidateSource: () => undefined })
    const generate = createWatchCssGenerator(assets)
    const sourceFile = path.resolve('/repo', 'theme.css')
    try {
      await generate(sourceFile, '@import "tailwindcss";')
      const original = '.unrelated{margin:3rem}'
      const bundle: OutputBundle = { 'another-output.css': asset('another-output.css', original) }
      injectViteProcessedCssIntoMainCssAssets(bundle, {
        opts: { cssMatcher: (file: string) => file.endsWith('.css'), mainCssChunkMatcher: () => true } as any,
        getViteProcessedCssAssetResults: assets.getViteProcessedCssAssetResults,
      })
      expect((bundle['another-output.css'] as any).source).toBe(original)
      expect(assets.cleanGeneratedCssByFile.get(sourceFile)).toBe(generatedCss)
    }
    finally {
      await generate.dispose()
      assets.dispose()
    }
  })
})
