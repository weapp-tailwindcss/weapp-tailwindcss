import type { RememberedCssSource } from '@/bundlers/vite/generate-bundle/types'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { createScopedGeneratorCandidateSignature } from '@/bundlers/vite/generate-bundle/scoped-generator'
import { createScopedGeneratorCandidateSignatureForSources, createScopedGeneratorSourceData } from '@/bundlers/vite/generate-bundle/scoped-generator-sources'
import { createCandidateSignature } from '@/bundlers/vite/generate-bundle/signatures'

describe('Vite 生成来源签名契约', () => {
  it('无记忆来源时可用不含产物归属的当前源码生成签名', async () => {
    const runtime = new Set(['text-white'])
    const data = await createScopedGeneratorSourceData({
      createScopedGeneratorRuntime: async () => runtime,
      createScopedGeneratorSourceTraceMap: async () => undefined,
      generatorCssHandlerOptions: {},
      generatorRawSource: '@import "tailwindcss";',
      generatorRuntime: runtime,
      generatorSourceFile: 'styles/entry.css',
      rememberedCssSources: [],
      scopedSourceCandidateSourceGetter: undefined,
      outputFile: 'assets/entry.acss',
    })

    expectTypeOf(data.signatureSources).toEqualTypeOf<Pick<RememberedCssSource, 'rawSource' | 'sourceFile'>[]>()
    expect(data.signatureSources).toEqual([{
      rawSource: '@import "tailwindcss";',
      sourceFile: 'styles/entry.css',
    }])
    expect(data.scopedGeneratorRuntime).toBe(runtime)
    const signature = await createScopedGeneratorCandidateSignatureForSources({
      createScopedGeneratorCandidateSignature,
      generatorCssHandlerOptions: {},
      majorVersion: undefined,
      scopedSourceCandidateGetter: undefined,
      signatureSources: data.signatureSources,
      trackedGeneratorCandidateSignature: 'fallback',
    })
    expect(JSON.parse(signature)).toEqual([['styles/entry.css', 'fallback']])
  })

  it.each([true, false, undefined])('多来源仅在主入口标记为 true 时合并全局签名：%s', async (isMainChunk) => {
    const candidates = new Set(['text-white'])
    const scoped = createCandidateSignature(candidates)
    const signature = await createScopedGeneratorCandidateSignatureForSources({
      createScopedGeneratorCandidateSignature,
      generatorCssHandlerOptions: { isMainChunk },
      majorVersion: undefined,
      scopedSourceCandidateGetter: () => candidates,
      signatureSources: [
        { rawSource: '@source "./first.wxml";', sourceFile: 'styles/first.css' },
        { rawSource: '@source "./second.wxml";', sourceFile: 'styles/second.css' },
      ],
      trackedGeneratorCandidateSignature: 'fallback',
    })
    const expected = isMainChunk === true ? `${scoped}:fallback` : scoped
    expect(JSON.parse(signature)).toEqual([
      ['styles/first.css', expected],
      ['styles/second.css', expected],
    ])
  })
})
