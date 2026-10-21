import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping'
import { Buffer } from 'node:buffer'
import { stripBundlerGeneratedCssMarkers } from '@weapp-tailwindcss/postcss/transform'
import { describe, expect, it, vi } from 'vitest'
import { sources } from 'webpack'
import { createCache } from '@/cache'
import { finalizeProcessedWebpackCssAssets } from '../../src/bundlers/webpack/BaseUnifiedPlugin/v5-assets/final-css-assets'
import { processWebpackGeneratedCssAsset } from '../../src/bundlers/webpack/BaseUnifiedPlugin/v5-assets/generated-css-task'
import { finalizeWebpackProcessAssets } from '../../src/bundlers/webpack/BaseUnifiedPlugin/v5-assets/finalize-assets'
import { annotateProcessedWebpackCssSource, preserveProcessedWebpackCssSource } from '../../src/bundlers/webpack/BaseUnifiedPlugin/v5-assets/processed-css-source'
import { processWebpackProcessedCssAsset } from '../../src/bundlers/webpack/BaseUnifiedPlugin/v5-assets/processed-css-task'

describe('已处理 Web CSS 的来源映射', () => {
  it.each([false, true].flatMap(buffer => ['', '\uFEFF', '\uFFFE'].map(bom => ({ buffer, bom }))))('完整资产的注册默认值插入保留中文、emoji 与业务来源映射：%j', ({ buffer, bom }) => {
    const registration = '@property --tw-space-y-reverse { syntax: "*"; inherits: false; initial-value: 0; }'
    const css = `${bom}@charset "UTF-8";\r\n@import "shared.css";\r\n/* 中文 😀 */\r\n${registration}\r\n:where(.reverse > :not(:last-child)){--tw-space-y-reverse:1}\r\n.business{width:24px}`
    const original = new sources.OriginalSource(css, 'C:\\styles\\entry.css')
    const input = buffer ? new sources.SourceMapSource(Buffer.from(css), 'entry.css', original.map()!) : original
    let output: sources.Source = input
    finalizeProcessedWebpackCssAssets({
      compilation: { getAsset: () => ({ name: 'entry.css', source: input, info: {} }) },
      cssFiles: ['entry.css'],
      sources,
      webCompat: true,
      updateAssetIfChanged: (_file, source) => { output = source as sources.Source; return true },
    })
    const text = output.source().toString()
    expect(text.indexOf('--tw-space-y-reverse: 0')).toBeLessThan(text.indexOf(':where(.reverse'))
    expect(text).toContain(css.slice(css.indexOf(registration)))
    const prefix = text.slice(0, text.indexOf('24px')).split('\n')
    const actual = originalPositionFor(new TraceMap(output.map() as ConstructorParameters<typeof TraceMap>[0]), { line: prefix.length, column: prefix.at(-1)!.length })
    expect(actual).toEqual(originalPositionFor(new TraceMap(original.map() as ConstructorParameters<typeof TraceMap>[0]), { line: 6, column: '.business{width:'.length }))
  })

  it('最终资产集合的冲突注册不能由模块阶段的局部分析绕过', () => {
    const css = '@property --tw-space-y-reverse{syntax:"*";inherits:false;initial-value:0}.utility{--tw-space-y-reverse:1}'
    const assets = new Map([
      ['entry.css', new sources.RawSource(css)],
      ['lazy.css', new sources.RawSource('@property --tw-space-y-reverse{syntax:"*";inherits:false;initial-value:2}')],
    ])
    const update = vi.fn()
    finalizeProcessedWebpackCssAssets({
      compilation: { getAsset: file => ({ name: file, source: assets.get(file)!, info: {} }) },
      cssFiles: assets.keys(), sources, webCompat: true, updateAssetIfChanged: update,
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('Buffer Source 以字符串偏移插入注释，不破坏中文或 emoji', () => {
    const css = '/* 中文 😀 */.card { width: 24px; }'
    const source = new sources.RawSource(Buffer.from(css))
    const tokens = new Map([['card', { token: 'card', sources: ['card.vue'] }]])
    const result = annotateProcessedWebpackCssSource(source, sources, tokens)
    expect(result.source().toString()).toBe('/* 中文 😀 *//*! tokens: card <= card.vue */\n.card { width: 24px; }')
  })

  it.each(['\n', '\r\n'].flatMap(newline => ['', '\uFEFF', '\uFFFE'].map(bom => ({ newline, bom }))))('只编辑来源注释，保留多模块正文、生成 container 及映射且重复执行稳定：%j', ({ newline, bom }) => {
    const first = `${bom}/* 中文 😀 */${newline}/* tokens: card <= stale.vue */${newline}.card { width: 24px; }`
    const second = `${newline}.container { width: 100%; }${newline}/*! tokens: stale <= deleted.vue */`
    const source = new sources.ConcatSource(new sources.OriginalSource(first, 'C:\\styles\\card.css'), new sources.OriginalSource(second, '/styles/layout.css'))
    const tokenSources = new Map([
      ['card', { token: 'card', sources: ['views/card.vue'] }],
      ['container', { token: 'container', sources: [] }],
    ])
    const result = annotateProcessedWebpackCssSource(source, sources, tokenSources)
    const css = result.source().toString()
    expect(css.startsWith(`${bom}/* 中文 😀 */`)).toBe(true)
    expect(css).toContain('/*! tokens: card <= views/card.vue */')
    expect(css).toContain('/*! tokens: container <= <tailwind generated> */')
    expect(css).toContain('.card { width: 24px; }')
    expect(css).toContain('.container { width: 100%; }')
    expect(css).not.toContain('stale.vue')
    expect(css).not.toContain('deleted.vue')
    expect(annotateProcessedWebpackCssSource(result, sources, tokenSources)).toBe(result)
    const map = new TraceMap(result.map() as ConstructorParameters<typeof TraceMap>[0])
    for (const [token, file, line] of [['24px', 'C:\\styles\\card.css', 3], ['100%', '/styles/layout.css', 2]] as const) {
      const prefix = css.slice(0, css.indexOf(token)).split('\n')
      expect(originalPositionFor(map, { line: prefix.length, column: prefix.at(-1)!.length })).toMatchObject({ source: file, line })
    }
    expect(annotateProcessedWebpackCssSource(source, sources)).toBe(source)
  })

  it('没有本插件元数据时保留原 Source 身份', () => {
    const source = new sources.OriginalSource('.business { color: red }', 'business.css')
    expect(preserveProcessedWebpackCssSource(source, sources)).toBe(source)
  })

  it.each([
    { newline: '\n', bom: '' },
    { newline: '\r\n', bom: '' },
    { newline: '\r\n', bom: '\uFEFF' },
    { newline: '\r\n', bom: '\uFFFE' },
  ])('本轮导入合并后降级完整渐变链并保留框架映射：%j', ({ newline, bom }) => {
    const direction = [
      '/* 中文 😀 */',
      '.direction { --tw-gradient-position: to right in oklab; background-image: linear-gradient(var(--stops)); }',
    ].join(newline)
    const stops = [
      '.colors { --stops: var(--tw-gradient-position), red, blue; }',
      '.reset { --tw-gradient-position: initial; }',
      '.business { width: 24px; }',
    ].join(newline)
    const source = new sources.ConcatSource(new sources.OriginalSource(bom + direction, 'C:\\styles\\direction.css'), newline, new sources.OriginalSource(stops, '/styles/colors.css'))
    const result = preserveProcessedWebpackCssSource(source, sources, true)
    const text = result.source().toString()
    expect(text).toContain('--tw-gradient-position: to right;')
    expect(text).not.toContain('in oklab')
    expect(text).toContain('--tw-gradient-position: initial;')
    expect(text).toContain('linear-gradient(var(--stops))')
    const prefix = text.slice(0, text.indexOf('24px')).split('\n')
    const map = new TraceMap(result.map() as ConstructorParameters<typeof TraceMap>[0])
    expect(originalPositionFor(map, { line: prefix.length, column: prefix.at(-1)!.length })).toMatchObject({ source: '/styles/colors.css', line: 3 })
    expect(preserveProcessedWebpackCssSource(result, sources, true)).toBe(result)
  })

  it('完整资产兼容在所有任务结束后执行，并计入 HMR 耗时且先于 onEnd', async () => {
    const order: string[] = []
    const recordTimingDetail = vi.fn()
    await finalizeWebpackProcessAssets({
      activeProcessCacheKeys: new Set(),
      activeProcessHashKeys: new Set(),
      activeWebpackCssSourceFiles: new Set(),
      compilerOptions: { cache: createCache(), onEnd: () => order.push('end') },
      cssAssetResources: new Map(),
      cssHandlerOptionsCache: new Map(),
      cssUserHandlerOptionsCache: new Map(),
      debug: vi.fn(),
      entries: [],
      groupedEntries: { css: [] },
      hmrTimingStartedAt: performance.now(),
      recordTimingDetail,
      registeredWebpackCssSourceFiles: new Set(),
      tasks: [Promise.resolve().then(() => order.push('css-task'))],
      timingDetails: {},
      watchMode: true,
      webpackSourceCandidateScanCache: { getMemoryStats: () => ({}) },
      finalizeCssAssets: () => order.push('css-assets'),
    })
    expect(order).toEqual(['css-task', 'css-assets', 'end'])
    expect(recordTimingDetail).toHaveBeenCalledWith('css.assets.finalize', expect.any(Number))
  })

  it.each([
    '@import "unresolved.css";',
    '.author { font-family: var(--tw-gradient-position); }',
  ])('导入尚未展开或含未知消费者时保留原 token：%s', (extra) => {
    const css = `${extra}.direction { --tw-gradient-position: to right in oklab; --stops: var(--tw-gradient-position), red, blue; background: linear-gradient(var(--stops)); }`
    const source = new sources.OriginalSource(css, 'direction.css')
    expect(preserveProcessedWebpackCssSource(source, sources, true)).toBe(source)
  })

  it('转义变量和值内注释不使同一行后续业务声明的来源漂移', () => {
    const css = '.direction { --tw-gradient-po\\73 ition: to right /* direction */ in oklab !important; width: 24px; --stops: var(--tw-gradient-position), red, blue; background: linear-gradient(var(--stops)); }'
    const source = new sources.OriginalSource(css, './relative.css')
    const result = preserveProcessedWebpackCssSource(source, sources, true)
    const text = result.source().toString()
    expect(text).toContain('--tw-gradient-po\\73 ition: to right !important')
    expect(text).not.toContain('in oklab')
    expect(text).toContain('width: 24px')
    const before = originalPositionFor(new TraceMap(source.map() as ConstructorParameters<typeof TraceMap>[0]), { line: 1, column: css.indexOf('24px') })
    const after = originalPositionFor(new TraceMap(result.map() as ConstructorParameters<typeof TraceMap>[0]), { line: 1, column: text.indexOf('24px') })
    expect(after).toEqual(before)
    expect(after.source).toBe('./relative.css')
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
    let traceSource = 'first.vue'
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
      preserveProcessedWebCssAsset: (source: sources.Source) => annotateProcessedWebpackCssSource(preserveProcessedWebpackCssSource(source, sources), sources, new Map([['business', { token: 'business', sources: [traceSource] }]])),
      rememberProcessCacheKey: vi.fn(),
      debug: vi.fn(),
      enqueueTask: async (task: () => Promise<void>) => task(),
      finalizeCssAssetSource: stripBundlerGeneratedCssMarkers,
      finalizeTracedCss: (value: string) => value,
      updateAssetIfChanged: vi.fn(),
    }
    for (const origin of ['first.css', 'second.css']) {
      traceSource = `${origin}.vue`
      const input = new sources.OriginalSource(css, origin)
      await processAsset(['theme.css', input], context)
      const output = context.updateAssetIfChanged.mock.lastCall![1] as sources.Source
      const text = output.source().toString()
      expect(text).not.toContain('weapp-tailwindcss')
      expect(text).toContain(`/*! tokens: business <= ${traceSource} */`)
      expect(text.match(/tokens:/g)).toHaveLength(1)
      const map = new TraceMap(output.map() as ConstructorParameters<typeof TraceMap>[0])
      const prefix = text.slice(0, text.indexOf('red')).split('\n')
      const actual = originalPositionFor(map, { line: prefix.length, column: prefix.at(-1)!.length })
      expect(actual).toEqual(originalPositionFor(new TraceMap(input.map() as ConstructorParameters<typeof TraceMap>[0]), { line: 2, column: '.business { color: '.length }))
    }
  })
})
