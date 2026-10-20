import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping'
import { stripBundlerGeneratedCssMarkers } from '@weapp-tailwindcss/postcss/transform'
import { describe, expect, it, vi } from 'vitest'
import { sources } from 'webpack'
import { createCache } from '@/cache'
import { processWebpackGeneratedCssAsset } from '../../src/bundlers/webpack/BaseUnifiedPlugin/v5-assets/generated-css-task'
import { preserveProcessedWebpackCssSource } from '../../src/bundlers/webpack/BaseUnifiedPlugin/v5-assets/processed-css-source'
import { processWebpackProcessedCssAsset } from '../../src/bundlers/webpack/BaseUnifiedPlugin/v5-assets/processed-css-task'

describe('已处理 Web CSS 的来源映射', () => {
  it('没有本插件元数据时保留原 Source 身份', () => {
    const source = new sources.OriginalSource('.business { color: red }', 'business.css')
    expect(preserveProcessedWebpackCssSource(source, sources)).toBe(source)
  })

  it.each(['\n', '\r\n'])('多个模块与元数据删除后仍映射到原业务位置：%j', (newline) => {
    const first = [
      '/*! weapp-tailwindcss webpack-generated-css:%2Fstyles%2Fa.css */',
      '.first { color: red }',
      '/*! weapp-tailwindcss webpack-generated-css-end:%2Fstyles%2Fa.css */',
    ].join(newline)
    const second = [
      '/*! weapp-tailwindcss deferred-source:C%3A%5Cstyles%5Cb.css */',
      '.second { color: blue }',
      '/*$vite$:1*/',
      '.last { width: 17px }',
    ].join(newline)
    const source = new sources.ConcatSource(new sources.OriginalSource(first, '/styles/a.css'), newline, new sources.OriginalSource(second, 'C:\\styles\\b.css'))
    const result = preserveProcessedWebpackCssSource(source, sources)
    const text = result.source().toString()
    expect(text).not.toContain('weapp-tailwindcss')
    expect(text).not.toContain('$vite$')
    const map = new TraceMap(result.map() as ConstructorParameters<typeof TraceMap>[0])
    for (const [token, file, line] of [['red', '/styles/a.css', 2], ['blue', 'C:\\styles\\b.css', 2], ['17px', 'C:\\styles\\b.css', 4]] as const) {
      const prefix = text.slice(0, text.indexOf(token)).split('\n')
      const origin = originalPositionFor(map, { line: prefix.length, column: prefix.at(-1)!.length })
      expect(origin).toMatchObject({ source: file, line })
    }
  })

  it.each([
    ['生成注册表消费', processWebpackGeneratedCssAsset],
    ['已处理资产', processWebpackProcessedCssAsset],
  ] as const)('%s 在相同 CSS 重新编译后使用本轮框架映射', async (_name, processAsset) => {
    const css = '/*! weapp-tailwindcss webpack-generated-css:theme.css */\n.business { color: red }'
    const sourceFile = '/styles/theme.css'
    const context = {
      ConcatSource: sources.ConcatSource,
      compilerOptions: { cache: createCache() },
      affectedCompilationScopes: new Set(),
      assetHashByChunk: new Map(),
      compilation: { fileDependencies: new Set() },
      configuredCssEntryFiles: [sourceFile],
      configuredMainCssEntryFiles: [],
      createRuntimeSetHash: () => 'stable',
      cssSources: new Map([[sourceFile, { css }]]),
      generatedCssSources: new Map([[sourceFile, { css, classSet: new Set(['business']), dependencies: [] }]]),
      getCssHandlerOptions: () => ({ isMainChunk: false, sourceOptions: { sourceFile } }),
      getGeneratorRuntimeSet: () => new Set(),
      getCompilationDependencyRevision: () => 0,
      resolveWebpackCssSourceFile: () => sourceFile,
      hasConfiguredTailwindV4SourceRoots: () => false,
      isKnownWebpackProcessedCssAsset: () => true,
      isWebGeneratorTarget: true,
      processedCssAssetSkipDecisionCache: new Map(),
      generatorRuntimeSet: new Set(),
      transformRuntimeSet: new Set(),
      runtimeState: { readyPromise: Promise.resolve() },
      preserveProcessedWebCssAsset: (source: sources.Source) => preserveProcessedWebpackCssSource(source, sources),
      rememberProcessCacheKey: vi.fn(),
      debug: vi.fn(),
      enqueueTask: async (task: () => Promise<void>) => task(),
      finalizeCssAssetSource: stripBundlerGeneratedCssMarkers,
      finalizeTracedCss: (value: string) => value,
      updateAssetIfChanged: vi.fn(),
    }
    for (const origin of ['first.css', 'second.css']) {
      await processAsset(['theme.css', new sources.OriginalSource(css, origin)], context)
      const output = context.updateAssetIfChanged.mock.lastCall![1] as sources.Source
      expect(output.source().toString()).not.toContain('weapp-tailwindcss')
      const map = new TraceMap(output.map() as ConstructorParameters<typeof TraceMap>[0])
      expect(originalPositionFor(map, { line: 1, column: 20 })).toMatchObject({ source: origin, line: 2 })
    }
  })
})
