import { describe, expect, it } from 'vitest'
import { finalizeTracedWebpackCssAsset, finalizeWebpackCssAssetOutputSource, finalizeWebpackCssAssetSource } from '@/bundlers/webpack/BaseUnifiedPlugin/v5-assets/pipeline-helpers/finalize'
import { finalizeMiniProgramUserCssAssetSource } from '@/bundlers/webpack/BaseUnifiedPlugin/v5-assets/pipeline-helpers/memory-trace'
import { getCompilerContext } from '@/context'
import { finalizeMiniProgramGeneratorCss } from '@/generation/generation-helpers/preflight'

const source = '.issue-1286{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;-webkit-tap-highlight-color:transparent;-webkit-appearance:none}'

describe('Issue 1286 final CSS boundaries', () => {
  it.each([false, true])('preserves custom properties in Webpack assets (generated: %s)', (generatedCss) => {
    const context = getCompilerContext({
      cssOptions: { cssPreflight: false, preserveWebkitProperties: ['-webkit-tap-highlight-color'] },
    })
    const finalized = finalizeWebpackCssAssetSource(source, context, false, { generatedCss, cssPreflight: false })
    expect(finalized).toContain('-webkit-font-smoothing:antialiased')
    expect(finalized).toContain('-webkit-tap-highlight-color:transparent')
    expect(finalized).not.toContain('-webkit-appearance')
    expect(finalizeWebpackCssAssetOutputSource(finalized, context, false)).toContain('-webkit-tap-highlight-color:transparent')
  })

  it('preserves custom properties when finalizing traced author assets', () => {
    const context = getCompilerContext({
      cssSourceTrace: true,
      cssOptions: { cssPreflight: false, preserveWebkitProperties: ['-webkit-tap-highlight-color'] },
    })
    expect(finalizeMiniProgramUserCssAssetSource(source, context, false, { cssPreflight: false })).toContain('-webkit-tap-highlight-color:transparent')
    const traced = finalizeTracedWebpackCssAsset(source, { isMainChunk: true }, {
      annotateCss: css => css,
      compilerOptions: context,
      isWebGeneratorTarget: false,
    })
    expect(traced).toContain('-webkit-font-smoothing:antialiased')
    expect(traced).toContain('-webkit-tap-highlight-color:transparent')
  })

  it.each([undefined, 'component.vue?vue&type=style&scoped=abc'])('passes preservation through generator finalization (%s)', (from) => {
    const finalized = finalizeMiniProgramGeneratorCss(source, 'weapp', 4, false, {
      styleOptions: {
        cssOptions: { preserveWebkitProperties: ['-webkit-tap-highlight-color'] },
        postcssOptions: { options: { from } },
      },
    })
    expect(finalized).toContain('-webkit-font-smoothing:antialiased')
    expect(finalized).toContain('-webkit-tap-highlight-color:transparent')
    expect(finalized).not.toContain('-webkit-appearance')
  })
})
