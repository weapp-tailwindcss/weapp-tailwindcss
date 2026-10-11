import type { OutputAsset, OutputBundle } from 'rollup'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBundlerGeneratedCssMarker } from '@/bundlers/shared/generated-css-marker'
import { createViteCssFinalizerOutputPlugin } from '@/bundlers/vite/css-finalizer'
import { UNI_APP_X_WEB_PREFLIGHT_RESET_MARKER, withUniAppXWebPreflightReset } from '@/uni-app-x/web-preflight-reset'

const mocks = vi.hoisted(() => ({
  generateTailwindV4Css: vi.fn(),
}))

vi.mock('@/generation/service', () => ({
  generateTailwindV4Css: mocks.generateTailwindV4Css,
}))

function asset(fileName: string, source: string): OutputAsset {
  return {
    type: 'asset',
    fileName,
    names: [],
    originalFileNames: [],
    source,
  }
}

function getHandler(plugin: any) {
  return plugin.generateBundle.handler as (this: any, options: any, bundle: OutputBundle) => Promise<void>
}

function createContext(overrides: Record<string, any> = {}) {
  const processed = new WeakSet<OutputAsset>()
  const records = new Map<string, any>()
  const opts = {
    appType: 'taro',
    cssMatcher: (file: string) => /\.(?:css|wxss)$/.test(file),
    htmlMatcher: (file: string) => /\.(?:html|wxml)$/.test(file),
    mainCssChunkMatcher: (file: string) => /^(?:app|main)\.(?:css|wxss)$/.test(file),
    styleHandler: vi.fn(async (css: string) => ({ css: `${css}\n.handled{color:green}` })),
    onUpdate: vi.fn(),
    generator: {
      target: 'weapp',
    },
  }
  const context = {
    opts,
    runtimeState: {
      tailwindRuntime: {
        majorVersion: 4,
      },
      readyPromise: Promise.resolve(),
    },
    ensureRuntimeClassSet: vi.fn(async () => new Set(['text-red-500', 'hover:bg-red-500'])),
    isCssAssetProcessed: vi.fn((asset: OutputAsset) => processed.has(asset)),
    markCssAssetProcessed: vi.fn((asset: OutputAsset) => {
      processed.add(asset)
    }),
    debug: vi.fn(),
    getResolvedConfig: vi.fn(() => ({
      command: 'build',
      root: process.cwd(),
      build: { outDir: 'dist' },
    })),
    recordCssAssetResult: vi.fn((file: string, css: string) => {
      records.set(file, { css })
    }),
    recordViteProcessedCssAssetResult: vi.fn((file: string, css: string, options?: any) => {
      records.set(file, { css, ...options })
    }),
    getViteProcessedCssAssetResults: vi.fn(() => records.entries()),
    getSourceCandidates: vi.fn(() => new Set(['text-blue-500'])),
    waitForSourceCandidateSyncs: vi.fn(async () => undefined),
    ...overrides,
  }

  return {
    context,
    opts,
    processed,
    records,
  }
}

const uniAppXFinalizerStrategy = {
  isHarmonyAppStyleTarget: () => true,
  transformGeneratedCss(css: string, context: any) {
    const webCss = context.shouldApplyWebCssCompat
      ? context.defaultWebCssCompat(css)
      : css
    return withUniAppXWebPreflightReset(webCss, context.currentGeneratorBranch.isWeb)
  },
}

describe('vite css finalizer output plugin', () => {
  beforeEach(() => {
    mocks.generateTailwindV4Css.mockReset()
  })

  it('returns early outside build mode for non-native targets', async () => {
    const { context } = createContext({
      getResolvedConfig: vi.fn(() => ({ command: 'serve', root: process.cwd() })),
    })
    const plugin = createViteCssFinalizerOutputPlugin(context as any)
    const bundle: OutputBundle = {
      'app.wxss': asset('app.wxss', '.root{color:red}'),
    }

    await getHandler(plugin).call(plugin, {}, bundle)

    expect(String((bundle['app.wxss'] as OutputAsset).source)).toBe('.root{color:red}')
    expect(context.markCssAssetProcessed).not.toHaveBeenCalled()
  })

  it('finalizes Generic Web css assets once without reading js chunks', async () => {
    const transformGeneratedCss = vi.fn((css: string) => `${css}\n.finalized{display:block}`)
    const hmrTimingRecorder = {
      emitTotal: vi.fn(),
      measure: vi.fn(),
      record: vi.fn(),
    }
    const records = new Map<string, any>([
      ['/project/src/app.css', {
        css: '.app{color:red}.icon-mdi--home{display:inline-block}',
        outputFile: 'assets/app.css',
      }],
      ['/project/src/admin.css', {
        css: '.admin{color:blue}.text-sm{font-size:.875rem}',
        outputFile: 'assets/admin.css',
      }],
    ])
    const { context } = createContext({
      frameworkName: 'generic',
      opts: {
        appType: 'native',
        cssMatcher: (file: string) => file.endsWith('.css'),
        htmlMatcher: (file: string) => file.endsWith('.html'),
        mainCssChunkMatcher: () => false,
        styleHandler: vi.fn(),
        onUpdate: vi.fn(),
        generator: { target: 'web' },
      },
      cssPipelineStrategy: { transformGeneratedCss },
      hmrTimingRecorder,
      getViteProcessedCssAssetResults: vi.fn(() => records.entries()),
      isViteProcessedCssAsset: vi.fn((_asset: OutputAsset, file?: string) => file?.endsWith('.css') === true),
      resolveCssAssetIdentity: vi.fn((_asset: OutputAsset, file?: string) => ({
        kind: 'bundler-generated',
        sourceFile: file === 'assets/app.css' ? '/project/src/app.css' : '/project/src/admin.css',
      })),
    })
    const plugin = createViteCssFinalizerOutputPlugin(context as any)
    const appCss = asset('assets/app.css', `${createBundlerGeneratedCssMarker('vite', '/project/src/app.css')}\n.app{color:red}.icon-mdi--home{display:inline-block}`)
    const adminCss = asset('assets/admin.css', `${createBundlerGeneratedCssMarker('vite', '/project/src/admin.css')}\n.admin{color:blue}.text-sm{font-size:.875rem}`)
    const jsChunk = {
      type: 'chunk',
      fileName: 'assets/app.js',
      get code() {
        throw new Error('Generic Web finalizer must not read JS chunks')
      },
    }
    const bundle = {
      'assets/app.css': appCss,
      'assets/admin.css': adminCss,
      'assets/app.js': jsChunk,
    } as unknown as OutputBundle

    await getHandler(plugin).call(plugin, {}, bundle)

    expect(String(appCss.source)).toContain('.icon-mdi--home')
    expect(String(adminCss.source)).toContain('.text-sm')
    expect(String(appCss.source)).not.toContain('weapp-tailwindcss:generated-css')
    expect(String(adminCss.source)).not.toContain('weapp-tailwindcss:generated-css')
    expect(transformGeneratedCss).toHaveBeenCalledTimes(2)
    expect(context.opts.styleHandler).not.toHaveBeenCalled()
    expect(context.opts.onUpdate).toHaveBeenCalledTimes(2)
    expect(hmrTimingRecorder.record).toHaveBeenCalledWith('cssFinalizer', expect.any(Number), {
      timingDetails: expect.objectContaining({
        'assets.enumerate': expect.any(Number),
        'assets.markerCleanupWrite': expect.any(Number),
        'finalizeWebCss': expect.any(Number),
        'processedCss.collect': expect.any(Number),
        'processedCss.inject': expect.any(Number),
      }),
    })
    expect(hmrTimingRecorder.emitTotal).toHaveBeenCalledOnce()
  })

  it('falls back when a Generic Web processed css record has no final asset identity', async () => {
    const records = new Map<string, any>([
      ['/project/src/missing.css', {
        css: '.missing{color:red}',
        outputFile: 'assets/missing.css',
      }],
    ])
    const { context } = createContext({
      frameworkName: 'generic',
      opts: {
        appType: 'native',
        cssMatcher: (file: string) => file.endsWith('.css'),
        htmlMatcher: (file: string) => file.endsWith('.html'),
        mainCssChunkMatcher: (file: string) => file === 'assets/app.css',
        styleHandler: vi.fn(),
        onUpdate: vi.fn(),
        generator: { target: 'web' },
      },
      getViteProcessedCssAssetResults: vi.fn(() => records.entries()),
      isViteProcessedCssAsset: vi.fn(() => false),
    })
    const plugin = createViteCssFinalizerOutputPlugin(context as any)
    const output = asset('assets/app.css', '.app{color:red}')

    await getHandler(plugin).call(plugin, {}, { 'assets/app.css': output })

    expect(context.isCssAssetProcessed).toHaveBeenCalledWith(output, 'assets/app.css')
    expect(context.markCssAssetProcessed).toHaveBeenCalledWith(output, 'assets/app.css')
  })

  it('uses the single HTML-owned css asset for a Generic Web registry result', async () => {
    const records = new Map<string, any>([
      ['/project/src/style.css', {
        css: '.generated{color:red}.icon-\\[mdi--home\\]{display:inline-block}',
        outputFile: 'src/style.css',
      }],
    ])
    const { context } = createContext({
      frameworkName: 'generic',
      opts: {
        appType: 'native',
        cssMatcher: (file: string) => file.endsWith('.css'),
        htmlMatcher: (file: string) => file.endsWith('.html'),
        mainCssChunkMatcher: () => false,
        styleHandler: vi.fn(),
        onUpdate: vi.fn(),
        generator: { target: 'web' },
      },
      getViteProcessedCssAssetResults: vi.fn(() => records.entries()),
      isViteProcessedCssAsset: vi.fn(() => false),
      resolveCssAssetIdentity: vi.fn(() => ({ kind: 'user' })),
    })
    const plugin = createViteCssFinalizerOutputPlugin(context as any)
    const indexCss = {
      ...asset('assets/index.css', '.vite-output{color:red}'),
      originalFileName: 'index.html',
      originalFileNames: ['index.html'],
    }
    const monacoCss = asset('assets/monaco.css', '.monaco{color:blue}')

    await getHandler(plugin).call(plugin, {}, {
      'assets/index.css': indexCss,
      'assets/monaco.css': monacoCss,
    })

    expect(String(indexCss.source)).toBe('.generated{color:red}.icon-\\[mdi--home\\]{display:inline-block}')
    expect(String(monacoCss.source)).toBe('.monaco{color:blue}')
    expect(context.opts.onUpdate).toHaveBeenCalledOnce()
    expect(context.ensureRuntimeClassSet).not.toHaveBeenCalled()
  })

  it('falls back for ambiguous HTML-owned Generic Web css assets', async () => {
    const records = new Map<string, any>([
      ['/project/src/style.css', { css: '.generated{color:red}', outputFile: 'src/style.css' }],
    ])
    const { context } = createContext({
      frameworkName: 'generic',
      opts: {
        appType: 'native',
        cssMatcher: (file: string) => file.endsWith('.css'),
        htmlMatcher: (file: string) => file.endsWith('.html'),
        mainCssChunkMatcher: () => false,
        styleHandler: vi.fn(),
        onUpdate: vi.fn(),
        generator: { target: 'web' },
      },
      getViteProcessedCssAssetResults: vi.fn(() => records.entries()),
      isViteProcessedCssAsset: vi.fn(() => false),
      resolveCssAssetIdentity: vi.fn(() => ({ kind: 'user' })),
    })
    const plugin = createViteCssFinalizerOutputPlugin(context as any)
    const first = { ...asset('assets/first.css', '.first{}'), originalFileName: 'first.html' }
    const second = { ...asset('assets/second.css', '.second{}'), originalFileName: 'second.html' }

    await getHandler(plugin).call(plugin, {}, {
      'assets/first.css': first,
      'assets/second.css': second,
    })

    expect(context.isCssAssetProcessed).toHaveBeenCalled()
    expect(context.ensureRuntimeClassSet).not.toHaveBeenCalled()
    expect(String(first.source)).not.toContain('.generated')
    expect(String(second.source)).not.toContain('.generated')
  })

  it('finalizes ordinary css assets through the configured style handler', async () => {
    const { context, opts } = createContext()
    const plugin = createViteCssFinalizerOutputPlugin(context as any)
    const output = asset('app.wxss', '.root{color:red}')
    const bundle: OutputBundle = {
      'app-hash.wxss': output,
      'index.html': asset('index.html', '<html></html>'),
    }

    await getHandler(plugin).call(plugin, {}, bundle)

    expect(bundle['app-hash.wxss']).toBe(output)
    expect(String(output.source)).toContain('.handled{color:green}')
    expect(opts.styleHandler).toHaveBeenCalledWith('.root{color:red}', expect.objectContaining({
      isMainChunk: true,
      majorVersion: 4,
      postcssOptions: {
        options: {
          from: path.resolve(process.cwd(), 'dist/app.wxss'),
        },
      },
    }))
    expect(context.markCssAssetProcessed).toHaveBeenCalledWith(output, 'app.wxss')
    expect(opts.onUpdate).toHaveBeenCalledWith(
      'app.wxss',
      '.root{color:red}',
      expect.stringContaining('.handled{color:green}'),
    )
  })

  it('removes empty at-rules after framework css processing and preserves valid dark media', async () => {
    const { context } = createContext({
      opts: {
        appType: 'uni-app-vite',
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        htmlMatcher: (file: string) => file.endsWith('.wxml'),
        mainCssChunkMatcher: (file: string) => file === 'app.wxss',
        styleHandler: vi.fn(async (css: string) => ({
          css: `${css}\n@media (prefers-color-scheme: dark) { /* removed declarations */ }`,
        })),
        onUpdate: vi.fn(),
        generator: {
          target: 'weapp',
        },
      },
    })
    const plugin = createViteCssFinalizerOutputPlugin(context as any)
    const output = asset('app.wxss', [
      '@media (prefers-color-scheme: light) {}',
      '@media (prefers-color-scheme: dark) { .theme{background:#232323} }',
    ].join('\n'))
    const bundle: OutputBundle = {
      'app.wxss': output,
    }

    await getHandler(plugin).call(plugin, {}, bundle)

    const css = String(output.source)
    expect(css).not.toContain('prefers-color-scheme: light')
    expect(css).not.toContain('removed declarations')
    expect(css).toContain('@media (prefers-color-scheme: dark) { .theme{background:#232323} }')
  })

  it('preserves mini-program import shell assets without resolving output imports', async () => {
    const { context } = createContext({
      opts: {
        appType: 'uni-app-vite',
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        htmlMatcher: (file: string) => file.endsWith('.wxml'),
        mainCssChunkMatcher: (file: string) => file === 'main.wxss',
        styleHandler: vi.fn(async () => {
          throw new Error('styleHandler should not process import shell')
        }),
        onUpdate: vi.fn(),
        generator: {
          target: 'weapp',
        },
      },
    })
    const plugin = createViteCssFinalizerOutputPlugin(context as any)
    const bundle: OutputBundle = {
      'main.wxss': asset('main.wxss', '@import "app.wxss";\n'),
    }

    await getHandler(plugin).call(plugin, {}, bundle)

    expect(String((bundle['main.wxss'] as OutputAsset).source)).toBe('@import "./app.wxss";\n')
    expect(context.opts.styleHandler).not.toHaveBeenCalled()
    expect(context.markCssAssetProcessed).toHaveBeenCalledWith(bundle['main.wxss'], 'main.wxss')
    expect(context.recordCssAssetResult).toHaveBeenCalledWith('main.wxss', '@import "./app.wxss";\n')
  })

  it('preserves remembered mini-program main import shell without resolving it from project root', async () => {
    const { context } = createContext({
      opts: {
        appType: 'uni-app-vite',
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        htmlMatcher: (file: string) => file.endsWith('.wxml'),
        mainCssChunkMatcher: (file: string) => file === 'main.wxss',
        styleHandler: vi.fn(async () => {
          throw new Error('styleHandler should not process remembered import shell')
        }),
        onUpdate: vi.fn(),
        generator: {
          target: 'weapp',
        },
      },
      getRememberedMainCssSource: vi.fn(() => ({
        rawSource: '@import "app.wxss";\n',
        sourceFile: 'main.wxss',
      })),
      isCssAssetProcessed: vi.fn()
        .mockReturnValueOnce(false)
        .mockReturnValue(true),
    })
    const plugin = createViteCssFinalizerOutputPlugin(context as any)
    const output = asset('main.wxss', '.processed{color:red}')
    const bundle: OutputBundle = {
      'main.wxss': output,
    }

    await getHandler(plugin).call(plugin, {}, bundle)

    expect(String(output.source)).toBe('@import "./app.wxss";\n')
    expect(context.opts.styleHandler).not.toHaveBeenCalled()
    expect(mocks.generateTailwindV4Css).not.toHaveBeenCalled()
    expect(context.recordCssAssetResult).toHaveBeenCalledWith('main.wxss', '@import "./app.wxss";\n')
    expect(context.opts.onUpdate).toHaveBeenCalledWith('main.wxss', '.processed{color:red}', '@import "./app.wxss";\n')
  })

  it('strips Vite generated markers from already processed css assets', async () => {
    const { context } = createContext({
      isViteProcessedCssAsset: vi.fn((_asset: OutputAsset, file?: string) => file === 'pages/index.wxss'),
    })
    const plugin = createViteCssFinalizerOutputPlugin(context as any)
    const bundle: OutputBundle = {
      'pages/index.wxss': asset('pages/index.wxss', [
        createBundlerGeneratedCssMarker('vite', 'src/pages/index.css'),
        '.page{color:red}',
        '@media (prefers-color-scheme: dark) { /* removed */ }',
      ].join('\n')),
    }

    await getHandler(plugin).call(plugin, {}, bundle)

    expect(String((bundle['pages/index.wxss'] as OutputAsset).source)).toBe('.page{color:red}')
    expect(context.recordCssAssetResult).toHaveBeenCalledWith('pages/index.wxss', '.page{color:red}')
    expect(context.debug).toHaveBeenCalledWith('collect vite-processed css asset: %s bytes=%d', 'pages/index.wxss', 70)
  })

  it('strips Vite internal marker-only css assets', async () => {
    const { context, opts } = createContext()
    const plugin = createViteCssFinalizerOutputPlugin(context as any)
    const bundle: OutputBundle = {
      'packageB/pages/apple.wxss': asset('packageB/pages/apple.wxss', '/*$vite$:1*/'),
    }

    await getHandler(plugin).call(plugin, {}, bundle)

    expect(String((bundle['packageB/pages/apple.wxss'] as OutputAsset).source)).toBe('')
    expect(opts.styleHandler).not.toHaveBeenCalled()
    expect(context.recordCssAssetResult).toHaveBeenCalledWith('packageB/pages/apple.wxss', '')
    expect(context.debug).toHaveBeenCalledWith('css finalizer strip empty marker asset: %s', 'packageB/pages/apple.wxss')
  })

  it('prepends uni-app x Web border reset before Tailwind border utilities', async () => {
    const { context, opts } = createContext()
    opts.appType = 'uni-app-x'
    opts.cssMatcher = (file: string) => file.endsWith('.css')
    opts.generator = {
      target: 'web',
    }
    context.cssPipelineStrategy = uniAppXFinalizerStrategy
    const plugin = createViteCssFinalizerOutputPlugin(context as any)
    const output = asset('app.css', '*,::before{border:0 solid;}.border{border-width:1px;}')
    const bundle: OutputBundle = {
      'app.css': output,
    }

    await getHandler(plugin).call(plugin, {}, bundle)

    const css = String(output.source)
    expect(css).toContain(UNI_APP_X_WEB_PREFLIGHT_RESET_MARKER)
    expect(css).toContain('uni-app uni-view')
    expect(css.indexOf(UNI_APP_X_WEB_PREFLIGHT_RESET_MARKER)).toBeLessThan(css.indexOf('.border'))
    expect(opts.styleHandler).not.toHaveBeenCalled()
  })

  it('injects uni-app x Web border reset after a split framework medium rule', async () => {
    const { context, opts } = createContext()
    opts.appType = 'uni-app-x'
    opts.cssMatcher = (file: string) => file.endsWith('.css')
    opts.generator = {
      target: 'web',
    }
    context.cssPipelineStrategy = uniAppXFinalizerStrategy
    const output = asset('app.css', 'uni-app uni-view{position:relative;border-width:medium}.border{border-width:1px;}')
    const bundle: OutputBundle = {
      'app.css': output,
    }

    await getHandler(createViteCssFinalizerOutputPlugin(context as any)).call({}, {}, bundle)

    const css = String(output.source)
    expect(css).toContain(UNI_APP_X_WEB_PREFLIGHT_RESET_MARKER)
    expect(css.indexOf(UNI_APP_X_WEB_PREFLIGHT_RESET_MARKER)).toBeGreaterThan(css.indexOf('border-width:medium'))
    expect(css.indexOf(UNI_APP_X_WEB_PREFLIGHT_RESET_MARKER)).toBeLessThan(css.indexOf('.border'))
    expect(opts.styleHandler).not.toHaveBeenCalled()
  })

  it('generates Tailwind css for root directive assets, records dependencies, and remembers main source', async () => {
    mocks.generateTailwindV4Css.mockResolvedValue({
      css: '.generated{color:red}',
      dependencies: ['/project/tailwind.config.ts'],
    })
    const rememberMainCssSource = vi.fn()
    const { context, opts } = createContext({
      getSourceCandidates: vi.fn(() => new Set(['text-red-500', 'unsupported:hover'])),
      getSourceCandidateSourcesForEntries: vi.fn(() => new Map([
        ['text-red-500', new Set(['/project/src/index.ts'])],
      ])),
      rememberMainCssSource,
    })
    const plugin = createViteCssFinalizerOutputPlugin(context as any)
    const bundle: OutputBundle = {
      'app.wxss': asset('app.wxss', '@import "tailwindcss";'),
    }
    const addWatchFile = vi.fn((id: string) => {
      if (id.includes('tailwind.config')) {
        const error = new Error('Cannot call "addWatchFile" after the build has finished.') as Error & { code?: string }
        error.code = 'INVALID_ROLLUP_PHASE'
        throw error
      }
    })

    await getHandler(plugin).call({ addWatchFile }, {}, bundle)

    expect(mocks.generateTailwindV4Css).toHaveBeenCalledWith(expect.objectContaining({
      rawSource: '@import "tailwindcss";',
      file: 'app.wxss',
      outputFile: 'app.wxss',
      runtime: expect.any(Set),
    }))
    expect(String((bundle['app.wxss'] as OutputAsset).source)).toContain('.generated{color:red}')
    expect(context.recordCssAssetResult).toHaveBeenCalledWith('app.wxss', expect.stringContaining('.generated{color:red}'))
    expect(rememberMainCssSource).toHaveBeenCalledWith('app.wxss', '@import "tailwindcss";')
    expect(opts.onUpdate).toHaveBeenCalledWith('app.wxss', '@import "tailwindcss";', expect.stringContaining('.generated{color:red}'))
    expect(addWatchFile).toHaveBeenCalledWith('/project/tailwind.config.ts')
  })

  it('uses remembered main css source for processed main assets', async () => {
    mocks.generateTailwindV4Css.mockResolvedValue({
      css: '.remembered{color:blue}',
      dependencies: [],
    })
    const { context } = createContext({
      getRememberedMainCssSource: vi.fn(() => ({
        rawSource: '@import "tailwindcss";\n.from-source{}',
        sourceFile: '/project/src/app.css',
      })),
      isCssAssetProcessed: vi.fn()
        .mockReturnValueOnce(false)
        .mockReturnValue(true),
    })
    const plugin = createViteCssFinalizerOutputPlugin(context as any)
    const output = asset('app.wxss', '.processed{color:red}')
    const bundle: OutputBundle = {
      'app.wxss': output,
    }

    await getHandler(plugin).call(plugin, {}, bundle)

    expect(mocks.generateTailwindV4Css).toHaveBeenCalledWith(expect.objectContaining({
      rawSource: '@import "tailwindcss";\n.from-source{}',
      file: '/project/src/app.css',
      outputFile: 'app.wxss',
    }))
    expect(String(output.source)).toContain('.remembered{color:blue}')
  })

  it('skips local import css assets and does not invoke the generator', async () => {
    const { context, opts } = createContext()
    const plugin = createViteCssFinalizerOutputPlugin(context as any)
    const output = asset('app.wxss', '@import "./local.css";\n.root{color:red}')
    const bundle: OutputBundle = {
      'app.wxss': output,
    }

    await getHandler(plugin).call(plugin, {}, bundle)

    expect(mocks.generateTailwindV4Css).not.toHaveBeenCalled()
    expect(opts.styleHandler).toHaveBeenCalledWith('@import "./local.css";\n.root{color:red}', expect.objectContaining({
      isMainChunk: true,
    }))
    expect(String(output.source)).toContain('.handled{color:green}')
  })

  it('finalizes web target css without invoking the mini-program style handler', async () => {
    const { context, opts } = createContext({
      opts: {
        appType: 'h5',
        cssMatcher: (file: string) => file.endsWith('.css'),
        htmlMatcher: (file: string) => file.endsWith('.html'),
        mainCssChunkMatcher: (file: string) => file === 'style.css',
        styleHandler: vi.fn(async (css: string) => ({ css: `${css}\n.handled{color:green}` })),
        onUpdate: vi.fn(),
        generator: {
          target: 'web',
        },
      },
    })
    const plugin = createViteCssFinalizerOutputPlugin(context as any)
    const output = asset('style.css', [
      '@media (hover: hover){.hover\\:bg-red-500:hover{color:red}}',
      '@media (prefers-color-scheme: dark) {}',
    ].join('\n'))
    const bundle: OutputBundle = {
      'style.css': output,
    }

    await getHandler(plugin).call(plugin, {}, bundle)

    expect(mocks.generateTailwindV4Css).toHaveBeenCalledWith(expect.objectContaining({
      file: 'style.css',
      outputFile: 'style.css',
    }))
    expect(opts.styleHandler).not.toHaveBeenCalled()
    expect(String(output.source)).toContain('@media (hover: hover)')
    expect(String(output.source)).toContain('@media (prefers-color-scheme: dark) {}')
    expect(context.markCssAssetProcessed).toHaveBeenCalledWith(output, 'style.css')
  })

  it('adapts vite-processed mini-program css after the framework postcss pipeline', async () => {
    const { context, opts } = createContext()
    const plugin = createViteCssFinalizerOutputPlugin(context as any)
    const output = asset('app.wxss', [
      createBundlerGeneratedCssMarker('vite', 'src/app.css'),
      '.processed{color:red}',
    ].join('\n'))
    const bundle: OutputBundle = {
      'app.wxss': output,
    }
    context.isViteProcessedCssAsset = vi.fn(() => true)
    context.isCssAssetProcessed = vi.fn(() => false)

    await getHandler(plugin).call(plugin, {}, bundle)

    expect(opts.styleHandler).toHaveBeenCalledWith('.processed{color:red}', expect.objectContaining({
      isMainChunk: true,
      majorVersion: 4,
    }))
    expect(String(output.source)).toBe('.processed{color:red}\n.handled{color:green}')
    expect(context.markCssAssetProcessed).toHaveBeenCalledWith(output, 'app.wxss')
    expect(context.recordCssAssetResult).toHaveBeenCalledWith('app.wxss', '.processed{color:red}\n.handled{color:green}')
    expect(context.debug).toHaveBeenCalledWith('css finalizer skip vite-processed css: %s', 'app.wxss')
  })

  it('runs final injection and taro shell normalization when there are no pending css entries', async () => {
    const records = new Map<string, any>([
      ['src/app.css', {
        css: '.generated{color:blue}\n@media (prefers-color-scheme: dark) { /* removed */ }',
        injectIntoMain: true,
        outputFile: 'app.wxss',
      }],
    ])
    const { context, opts } = createContext({
      getViteProcessedCssAssetResults: vi.fn(() => records.entries()),
      getRecordedGeneratorCandidates: vi.fn(() => new Set(['cached'])),
      isCssAssetProcessed: vi.fn(() => true),
    })
    const plugin = createViteCssFinalizerOutputPlugin(context as any)
    const bundle: OutputBundle = {
      'app.wxss': asset('app.wxss', '@source "./src";\n.root{color:red}'),
    }

    await getHandler(plugin).call(plugin, {}, bundle)

    expect(context.ensureRuntimeClassSet).not.toHaveBeenCalled()
    expect(String((bundle['app.wxss'] as OutputAsset).source)).toContain('.generated{color:blue}')
    expect(String((bundle['app.wxss'] as OutputAsset).source)).not.toContain('prefers-color-scheme: dark')
    expect(String((bundle['app.wxss'] as OutputAsset).source)).not.toContain('@source')
    expect(opts.onUpdate).toHaveBeenCalled()
  })

  it('restores a cached framework root import shell before final css injection', async () => {
    const records = new Map<string, any>([
      ['src/components/card.vue', { css: '.card{color:blue}', injectIntoMain: true, outputFile: 'components/card.wxss' }],
    ])
    const { context } = createContext({
      opts: {
        appType: 'uni-app-vite',
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        htmlMatcher: (file: string) => file.endsWith('.wxml'),
        mainCssChunkMatcher: (file: string) => file === 'app.wxss' || file === 'main.wxss',
        styleHandler: vi.fn(async (css: string) => ({ css })),
        onUpdate: vi.fn(),
        generator: {
          target: 'weapp',
        },
      },
      cssPipelineStrategy: {
        shouldKeepRootMiniProgramStyleAsImportShell: () => true,
      },
      frameworkRootImportShellTargetByFile: new Map([
        ['app.wxss', 'main.wxss'],
      ]),
      getViteProcessedCssAssetResults: vi.fn(() => records.entries()),
      isCssAssetProcessed: vi.fn(() => true),
    })
    const plugin = createViteCssFinalizerOutputPlugin(context as any)
    const bundle: OutputBundle = {
      'app.wxss': asset('app.wxss', '.generated-root{display:flex}'),
      'main.wxss': asset('main.wxss', '.tailwind{display:block}'),
    }

    await getHandler(plugin).call(plugin, {}, bundle)

    expect(String((bundle['app.wxss'] as OutputAsset).source)).toBe('@import "./main.wxss";\n')
    expect(String((bundle['main.wxss'] as OutputAsset).source)).toContain('.card{color:blue}')
    expect(context.debug).toHaveBeenCalledWith('restore framework root css import shell: %s -> %s', 'app.wxss', 'main.wxss')
  })

  it('links a detached framework style shell from the runtime root style asset', async () => {
    const { context } = createContext({
      opts: {
        appType: 'uni-app-x',
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        htmlMatcher: (file: string) => file.endsWith('.wxml'),
        mainCssChunkMatcher: () => false,
        styleHandler: vi.fn(async (css: string) => ({ css })),
        onUpdate: vi.fn(),
        generator: {
          target: 'weapp',
        },
      },
      cssPipelineStrategy: {
        shouldKeepRootMiniProgramStyleAsImportShell: () => true,
      },
      frameworkRootImportShellTargetByFile: new Map([
        ['framework.wxss', 'generated.wxss'],
      ]),
      getViteProcessedCssAssetResults: vi.fn(() => []),
      isCssAssetProcessed: vi.fn(() => true),
    })
    const plugin = createViteCssFinalizerOutputPlugin(context as any)
    const bundle: OutputBundle = {
      'entry.js': {
        type: 'chunk',
        fileName: 'entry.js',
        name: 'entry',
        code: '',
        isEntry: true,
      } as any,
      'entry.wxss': asset('entry.wxss', '.runtime{display:flex}'),
      'framework.wxss': asset('framework.wxss', '.framework{display:block}'),
      'generated.wxss': asset('generated.wxss', '.tailwind{width:100rpx}'),
    }

    await getHandler(plugin).call(plugin, {}, bundle)

    expect(String((bundle['entry.wxss'] as OutputAsset).source)).toContain('@import "./framework.wxss";')
    expect(String((bundle['framework.wxss'] as OutputAsset).source)).toBe('@import "./generated.wxss";\n')
    expect(context.debug).toHaveBeenCalledWith('link framework root css to runtime entry: %s -> %s', 'entry.wxss', 'framework.wxss')
  })

  it('uses the Rollup entry chunk to link detached styles when root helper chunks have matching styles', async () => {
    const { context } = createContext({
      opts: {
        appType: 'custom-vite-framework',
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        htmlMatcher: (file: string) => file.endsWith('.wxml'),
        mainCssChunkMatcher: () => false,
        styleHandler: vi.fn(async (css: string) => ({ css })),
        onUpdate: vi.fn(),
        generator: { target: 'weapp' },
      },
      cssPipelineStrategy: {
        shouldKeepRootMiniProgramStyleAsImportShell: () => true,
      },
      frameworkRootImportShellTargetByFile: new Map([
        ['framework.wxss', 'generated.wxss'],
      ]),
      getViteProcessedCssAssetResults: vi.fn(() => []),
      isCssAssetProcessed: vi.fn(() => true),
    })
    const plugin = createViteCssFinalizerOutputPlugin(context as any)
    const bundle: OutputBundle = {
      'runtime.js': {
        type: 'chunk',
        fileName: 'runtime.js',
        name: 'runtime',
        code: '',
        isEntry: true,
      } as any,
      'vendor.js': {
        type: 'chunk',
        fileName: 'vendor.js',
        name: 'vendor',
        code: '',
        isEntry: false,
      } as any,
      'runtime.wxss': asset('runtime.wxss', '.runtime{display:flex}'),
      'vendor.wxss': asset('vendor.wxss', '.vendor{display:block}'),
      'framework.wxss': asset('framework.wxss', '.framework{display:block}'),
      'generated.wxss': asset('generated.wxss', '.tailwind{width:100rpx}'),
    }

    await getHandler(plugin).call(plugin, {}, bundle)

    expect(String((bundle['runtime.wxss'] as OutputAsset).source)).toContain('@import "./framework.wxss";')
    expect(String((bundle['vendor.wxss'] as OutputAsset).source)).toBe('.vendor{display:block}')
  })

  it('does not duplicate an existing framework root import for other Vite frameworks', async () => {
    const { context } = createContext({
      opts: {
        appType: 'taro',
        cssMatcher: (file: string) => file.endsWith('.wxss'),
        htmlMatcher: (file: string) => file.endsWith('.wxml'),
        mainCssChunkMatcher: () => false,
        styleHandler: vi.fn(async (css: string) => ({ css })),
        onUpdate: vi.fn(),
        generator: { target: 'weapp' },
      },
      cssPipelineStrategy: {
        shouldKeepRootMiniProgramStyleAsImportShell: () => true,
      },
      frameworkRootImportShellTargetByFile: new Map([
        ['app.wxss', 'app-origin.wxss'],
      ]),
      getViteProcessedCssAssetResults: vi.fn(() => []),
      isCssAssetProcessed: vi.fn(() => true),
    })
    const plugin = createViteCssFinalizerOutputPlugin(context as any)
    const bundle: OutputBundle = {
      'app.js': {
        type: 'chunk',
        fileName: 'app.js',
        name: 'app',
        code: '',
        isEntry: true,
      } as any,
      'app.wxss': asset('app.wxss', '@import "./app-origin.wxss";\n'),
      'app-origin.wxss': asset('app-origin.wxss', '.tailwind{width:100rpx}'),
    }

    await getHandler(plugin).call(plugin, {}, bundle)

    expect(String((bundle['app.wxss'] as OutputAsset).source)).toBe('@import "./app-origin.wxss";\n')
  })

  it('injects uni-app-x harmony apply styles when finalizer has no css assets', async () => {
    mocks.generateTailwindV4Css.mockResolvedValue({
      css: '.flex{display:flex}',
      dependencies: [],
    })
    const { context } = createContext({
      opts: {
        appType: 'uni-app-x',
        cssMatcher: (file: string) => file.endsWith('.css'),
        htmlMatcher: () => false,
        mainCssChunkMatcher: () => false,
        styleHandler: vi.fn(async (css: string) => ({ css })),
        onUpdate: vi.fn(),
        generator: {
          target: 'weapp',
        },
        uniAppX: {
          enabled: true,
        },
      },
      getSourceCandidates: vi.fn(() => new Set(['flex'])),
      getViteProcessedCssAssetResults: vi.fn(() => []),
      cssPipelineStrategy: uniAppXFinalizerStrategy,
    })
    const plugin = createViteCssFinalizerOutputPlugin(context as any)
    const bundle: OutputBundle = {
      'import/app-service.ets': asset('import/app-service.ets', 'marker'),
      'assets/App.js': {
        ...asset('assets/App.js', 'const _style_0 = {"app":{"":{"color":"blue"}}};'),
        type: 'chunk',
        code: 'const _style_0 = {"app":{"":{"color":"blue"}}};',
      } as any,
      'pages/index.js': {
        ...asset('pages/index.js', [
          'const _sfc_main = { class: "card flex" };',
          'export default _export_sfc(_sfc_main, [["__file","pages/index.uvue"]]);',
        ].join('\n')),
        type: 'chunk',
        code: [
          'const _sfc_main = { class: "card flex" };',
          'export default _export_sfc(_sfc_main, [["__file","pages/index.uvue"]]);',
        ].join('\n'),
        map: {
          sourcesContent: ['<style>.card{@apply flex}</style>'],
        },
      } as any,
    }

    await getHandler(plugin).call(plugin, {}, bundle)

    expect(mocks.generateTailwindV4Css).toHaveBeenCalledWith(expect.objectContaining({
      rawSource: expect.stringContaining('.card{@apply flex}'),
      file: 'uni-app-x-harmony-apply.css',
    }))
    expect((bundle['pages/index.js'] as any).code).toContain('display')
    expect(context.debug).toHaveBeenCalledWith('uni-app-x harmony bundle styles inject')
  })
})
