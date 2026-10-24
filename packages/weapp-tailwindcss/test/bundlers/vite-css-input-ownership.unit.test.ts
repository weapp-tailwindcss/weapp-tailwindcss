import type { CssCompositionHandlerOptions, ResolveViteCssCompositionPlanOptions } from '@/bundlers/vite/generate-bundle/css-composition-plan'
import type { RememberedCssSource } from '@/bundlers/vite/generate-bundle/types'
import { describe, expect, it, vi } from 'vitest'
import { createBundlerGeneratedCssMarker } from '@/bundlers/shared/generated-css-marker'
import { createViteCssMemory } from '@/bundlers/vite/css-memory'
import { resolveViteCssCompositionPlan } from '@/bundlers/vite/generate-bundle/css-composition-plan'

const outputFile = 'feature/components/card.acss'
const bundleSource = '@import "../framework.acss";.card[data-v-current]{width:11rpx}.framework{color:blue}'

function compose(options: {
  remembered: RememberedCssSource
  rawSource?: string
  viteProcessedCssAsset?: boolean
  shouldKeepImportedCssShell?: boolean
}) {
  const input: ResolveViteCssCompositionPlanOptions<CssCompositionHandlerOptions> = {
    assetSourceFile: options.remembered.sourceFile,
    configuredSourceFileKeys: new Set(),
    cssEntries: undefined,
    cssMatcher: file => file.endsWith('.acss'),
    explicitSourceFileKeys: new Set(),
    file: outputFile,
    getCssHandlerOptions: () => ({ isMainChunk: false }),
    getOriginalCssLayerSource: undefined,
    isRootStyleOutputFile: () => false,
    isWebGeneratorTarget: false,
    normalizeConfiguredSourceFile: file => file,
    normalizeGeneratorSource: source => source,
    normalizeGeneratorUserSource: source => source,
    outputCssHandlerOptions: { isMainChunk: false },
    outputFile,
    rawSource: options.rawSource ?? bundleSource,
    rememberedSources: [options.remembered],
    resolveConfiguredRootInjectionTarget: () => undefined,
    resolveMatchedOutputFile: () => undefined,
    resolvedFromTemporarySource: false,
    rootImportShellOutputFile: outputFile,
    shouldKeepImportedCssShell: options.shouldKeepImportedCssShell ?? false,
    shouldKeepRootImportShell: false,
    shouldMoveRootImportShellToOrigin: false,
    shouldSkipRememberedSource: () => false,
    viteProcessedCssAsset: options.viteProcessedCssAsset ?? false,
  }
  return resolveViteCssCompositionPlan(input)
}

describe('Vite 作者生成输入与本轮产物的所有权', () => {
  it.each([
    '/project/feature/components/card.css',
    '/card.css',
    'feature/components/card.css',
    String.raw`C:\project\feature\components\card.css`,
    String.raw`D:\card.css`,
    outputFile,
  ])('普通作者来源 %s 不覆盖本轮框架编译结果', (sourceFile) => {
    for (const viteProcessedCssAsset of [false, true]) {
      const plan = compose({
        remembered: { outputFile, sourceFile, rawSource: '.card{width:11rpx}' },
        viteProcessedCssAsset,
      })
      expect(plan.generatorRawSource).toBe(bundleSource)
      expect(plan.vitePipelineCssAsset).toBe(viteProcessedCssAsset)
    }
  })

  it.each([
    '@import "tailwindcss";',
    '@tailwind utilities;',
    '@source inline("w-[17px]");',
    '@reference "../theme.css";.card{@apply w-[17px]}',
    '@theme{--color-brand:blue}',
  ])('明确的作者生成指令仍可恢复：%s', (rawSource) => {
    for (const viteProcessedCssAsset of [false, true]) {
      const sourceFile = '/project/feature/components/card.css'
      const plan = compose({ remembered: { outputFile, sourceFile, rawSource }, viteProcessedCssAsset })
      expect(plan.generatorRawSource).toBe(rawSource)
      expect(plan.generatorSourceFile).toBe(sourceFile)
      expect(plan.vitePipelineCssAsset).toBe(true)
    }
  })

  it('已处理标记不能使保留的导入壳改用作者生成源', () => {
    const rawSource = '@import "../framework.acss";'
    const plan = compose({
      remembered: { outputFile, sourceFile: '/project/entry.css', rawSource: '@import "tailwindcss";' },
      rawSource,
      shouldKeepImportedCssShell: true,
      viteProcessedCssAsset: true,
    })
    expect(plan.generatorRawSource).toBe(rawSource)
    expect(plan.preserveImportedCssShell).toBe(true)
  })

  it.each([
    ['/project/card.css', '/project/card.css'],
    ['/card.css', '/card.css'],
    ['feature/card.css', 'feature/card.css'],
    [String.raw`C:\project\card.css`, 'C:/project/card.css'],
    [String.raw`D:\card.css`, 'D:/card.css'],
  ])('回滚只替换本轮生成标记证明归属的旧载荷：%s', (sourceFile, markerFile) => {
    const rawSource = '.clean{display:block}'
    const remembered = { kind: 'generation' as const, outputFile, sourceFile, rawSource }
    const stale = '.old{@apply w-[17px]}'
    expect(compose({
      remembered,
      rawSource: `${createBundlerGeneratedCssMarker('vite', markerFile)}${stale}`,
      viteProcessedCssAsset: true,
    }).generatorRawSource).toBe(rawSource)
    const unrelatedBundle = `${createBundlerGeneratedCssMarker('vite', `${markerFile}.other`)}${stale}`
    expect(compose({ remembered, rawSource: unrelatedBundle, viteProcessedCssAsset: true }).generatorRawSource).toBe(unrelatedBundle)
    expect(compose({ remembered, viteProcessedCssAsset: true }).generatorRawSource).toBe(bundleSource)
  })

  it.each([false, true])('输出导入壳角色在作者源刷新后失效，即使内容相同=%s', async (sameContent) => {
    const sourceFile = '/project/entry.css'
    const rawSource = '@import "./generated.acss";'
    const memory = createViteCssMemory({ debug: vi.fn(), getSourceCandidateSource: () => sameContent ? rawSource : '.entry{color:blue}' })
    try {
      memory.rememberCssSource({ kind: 'output-import-shell', outputFile, sourceFile, rawSource })
      expect(compose({ remembered: memory.getRememberedCssSourceEntry(outputFile)! }).generatorRawSource).toBe(rawSource)
      await memory.refreshRememberedCssSourceByCurrentFile(sourceFile)
      const refreshed = memory.getRememberedCssSourceEntry(outputFile)!
      expect(refreshed.kind).toBeUndefined()
      expect(compose({ remembered: refreshed, viteProcessedCssAsset: true }).generatorRawSource).toBe(bundleSource)
    }
    finally {
      memory.dispose()
    }
  })

  it('watch 删除最后一条生成指令后采用本轮产物，恢复指令后重新使用作者源', async () => {
    const sourceFile = '/project/feature/components/card.css'
    let currentSource = '.card{@apply w-[17px]}'
    const memory = createViteCssMemory({ debug: vi.fn(), getSourceCandidateSource: () => currentSource })
    try {
      memory.rememberCssSource({ outputFile, sourceFile, rawSource: currentSource })
      expect(compose({ remembered: memory.getRememberedCssSourceEntry(outputFile)! }).generatorRawSource).toBe(currentSource)

      currentSource = '.card{width:11rpx}'
      await memory.refreshRememberedCssSourceByCurrentFile(sourceFile)
      const updated = compose({ remembered: memory.getRememberedCssSourceEntry(outputFile)!, viteProcessedCssAsset: true })
      expect(updated.generatorRawSource).toBe(bundleSource)
      expect(updated.hasRememberedApplySource).toBe(false)
      expect(updated.hasSameOutputRememberedTailwindGenerationSource).toBe(false)

      currentSource = '.card{@apply w-[23px]}'
      await memory.refreshRememberedCssSourceByCurrentFile(sourceFile)
      expect(compose({ remembered: memory.getRememberedCssSourceEntry(outputFile)!, viteProcessedCssAsset: true }).generatorRawSource).toBe(currentSource)
    }
    finally {
      memory.dispose()
    }
  })
})
