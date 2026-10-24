import type { OutputBundle } from 'rollup'
import type { RememberedCssSource } from '@/bundlers/vite/generate-bundle'
import { describe, expect, it, vi } from 'vitest'
import { createViteCssMemory } from '@/bundlers/vite/css-memory'
import { selectUnbundledCssReplaySources } from '@/bundlers/vite/generate-bundle/bundled-css-sources'
import { processRememberedCssReplay } from '@/bundlers/vite/generate-bundle/remembered-css-replay'
import { createRollupChunk } from './vite-plugin.testkit'

function bundleWithModules(ids: string[], metadata: 'moduleIds' | 'modules' = 'moduleIds'): OutputBundle {
  return {
    'assets/entry.js': {
      ...createRollupChunk(''),
      fileName: 'assets/entry.js',
      moduleIds: metadata === 'moduleIds' ? ids : [],
      modules: metadata === 'modules' ? Object.fromEntries(ids.map(id => [id, { code: '', originalLength: 0, removedExports: [], renderedExports: [], renderedLength: 0 }])) : {},
    },
  }
}

function sourceEntry(sourceFile: string, delivery: RememberedCssSource['delivery'] = 'vite-module'): [string, RememberedCssSource] {
  return ['source', { sourceFile, delivery, outputFile: 'theme.css', rawSource: '@import "tailwindcss";' }]
}

describe('Vite 已提交样式模块与缺席来源回放', () => {
  it('没有通过模块提交的来源时不读取模块图', () => {
    const author = sourceEntry('/project/author.css')
    author[1].delivery = undefined
    const bundle: OutputBundle = {}
    Object.defineProperty(bundle, 'entry.js', {
      enumerable: true,
      get() {
        throw new Error('没有模块提交来源时不应读取 bundle')
      },
    })
    expect(selectUnbundledCssReplaySources([author], bundle, vi.fn())).toEqual([author])
  })

  it('一次性来源迭代器只消费一遍，缺席来源仍保留', () => {
    const present = sourceEntry('/project/present.css')
    const absent = sourceEntry('/project/absent.css')
    function* sources() {
      yield present
      yield absent
    }
    const onBundledSource = vi.fn()
    expect(selectUnbundledCssReplaySources(sources(), bundleWithModules([present[1].sourceFile]), onBundledSource)).toEqual([absent])
    expect(onBundledSource).toHaveBeenCalledExactlyOnceWith(present[1].sourceFile)
  })

  it.each([
    ['/workspace/theme.css', '/workspace/theme.css?direct'],
    ['/theme.css', '/theme.css#build'],
    ['C:\\workspace\\theme.css', 'C:/workspace/theme.css?direct'],
    ['D:\\theme.css', 'D:/theme.css'],
    ['theme.css', './theme.css?direct'],
    ['/workspace/Page.vue?vue&type=style&index=1&lang.css', '/workspace/Page.vue?type=style&index=1&scoped=abc&lang.css'],
  ])('按模块身份识别当前已提交来源：%s', (sourceFile, moduleId) => {
    const onBundledSource = vi.fn()
    expect(selectUnbundledCssReplaySources([sourceEntry(sourceFile)], bundleWithModules([moduleId]), onBundledSource)).toEqual([])
    expect(onBundledSource).toHaveBeenCalledExactlyOnceWith(sourceFile)
  })

  it('没有 importedCss 时仍使用当前模块成员，但不授予其他作者源回放豁免', () => {
    const delivered = sourceEntry('/project/generated.css')
    const author = sourceEntry('/project/author.css')
    author[1].delivery = undefined
    const onBundledSource = vi.fn()
    expect(selectUnbundledCssReplaySources([delivered, author], bundleWithModules([
      delivered[1].sourceFile,
      author[1].sourceFile,
    ], 'modules'), onBundledSource)).toEqual([author])
    expect(onBundledSource).toHaveBeenCalledExactlyOnceWith(delivered[1].sourceFile)
  })

  it.each([
    '/project/Page.vue',
    '/project/Page.vue?vue&type=script&lang.ts',
    '/project/Page.vue?vue&type=style&index=1&lang.css',
    '/project/Other.vue?vue&type=style&index=0&lang.css',
  ])('其他请求不能替代实际样式模块：%s', (moduleId) => {
    const source = sourceEntry('/project/Page.vue?vue&type=style&index=0&lang.css')
    expect(selectUnbundledCssReplaySources([source], bundleWithModules([moduleId]), vi.fn())).toEqual([source])
  })

  it('来源离开当前图后恢复缺席回放，下一轮不能继承旧成员关系', () => {
    const source = sourceEntry('/project/theme.css')
    const active = bundleWithModules([source[1].sourceFile])
    const removed = bundleWithModules(['/project/entry.ts'])
    expect(selectUnbundledCssReplaySources([source], active, vi.fn())).toEqual([])
    expect(selectUnbundledCssReplaySources([source], removed, vi.fn())).toEqual([source])
    expect(selectUnbundledCssReplaySources([source], active, vi.fn())).toEqual([])
  })

  it('产物回放不再生成已提交来源，并保留其会话缓存', async () => {
    const source = sourceEntry('/project/theme.css')
    const activeViteCssCacheFiles = new Set<string>()
    const cssTaskFactories: Array<() => Promise<void>> = []
    const generate = vi.fn(async () => {
      throw new Error('已提交模块不应再次生成独立资产')
    })
    await processRememberedCssReplay({
      activeViteCssCacheFiles,
      bundle: bundleWithModules([source[1].sourceFile]),
      bundleFiles: ['assets/entry.js', 'assets/current-hash.css'],
      createScopedGeneratorRuntime: generate,
      cssTaskFactories,
      getRememberedCssSources: () => [source],
      isWebGeneratorTarget: true,
      normalizeViteCssCacheKey: (file: string) => file,
      opts: { cssMatcher: (file: string) => file.endsWith('.css') },
      rootDir: '/project',
    } as unknown as Parameters<typeof processRememberedCssReplay>[0])
    expect(generate).not.toHaveBeenCalled()
    expect(cssTaskFactories).toEqual([])
    expect(activeViteCssCacheFiles).toEqual(new Set([source[1].sourceFile]))
  })

  it('同一来源改为产物生成输入后，旧记录不能继续声称已交给模块', () => {
    const memory = createViteCssMemory({ debug: vi.fn(), getSourceCandidateSource: () => undefined })
    const [, source] = sourceEntry('/project/theme.css')
    memory.rememberCssSource(source)
    memory.rememberCssSource({ ...source, outputFile: 'assets/theme.css' })
    memory.rememberCssSource({ ...source, outputFile: 'assets/current.css', delivery: undefined })
    expect([...memory.getRememberedCssSources().values()]).toHaveLength(3)
    expect([...memory.getRememberedCssSources().values()].every(entry => entry.delivery === undefined)).toBe(true)
    memory.dispose()
  })
})
