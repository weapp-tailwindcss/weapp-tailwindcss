import type { OutputAsset } from 'rollup'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createViteCssAssetIdentityResolver } from '@/bundlers/vite/css-asset-identity'
import { resolveViteCssTransformDecisionPlan } from '@/bundlers/vite/generate-bundle/css-transform-decision-plan'

describe('已完成的 Vite CSS 编译结果', () => {
  it.each([
    ['/workspace', 'feature/card.uvue', '/workspace/feature/card.uvue'],
    ['/', 'feature/card.uvue', '/feature/card.uvue'],
    ['workspace', 'feature/card.uvue', path.resolve('workspace', 'feature/card.uvue')],
    ['/workspace', '/other/card.uvue', '/other/card.uvue'],
    ['C:\\workspace', 'feature\\card.uvue', 'C:\\workspace\\feature\\card.uvue'],
    ['D:\\workspace', 'feature/card.uvue', 'D:\\workspace\\feature\\card.uvue'],
    ['C:\\workspace', 'D:\\other\\card.uvue', 'D:\\other\\card.uvue'],
  ])('以 Vite root %s 识别资产来源 %s', (root, originalFileName, sourceFile) => {
    const resolveIdentity = createViteCssAssetIdentityResolver({
      generatorPlaceholderFile: '/virtual/placeholder.css',
      getProjectRoot: () => root,
      isKnownProcessedSource: file => file === sourceFile,
    })
    const asset = { type: 'asset', fileName: 'assets/card-hash.css', originalFileNames: [originalFileName], source: '.probe{height:calc(var(--spacing,.25rem)*8)}' } as OutputAsset
    expect(resolveIdentity(asset, asset.fileName)).toEqual({ kind: 'bundler-generated', sourceFile })
    expect(resolveIdentity({ ...asset, originalFileNames: [] }, asset.fileName)).toEqual({ kind: 'user' })
  })

  function decision(overrides = {}) {
    return resolveViteCssTransformDecisionPlan({
      alreadyProcessedCssAsset: true,
      cssAssetIdentityKind: 'bundler-generated',
      cssAssetSourceFile: '/workspace/feature/card.uvue',
      cssIsMainChunk: false,
      generatorCandidateSignatureInitialized: false,
      generatorCandidatesChanged: true,
      generatorRawSource: '@reference "../theme.css"; .probe { @apply h-8; }',
      hasCurrentTailwindGenerationDirective: false,
      hasRememberedApplySource: true,
      hasRuntimeAffectingChanges: true,
      hasSameOutputRememberedTailwindGenerationSource: true,
      hasStaleViteProcessedCssSource: true,
      isCollectedBundlerGeneratedCssFile: false,
      isProcessCssFile: true,
      isRuntimeLinkedCss: false,
      rawSource: '.probe{height:calc(var(--spacing,.25rem)*8)}',
      rememberedRawSource: '@reference "../theme.css"; .probe { @apply h-8; }',
      shouldProcessTailwindGeneration: true,
      shouldRegenerateMainPackageCssWithScopedCandidates: false,
      useIncrementalMode: false,
      vitePipelineCssAsset: true,
      viteProcessedCssAsset: true,
      ...overrides,
    })
  }

  it('首次完整构建复用框架已编译的 apply 结果，保留压缩和合并的作者样式', () => {
    expect(decision().shouldReuseProcessedCss).toBe(true)
  })

  it.each([
    { useIncrementalMode: true },
    { cssAssetIdentityKind: 'user' },
    { cssAssetSourceFile: undefined },
    { cssAssetIdentityKind: 'generator-placeholder' },
    { alreadyProcessedCssAsset: false },
    { rawSource: '.probe{@apply h-8}' },
    { rawSource: '@import "tailwindcss";' },
    { shouldRegenerateMainPackageCssWithScopedCandidates: true },
  ])('不跳过仍需生成或发生增量变化的资产 %j', (overrides) => {
    expect(decision(overrides).shouldReuseProcessedCss).toBe(false)
  })
})
