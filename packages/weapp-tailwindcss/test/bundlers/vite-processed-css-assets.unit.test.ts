import type { OutputAsset, OutputBundle } from 'rollup'
import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import {
  createBundlerGeneratedCssMarker,
} from '@/bundlers/shared/generated-css-marker'
import {
  collectViteProcessedCssAssetResults,
  injectViteProcessedCssIntoMainCssAssets,
  isCssImportOnlyBundleAsset,
  removeCssCoveredByRootStyleAssets,
  removeDuplicateUnlinkedRootCssAssetsReferencedByHtml,
  removeScopedTailwindPreflightCss,
} from '@/bundlers/vite/processed-css-assets'

import { createViteSourceOutputRelationOwner, withViteSourceOutputRelationOwner } from '@/bundlers/vite/source-output-relations'

function asset(fileName: string, source: string): OutputAsset {
  return {
    type: 'asset',
    fileName,
    names: [],
    originalFileNames: [],
    source,
  }
}

function opts() {
  return {
    appType: 'taro',
    cssMatcher: (file: string) => /\.(?:css|wxss)$/.test(file),
    mainCssChunkMatcher: (file: string) => /^(?:app|common)\.(?:css|wxss)$/.test(file),
  } as any
}

const createCssPipelineContext = () => ({}) as any

const uniAppWebviewCssStrategy = { styles: { resolveConfiguredCssEntryRootInjectionTarget: () => 'app.css',
preferExplicitWebTargets: true,
preferMatchedRootWebTarget: true } }

const taroImportShellStrategy = { styles: { rootImportShell: 'extract' as const } }

describe('vite processed css assets', () => {
  it('从多个生成标记登记合并资产的全部来源，不依赖 CSS 与 JS 同名', () => {
    const owner = createViteSourceOutputRelationOwner()
    const first = '/repo/Label.vue?vue&type=style&index=1'
    const second = 'C:\\repo\\Other.vue?vue&type=style&index=2'
    const file = 'assets/entry-css-hash.css'
    const css = `${createBundlerGeneratedCssMarker('vite', first)}.first{display:flex}${createBundlerGeneratedCssMarker('vite', second)}.second{display:block}`
    withViteSourceOutputRelationOwner(owner, () => collectViteProcessedCssAssetResults({ [file]: asset(file, css) }, { isViteProcessedCssAsset: () => false }))
    expect(owner.getOwnedOutputs(first)).toEqual(new Set([file]))
    expect(owner.getOwnedOutputs(second)).toEqual(new Set([file]))
    expect(owner.getOutputSources(file)).toEqual(new Set(['/repo/Label.vue', 'C:/repo/Other.vue']))
    owner.dispose()
  })

  it('collects marker scoped css and removes covered generated source assets', () => {
    const bundle: OutputBundle = {
      'app.wxss': asset('app.wxss', '.root{color:red}'),
      'pages/index.wxss': asset('pages/index.wxss', [
        createBundlerGeneratedCssMarker('vite', 'src/app.css'),
        '.root{color:red}',
        createBundlerGeneratedCssMarker('vite', 'src/pages/index.css'),
        '.page{color:blue}',
      ].join('\n')),
      'src/pages/index.css': asset('src/pages/index.css', '.page{color:blue}'),
    }
    const records = new Map<string, { css: string, injectIntoMain?: boolean, outputFile?: string }>()
    const mark = vi.fn()

    const collected = collectViteProcessedCssAssetResults(bundle, {
      opts: opts(),
      isViteProcessedCssAsset: (_asset, file) => file?.endsWith('.wxss') === true || file === 'src/pages/index.css',
      markCssAssetProcessed: mark,
      recordViteProcessedCssAssetResult(file, css, options) {
        records.set(file, { css, ...options })
      },
      resolveViteProcessedCssOutputFile: file => file.startsWith('src/') ? file.slice(4).replace(/\.css$/, '.wxss') : file,
      transformCss: css => css.replace('blue', 'green'),
      debug: vi.fn(),
    })

    expect(collected).toBe(3)
    expect(bundle['pages/index.wxss']).toMatchObject({ source: '.page{color:green}' })
    expect(bundle['src/pages/index.css']).toBeUndefined()
    expect(records.get('pages/index.wxss')?.css).toContain('green')
    expect(mark).toHaveBeenCalled()
  })

  it('injects processed css into root and explicit output targets', () => {
    const bundle: OutputBundle = {
      'app.wxss': asset('app.wxss', '@import "./common.wxss";\n@source "./src";\n.root{color:red}'),
      'common.wxss': asset('common.wxss', '.common{display:block}'),
      'pages/index.wxss': asset('pages/index.wxss', '/* shell */'),
      'pages/other.wxss': asset('pages/other.wxss', '.old{color:black}'),
    }
    const records = new Map<string, any>([
      ['src/app.css', { css: '.generated{color:blue}', injectIntoMain: true, outputFile: 'app.wxss' }],
      ['src/pages/index.css', { css: '.page{color:green}', injectIntoMain: true, outputFile: 'pages/index.wxss' }],
      ['src/pages/skip.css', { css: '.skip{color:red}', injectIntoMain: false, outputFile: 'pages/other.wxss' }],
      ['src/common.css', { css: '.common{display:block}', outputFile: 'common.wxss' }],
    ])
    const onUpdate = vi.fn()

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: opts(),
      getViteProcessedCssAssetResults: () => records.entries(),
      markCssAssetProcessed: vi.fn(),
      shouldRemoveInjectedSourceAsset: () => true,
      onUpdate,
      debug: vi.fn(),
    })

    expect(injected).toBe(3)
    expect(String((bundle['app.wxss'] as OutputAsset).source)).toContain('.generated{color:blue}')
    expect(String((bundle['app.wxss'] as OutputAsset).source)).not.toContain('@source')
    expect(String((bundle['pages/index.wxss'] as OutputAsset).source)).toContain('.page{color:green}')
    expect(String((bundle['pages/other.wxss'] as OutputAsset).source)).not.toContain('.skip')
    expect(onUpdate).toHaveBeenCalled()
  })

  it('uses explicit nonstandard root style targets instead of @layer or app/main filenames', () => {
    const bundle: OutputBundle = {
      'theme.acss': asset('theme.acss', '@layer utilities;\n.theme-root{color:red}'),
      'vendor.acss': asset('vendor.acss', '@layer utilities;\n.vendor-root{color:black}'),
    }
    const records = new Map<string, any>([
      ['src/styles/theme.css', {
        css: '.generated-theme{color:blue}',
        injectIntoMain: true,
        outputFile: 'theme.acss',
      }],
    ])

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: {
        ...opts(),
        appType: 'uni-app-vite',
        cssMatcher: (file: string) => /\.(?:css|acss)$/.test(file),
        mainCssChunkMatcher: (file: string) => file === 'theme.acss',
      },
      getViteProcessedCssAssetResults: () => records.entries(),
      markCssAssetProcessed: vi.fn(),
      debug: vi.fn(),
    })

    expect(injected).toBe(1)
    expect(String((bundle['theme.acss'] as OutputAsset).source)).toContain('.generated-theme{color:blue}')
    expect(String((bundle['vendor.acss'] as OutputAsset).source)).toBe('@layer utilities;\n.vendor-root{color:black}')
  })

  it('detects import-only assets and removes scoped css covered by root styles', () => {
    const bundle: OutputBundle = {
      'app.wxss': asset('app.wxss', '.dup{color:red}\n.keep{color:blue}'),
      'pages/index.wxss': asset('pages/index.wxss', '/* tokens: dup <= src */\n.dup{color:red}\n.page{color:green}\n/* tokens: dangling <= src */'),
      'pages/import.wxss': asset('pages/import.wxss', '@import "../app.wxss";\n/* comment */'),
    }
    const onUpdate = vi.fn()

    expect(isCssImportOnlyBundleAsset(bundle, 'pages/import.wxss', '@import "../app.wxss";\n/* comment */')).toBe(true)
    expect(isCssImportOnlyBundleAsset(bundle, 'pages/import.wxss', '@import "../app.wxss";\n.keep{}')).toBe(false)
    expect(isCssImportOnlyBundleAsset(bundle, 'pages/import.wxss', '@import "../missing.wxss";')).toBe(false)

    expect(removeCssCoveredByRootStyleAssets(bundle, {
      cssMatcher: (file: string) => file.endsWith('.wxss'),
      onUpdate,
      debug: vi.fn(),
    })).toBe(1)
    expect(String((bundle['pages/index.wxss'] as OutputAsset).source)).toContain('.page{color:green}')
    expect(String((bundle['pages/index.wxss'] as OutputAsset).source)).not.toContain('.dup')
    expect(String((bundle['pages/index.wxss'] as OutputAsset).source)).not.toContain('dangling')
  })

  it('replays processed css into the root target and clears injected sources', () => {
    const bundle: OutputBundle = {
      'app.wxss': asset('app.wxss', '.root{color:red}'),
      'pages/index.wxss': asset('pages/index.wxss', '.shell{display:block}'),
      'pages/index.css': asset('pages/index.css', '.page{color:green}'),
    }
    const records = new Map<string, any>([
      ['src/pages/index.css', { css: '.page{color:green}', injectIntoMain: true, outputFile: 'pages/index.wxss' }],
      ['src/pages/skip.css', { css: '.skip{color:red}', outputFile: 'pages/skip.wxss' }],
    ])
    const mark = vi.fn()

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: {
        ...opts(),
        mainCssChunkMatcher: (file: string) => file === 'pages/index.wxss',
      },
      getViteProcessedCssAssetResults: () => records.entries(),
      markCssAssetProcessed: mark,
      shouldRemoveInjectedSourceAsset: () => true,
      debug: vi.fn(),
    })

    expect(injected).toBe(2)
    expect(String((bundle['app.wxss'] as OutputAsset).source)).toContain('.page{color:green}')
    expect(String((bundle['pages/index.wxss'] as OutputAsset).source)).toContain('.page{color:green}')
    expect(String((bundle['pages/index.css'] as OutputAsset).source)).toBe('')
    expect(mark).toHaveBeenCalledWith(bundle['app.wxss'], 'app.wxss')
  })

  it('removes covered root css source assets when app webview target already has generated css', () => {
    const generatedCss = [
      '.template-corpus-card{display:block}',
      '.text-\\[45rpx\\]{font-size:45rpx}',
      '.space-y-2>:not(:last-child){margin-block-start:calc(var(--spacing) * 2)}',
    ].join('\n')
    const bundle: OutputBundle = {
      'main.css': asset('main.css', generatedCss),
      'app.css': asset('app.css', generatedCss),
      'pages/index/index.css': asset('pages/index/index.css', '.page-shell{display:block}'),
    }
    const records = new Map<string, any>([
      ['main.css', { css: generatedCss, injectIntoMain: true, outputFile: 'app.css' }],
    ])

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: {
        ...opts(),
        appType: 'uni-app-vite',
        cssMatcher: (file: string) => file.endsWith('.css'),
        mainCssChunkMatcher: (file: string) => file === 'app.css',
      },
      cssPipelineStrategy: uniAppWebviewCssStrategy,
      createCssPipelineContext,
      getViteProcessedCssAssetResults: () => records.entries(),
      markCssAssetProcessed: vi.fn(),
      shouldRemoveInjectedSourceAsset: (targetFile, record) =>
        record.injectIntoMain !== false && record.file !== targetFile,
      debug: vi.fn(),
    })

    expect(injected).toBe(1)
    expect(String((bundle['app.css'] as OutputAsset).source)).toBe(generatedCss)
    expect(bundle['main.css']).toBeUndefined()
    expect(String((bundle['pages/index/index.css'] as OutputAsset).source)).toBe('.page-shell{display:block}')
  })

  it('removes root css source assets covered by the app webview target even when record aliases differ', () => {
    const sourceCss = [
      ':root{--spacing:.25rem;--color-white:#fff}',
      '.template-corpus-card{display:block}',
      '.space-y-2>:not(:last-child){margin-block-start:calc(var(--spacing) * 2)}',
    ].join('\n')
    const appCss = [
      ':root{--color-white:#fff;--spacing:.25rem}',
      '.bg-normal-subpackage-marker{background-color:#2563eb}',
      '.template-corpus-card{display:block}',
      '.space-y-2>:not(:last-child){margin-block-start:calc(var(--spacing) * 2)}',
    ].join('\n')
    const bundle: OutputBundle = {
      'main.css': asset('main.css', sourceCss),
      'app.css': asset('app.css', appCss),
    }
    const records = new Map<string, any>([
      ['src/main.css', { css: appCss, injectIntoMain: true, outputFile: 'app.css' }],
    ])

    expect(injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: {
        ...opts(),
        appType: 'uni-app-vite',
        cssMatcher: (file: string) => file.endsWith('.css'),
        mainCssChunkMatcher: (file: string) => file === 'app.css',
      },
      cssPipelineStrategy: uniAppWebviewCssStrategy,
      createCssPipelineContext,
      getViteProcessedCssAssetResults: () => records.entries(),
      markCssAssetProcessed: vi.fn(),
      shouldRemoveInjectedSourceAsset: (targetFile, record) =>
        record.injectIntoMain !== false && record.file !== targetFile,
      debug: vi.fn(),
    })).toBe(1)

    expect(bundle['main.css']).toBeUndefined()
    expect(String((bundle['app.css'] as OutputAsset).source)).toBe(appCss)
  })

  it('does not remove app webview root css from non-root injection targets', () => {
    const generatedCss = '.template-corpus-card{display:block}'
    const bundle: OutputBundle = {
      'app.css': asset('app.css', generatedCss),
      'pages-order/pages/user/user.css': asset('pages-order/pages/user/user.css', generatedCss),
    }
    const records = new Map<string, any>([
      ['main.css', { css: generatedCss, injectIntoMain: true, outputFile: 'pages-order/pages/user/user.css' }],
    ])

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: {
        ...opts(),
        appType: 'uni-app-vite',
        cssMatcher: (file: string) => file.endsWith('.css'),
        mainCssChunkMatcher: (file: string) => file === 'app.css',
      },
      cssPipelineStrategy: uniAppWebviewCssStrategy,
      createCssPipelineContext,
      getViteProcessedCssAssetResults: () => records.entries(),
      markCssAssetProcessed: vi.fn(),
      shouldRemoveInjectedSourceAsset: (targetFile, record) =>
        record.injectIntoMain !== false && record.file !== targetFile,
      debug: vi.fn(),
    })

    expect(injected).toBe(0)
    expect(String((bundle['app.css'] as OutputAsset).source)).toBe(generatedCss)
    expect(String((bundle['pages-order/pages/user/user.css'] as OutputAsset).source)).toBe(generatedCss)
  })

  it('preserves taro import shell assets by injecting into the imported root asset', () => {
    const bundle: OutputBundle = {
      'app.wxss': asset('app.wxss', '.root{color:red}'),
      'pages/index.wxss': asset('pages/index.wxss', '@import "../app.wxss";\n/* shell */'),
    }
    const records = new Map<string, any>([
      ['src/app.css', { css: '.generated{color:blue}', injectIntoMain: true, outputFile: 'app.wxss' }],
    ])

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: { ...opts(), appType: 'uni-app-vite' },
      getViteProcessedCssAssetResults: () => records.entries(),
      markCssAssetProcessed: vi.fn(),
      debug: vi.fn(),
    })

    expect(injected).toBe(1)
    expect(String((bundle['pages/index.wxss'] as OutputAsset).source)).toContain('@import')
    expect(String((bundle['app.wxss'] as OutputAsset).source)).toContain('.generated{color:blue}')
  })

  it('records marker aliases and keeps subpackage scoped root markers isolated', () => {
    const bundle: OutputBundle = {
      'app.wxss': asset('app.wxss', '.root{color:red}'),
      'pkg/page.wxss': asset('pkg/page.wxss', [
        createBundlerGeneratedCssMarker('vite', 'src/app.css'),
        '.root{color:red}',
        '.pkg{color:green}',
      ].join('\n')),
    }
    const records = new Map<string, any>()

    const collected = collectViteProcessedCssAssetResults(bundle, {
      opts: opts(),
      isViteProcessedCssAsset: (_asset, file) => file === 'pkg/page.wxss',
      markCssAssetProcessed: vi.fn(),
      recordViteProcessedCssAssetResult(file, css, options) {
        records.set(file, { css, ...options })
      },
      resolveViteProcessedCssOutputFile: file => file.replace(/^src\//, '').replace(/\.css$/, '.wxss'),
      subpackageRoots: new Set(['pkg']),
      debug: vi.fn(),
    })

    expect(collected).toBe(1)
    expect(String((bundle['pkg/page.wxss'] as OutputAsset).source)).toContain('.root{color:red}')
    expect(records.get('pkg/page.wxss')?.outputFile).toBe('app.wxss')
    expect(records.get('app.wxss')?.outputFile).toBe('app.wxss')
  })

  it('normalizes absolute imports, binary asset sources, empty source media wrappers, and marker aliases', () => {
    const bundle: OutputBundle = {
      'app.wxss': asset('app.wxss', '.root{color:red}'),
      'pages/import.wxss': asset('pages/import.wxss', '@import "/app.wxss";'),
      'pages/binary.wxss': {
        ...asset('pages/binary.wxss', ''),
        source: Buffer.from(`${createBundlerGeneratedCssMarker('vite', 'src/pages/binary.css')}\n@media source("./src") {}`),
      },
      'pages/alias.wxss': asset('pages/alias.wxss', [
        '/*! weapp-tailwindcss vite-generated-css */',
        '.fallback{color:red}',
        createBundlerGeneratedCssMarker('vite', 'src/pages/alias.css'),
        '.alias{color:blue}',
      ].join('\n')),
    }
    const records = new Map<string, any>()

    expect(isCssImportOnlyBundleAsset(bundle, 'pages/import.wxss', '@import "/app.wxss";')).toBe(true)
    expect(isCssImportOnlyBundleAsset(bundle, 'pages/import.wxss', '@import "')).toBe(false)

    const collected = collectViteProcessedCssAssetResults(bundle, {
      opts: opts(),
      isViteProcessedCssAsset: (_asset, file) => file?.startsWith('pages/') === true,
      recordViteProcessedCssAssetResult(file, css, options) {
        records.set(file, { css, ...options })
      },
      resolveViteProcessedCssOutputFile: file => file.replace(/^src\//, '').replace(/\.css$/, '.wxss'),
      debug: vi.fn(),
    })

    expect(collected).toBe(3)
    expect(String((bundle['pages/binary.wxss'] as OutputAsset).source)).toBe('@media source("./src") {}')
    expect(records.get('pages/alias.wxss')?.css).toContain('.alias{color:blue}')
    expect(records.get('src/pages/alias.css')?.css).toContain('.alias{color:blue}')
  })

  it('injects into explicit non-root targets and skips duplicate, imported, and empty records', () => {
    const bundle: OutputBundle = {
      'app.wxss': asset('app.wxss', '.root{color:red}'),
      'pages/index.wxss': asset('pages/index.wxss', '@import "../shared.wxss";\n.shell{display:block}'),
      'shared.wxss': asset('shared.wxss', '.imported{color:black}'),
    }
    const records = new Map<string, any>([
      ['src/pages/index.css', { css: '.target{color:green}', injectIntoMain: true, outputFile: 'pages/index.wxss' }],
      ['src/pages/wrong.css', { css: '.wrong{color:red}', injectIntoMain: true, outputFile: 'pages/wrong.wxss' }],
      ['src/pages/duplicate.css', { css: '.shell{display:block}', injectIntoMain: true, outputFile: 'pages/index.wxss' }],
      ['src/pages/imported.css', { css: '.imported{color:black}', outputFile: 'shared.wxss' }],
      ['src/pages/empty.css', { css: '', injectIntoMain: true, outputFile: 'pages/index.wxss' }],
    ])

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: { ...opts(), appType: 'mpx' },
      getViteProcessedCssAssetResults: () => records.entries(),
      markCssAssetProcessed: vi.fn(),
      debug: vi.fn(),
    })

    const pageCss = String((bundle['pages/index.wxss'] as OutputAsset).source)
    expect(injected).toBe(3)
    expect(String((bundle['app.wxss'] as OutputAsset).source)).toContain('.target{color:green}')
    expect(pageCss).toContain('.target{color:green}')
    expect(String((bundle['shared.wxss'] as OutputAsset).source)).toContain('.target{color:green}')
    expect(pageCss).not.toContain('.wrong')
    expect(pageCss).not.toContain('.duplicate')
  })

  it('limits framework-owned import shell protection to root mini-program styles', () => {
    const records = new Map<string, any>([
      ['src/app.css', { css: '.generated{color:blue}', injectIntoMain: true, outputFile: 'pages/index.wxss' }],
    ])
    const debug = vi.fn()

    const scopedImportBundle: OutputBundle = {
      'pages/dep.wxss': asset('pages/dep.wxss', '.dep{color:red}'),
      'pages/index.wxss': asset('pages/index.wxss', '@import "./dep.wxss";'),
    }
    expect(injectViteProcessedCssIntoMainCssAssets(scopedImportBundle, {
      opts: { ...opts(), mainCssChunkMatcher: (file: string) => file === 'pages/index.wxss' },
      cssPipelineStrategy: taroImportShellStrategy,
      createCssPipelineContext,
      getViteProcessedCssAssetResults: () => records.entries(),
      debug,
    })).toBe(1)
    expect(String((scopedImportBundle['pages/index.wxss'] as OutputAsset).source)).toContain('.generated{color:blue}')

    debug.mockClear()
    const twoImportBundle: OutputBundle = {
      'app.wxss': asset('app.wxss', '.root{color:red}'),
      'common.wxss': asset('common.wxss', '.common{color:blue}'),
      'pages/index.wxss': asset('pages/index.wxss', '@import "../app.wxss";\n@import "../common.wxss";'),
    }
    expect(injectViteProcessedCssIntoMainCssAssets(twoImportBundle, {
      opts: opts(),
      getViteProcessedCssAssetResults: () => records.entries(),
      debug,
    })).toBe(2)
    expect(String((twoImportBundle['pages/index.wxss'] as OutputAsset).source)).toContain('@import "../app.wxss"')
  })

  it('keeps base css when injected records become empty or duplicate after merge checks', () => {
    const bundle: OutputBundle = {
      'app.wxss': asset('app.wxss', '.base{color:red}'),
    }
    const records = new Map<string, any>([
      ['src/duplicate.css', { css: '.base{color:red}', injectIntoMain: true, outputFile: 'app.wxss' }],
      ['src/empty.css', { css: '', injectIntoMain: true, outputFile: 'app.wxss' }],
    ])
    const mark = vi.fn()

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: opts(),
      getViteProcessedCssAssetResults: () => records.entries(),
      markCssAssetProcessed: mark,
      debug: vi.fn(),
    })

    expect(injected).toBe(0)
    expect(String((bundle['app.wxss'] as OutputAsset).source)).toBe('.base{color:red}')
    expect(mark).not.toHaveBeenCalled()
  })

  it('falls back safely when source media wrappers cannot be parsed', () => {
    const bundle: OutputBundle = {
      'app.wxss': asset('app.wxss', '@media source("./src") { /*! weapp-tailwindcss generator-placeholder */ }'),
    }
    const records = new Map<string, any>([
      ['src/app.css', { css: '.generated{color:blue}', injectIntoMain: true, outputFile: 'app.wxss' }],
    ])

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: opts(),
      getViteProcessedCssAssetResults: () => records.entries(),
      markCssAssetProcessed: vi.fn(),
      debug: vi.fn(),
    })

    expect(injected).toBe(1)
    expect(String((bundle['app.wxss'] as OutputAsset).source)).toContain('.generated{color:blue}')
    expect(String((bundle['app.wxss'] as OutputAsset).source)).not.toContain('generator-placeholder')
  })

  it('injects generated css into empty root assets and preserves explicit scoped targets', () => {
    const bundle: OutputBundle = {
      'app.wxss': asset('app.wxss', ''),
      'pages/index.wxss': asset('pages/index.wxss', '.page{color:black}'),
    }
    const records = new Map<string, any>([
      ['src/app.css', { css: '.root{color:blue}', injectIntoMain: true, outputFile: 'app.wxss' }],
      ['src/pages/index.css', { css: '.scoped{color:green}', injectIntoMain: true, outputFile: 'pages/index.wxss' }],
    ])

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: opts(),
      getViteProcessedCssAssetResults: () => records.entries(),
      markCssAssetProcessed: vi.fn(),
      debug: vi.fn(),
    })

    expect(injected).toBe(2)
    expect(String((bundle['app.wxss'] as OutputAsset).source)).toBe('.root{color:blue}\n.scoped{color:green}')
    expect(String((bundle['pages/index.wxss'] as OutputAsset).source)).toBe('.page{color:black}\n.scoped{color:green}')
  })

  it('injects configured uni-app vite app webview entry css into the root css asset', () => {
    const root = '/project'
    const sourceFile = `${root}/src/main.css`
    const generatedCss = [
      '.template-corpus-card{display:block}',
      '.text-\\[45rpx\\]{font-size:45rpx}',
      '.space-y-2>:not([hidden])~:not([hidden]){margin-top:.5rem}',
      '.bg-radial{background-image:radial-gradient(circle,#fff,#000)}',
    ].join('\n')
    const bundle: OutputBundle = {
      'app.css': asset('app.css', ''),
      'src/main.css': asset('src/main.css', `${createBundlerGeneratedCssMarker('vite', sourceFile)}\n${generatedCss}`),
    }
    const records = new Map<string, any>()

    collectViteProcessedCssAssetResults(bundle, {
      opts: {
        ...opts(),
        appType: 'uni-app-vite',
        cssMatcher: (file: string) => file.endsWith('.css'),
        cssEntries: [sourceFile],
        tailwindcss: {
          v4: {
            cssEntries: [sourceFile],
          },
        },
        mainCssChunkMatcher: () => false,
      },
      cssPipelineStrategy: uniAppWebviewCssStrategy,
      createCssPipelineContext,
      isViteProcessedCssAsset: (_asset, file) => file === 'src/main.css',
      recordViteProcessedCssAssetResult(file, css, options) {
        records.set(file, { css, ...options })
      },
      resolveViteProcessedCssOutputFile: file => file.startsWith(`${root}/`) ? file.slice(root.length + 1) : file,
      debug: vi.fn(),
    })
    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: {
        ...opts(),
        appType: 'uni-app-vite',
        cssMatcher: (file: string) => file.endsWith('.css'),
        mainCssChunkMatcher: () => false,
      },
      cssPipelineStrategy: uniAppWebviewCssStrategy,
      createCssPipelineContext,
      getViteProcessedCssAssetResults: () => records.entries(),
      debug: vi.fn(),
    })

    const appCss = String((bundle['app.css'] as OutputAsset).source)
    expect(injected).toBe(1)
    expect(records.get('src/main.css')).toMatchObject({
      injectIntoMain: true,
      outputFile: 'app.css',
    })
    expect(appCss).toContain('.template-corpus-card')
    expect(appCss).toContain('.text-\\[45rpx\\]')
    expect(appCss).toContain('.space-y-2')
    expect(appCss).toContain('radial-gradient')
  })

  it('falls back to the matched root css asset for configured css entry injection targets', () => {
    const root = '/project'
    const sourceFile = `${root}/src/main.css`
    const generatedCss = '.template-corpus-card{display:block}'
    const bundle: OutputBundle = {
      'app.css': asset('app.css', ''),
      'main.css': asset('main.css', '.legacy{color:red}'),
      'src/main.css': asset('src/main.css', `${createBundlerGeneratedCssMarker('vite', sourceFile)}\n${generatedCss}`),
      'chunk.js': {
        type: 'chunk',
        fileName: 'chunk.js',
        name: 'chunk',
        code: 'export default {}',
      } as any,
    }
    const records = new Map<string, any>()

    collectViteProcessedCssAssetResults(bundle, {
      opts: {
        ...opts(),
        appType: 'uni-app-vite',
        cssMatcher: (file: string) => file.endsWith('.css'),
        cssEntries: [sourceFile],
        mainCssChunkMatcher: (file: string) => file === 'app.css',
      },
      cssPipelineStrategy: { styles: { resolveConfiguredCssEntryRootInjectionTarget: () => undefined } },
      createCssPipelineContext,
      isViteProcessedCssAsset: (_asset, file) => file === 'src/main.css',
      recordViteProcessedCssAssetResult(file, css, options) {
        records.set(file, { css, ...options })
      },
      resolveViteProcessedCssOutputFile: file => file.startsWith(`${root}/`) ? file.slice(root.length + 1) : file,
      debug: vi.fn(),
    })

    expect(records.get('src/main.css')).toMatchObject({
      injectIntoMain: true,
      outputFile: 'app.css',
    })
  })

  it('dedupes aliased uni-app vite app webview css records before root injection', () => {
    const generatedCss = [
      '/*! tailwindcss v4.3.2 | MIT License | https://tailwindcss.com */',
      '.template-corpus-card{display:block}',
      '.space-y-2>:not([hidden])~:not([hidden]){margin-top:.5rem}',
    ].join('\n')
    const bundle: OutputBundle = {
      'app.css': asset('app.css', ''),
      'pages/index/index.css': asset('pages/index/index.css', '.page{color:black}'),
    }
    const records = new Map<string, any>([
      ['src/main.css', { css: generatedCss, injectIntoMain: true, outputFile: 'app.css' }],
      ['app.css', { css: generatedCss, injectIntoMain: true, outputFile: 'app.css' }],
    ])

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: {
        ...opts(),
        appType: 'uni-app-vite',
        cssMatcher: (file: string) => file.endsWith('.css'),
        mainCssChunkMatcher: () => false,
      },
      getViteProcessedCssAssetResults: () => records.entries(),
      debug: vi.fn(),
    })

    const appCss = String((bundle['app.css'] as OutputAsset).source)
    expect(injected).toBe(1)
    expect(appCss.match(/tailwindcss v4\.3\.2/g)).toHaveLength(1)
    expect(appCss.match(/template-corpus-card/g)).toHaveLength(1)
    expect(appCss.match(/space-y-2/g)).toHaveLength(1)
    expect(String((bundle['pages/index/index.css'] as OutputAsset).source)).toBe('.page{color:black}')
  })

  it('removes duplicate unlinked root css assets when html links the real app view css', () => {
    const generatedCss = [
      '/*! tailwindcss v4.3.2 | MIT License | https://tailwindcss.com */',
      '.template-corpus-card{display:block}',
      '.space-y-2>:not([hidden])~:not([hidden]){margin-top:.5rem}',
    ].join('\n')
    const bundle: OutputBundle = {
      '__uniappview.html': asset('__uniappview.html', '<link rel="stylesheet" href="app.css" />'),
      'app.css': asset('app.css', generatedCss),
      'main.css': asset('main.css', generatedCss),
      'pages/index/index.css': asset('pages/index/index.css', '.page{color:black}'),
    }
    const debug = vi.fn()

    expect(removeDuplicateUnlinkedRootCssAssetsReferencedByHtml(bundle, { debug })).toBe(1)

    expect(bundle['app.css']).toBeDefined()
    expect(bundle['main.css']).toBeUndefined()
    expect(bundle['pages/index/index.css']).toBeDefined()
    expect(debug).toHaveBeenCalledWith('remove duplicate unlinked root css asset referenced by html: %s', 'main.css')
  })

  it('handles absolute html css links and ignores unresolved duplicate candidates', () => {
    const generatedCss = '.template-corpus-card{display:block}'
    const bundleWithoutLinkedCss: OutputBundle = {
      '__uniappview.html': asset('__uniappview.html', '<link rel="stylesheet" href="/app.css" /><link rel="stylesheet" href="https://cdn.example.com/theme.css" />'),
      'main.css': asset('main.css', generatedCss),
    }

    expect(removeDuplicateUnlinkedRootCssAssetsReferencedByHtml(bundleWithoutLinkedCss)).toBe(0)
    expect(bundleWithoutLinkedCss['main.css']).toBeDefined()

    const bundle: OutputBundle = {
      '__uniappview.html': asset('__uniappview.html', '<link rel="stylesheet" href="/app.css" /><link rel="stylesheet" href="./pages/index.css" />'),
      'app.css': asset('app.css', generatedCss),
      'main.css': asset('main.css', generatedCss),
      'chunk.js': {
        type: 'chunk',
        fileName: 'chunk.js',
        name: 'chunk',
        code: 'export default {}',
      } as any,
      'pages/index.css': asset('pages/index.css', '.page{color:black}'),
    }

    expect(removeDuplicateUnlinkedRootCssAssetsReferencedByHtml(bundle)).toBe(1)
    expect(bundle['app.css']).toBeDefined()
    expect(bundle['main.css']).toBeUndefined()
    expect(bundle['chunk.js']).toBeDefined()
    expect(bundle['pages/index.css']).toBeDefined()
  })

  it.each([false, true])('仅注释不注入，重复规则迁移真实来源且保持幂等：hasRule=%s', (hasRule) => {
    const bundle: OutputBundle = {
      'app.css': asset('app.css', '.template-corpus-card{display:block}'),
    }
    const records = new Map<string, any>([
      ['src/main.css', {
        css: [
          '/*! tailwindcss v4.3.2 | MIT License | https://tailwindcss.com */',
          '/*tokens: template-corpus-card <= src/pages/index/index.vue */',
          ...(hasRule ? ['.template-corpus-card{display:block}'] : []),
        ].join('\n'),
        injectIntoMain: true,
        outputFile: 'app.css',
      }],
    ])

    const context = {
      opts: {
        ...opts(),
        appType: 'uni-app-vite',
        cssMatcher: (file: string) => file.endsWith('.css'),
        mainCssChunkMatcher: () => false,
      },
      getViteProcessedCssAssetResults: () => records.entries(),
      debug: vi.fn(),
    }
    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, context)

    const output = String((bundle['app.css'] as OutputAsset).source)
    expect(injected).toBe(hasRule ? 1 : 0)
    expect(output.match(/\.template-corpus-card\s*\{/g)).toHaveLength(1)
    expect(output).not.toContain('/*! tailwindcss')
    if (hasRule) {
      expect(output).toContain('/*tokens: template-corpus-card <= src/pages/index/index.vue */')
    }
    else {
      expect(output).toBe('.template-corpus-card{display:block}')
    }
    expect(injectViteProcessedCssIntoMainCssAssets(bundle, context)).toBe(0)
    expect(String((bundle['app.css'] as OutputAsset).source)).toBe(output)
  })

  it('does not treat non-root uni-app vite page css as app webview main css', () => {
    const root = '/project'
    const bundle: OutputBundle = {
      'app.css': asset('app.css', ''),
      'pages/index.css': asset('pages/index.css', `${createBundlerGeneratedCssMarker('vite', `${root}/src/pages/index.css`)}\n.page-only{color:green}`),
    }
    const records = new Map<string, any>()

    collectViteProcessedCssAssetResults(bundle, {
      opts: {
        ...opts(),
        appType: 'uni-app-vite',
        cssMatcher: (file: string) => file.endsWith('.css'),
        cssEntries: [`${root}/src/main.css`],
        mainCssChunkMatcher: () => false,
      },
      isViteProcessedCssAsset: (_asset, file) => file === 'pages/index.css',
      recordViteProcessedCssAssetResult(file, css, options) {
        records.set(file, { css, ...options })
      },
      resolveViteProcessedCssOutputFile: () => 'app.css',
      debug: vi.fn(),
    })
    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: {
        ...opts(),
        appType: 'uni-app-vite',
        cssMatcher: (file: string) => file.endsWith('.css'),
        mainCssChunkMatcher: () => false,
      },
      getViteProcessedCssAssetResults: () => records.entries(),
      debug: vi.fn(),
    })

    expect(injected).toBe(0)
    expect(String((bundle['app.css'] as OutputAsset).source)).toBe('')
    expect(records.get('pages/index.css')?.injectIntoMain).toBeUndefined()
  })

  it('removes scoped uni-app vite app webview tailwind duplicates from page css', () => {
    const bundle: OutputBundle = {
      'app.css': asset('app.css', [
        '/*! tailwindcss v4.3.2 | MIT License | https://tailwindcss.com */',
        ':root,:host{--spacing:.25rem;--color-slate-700:rgb(49,65,88)}',
        '*,::after,::before{box-sizing:border-box;margin:0;padding:0}',
        'html,:host{tab-size:4}',
        '.space-y-2>:not(:last-child){margin-block-start:calc(var(--spacing) * 2)}',
        '@property --tw-space-y-reverse { syntax: "*"; inherits: false; initial-value: 0; }',
      ].join('\n')),
      'pages/index/index.css': asset('pages/index/index.css', [
        '/* uni comment */',
        '/*! tailwindcss v4.3.2 | MIT License | https://tailwindcss.com */',
        '[data-v-e17ea971]:root,[data-v-e17ea971]:host{--spacing:.25rem;--color-slate-700:rgb(49,65,88)}',
        '*[data-v-e17ea971],[data-v-e17ea971]::after,[data-v-e17ea971]::before{box-sizing:border-box;margin:0;padding:0}',
        'html[data-v-e17ea971],[data-v-e17ea971]:host{-moz-tab-size:4;tab-size:4}',
        'uni-progress[data-v-e17ea971]{vertical-align:baseline}',
        '.space-y-2[data-v-e17ea971]>:not(:last-child){margin-block-start:calc(var(--spacing) * 2)}',
        '.hello-world-shell[data-v-e17ea971]{display:flex;color:var(--color-slate-700)}',
        '@property --tw-space-y-reverse { syntax: "*"; inherits: false; initial-value: 0; }',
      ].join('\n')),
    }
    const onUpdate = vi.fn()

    expect(removeCssCoveredByRootStyleAssets(bundle, {
      cssMatcher: (file: string) => file === 'app.css',
      isViteProcessedCssAsset: (_asset, file) => file === 'pages/index/index.css',
      onUpdate,
      debug: vi.fn(),
    })).toBe(1)

    const pageCss = String((bundle['pages/index/index.css'] as OutputAsset).source)
    expect(pageCss).toContain('.hello-world-shell[data-v-e17ea971]')
    expect(pageCss).not.toContain('tailwindcss v4.3.2')
    expect(pageCss).not.toContain('.space-y-2')
    expect(pageCss).not.toContain('box-sizing:border-box')
    expect(pageCss).not.toContain('-moz-tab-size')
    expect(pageCss).not.toContain('uni-progress')
    expect(pageCss).not.toContain('@property --tw-space-y-reverse')
    expect(pageCss).toContain('/* uni comment */')
    expect(onUpdate).toHaveBeenCalled()
  })

  it('removes unscoped uni-app vite app webview tailwind duplicates from page css when root css covers them', () => {
    const generatedCss = [
      '/*! tailwindcss v4.3.2 | MIT License | https://tailwindcss.com */',
      '.template-corpus-card{display:block}',
      '.space-y-2>:not(:last-child){margin-block-start:calc(var(--spacing) * 2)}',
    ].join('\n')
    const bundle: OutputBundle = {
      'app.css': asset('app.css', generatedCss),
      'pkg/pages/user/user.css': asset('pkg/pages/user/user.css', [
        '/*! tailwindcss v4.3.2 | MIT License | https://tailwindcss.com */',
        '/*tokens: template-corpus-card <= src/pkg/pages/user.vue */',
        '.template-corpus-card{display:block}',
        '/*tokens: space-y-2 <= src/pkg/pages/user.vue */',
        '.space-y-2>:not(:last-child){margin-block-start:calc(var(--spacing) * 2)}',
      ].join('\n')),
    }
    const onUpdate = vi.fn()

    expect(removeCssCoveredByRootStyleAssets(bundle, {
      cssMatcher: (file: string) => file === 'app.css',
      includeTailwindGeneratedCssAssets: true,
      isViteProcessedCssAsset: (_asset, file) => file === 'pkg/pages/user/user.css',
      onUpdate,
      debug: vi.fn(),
    })).toBe(1)

    expect(String((bundle['pkg/pages/user/user.css'] as OutputAsset).source)).toBe('')
    expect(onUpdate).toHaveBeenCalled()
  })

  it('keeps unscoped tailwind page css when app webview duplicate cleanup is disabled', () => {
    const bundle: OutputBundle = {
      'app.css': asset('app.css', '.template-corpus-card{display:block}'),
      'pkg/pages/user/user.css': asset('pkg/pages/user/user.css', [
        '/*! tailwindcss v4.3.2 | MIT License | https://tailwindcss.com */',
        '.template-corpus-card{display:block}',
      ].join('\n')),
    }

    expect(removeCssCoveredByRootStyleAssets(bundle, {
      cssMatcher: (file: string) => file === 'app.css',
      isViteProcessedCssAsset: (_asset, file) => file === 'pkg/pages/user/user.css',
      debug: vi.fn(),
    })).toBe(0)

    expect(String((bundle['pkg/pages/user/user.css'] as OutputAsset).source)).toContain('tailwindcss v4.3.2')
  })

  it('removes scoped tailwind preflight without root css coverage', () => {
    const css = [
      '/*! tailwindcss v4.3.2 | MIT License | https://tailwindcss.com */',
      '[data-v-e17ea971]:root,[data-v-e17ea971]:host{--spacing:.25rem}',
      'uni-progress[data-v-e17ea971]{vertical-align:baseline}',
      '.hello-world-shell[data-v-e17ea971]{display:flex}',
    ].join('\n')

    const nextCss = removeScopedTailwindPreflightCss(css)

    expect(nextCss).toContain('.hello-world-shell[data-v-e17ea971]')
    expect(nextCss).not.toContain('tailwindcss v4.3.2')
    expect(nextCss).not.toContain(':root')
    expect(nextCss).not.toContain('uni-progress')
  })

  it('preserves user scoped element css while removing scoped tailwind preflight', () => {
    const css = [
      '/*! tailwindcss v4.3.2 | MIT License | https://tailwindcss.com */',
      '*[data-v-e17ea971],[data-v-e17ea971]::after,[data-v-e17ea971]::before{box-sizing:border-box;margin:0;padding:0}',
      'view[data-v-e17ea971]{color:red}',
      '@media (min-width: 640px){view[data-v-e17ea971]{display:block}}',
      '@property --tw-space-y-reverse { syntax: "*"; inherits: false; initial-value: 0; }',
    ].join('\n')

    const nextCss = removeScopedTailwindPreflightCss(css)

    expect(nextCss).toContain('view[data-v-e17ea971]{color:red}')
    expect(nextCss).toContain('@media (min-width: 640px)')
    expect(nextCss).not.toContain('box-sizing:border-box')
    expect(nextCss).not.toContain('@property --tw-space-y-reverse')
  })

  it('removes scoped uni-app Web preflight that would override global utilities', () => {
    const css = [
      '/*! tailwindcss v4.3.3 | MIT License | https://tailwindcss.com */',
      'uni-view[data-v-00a60067],uni-text[data-v-00a60067],[data-v-00a60067]::after,[data-v-00a60067]::before{box-sizing:border-box;margin:0;padding:0;border:0 solid}',
      'uni-view[data-v-00a60067]{color:red}',
      '.content[data-v-00a60067]{display:flex}',
    ].join('\n')

    const nextCss = removeScopedTailwindPreflightCss(css)

    expect(nextCss).not.toContain('box-sizing:border-box')
    expect(nextCss).not.toContain('margin:0')
    expect(nextCss).toContain('uni-view[data-v-00a60067]{color:red}')
    expect(nextCss).toContain('.content[data-v-00a60067]{display:flex}')
  })

  it('removes framework-processed scoped uni-app Web preflight without a Tailwind banner', () => {
    const css = [
      'uni-view[data-v-00a60067],uni-text[data-v-00a60067],[data-v-00a60067]::after,[data-v-00a60067]::before{box-sizing:border-box;margin:0;padding:0;border:0 solid}',
      'uni-view[data-v-00a60067]{color:red}',
      '.content[data-v-00a60067]{display:flex}',
    ].join('\n')

    const nextCss = removeScopedTailwindPreflightCss(css)

    expect(nextCss).not.toContain('box-sizing:border-box')
    expect(nextCss).not.toContain('margin:0')
    expect(nextCss).toContain('uni-view[data-v-00a60067]{color:red}')
    expect(nextCss).toContain('.content[data-v-00a60067]{display:flex}')
  })

  it('removes bannerless Tailwind layer, property and universal preflight noise from scoped @reference output', () => {
    const css = [
      '@layer properties;',
      '@layer theme, base, components, utilities;',
      '@layer theme;',
      '@layer base;',
      '@property --tw-content{syntax:"*";initial-value:"";inherits:false}',
      '*[data-v-04bcf89b],[data-v-04bcf89b]::before,[data-v-04bcf89b]::after,[data-v-04bcf89b]::backdrop{--tw-content:""}',
      '@layer components{.hello-world-shell[data-v-04bcf89b]{display:flex}}',
      '.user-card[data-v-04bcf89b]{padding:16px}',
    ].join('\n')

    const nextCss = removeScopedTailwindPreflightCss(css)

    expect(nextCss).not.toContain('@layer properties')
    expect(nextCss).not.toContain('@layer theme, base, components, utilities')
    expect(nextCss).not.toContain('@property --tw-content')
    expect(nextCss).not.toContain('--tw-content:""')
    expect(nextCss).toContain('@layer components{.hello-world-shell[data-v-04bcf89b]{display:flex}}')
    expect(nextCss).toContain('.user-card[data-v-04bcf89b]{padding:16px}')
  })

  it('removes scoped universal preflight when Vue serializes pseudo-elements with one colon', () => {
    const css = '*[data-v-04bcf89b],[data-v-04bcf89b]:before,[data-v-04bcf89b]:after,[data-v-04bcf89b]::backdrop{--tw-content:""}\n.card[data-v-04bcf89b]{color:red}'

    const nextCss = removeScopedTailwindPreflightCss(css)

    expect(nextCss).not.toContain('--tw-content:""')
    expect(nextCss).toContain('.card[data-v-04bcf89b]{color:red}')
  })

  it('preserves mixed user scoped css while removing scoped Tailwind theme and element preflight', () => {
    const css = [
      '/*! tailwindcss v4.3.2 | MIT License | https://tailwindcss.com */',
      '[data-v-04bcf89b]:root,[data-v-04bcf89b]:host{--spacing:.25rem}',
      '*[data-v-04bcf89b],[data-v-04bcf89b]::after,[data-v-04bcf89b]::before{box-sizing:border-box;margin:0;padding:0}',
      'html[data-v-04bcf89b],[data-v-04bcf89b]:host{line-height:1.5;-webkit-text-size-adjust:100%;-o-tab-size:4;tab-size:4;font-family:var(--default-font-family,sans-serif);font-feature-settings:var(--default-font-feature-settings,normal);font-variation-settings:var(--default-font-variation-settings,normal);-webkit-tap-highlight-color:transparent}',
      'abbr:where([title][data-v-04bcf89b]){text-decoration:underline dotted}',
      'button[data-v-04bcf89b],input[data-v-04bcf89b]{font:inherit;color:inherit;background-color:transparent}',
      '[data-v-04bcf89b]::file-selector-button{margin-inline-end:4px}',
      '[data-v-04bcf89b]::placeholder{color:currentcolor}',
      '[data-v-04bcf89b]::-webkit-datetime-edit{padding-block:0}',
      '[data-v-04bcf89b]::-webkit-calendar-picker-indicator{line-height:1}',
      'uni-button[data-v-04bcf89b]{font:inherit}',
      'view[data-v-04bcf89b]{color:red}',
      'button[data-v-04bcf89b]{color:red}',
      'input[data-v-04bcf89b]{border-color:#123456}',
      'img[data-v-04bcf89b]{width:12px}',
      '.card[data-v-04bcf89b]{padding:16px}',
      '@media (min-width: 640px){text[data-v-04bcf89b]{display:block}.card[data-v-04bcf89b]{display:flex}}',
    ].join('\n')

    const nextCss = removeScopedTailwindPreflightCss(css)

    expect(nextCss).toContain('view[data-v-04bcf89b]{color:red}')
    expect(nextCss).toContain('button[data-v-04bcf89b]{color:red}')
    expect(nextCss).toContain('input[data-v-04bcf89b]{border-color:#123456}')
    expect(nextCss).toContain('img[data-v-04bcf89b]{width:12px}')
    expect(nextCss).toContain('uni-button[data-v-04bcf89b]{font:inherit}')
    expect(nextCss).toContain('.card[data-v-04bcf89b]{padding:16px}')
    expect(nextCss).toContain('@media (min-width: 640px)')
    expect(nextCss).toContain('text[data-v-04bcf89b]{display:block}')
    expect(nextCss).not.toContain('tailwindcss v4.3.2')
    expect(nextCss).not.toContain(':host')
    expect(nextCss).not.toContain('box-sizing:border-box')
    expect(nextCss).not.toContain('button[data-v-04bcf89b],input[data-v-04bcf89b]')
    expect(nextCss).not.toContain('--default-font-family')
    expect(nextCss).not.toContain('margin-inline-end')
    expect(nextCss).not.toContain('currentcolor')
    expect(nextCss).not.toContain('padding-block')
  })

  it('removes unscoped mini-program preflight from scoped generated css without a Tailwind banner', () => {
    const css = [
      'view,text,::after,::before{--tw-content:""}',
      '.hello-world-shell{display:flex}',
      'view.data-v-04bcf89b{text-align:left}',
      '.hello-world-shell.data-v-04bcf89b{display:flex}',
    ].join('\n')

    const nextCss = removeScopedTailwindPreflightCss(css)

    expect(nextCss).not.toContain('view,text,::after,::before')
    expect(nextCss).toContain('.hello-world-shell{display:flex}')
    expect(nextCss).toContain('view.data-v-04bcf89b{text-align:left}')
    expect(nextCss).toContain('.hello-world-shell.data-v-04bcf89b{display:flex}')
  })

  it('removes scoped mini-program content init from local @reference output', () => {
    const css = [
      '.hello-world-shell{display:flex}',
      'view.data-v-04bcf89b,text.data-v-04bcf89b,.data-v-04bcf89b::after,.data-v-04bcf89b::before{--tw-content:""}',
      'view.data-v-04bcf89b{text-align:left}',
      '.hello-world-shell.data-v-04bcf89b{display:flex}',
      '.before_ccontent-_bhello_B.data-v-04bcf89b::before{--tw-content:"hello";content:var(--tw-content)}',
    ].join('\n')

    const nextCss = removeScopedTailwindPreflightCss(css)

    expect(nextCss).not.toContain('view.data-v-04bcf89b,text.data-v-04bcf89b')
    expect(nextCss).not.toContain('.data-v-04bcf89b::after')
    expect(nextCss).toContain('view.data-v-04bcf89b{text-align:left}')
    expect(nextCss).toContain('.hello-world-shell.data-v-04bcf89b{display:flex}')
    expect(nextCss).toContain('.before_ccontent-_bhello_B.data-v-04bcf89b::before')
  })

  it('moves taro import shell injection to the imported root css asset', () => {
    const bundle: OutputBundle = {
      'app.wxss': asset('app.wxss', ''),
      'pages/index.wxss': asset('pages/index.wxss', '@import "../app.wxss";'),
    }
    const records = new Map<string, any>([
      ['src/app.css', { css: '.generated{color:blue}', injectIntoMain: true, outputFile: 'app.wxss' }],
    ])
    const debug = vi.fn()

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: opts(),
      getViteProcessedCssAssetResults: () => records.entries(),
      markCssAssetProcessed: vi.fn(),
      debug,
    })

    expect(injected).toBe(1)
    expect(String((bundle['app.wxss'] as OutputAsset).source)).toBe('.generated{color:blue}')
    expect(String((bundle['pages/index.wxss'] as OutputAsset).source)).toBe('@import "../app.wxss";')
    expect(debug).toHaveBeenCalledWith('inject vite-processed css into main css asset: %s bytes=%d', 'app.wxss', 22)
  })

  it('removes bare package imports when replaying taro app css into the origin shell target', () => {
    const bundle: OutputBundle = {
      'app.wxss': asset('app.wxss', '@import "./app-origin.wxss";'),
      'app-origin.wxss': asset('app-origin.wxss', '.nut-button{color:red}'),
    }
    const records = new Map<string, any>([
      ['src/app.css', {
        css: [
          '@import "@nutui/nutui-react-taro/dist/styles/themes/default.css";',
          '@import "@nutui/nutui-react-taro/dist/style.css";',
          '.generated{color:blue}',
        ].join('\n'),
        injectIntoMain: true,
        outputFile: 'app.wxss',
      }],
    ])

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: opts(),
      cssPipelineStrategy: taroImportShellStrategy,
      createCssPipelineContext,
      getViteProcessedCssAssetResults: () => records.entries(),
      markCssAssetProcessed: vi.fn(),
      debug: vi.fn(),
    })

    const originCss = String((bundle['app-origin.wxss'] as OutputAsset).source)
    expect(injected).toBe(1)
    expect(String((bundle['app.wxss'] as OutputAsset).source)).toBe('@import "./app-origin.wxss";')
    expect(originCss).toContain('.nut-button{color:red}')
    expect(originCss).toContain('.generated{color:blue}')
    expect(originCss).not.toContain('@nutui/nutui-react-taro')
  })

  it('removes bare package imports from mini-program css assets before injection', () => {
    const bundle: OutputBundle = {
      'vendors.wxss': asset('vendors.wxss', [
        '@import "@nutui/nutui-react-taro/dist/styles/themes/default.css";',
        '.vendor{color:red}',
      ].join('\n')),
    }
    const records = new Map<string, any>([
      ['src/vendor.css', { css: '.generated{color:blue}', injectIntoMain: true, outputFile: 'vendors.wxss' }],
    ])

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: {
        ...opts(),
        mainCssChunkMatcher: (file: string) => file === 'vendors.wxss',
      },
      getViteProcessedCssAssetResults: () => records.entries(),
      markCssAssetProcessed: vi.fn(),
      debug: vi.fn(),
    })

    const vendorsCss = String((bundle['vendors.wxss'] as OutputAsset).source)
    expect(injected).toBe(1)
    expect(vendorsCss).toContain('.vendor{color:red}')
    expect(vendorsCss).toContain('.generated{color:blue}')
    expect(vendorsCss).not.toContain('@nutui/nutui-react-taro')
  })

  it('keeps extra declarations for existing third-party selectors during main css injection', () => {
    const bundle: OutputBundle = {
      'app.wxss': asset('app.wxss', '.u-cell{display:flex}'),
    }
    const records = new Map<string, any>([
      ['node_modules/uview-plus/index.scss', {
        css: [
          '.u-cell{display:flex;color:var(--u-cell-color,#303133)}',
          '.u-cell--clickable{background-color:var(--u-cell-active-color,#f5f7fa)}',
        ].join('\n'),
        injectIntoMain: true,
        outputFile: 'app.wxss',
      }],
    ])

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: opts(),
      getViteProcessedCssAssetResults: () => records.entries(),
      markCssAssetProcessed: vi.fn(),
      debug: vi.fn(),
    })

    const appCss = String((bundle['app.wxss'] as OutputAsset).source)
    expect(injected).toBe(1)
    expect(appCss).toContain('.u-cell')
    expect(appCss).toContain('display:flex')
    expect(appCss).toContain('--u-cell-color')
    expect(appCss).toContain('.u-cell--clickable')
  })

  it('keeps scoped third-party declarations that are not covered by root css', async () => {
    const { removeCssCoveredByRootStyleBundleSources } = await import('@/bundlers/vite/processed-css-assets')
    const bundle: OutputBundle = {
      'app.wxss': asset('app.wxss', '.u-cell{display:flex}'),
      'node-modules/uview-plus/components/u-cell/u-cell.wxss': asset(
        'node-modules/uview-plus/components/u-cell/u-cell.wxss',
        '.u-cell.data-v-uview{display:flex;color:var(--u-cell-color,#303133)}',
      ),
    }

    const css = removeCssCoveredByRootStyleBundleSources(
      bundle,
      'node-modules/uview-plus/components/u-cell/u-cell.wxss',
      String((bundle['node-modules/uview-plus/components/u-cell/u-cell.wxss'] as OutputAsset).source),
    )

    expect(css).toContain('.u-cell.data-v-uview')
    expect(css).toContain('--u-cell-color')
  })

  it('removes scoped Tailwind global css without a root style bundle asset', async () => {
    const { removeCssCoveredByRootStyleBundleSources } = await import('@/bundlers/vite/processed-css-assets')
    const source = [
      '/*! tailwindcss v4.3.2 | MIT License | https://tailwindcss.com */',
      '@layer theme{[data-v-page]:root,[data-v-page]:host{--font-sans:ui-sans-serif}}',
      '@layer base{*[data-v-page]{box-sizing:border-box}}',
      '.page[data-v-page]{color:red}',
    ].join('')
    const bundle: OutputBundle = {
      'assets/page.css': asset('assets/page.css', source),
    }

    const css = removeCssCoveredByRootStyleBundleSources(bundle, 'assets/page.css', source)

    expect(css).not.toContain('tailwindcss v4.3.2')
    expect(css).not.toContain('--font-sans')
    expect(css).not.toContain('box-sizing:border-box')
    expect(css).toContain('.page[data-v-page]{color:red}')
  })

  it('removes unsupported imports from non-wechat mini-program css assets while preserving local imports', () => {
    const bundle: OutputBundle = {
      'main.acss': asset('main.acss', [
        '@import "./local-theme.acss";',
        '@import "third-party-ui/dist/theme.css";',
        '@import url("https://example.com/remote.css");',
        '.main{color:red}',
      ].join('\n')),
    }
    const records = new Map<string, any>([
      ['src/main.css', {
        css: [
          '@import "./component.acss";',
          '@import "another-package/styles.css";',
          '.generated{color:blue}',
        ].join('\n'),
        injectIntoMain: true,
        outputFile: 'main.acss',
      }],
    ])

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: {
        ...opts(),
        cssMatcher: (file: string) => /\.(?:css|acss)$/.test(file),
        mainCssChunkMatcher: (file: string) => file === 'main.acss',
      },
      getViteProcessedCssAssetResults: () => records.entries(),
      markCssAssetProcessed: vi.fn(),
      debug: vi.fn(),
    })

    const mainCss = String((bundle['main.acss'] as OutputAsset).source)
    expect(injected).toBe(1)
    expect(mainCss).toContain('@import "./local-theme.acss";')
    expect(mainCss).toContain('@import "./component.acss";')
    expect(mainCss).toContain('.main{color:red}')
    expect(mainCss).toContain('.generated{color:blue}')
    expect(mainCss).not.toContain('third-party-ui')
    expect(mainCss).not.toContain('another-package')
    expect(mainCss).not.toContain('https://example.com')
  })

  it('uses fallback import cleanup when mini-program css cannot be parsed', () => {
    const bundle: OutputBundle = {
      'main.acss': asset('main.acss', [
        '@import "./local-theme.acss";',
        '@import "third-party-ui/dist/theme.css";',
        '.main{color:red',
      ].join('\n')),
    }
    const records = new Map<string, any>([
      ['src/main.css', {
        css: [
          '@import "./component.acss";',
          '@import "another-package/styles.css";',
          '.generated{color:blue}',
        ].join('\n'),
        injectIntoMain: true,
        outputFile: 'main.acss',
      }],
    ])

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: {
        ...opts(),
        cssMatcher: (file: string) => /\.(?:css|acss)$/.test(file),
        mainCssChunkMatcher: (file: string) => file === 'main.acss',
      },
      getViteProcessedCssAssetResults: () => records.entries(),
      markCssAssetProcessed: vi.fn(),
      debug: vi.fn(),
    })

    const mainCss = String((bundle['main.acss'] as OutputAsset).source)
    expect(injected).toBe(1)
    expect(mainCss).toContain('@import "./local-theme.acss";')
    expect(mainCss).toContain('@import "./component.acss";')
    expect(mainCss).toContain('.generated{color:blue}')
    expect(mainCss).not.toContain('third-party-ui')
    expect(mainCss).not.toContain('another-package')
  })

  it('cleans parsed source media wrappers and empty nested at-rules before injection', () => {
    const bundle: OutputBundle = {
      'app.wxss': asset('app.wxss', [
        '@media source("./src") {',
        '  .from-source{display:block}',
        '}',
        '@supports (display: grid) {}',
      ].join('\n')),
    }
    const records = new Map<string, any>([
      ['src/app.css', { css: '.generated{color:blue}', injectIntoMain: true, outputFile: 'app.wxss' }],
    ])

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: opts(),
      getViteProcessedCssAssetResults: () => records.entries(),
      debug: vi.fn(),
    })

    const css = String((bundle['app.wxss'] as OutputAsset).source)
    expect(injected).toBe(1)
    expect(css).toContain('.from-source')
    expect(css).toContain('.generated{color:blue}')
    expect(css).not.toContain('@media source')
    expect(css).not.toContain('@supports')
  })

  it('preserves taro import shells when the imported target is not injectable', () => {
    const records = new Map<string, any>([
      ['src/app.css', { css: '.generated{color:blue}', injectIntoMain: true, outputFile: 'app.wxss' }],
    ])
    const debug = vi.fn()

    const nonRootImportBundle: OutputBundle = {
      'pages/dep.wxss': asset('pages/dep.wxss', '.dep{color:red}'),
      'app.wxss': asset('app.wxss', '@import "./pages/dep.wxss";'),
    }
    expect(injectViteProcessedCssIntoMainCssAssets(nonRootImportBundle, {
      opts: {
        ...opts(),
        mainCssChunkMatcher: (file: string) => file === 'app.wxss',
      },
      cssPipelineStrategy: taroImportShellStrategy,
      createCssPipelineContext,
      getViteProcessedCssAssetResults: () => records.entries(),
      debug,
    })).toBe(0)

    const missingRootBundle: OutputBundle = {
      'app.wxss': asset('app.wxss', '@import "./missing.wxss";'),
    }
    expect(injectViteProcessedCssIntoMainCssAssets(missingRootBundle, {
      opts: {
        ...opts(),
        mainCssChunkMatcher: (file: string) => file === 'app.wxss',
      },
      cssPipelineStrategy: taroImportShellStrategy,
      createCssPipelineContext,
      getViteProcessedCssAssetResults: () => records.entries(),
      debug,
    })).toBe(0)

    expect(debug).toHaveBeenCalledWith('preserve mini-program css import shell asset: %s', 'app.wxss')
  })

  it('skips non-root explicit targets when records are missing or empty after import coverage', () => {
    const bundle: OutputBundle = {
      'pages/index.wxss': asset('pages/index.wxss', '@import "../shared.wxss";\n.page{color:black}'),
      'shared.wxss': asset('shared.wxss', '.shared{color:black}'),
    }
    const records = new Map<string, any>([
      ['src/no-output.css', { css: '.no-output{color:red}', injectIntoMain: true }],
      ['src/wrong.css', { css: '.wrong{color:red}', injectIntoMain: true, outputFile: 'pages/other.wxss' }],
      ['src/imported.css', { css: '.shared{color:black}', injectIntoMain: true, outputFile: 'pages/index.wxss' }],
    ])

    const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
      opts: {
        ...opts(),
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        mainCssChunkMatcher: (file: string) => file === 'pages/index.wxss',
      },
      getViteProcessedCssAssetResults: () => records.entries(),
      debug: vi.fn(),
    })

    expect(injected).toBe(1)
    expect(String((bundle['pages/index.wxss'] as OutputAsset).source)).toBe('@import "../shared.wxss";\n.page{color:black}')
    expect(String((bundle['pages/index.wxss'] as OutputAsset).source)).not.toContain('.shared{color:black}')
  })

  it('records aliases for matching multi-marker processed css blocks', () => {
    const bundle: OutputBundle = {
      'pages/index.wxss': asset('pages/index.wxss', [
        createBundlerGeneratedCssMarker('vite', 'src/pages/index.css'),
        '.page{color:green}',
        createBundlerGeneratedCssMarker('vite', 'src/pages/other.css'),
        '.other{color:red}',
      ].join('\n')),
    }
    const records: Array<[string, any]> = []

    const collected = collectViteProcessedCssAssetResults(bundle, {
      opts: opts(),
      isViteProcessedCssAsset: (_asset, file) => file === 'pages/index.wxss',
      recordViteProcessedCssAssetResult(file, css, options) {
        records.push([file, { css, ...options }])
      },
      resolveViteProcessedCssOutputFile: file => file.replace(/^src\//, '').replace(/\.css$/, '.wxss'),
      debug: vi.fn(),
    })

    expect(collected).toBe(1)
    expect(String((bundle['pages/index.wxss'] as OutputAsset).source).trim()).toBe('.page{color:green}')
    expect(records.some(([file]) => file === 'src/pages/index.css')).toBe(true)
    expect(records.some(([file]) => file === 'pages/index.wxss')).toBe(true)
  })
})
