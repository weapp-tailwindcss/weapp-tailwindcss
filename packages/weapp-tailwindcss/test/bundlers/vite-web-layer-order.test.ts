import type { OutputAsset, OutputBundle } from 'rollup'
import { describe, expect, it } from 'vitest'
import { injectViteProcessedCssIntoMainCssAssets } from '@/bundlers/vite/processed-css-assets'

describe('web CSS layer order during processed asset injection', () => {
  it('重复注入同一入口的嵌套 preflight 时不追加空 layer 外壳', () => {
    const source = '/*! tailwindcss v4.3.3 */\n@layer base,utilities;@layer base{@supports (display:grid){.card{display:grid}}}'
    const bundle: OutputBundle = {
      'styles/theme.css': {
        type: 'asset',
        fileName: 'styles/theme.css',
        names: [],
        originalFileNames: [],
        source,
      },
    }
    const options = {
      opts: { cssMatcher: () => true, mainCssChunkMatcher: () => false } as any,
      createCssPipelineContext: () => ({ currentGeneratorBranch: { isWeb: true } }) as any,
      getViteProcessedCssAssetResults: () => [
        ['entry.css', { css: `${source}\n/* source trace */`, outputFile: 'styles/theme.css', injectIntoMain: true }] as [string, { css: string, outputFile: string, injectIntoMain: boolean }],
      ],
    }
    injectViteProcessedCssIntoMainCssAssets(bundle, options)
    expect(String((bundle['styles/theme.css'] as OutputAsset).source)).toBe(source)
    injectViteProcessedCssIntoMainCssAssets(bundle, options)
    expect(String((bundle['styles/theme.css'] as OutputAsset).source)).toBe(source)
  })

  it('preserves layer declarations while removing Tailwind-only source directives', () => {
    const source = '@layer properties;@layer theme,base,components,utilities;@source "./src";@layer base{button{color:red}}'
    const bundle: OutputBundle = {
      'styles/theme.css': {
        type: 'asset',
        fileName: 'styles/theme.css',
        names: [],
        originalFileNames: [],
        source,
      },
    }
    injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: {
        appType: 'taro',
        cssMatcher: () => true,
        mainCssChunkMatcher: () => false,
      } as any,
      createCssPipelineContext: () => ({ currentGeneratorBranch: { isWeb: true } }) as any,
      getViteProcessedCssAssetResults: () => [
        ['entry.css', { css: '.extra{display:flex}', outputFile: 'styles/theme.css', injectIntoMain: true }],
      ],
    })
    const css = String((bundle['styles/theme.css'] as OutputAsset).source)
    expect(css).toContain('@layer properties;')
    expect(css).toContain('@layer theme,base,components,utilities;')
    expect(css).toContain('@layer base{button{color:red}}')
    expect(css).toContain('.extra{display:flex}')
    expect(css).not.toContain('@source')
  })
})
