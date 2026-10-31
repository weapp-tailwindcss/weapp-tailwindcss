import { expect, it, vi } from 'vitest'
import { processViteCssEntryTransform } from '@/bundlers/vite/generate-bundle/css-entry-transform'
import { createReplayCssAsset } from '@/bundlers/vite/generate-bundle/rollup-assets'
import { removeCssCoveredByRootStyleBundleSources } from '@/bundlers/vite/processed-css-assets'

it.each([true, false])('已处理资产复用从完整配置保留组件 reset：skyline=%s', async (skyline) => {
  const css = 'view,text{--tw-leading:var(--weapp-tw-invalid-reset);--tw-font-weight:var(--weapp-tw-invalid-reset)}'
  const applyCssResult = vi.fn()
  const removeRootCovered = vi.fn(removeCssCoveredByRootStyleBundleSources)
  await processViteCssEntryTransform({
    cssCompositionPlan: { generatorRawSource: css, generatorCssHandlerOptions: {}, cssHandlerOptions: {} },
    rememberedCssSources: [],
    cssAssetIdentity: {},
    currentSubpackageRoots: new Set(),
    isSubpackageOutputFile: () => false,
    generatorPlatform: 'mp-weixin',
    runtimeState: { tailwindRuntime: { majorVersion: 4 } },
    opts: { cssOptions: { skyline }, platform: 'mp-weixin' },
    outputCssHandlerOptions: { isMainChunk: false },
    outputFile: 'components/widget.wxss',
    normalizeOutputPathKey: (key: string) => key,
    bundle: { 'theme.wxss': createReplayCssAsset('theme.wxss', css) },
    removeCssCoveredByRootStyleBundleSources: removeRootCovered,
    shouldExcludeSubpackageSourceCandidates: () => false,
    runtimeLinkedCssFiles: new Set(),
    state: {},
    collectedBundlerGeneratedCssFiles: new Set(),
    processFiles: { css: new Set() },
    resolveViteCssTransformDecisionPlan: () => ({ shouldReuseProcessedCss: true, strippedViteProcessedCss: css }),
    applyCssResult,
    onUpdate: vi.fn(),
    debug: vi.fn(),
  })
  expect(removeRootCovered).toHaveBeenCalledWith(expect.anything(), 'components/widget.wxss', css, { preserveSkylineTypography: skyline })
  expect(applyCssResult).toHaveBeenCalledWith(skyline ? css : '')
})
