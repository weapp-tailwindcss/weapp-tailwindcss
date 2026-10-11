import type { OutputAsset } from 'rollup'
import { describe, expect, it, vi } from 'vitest'
import { createMergedCssSourceTraceMap } from '@/bundlers/vite/generate-bundle/source-trace'
import { resolveViteCssCompositionPlan } from '@/bundlers/vite/generate-bundle/css-composition-plan'
import { resolveViteCssSourcePlan } from '@/bundlers/vite/generate-bundle/css-source-plan'
import { resolveRememberedCssSourcePlan } from '@/bundlers/vite/generate-bundle/remembered-css-plan'

import { createDeferredCssSourceMarker } from '@weapp-tailwindcss/postcss/transform'
function createAsset(fileName: string, source = ''): OutputAsset {
  return {
    fileName,
    name: undefined,
    needsCodeReference: false,
    originalFileName: undefined,
    originalFileNames: [],
    source,
    type: 'asset',
  }
}

function createOptions(overrides: Partial<Parameters<typeof resolveRememberedCssSourcePlan>[0]> = {}) {
  return {
    configuredSourceFileKeys: new Set<string>(),
    cssMatcher: (file: string) => file.endsWith('.wxss'),
    currentRawSourceHasExplicitScanContext: false,
    debug: vi.fn(),
    explicitConfiguredSourceFileKeys: new Set<string>(),
    file: 'pages/index/index.wxss',
    getRememberedCssSources: () => new Map(),
    getSfcSource: undefined,
    hasExplicitConfiguredRootSource: false,
    normalizeConfiguredSourceFile: (file: string) => file.replace(/[?#].*$/, ''),
    originalSource: createAsset('pages/index/index.wxss'),
    outputFile: 'pages/index/index.wxss',
    outputRoot: '/repo/dist',
    rawSource: '',
    resolveConfiguredRootSource: () => undefined,
    resolveMatchedOutputFile: () => undefined,
    resolveTemporarySource: () => undefined,
    shouldKeepCurrentRootOutput: () => false,
    snapshot: { entries: [] } as any,
    sourceRoot: '/repo/src',
    temporaryOutput: false,
    ...overrides,
  }
}

  function createCssSourceOptions(
    overrides: Partial<Parameters<typeof resolveViteCssSourcePlan>[0]> = {},
  ) {
    return {
      ...createOptions(),
      configuredEntries: [],
      cwd: '/repo/src',
      getSourceStyleSource: undefined,
      getSourceStyleSources: undefined,
      inferenceSourceRoot: '/repo/src',
      isConfiguredSourceProcessed: () => false,
      isConfiguredSourceUsed: () => false,
      isCurrentRootMiniProgramStyleOutput: false,
      projectRoot: '/repo',
      selectConfiguredRootSource: () => undefined,
      shouldKeepRootImportShell: () => false,
      ...overrides,
    }
  }

  function createCompositionOptions(
    overrides: Partial<Parameters<typeof resolveViteCssCompositionPlan>[0]> = {},
  ) {
    return {
      assetSourceFile: 'pages/index/index.wxss',
      configuredSourceFileKeys: new Set<string>(),
      cssEntries: undefined,
      cssMatcher: (file: string) => file.endsWith('.wxss'),
      explicitSourceFileKeys: new Set<string>(),
      file: 'pages/index/index.wxss',
      getCssHandlerOptions: () => ({ isMainChunk: false }),
      getOriginalCssLayerSource: undefined,
      isRootStyleOutputFile: (file: string) => !file.includes('/') && file.endsWith('.wxss'),
      isWebGeneratorTarget: false,
      normalizeConfiguredSourceFile: (file: string) => file,
      normalizeGeneratorSource: (source: string) => source,
      normalizeGeneratorUserSource: (source: string) => source,
      outputCssHandlerOptions: { isMainChunk: false },
      outputFile: 'pages/index/index.wxss',
      rawSource: '.page{}',
      rememberedSources: [],
      resolveConfiguredRootInjectionTarget: () => undefined,
      resolveMatchedOutputFile: () => undefined,
      resolvedFromTemporarySource: false,
      rootImportShellOutputFile: 'app.wxss',
      shouldKeepImportedCssShell: false,
      shouldKeepRootImportShell: false,
      shouldMoveRootImportShellToOrigin: false,
      shouldSkipRememberedSource: () => false,
      viteProcessedCssAsset: false,
      ...overrides,
    }
  }


describe('双入口的构建图来源归属', () => {
  it.each([
    ['/project/alpha.css', '/project/nested/beta.css', '/project', '/project/nested'],
    [String.raw`C:\project\alpha.css`, String.raw`D:\styles\beta.css`, String.raw`C:\project`, String.raw`D:\styles`],
    ['alpha.css', 'nested/beta.css', '.', 'nested'],
    ['/alpha.css', '/beta.css', '/', '/'],
  ])('按每个来源解析目录，不使用输出目录：%s', async (first, second, firstBase, secondBase) => {
    const sources = new Map([[first, '@import "tailwindcss" source(none); @source "./first.vue";'], [second, '@import "tailwindcss" source(none);']])
    const rawSource = [...sources.keys()].map(createDeferredCssSourceMarker).join('\n')
    const plan = await resolveViteCssSourcePlan(createCssSourceOptions({
      outputFile: 'renamed/bundle.acss', rawSource,
      getSourceStyleSource: file => sources.get(file),
      currentRawSourceHasExplicitScanContext: true,
    }))
    expect(plan.sources.map(source => source.sourceFile)).toEqual([first, second])
    const composition = resolveViteCssCompositionPlan(createCompositionOptions({
      outputFile: plan.outputFile, rawSource, rememberedSources: plan.sources,
    }))
    expect(composition.generatorCssHandlerOptions.sourceOptions).toMatchObject({
      cssEntries: [first, second],
      cssSources: [
        { file: first, base: firstBase, css: sources.get(first) },
        { file: second, base: secondBase, css: sources.get(second) },
      ],
    })
  })

  it('临时 CSS 资产保留当前资产身份，避免直接写入框架最终输出', async () => {
    const sourceFile = '/project/pages/index.css'
    const rawSource = createDeferredCssSourceMarker(sourceFile)
    const plan = await resolveViteCssSourcePlan(createCssSourceOptions({
      file: 'index.css',
      outputFile: 'index.css',
      rawSource,
      temporaryOutput: true,
      getSourceStyleSource: file => file === sourceFile ? '@import "tailwindcss";' : undefined,
      resolveMatchedOutputFile: () => 'pages/index/index.acss',
    }))
    expect(plan.outputFile).toBe('index.css')
    expect(plan.sources[0]?.outputFile).toBe('index.css')
  })

  it('Web 或页面 CSS 保留当前输出资产，不复用小程序根入口映射', async () => {
    const sourceFile = '/project/pages/index.css'
    const plan = await resolveViteCssSourcePlan(createCssSourceOptions({
      file: 'assets/index.css',
      outputFile: 'assets/index.css',
      rawSource: createDeferredCssSourceMarker(sourceFile),
      getSourceStyleSource: () => '@import "tailwindcss";',
      resolveMatchedOutputFile: () => 'main.css',
    }))
    expect(plan.outputFile).toBe('assets/index.css')
    expect(plan.sources[0]?.outputFile).toBe('assets/index.css')
  })

  it('同一缓存按当前资产标记隔离来源，导入移除和恢复不沿用旧入口', async () => {
    const sources = new Map([['/alpha.css', '@import "tailwindcss";'], ['/beta.css', '@import "tailwindcss"; @source "./beta.vue";']])
    for (const files of [['/alpha.css', '/beta.css'], ['/alpha.css'], ['/beta.css'], ['/beta.css', '/alpha.css']]) {
      const plan = await resolveViteCssSourcePlan(createCssSourceOptions({
        rawSource: files.map(createDeferredCssSourceMarker).join(''),
        getSourceStyleSource: file => sources.get(file),
        getRememberedCssSources: () => new Map([...sources].map(([sourceFile, rawSource]) => [sourceFile, { sourceFile, rawSource, outputFile: 'stale.wxss' }])),
      }))
      expect(plan.sources.map(source => source.sourceFile)).toEqual(files)
    }
    sources.set('/beta.css', '@import "tailwindcss" source(none);')
    const plan = await resolveViteCssSourcePlan(createCssSourceOptions({
      rawSource: createDeferredCssSourceMarker('/beta.css'),
      getSourceStyleSource: file => sources.get(file),
    }))
    expect(plan.sources[0]?.rawSource).toBe(sources.get('/beta.css'))
  })

  it('缺失来源缓存时明确报错，不用输出目录或全局入口降级', async () => {
    await expect(resolveViteCssSourcePlan(createCssSourceOptions({
      rawSource: ['/alpha.css', '/missing.css'].map(createDeferredCssSourceMarker).join(''),
      getSourceStyleSource: file => file === '/alpha.css' ? '@import "tailwindcss";' : undefined,
    }))).rejects.toThrow('Missing transformed CSS source for deferred generation: /missing.css')
  })
})

it('来源标注合并同名候选但不丢掉文件归属', async () => {
  const sources = [{ sourceFile: '/first.css', rawSource: '' }, { sourceFile: '/second.css', rawSource: '' }]
  const result = await createMergedCssSourceTraceMap(sources, async source => new Map([['owned', new Set([source.sourceFile])]]))
  expect(result).toEqual(new Map([['owned', new Set(['/first.css', '/second.css'])]]))
})
