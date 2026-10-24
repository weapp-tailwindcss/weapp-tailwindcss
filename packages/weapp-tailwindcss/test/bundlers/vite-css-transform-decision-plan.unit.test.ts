import { describe, expect, it } from 'vitest'
import {
  resolveViteCssTransformCachePlan,
  resolveViteCssTransformDecisionPlan,
} from '../../src/bundlers/vite/generate-bundle/css-transform-decision-plan'

function createDecisionOptions() {
  return {
    alreadyProcessedCssAsset: true,
    cssAssetIdentityKind: 'bundler-generated' as const,
    cssIsMainChunk: false,
    generatorCandidateSignatureInitialized: true,
    generatorCandidatesChanged: false,
    generatorRawSource: '.generated { color: red; }',
    hasCurrentTailwindGenerationDirective: false,
    hasRememberedApplySource: false,
    hasRuntimeAffectingChanges: false,
    hasSameOutputRememberedTailwindGenerationSource: false,
    hasStaleViteProcessedCssSource: true,
    isCollectedBundlerGeneratedCssFile: true,
    isProcessCssFile: false,
    isRuntimeLinkedCss: false,
    rawSource: '/* weapp-tailwindcss:bundler-generated */\n.generated { color: red; }',
    shouldProcessTailwindGeneration: true,
    shouldRegenerateMainPackageCssWithScopedCandidates: false,
    useIncrementalMode: true,
    vitePipelineCssAsset: true,
    viteProcessedCssAsset: true,
  }
}

describe('vite css transform decision plan', () => {
  it('已知作者源删除生成指令后不复用旧生成载荷', () => {
    const plan = resolveViteCssTransformDecisionPlan({
      ...createDecisionOptions(),
      generatorRawSource: '.clean{display:block}',
      rememberedRawSource: '.clean{display:block}',
    })
    expect(plan.shouldPreserveStaleGeneratedCssAsset).toBe(false)
    expect(plan.shouldReuseProcessedCss).toBe(false)
  })

  it('reuses stable stale generated css without tracking the generator', () => {
    const plan = resolveViteCssTransformDecisionPlan(createDecisionOptions())

    expect(plan.shouldPreserveCollectedViteCssAsset).toBe(true)
    expect(plan.shouldPreserveStaleGeneratedCssAsset).toBe(true)
    expect(plan.shouldReuseProcessedCss).toBe(true)
    expect(plan.shouldTrackGeneratorRuntime).toBe(true)
    expect(plan.shouldReplayLastCss).toBe(false)
    expect(plan.strippedViteProcessedCss).toContain('.generated')
  })

  it('never preserves a generator placeholder as stale generated css', () => {
    const plan = resolveViteCssTransformDecisionPlan({
      ...createDecisionOptions(),
      cssAssetIdentityKind: 'generator-placeholder',
    })

    expect(plan.shouldPreserveStaleGeneratedCssAsset).toBe(false)
    expect(plan.shouldReuseProcessedCss).toBe(false)
  })

  it('regenerates processed css when candidates change', () => {
    const plan = resolveViteCssTransformDecisionPlan({
      ...createDecisionOptions(),
      generatorCandidatesChanged: true,
      generatorRawSource: '@import "tailwindcss";',
    })

    expect(plan.shouldRegenerateCollectedViteCss).toBe(true)
    expect(plan.shouldRefreshViteProcessedCssByCandidates).toBe(true)
    expect(plan.shouldTrackGeneratorRuntime).toBe(true)
    expect(plan.shouldReuseProcessedCss).toBe(false)
    expect(plan.shouldReplayLastCss).toBe(false)
  })

  it('does not replay a last result for runtime-linked css', () => {
    const plan = resolveViteCssTransformDecisionPlan({
      ...createDecisionOptions(),
      isRuntimeLinkedCss: true,
    })

    expect(plan.shouldReplayLastCss).toBe(false)
  })
})

describe('vite css transform cache plan', () => {
  it('builds stable cache and remembered signatures', () => {
    expect(resolveViteCssTransformCachePlan({
      cssIsMainChunk: true,
      cssRuntimeAffectingHash: 'raw-hash',
      cssShareScope: 'scope',
      outputFile: 'app.acss',
      runtimeSignature: 'runtime',
      scopedGeneratorCandidateSignature: 'candidates',
      sourceTraceSignature: 'trace',
      tailwindcssMajorVersion: 4,
    })).toEqual({
      cssCacheKey: 'app.acss:css:runtime:candidates:4',
      cssHashKey: 'app.acss:css:runtime:candidates:4',
      cssRuntimeSignature: 'runtime:candidates',
      cssSharedCacheKey: 'scope:runtime:candidates:4:1:raw-hash:candidates:trace',
      cssTaskHash: 'raw-hash:candidates:trace',
      rememberedCssRuntimeSignature: 'runtime:candidates:raw-hash',
    })
  })

  it('isolates cache ownership when scoped candidates change', () => {
    const createPlan = (scopedGeneratorCandidateSignature: string) => resolveViteCssTransformCachePlan({
      cssIsMainChunk: false,
      cssRuntimeAffectingHash: 'raw-hash',
      cssShareScope: 'scope',
      outputFile: 'pages/index.wxss',
      runtimeSignature: 'runtime',
      scopedGeneratorCandidateSignature,
      sourceTraceSignature: 'trace',
      tailwindcssMajorVersion: 4,
    })

    const initial = createPlan('dark:bg-[#232323]')
    const updated = createPlan('dark:bg-[#242424]')

    expect(updated.cssCacheKey).not.toBe(initial.cssCacheKey)
    expect(updated.cssHashKey).not.toBe(initial.cssHashKey)
    expect(updated.cssTaskHash).not.toBe(initial.cssTaskHash)
  })

  it('invalidates identical source and candidates when the runtime configuration changes', () => {
    const createPlan = (runtimeSignature: string) => resolveViteCssTransformCachePlan({
      cssIsMainChunk: true,
      cssRuntimeAffectingHash: 'raw-hash',
      cssShareScope: 'scope',
      outputFile: 'app.acss',
      runtimeSignature,
      scopedGeneratorCandidateSignature: 'candidates',
      sourceTraceSignature: 'trace',
      tailwindcssMajorVersion: 4,
    })
    const initial = createPlan('config-v1')
    const updated = createPlan('config-v2')

    expect(updated.cssCacheKey).not.toBe(initial.cssCacheKey)
    expect(updated.cssSharedCacheKey).not.toBe(initial.cssSharedCacheKey)
    expect(updated.rememberedCssRuntimeSignature).not.toBe(initial.rememberedCssRuntimeSignature)
  })
})
