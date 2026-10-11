import { describe, expect, it, vi } from 'vitest'
import { processRememberedCssReplay } from '@/bundlers/vite/generate-bundle/remembered-css-replay'

describe('Vite 本轮 CSS 写入与历史回放', () => {
  it.each([
    ['theme-bundle.acss', new Map<string, string>()],
    ['legacy-shell.acss', new Map([['legacy-shell.acss', 'theme-bundle.acss']])],
  ])('本轮已计划写入的输出不再排入旧回放：%s', async (rememberedOutputFile, frameworkRootImportShellTargetByFile) => {
    const freshTask = vi.fn(async () => {})
    const cssTaskFactories = [freshTask]
    const createScopedGeneratorRuntime = vi.fn(async () => {
      throw new Error('当前产物已有生成计划，不应读取旧来源生成候选')
    })
    await expect(processRememberedCssReplay({
      activeViteCssCacheFiles: new Set(['planned:theme-bundle.acss']),
      bundle: {},
      bundleFiles: ['current-shell.acss'],
      createScopedGeneratorRuntime,
      cssTaskFactories,
      debug: vi.fn(),
      defaultStyleOutputExtension: '.acss',
      frameworkRootImportShellTargetByFile,
      getCssHandlerOptions: () => ({}),
      getRememberedCssSources: () => new Map([['legacy', {
        outputFile: rememberedOutputFile,
        rawSource: '@import "tailwindcss" source(none);',
        sourceFile: rememberedOutputFile,
      }]]),
      isWebGeneratorTarget: false,
      lastCssResultByFile: new Map(),
      normalizeViteCssCacheKey: (file: string) => file,
      opts: {
        cssMatcher: (file: string) => file.endsWith('.acss'),
        htmlMatcher: (file: string) => file.endsWith('.axml'),
      },
      rootDir: '/project',
      shouldPreserveAppCssExtension: false,
      createScopedSourceCandidateGetter: () => undefined,
      createScopedSourceCandidateSourceGetter: () => undefined,
    } as unknown as Parameters<typeof processRememberedCssReplay>[0])).resolves.toBeUndefined()
    expect(createScopedGeneratorRuntime).not.toHaveBeenCalled()
    expect(cssTaskFactories).toEqual([freshTask])
  })
})
