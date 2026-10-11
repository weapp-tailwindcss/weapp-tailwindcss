import { describe, expect, it } from 'vitest'
import { createScopedGeneratorRuntime } from '@/bundlers/vite/generate-bundle/scoped-generator'
import { memoizeScopedGeneratorRuntime } from '@/bundlers/vite/generate-bundle/scoped-generator-runtime-cache'
import { createScopedGeneratorSourceData } from '@/bundlers/vite/generate-bundle/scoped-generator-sources'
import { createSourceCandidateCollector } from '@/bundlers/vite/source-candidates'

describe('Vite 多入口显式空范围', () => {
  it.each(['/styles/first.css', String.raw`C:\styles\first.css`, '/first.css', 'styles/first.css'])('空入口不引入页面候选且不复用普通生成缓存：%s', async (sourceFile) => {
    const collector = createSourceCandidateCollector({ extractor: source => source.split(/\s+/) })
    await collector.sync('/pages/index.vue', 'w-32 h-32')
    const runtime = collector.values()
    const rawSource = '@import "tailwindcss" source(none);'
    const resolve = memoizeScopedGeneratorRuntime((outputFile, cssHandlerOptions, fallbackRuntime, rawSource, sourceFile, scopeToSource) => createScopedGeneratorRuntime({
      outputFile,
      cssHandlerOptions,
      fallbackRuntime,
      rawSource,
      sourceFile,
      scopeToSource,
      majorVersion: 4,
      getSourceCandidatesForEntries: collector.valuesForEntries,
      scopedSourceCandidateGetter: undefined,
      shouldExcludeSubpackageSourceCandidates: () => false,
    }))
    expect(await resolve('theme.acss', {}, runtime, rawSource, sourceFile)).toEqual(runtime)
    const result = await createScopedGeneratorSourceData({
      createScopedGeneratorRuntime: resolve,
      createScopedGeneratorSourceTraceMap: async () => undefined,
      generatorCssHandlerOptions: {},
      generatorRawSource: rawSource,
      generatorRuntime: runtime,
      generatorSourceFile: sourceFile,
      rememberedCssSources: [
        { outputFile: 'theme.acss', rawSource, sourceFile },
        { outputFile: 'theme.acss', rawSource, sourceFile: 'other.css' },
      ],
      scopedSourceCandidateSourceGetter: undefined,
      outputFile: 'theme.acss',
    })
    expect(result.scopedGeneratorRuntime).toEqual(new Set())
    expect(await resolve('theme.acss', {}, runtime, rawSource, sourceFile)).toEqual(runtime)
  })
})
