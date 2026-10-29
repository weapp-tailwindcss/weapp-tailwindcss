import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { createBundlerGeneratedCssMarker, createContext, createJsHandler, path, replaceWxml, setupWebpackV5UnitTest, testState } from './webpack.v5.unit/shared'
import { createHookHarness } from './webpack.v5.unit/v5-assets.hook-harness'

describe('webpack loader confirmed classes before asset transforms', () => {
  setupWebpackV5UnitTest()

  it.each([{ baseClasses: [] }, { baseClasses: ['bg-red-500'] }])('confirms active loader classes before HTML and JS with base $baseClasses', async ({ baseClasses }) => {
    const root = testState.projectRoot!
    const sourceFile = path.join(root, 'styles', 'feature.css')
    const inactiveSourceFile = path.join(root, 'styles', 'inactive.css')
    const candidate = 'before:content-[\'loader_confirmed\']'
    const unconfirmed = 'before:content-[\'business_only\']'
    const escapedCandidate = replaceWxml(candidate)
    const generatedCss = `${createBundlerGeneratedCssMarker('webpack', sourceFile)}\n.${escapedCandidate}::before{content:'loader confirmed'}`
    const generated = { file: sourceFile, classSet: new Set([candidate]), css: generatedCss, dependencies: [sourceFile] }
    const originalJs = `const className = ${JSON.stringify(`${candidate} ${unconfirmed}`)}; const business = 'event:after'`
    const baseSet = new Set(baseClasses)
    const observed: Array<{ phase: string, classes: string[] }> = []
    const order: string[] = []
    const realJsHandler = createJsHandler({ escapeMap: undefined })
    const context = createContext({
      cssMatcher: (file: string) => file.endsWith('.ttss') || file.endsWith('.css'),
      mainCssChunkMatcher: vi.fn(() => false),
      templateHandler: vi.fn(async (code: string, options: { runtimeSet: Set<string> }) => {
        order.push('html')
        observed.push({ phase: 'html', classes: [...options.runtimeSet] })
        return code
      }),
      jsHandler: vi.fn((code: string, classSet?: Set<string>, options?: Record<string, unknown>) => {
        order.push('js')
        // 必须在调用时复制集合，避免 CSS 阶段迟到的 add 让断言假通过。
        observed.push({ phase: 'js', classes: [...classSet ?? []] })
        return realJsHandler(code, classSet, options as any)
      }),
      styleHandler: vi.fn(async (code: string) => {
        order.push('css')
        return { css: code }
      }),
      tailwindRuntime: {
        ...createContext().tailwindRuntime,
        majorVersion: 4,
        getClassSet: vi.fn(async () => baseSet),
        getClassSetSync: vi.fn(() => baseSet),
        extract: vi.fn(async () => ({ classSet: baseSet })),
      },
    })
    const harness = createHookHarness({
      assetStore: {
        'feature.ttss': generatedCss,
        'view.wxml': `<view class="${candidate}"></view>`,
        'entry.js': originalJs,
      },
      chunkGraph: {
        getChunkModulesIterable: () => [{ resource: sourceFile }],
      },
      context,
      hookOptions: {
        getWebpackCssSources: () => [[sourceFile, { css: '.local{color:blue}' }]],
        getWebpackGeneratedCssSources: () => [
          [sourceFile, generated],
          [inactiveSourceFile, { file: inactiveSourceFile, classSet: new Set([unconfirmed]), css: '.inactive{}', dependencies: [] }],
        ],
        prepareWebpackCssSources: vi.fn(files => files),
      },
    })

    await harness.processAssets()

    expect(harness.compilation.fileDependencies.add).toHaveBeenCalledWith(sourceFile)
    expect(harness.assetStore['entry.js']).toContain(escapedCandidate)
    expect(observed.map(item => item.phase)).toEqual(['html', 'js'])
    for (const snapshot of observed) {
      expect(snapshot.classes).toContain(candidate)
      expect(snapshot.classes).not.toContain(unconfirmed)
    }
    expect(harness.assetStore['entry.js']).not.toContain(candidate)
    expect(runInNewContext(`${harness.assetStore['entry.js']}; [className, business]`)).toEqual([`${escapedCandidate} ${unconfirmed}`, 'event:after'])
    expect(harness.assetStore['feature.ttss']).toContain(escapedCandidate)
    expect(order.indexOf('html')).toBeLessThan(order.indexOf('js'))
    expect(order.indexOf('js')).toBeLessThan(order.indexOf('css'))

    // JS chunk 未变化时也必须按本轮确认集合失效缓存，不能复活被移除的 loader 类名。
    observed.length = 0
    generated.classSet.clear()
    generated.css = `${createBundlerGeneratedCssMarker('webpack', sourceFile)}\n.local{color:blue}`
    harness.assetStore['feature.ttss'] = generated.css
    harness.assetStore['view.wxml'] = `<view class="${candidate}"></view>`
    harness.assetStore['entry.js'] = originalJs

    await harness.processAssets()

    expect(observed.map(item => item.phase)).toEqual(['html', 'js'])
    expect(observed.every(snapshot => !snapshot.classes.includes(candidate))).toBe(true)
    expect(runInNewContext(`${harness.assetStore['entry.js']}; className`)).toBe(`${candidate} ${unconfirmed}`)
  })

  it.each([
    { css: '// extracted by mini-css-extract-plugin\nexport {}' },
    { css: 'var ___CSS_LOADER_API_IMPORT___ = require("css-loader/dist/runtime/api.js"); var ___CSS_LOADER_EXPORT___ = []; module.exports = ___CSS_LOADER_EXPORT___;' },
  ])('does not confirm loader metadata for a CSS loader runtime payload', async ({ css }) => {
    const sourceFile = path.join(testState.projectRoot!, 'styles', 'runtime.css')
    const candidate = 'before:content-[\'runtime_only\']'
    const observed: string[][] = []
    const realJsHandler = createJsHandler({ escapeMap: undefined })
    const context = createContext({
      jsHandler: vi.fn((code: string, classSet?: Set<string>, options?: Record<string, unknown>) => {
        observed.push([...classSet ?? []])
        return realJsHandler(code, classSet, options as any)
      }),
    })
    const harness = createHookHarness({
      assetStore: { 'runtime.css': css, 'entry.js': `const className = ${JSON.stringify(candidate)}` },
      chunkGraph: { getChunkModulesIterable: () => [{ resource: sourceFile }] },
      context,
      hookOptions: {
        getWebpackCssSources: () => [[sourceFile, { css: '.local{color:blue}' }]],
        getWebpackGeneratedCssSources: () => [[sourceFile, { file: sourceFile, classSet: new Set([candidate]), css: '.local{color:blue}', dependencies: [] }]],
        prepareWebpackCssSources: vi.fn(files => files),
      },
    })

    await harness.processAssets()

    expect(observed).toHaveLength(1)
    expect(observed[0]).not.toContain(candidate)
    expect(runInNewContext(`${harness.assetStore['entry.js']}; className`)).toBe(candidate)
    expect(harness.assetStore['runtime.css']).toBe(css)
  })

  it.each([{ stale: true }, { stale: false }])('does not confirm rejected explicit-source loader metadata, stale=$stale', async ({ stale }) => {
    const sourceFile = path.join(testState.projectRoot!, 'styles', 'explicit.css')
    const candidate = 'before:content-[\'loader_only\']'
    const fresh = 'before:content-[\'new_source\']'
    const sourceCandidates = new Set(stale ? [fresh] : [candidate, fresh])
    const marker = stale ? createBundlerGeneratedCssMarker('webpack', sourceFile) : ''
    const observed: string[][] = []
    const realJsHandler = createJsHandler({ escapeMap: undefined })
    vi.resetModules()
    vi.doMock('@/bundlers/webpack/BaseUnifiedPlugin/v5-assets/source-candidate-refresh', () => ({
      refreshWebpackSourceCandidates: vi.fn(async () => ({
        getSourceCandidatesForEntries: () => sourceCandidates,
        signatureHash: 'current-source-snapshot',
        tokenSources: new Map(),
      })),
    }))
    vi.doMock('@/context/generation', () => ({ generateTailwindV4Css: vi.fn(async () => undefined) }))
    try {
      const { setupWebpackV5ProcessAssetsHook } = await import('@/bundlers/webpack/BaseUnifiedPlugin/v5-assets')
      const context = createContext({
        cssMatcher: (file: string) => file.endsWith('.css'),
        mainCssChunkMatcher: vi.fn(() => false),
        jsHandler: vi.fn((code: string, classSet?: Set<string>, options?: Record<string, unknown>) => {
          observed.push([...classSet ?? []])
          return realJsHandler(code, classSet, options as any)
        }),
      })
      Object.assign(context, { experimentalJsFastPath: false })
      const harness = createHookHarness({
        setupProcessAssetsHook: setupWebpackV5ProcessAssetsHook,
        assetStore: { 'explicit.css': `${marker}\n.local{color:blue}`, 'entry.js': `const className = ${JSON.stringify(candidate)}` },
        chunkGraph: { getChunkModulesIterable: () => [{ resource: sourceFile }] },
        context,
        watchMode: true,
        hookOptions: {
          runtimeClassSetManager: { sync: vi.fn(async () => new Set(['bg-red-500'])), reset: vi.fn(async () => {}) } as any,
          getWebpackCssSources: () => [[sourceFile, { css: '@source "./view.tsx";' }]],
          getWebpackGeneratedCssSources: () => [[sourceFile, { file: sourceFile, classSet: new Set([candidate]), css: '.local{color:blue}', dependencies: [] }]],
          prepareWebpackCssSources: vi.fn(files => files),
        },
      })

      await harness.processAssets()

      // markerless case 只有 missing，没有 stale；两条资格拒绝都不得污染 JS 集合。
      expect(sourceCandidates.has(candidate)).toBe(!stale)
      expect(observed).toHaveLength(1)
      expect(observed.every(classes => !classes.includes(candidate))).toBe(true)
      expect(runInNewContext(`${harness.assetStore['entry.js']}; className`)).toBe(candidate)
    }
    finally {
      vi.doUnmock('@/bundlers/webpack/BaseUnifiedPlugin/v5-assets/source-candidate-refresh')
      vi.doUnmock('@/context/generation')
      vi.resetModules()
    }
  })

  it.each([true, false])('keeps CSS generation dependent on candidates in transformed JS, mentioned=%s', async (mentioned) => {
    const candidate = 'bg-[#123456]'
    const baseSet = new Set(['bg-red-500'])
    const observedRuntime: string[][] = []
    const realJsHandler = createJsHandler({ escapeMap: undefined })
    vi.resetModules()
    vi.doMock('@/context/generation', () => ({
      generateTailwindV4Css: vi.fn(async (options: { runtime: Set<string> }) => {
        observedRuntime.push([...options.runtime])
        return undefined
      }),
    }))
    try {
      const { setupWebpackV5ProcessAssetsHook } = await import('@/bundlers/webpack/BaseUnifiedPlugin/v5-assets')
      const context = createContext({
        styleHandler: vi.fn(async (code: string) => ({ css: code })),
        jsHandler: vi.fn((code: string, classSet?: Set<string>, options?: Record<string, unknown>) => realJsHandler(code, classSet, options as any)),
        tailwindRuntime: {
          ...createContext().tailwindRuntime,
          getClassSet: vi.fn(async () => baseSet),
          getClassSetSync: vi.fn(() => baseSet),
          extract: vi.fn(async () => ({ classSet: baseSet })),
        },
      })
      const harness = createHookHarness({
        setupProcessAssetsHook: setupWebpackV5ProcessAssetsHook,
        assetStore: {
          // 无 bundler marker 的已生成 CSS 只确认 transformRuntimeSet，不预先加入 generatorRuntimeSet。
          'theme.css': '/*! tailwindcss v4.0.0 */\n.bg-\\[\\#123456\\]{color:red}',
          'entry.js': `const className = ${JSON.stringify(mentioned ? candidate : 'ordinary')}`,
        },
        context,
      })

      await harness.processAssets()

      expect(baseSet.has(candidate)).toBe(false)
      expect(observedRuntime.length).toBeGreaterThan(0)
      expect(observedRuntime.every(classes => classes.includes(candidate) === mentioned)).toBe(true)
      if (mentioned) {
        expect(harness.assetStore['entry.js']).toContain(replaceWxml(candidate))
      }
    }
    finally {
      vi.doUnmock('@/context/generation')
      vi.resetModules()
    }
  })
})
