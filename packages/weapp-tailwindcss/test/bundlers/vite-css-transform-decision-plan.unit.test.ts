import type { OutputAsset, OutputChunk } from 'rollup'
import type { InternalUserDefinedOptions } from '@/types'
import { describe, expect, it } from 'vitest'
import { createCache } from '@/cache'
import { buildBundleSnapshot, createBundleBuildState, updateBundleBuildState } from '../../src/bundlers/vite/bundle-state'
import {
  resolveViteCssLinkedImpactSignature,
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
      linkedImpactSignature: 'linked',
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
      cssTaskHash: 'raw-hash:candidates:trace:linked',
      rememberedCssRuntimeSignature: 'runtime:candidates:raw-hash',
    })
  })

  it('isolates cache ownership when scoped candidates change', () => {
    const createPlan = (scopedGeneratorCandidateSignature: string) => resolveViteCssTransformCachePlan({
      cssIsMainChunk: false,
      cssRuntimeAffectingHash: 'raw-hash',
      cssShareScope: 'scope',
      linkedImpactSignature: '',
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
      linkedImpactSignature: 'linked',
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

function createLinkedSourceFixture() {
  const state = createBundleBuildState()
  const opts = {
    cache: createCache(),
    cssMatcher: (file: string) => file.endsWith('.css'),
    htmlMatcher: (file: string) => file.endsWith('.wxml'),
    jsMatcher: (file: string) => file.endsWith('.js'),
    wxsMatcher: () => false,
  } as InternalUserDefinedOptions
  const snapshotFor = (sources: Record<string, string>, partial = false, removedFiles: string[] = []) => {
    const bundle = Object.fromEntries(Object.entries(sources).map(([fileName, source]) => [
      fileName,
      fileName.endsWith('.js')
        ? { type: 'chunk', fileName, code: source, isEntry: true } as OutputChunk
        : { type: 'asset', fileName, source } as OutputAsset,
    ]))
    return buildBundleSnapshot(bundle, opts, process.cwd(), state, false, {
      hasOmittedKnownFiles: partial,
      removedFiles,
    })
  }
  return { state, snapshotFor }
}

describe('vite css linked source identity', () => {
  it('keeps identity through unchanged and non-runtime edits regardless of entry order', () => {
    const { state, snapshotFor } = createLinkedSourceFixture()
    const first = snapshotFor({
      'page.js': 'const cls = "flex"; const stamp = 1',
      'page.wxml': '<view class="underline" />',
    })
    const signature = resolveViteCssLinkedImpactSignature({ snapshot: first, state })
    updateBundleBuildState(state, first, new Map())
    const unchanged = snapshotFor({
      'page.wxml': '<view class="underline" />',
      'page.js': 'const cls = "flex"; const stamp = 1',
    })
    expect(unchanged.runtimeAffectingSignatureByFile.size).toBe(0)
    expect(resolveViteCssLinkedImpactSignature({ snapshot: unchanged, state })).toBe(signature)
    const edited = snapshotFor({
      'page.js': 'const cls = "flex"; const stamp = 2',
      'page.wxml': '<view class="underline" />',
    })
    expect(edited.changedByType.js.has('page.js')).toBe(true)
    expect(edited.runtimeAffectingChangedByType.js.size).toBe(0)
    expect(resolveViteCssLinkedImpactSignature({ snapshot: edited, state })).toBe(signature)
  })

  it('invalidates candidate changes and complete-bundle source deletion', () => {
    const { state, snapshotFor } = createLinkedSourceFixture()
    const first = snapshotFor({ 'page.js': 'const cls = "flex"', 'page.wxml': '<view class="underline" />' })
    const signature = resolveViteCssLinkedImpactSignature({ snapshot: first, state })
    updateBundleBuildState(state, first, new Map())
    const edited = snapshotFor({ 'page.js': 'const cls = "grid"', 'page.wxml': '<view class="underline" />' })
    expect(resolveViteCssLinkedImpactSignature({ snapshot: edited, state })).not.toBe(signature)
    const deleted = snapshotFor({ 'page.js': 'const cls = "flex"' })
    expect(resolveViteCssLinkedImpactSignature({ snapshot: deleted, state })).not.toBe(signature)
  })

  it('retains omitted sources in partial bundles and removes explicit deletions', () => {
    const { state, snapshotFor } = createLinkedSourceFixture()
    const first = snapshotFor({ 'page.js': 'const cls = "flex"', 'page.wxml': '<view class="underline" />' })
    const signature = resolveViteCssLinkedImpactSignature({ snapshot: first, state })
    updateBundleBuildState(state, first, new Map())
    const partial = snapshotFor({ 'page.js': 'const cls = "flex"; const stamp = 2' }, true)
    expect(resolveViteCssLinkedImpactSignature({ snapshot: partial, state })).toBe(signature)
    updateBundleBuildState(state, partial, new Map(), { incremental: true })
    const deleted = snapshotFor({}, true, ['page.wxml'])
    expect(resolveViteCssLinkedImpactSignature({ snapshot: deleted, state })).not.toBe(signature)
  })
})
