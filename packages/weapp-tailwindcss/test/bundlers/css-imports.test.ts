import { Buffer } from 'node:buffer'
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import postcss from 'postcss'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeResolvedTailwindcssImports, resolveTailwindcssImport, rewriteTailwindcssImportsInCode } from '@/bundlers/shared/css-imports'
import { createBundlerGeneratedCssMarker } from '@/bundlers/shared/generated-css-marker'
import { rewriteLocalCssImportRequestsForOutput } from '@/generation/local-imports'
import loader, { transformCssImportRewriteSource } from '@/bundlers/webpack/loaders/weapp-tw-css-import-rewrite-loader'

function joinPosixPath(base: string, subpath: string) {
  return base.endsWith('/') ? `${base}${subpath}` : `${base}/${subpath}`
}

describe('bundlers/shared css-imports', () => {
  it.each([
    ['/workspace/node_modules/weapp-tailwindcss', '/workspace/node_modules/weapp-tailwindcss'],
    ['C:\\project space\\node_modules\\weapp-tailwindcss', 'C:/project space/node_modules/weapp-tailwindcss'],
    ['\\\\server\\share\\weapp-tailwindcss', '//server/share/weapp-tailwindcss'],
  ])('restores only resolved generator package files at the loader boundary: %s', (directory, cssDirectory) => {
    const source = `@import url("${cssDirectory}/theme.css") layer(theme);\n@import "${cssDirectory}/utilities.css" layer(utilities) source(none);\n@import "./theme.css";\n@import "${cssDirectory}/../other/theme.css";`
    expect(normalizeResolvedTailwindcssImports(source, directory)).toBe(`@import "tailwindcss/theme.css" layer(theme);\n@import "tailwindcss/utilities.css" layer(utilities) source(none);\n@import "./theme.css";\n@import "${cssDirectory}/../other/theme.css";`)
    const escaped = directory.replaceAll('\\', '\\\\')
    expect(normalizeResolvedTailwindcssImports(`@import "${escaped}/index.css";`, directory)).toBe('@import "tailwindcss";')
  })

  const pkgDir = '/virtual/weapp-tailwindcss'
  const createdDirs: string[] = []

  afterEach(async () => {
    delete process.env.WEAPP_TW_LOADER_DEBUG
    await Promise.all(createdDirs.map(dir => rm(dir, { recursive: true, force: true })))
    createdDirs.length = 0
    vi.restoreAllMocks()
    vi.doUnmock('@/generator')
  })

  it('rewrites tailwindcss import to the package css entry for mpx', () => {
    const code = '@import "tailwindcss";'
    const rewritten = rewriteTailwindcssImportsInCode(code, pkgDir, {
      join: joinPosixPath,
      appType: 'mpx',
    })
    expect(rewritten).toBe(`@import "${pkgDir}/index.css";`)
  })

  it('keeps tailwindcss subpath resolution for mpx', () => {
    const code = '@import "tailwindcss/base";'
    const rewritten = rewriteTailwindcssImportsInCode(code, pkgDir, {
      join: joinPosixPath,
      appType: 'mpx',
    })
    expect(rewritten).toBe(`@import "${pkgDir}/base";`)
  })

  it('normalizes tailwindcss$ and ignores unrelated specifiers', () => {
    expect(resolveTailwindcssImport('tailwindcss$', pkgDir, { join: joinPosixPath })).toBe(`${pkgDir}/index.css`)
    expect(resolveTailwindcssImport('postcss', pkgDir)).toBeNull()
  })

  it('rewrites local source css imports to emitted mini-program style paths', () => {
    expect(rewriteLocalCssImportRequestsForOutput(
      '@import "./src/third-party-ui.css";\n.foo{color:red}',
      { styleOutputExtension: '.wxss' },
    )).toBe('@import "./third-party-ui.wxss";\n.foo{color:red}')
    expect(rewriteLocalCssImportRequestsForOutput(
      '@import "./styles/third-party-ui.css?inline";',
      { styleOutputExtension: 'acss' },
    )).toBe('@import "./styles/third-party-ui.acss?inline";')
  })

  it('rewrites buffer sources in loader for mpx', () => {
    const buf = Buffer.from('@import "tailwindcss";')
    const rewritten = transformCssImportRewriteSource(buf, {
      tailwindcssImportRewrite: {
        pkgDir,
        appType: 'mpx',
      },
    })
    expect(rewritten).toBe(`@import "${pkgDir}/index.css";`)
  })

  it('normalizes registered relative @config paths against the webpack loader resource file', async () => {
    const registerCssSource = vi.fn()
    const result = loader.call({
      getOptions: () => ({
        tailwindcssImportRewrite: {
          pkgDir,
          appType: 'mpx',
          registerCssSource,
        },
      }),
      resourcePath: '/repo/demo/mpx-tailwindcss-v4/src/sub-normal/pages/index.css',
      rootContext: '/repo/demo/mpx-tailwindcss-v4',
    } as any,
      [
        '@import "tailwindcss" source(none);',
        '@config "../../../tailwind.config.sub-normal.js";',
      ].join('\n'),
    )

    await Promise.resolve(result)

    expect(result).toBe([
      `@import "${pkgDir}/index.css" source(none);`,
      '@config "/repo/demo/mpx-tailwindcss-v4/tailwind.config.sub-normal.js";',
    ].join('\n'))
    expect(registerCssSource).toHaveBeenCalledWith({
      file: '/repo/demo/mpx-tailwindcss-v4/src/sub-normal/pages/index.css',
      css: [
        '@import "tailwindcss" source(none);',
        '@config "/repo/demo/mpx-tailwindcss-v4/tailwind.config.sub-normal.js";',
      ].join('\n'),
    })
  })

  it('normalizes main package relative @config paths without depending on webpack rootContext', async () => {
    const registerCssSource = vi.fn()
    const result = loader.call({
      getOptions: () => ({
        tailwindcssImportRewrite: {
          pkgDir,
          appType: 'mpx',
          registerCssSource,
        },
      }),
      resourcePath: '/repo/demo/mpx-tailwindcss-v4/src/app.css',
      rootContext: '/repo/demo/mpx-tailwindcss-v4',
    } as any,
      [
        '@import "tailwindcss";',
        '@config "../tailwind.config.js";',
      ].join('\n'),
    )

    await Promise.resolve(result)

    expect(result).toBe([
      `@import "${pkgDir}/index.css";`,
      '@config "/repo/demo/mpx-tailwindcss-v4/tailwind.config.js";',
    ].join('\n'))
    expect(registerCssSource).toHaveBeenCalledWith({
      file: '/repo/demo/mpx-tailwindcss-v4/src/app.css',
      css: [
        '@import "tailwindcss";',
        '@config "/repo/demo/mpx-tailwindcss-v4/tailwind.config.js";',
      ].join('\n'),
    })
  })

  it('keeps absolute and package import @config requests unchanged in the webpack loader', () => {
    expect(transformCssImportRewriteSource('@config "/repo/tailwind.config.js";', {
      tailwindcssImportRewrite: { pkgDir },
    })).toBe('@config "/repo/tailwind.config.js";')

    expect(transformCssImportRewriteSource('@config "#tw-config";', {
      tailwindcssImportRewrite: { pkgDir },
    })).toBe('@config "#tw-config";')
  })

  it('preserves original source when loader options are missing or unchanged', () => {
    const source = '@import "local.css";'
    const buffer = Buffer.from(source)

    expect(transformCssImportRewriteSource(source, undefined)).toBe(source)
    expect(transformCssImportRewriteSource(buffer, {
      tailwindcssImportRewrite: {
        pkgDir,
      },
    })).toBe(buffer)
  })

  it('supports url imports and trailing slash package directories', () => {
    const rewritten = transformCssImportRewriteSource('@import url("tailwindcss/theme.css");', {
      tailwindcssImportRewrite: {
        pkgDir: `${pkgDir}/`,
      },
    })

    expect(rewritten).toBe(`@import url("${pkgDir}/theme.css");`)
  })

  it('preserves original import when custom resolver returns empty', () => {
    const code = '@import "tailwindcss/base";'
    const rewritten = rewriteTailwindcssImportsInCode(code, pkgDir, {
      join: () => null as unknown as string,
    })

    expect(rewritten).toBeUndefined()
  })

  it('emits debug output and runs as a webpack loader', () => {
    process.env.WEAPP_TW_LOADER_DEBUG = '1'
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const rewritten = loader.call({
      getOptions: () => ({
        tailwindcssImportRewrite: {
          pkgDir,
        },
      }),
      resourcePath: '/src/app.css',
    } as any, '@import "tailwindcss/base";')

    expect(rewritten).toBe(`@import "${pkgDir}/base";`)
    expect(write).toHaveBeenCalledWith(expect.stringContaining('executing for /src/app.css'))
    expect(write).toHaveBeenCalledWith(expect.stringContaining('rewritten import'))
  })

  it('registers tailwindcss root css sources from the webpack loader', async () => {
    const registerCssSource = vi.fn()
    const result = loader.call({
      getOptions: () => ({
        tailwindcssImportRewrite: {
          pkgDir,
          registerCssSource,
        },
      }),
      resourcePath: '/src/app.css',
    } as any, '@import "tailwindcss";\n@source inline("w-4");')

    await Promise.resolve(result)

    expect(registerCssSource).toHaveBeenCalledWith({
      file: '/src/app.css',
      css: '@import "tailwindcss";\n@source inline("w-4");',
    })
  })

  it('emits generated css from webpack loader before postcss-loader runs', async () => {
    const { default: webpackLoader } = await import('@/bundlers/webpack/loaders/weapp-tw-css-import-rewrite-loader')
    const result = webpackLoader.call({
      getOptions: () => ({
        tailwindcssImportRewrite: {
          pkgDir,
        },
      }),
      resourcePath: '/src/app.css',
      rootContext: '/src',
    } as any, '@import "tailwindcss";\n@config "./tailwind.config.js";')

    expect(result).toBe('@import "/virtual/weapp-tailwindcss/index.css";\n@config "/src/tailwind.config.js";')
  })

  it('expands Tailwind v4 mini-program css before postcss-loader can consume source(none)', async () => {
    vi.resetModules()
    const generateTailwindV4Css = vi.fn(async (options: any) => ({
      css: [
        '.bg-brand{background-color:#123456}',
        '.rounded-full{border-radius:9999px}',
        '.dark .text-foreground{color:#ffffff}',
      ].join('\n'),
      target: 'weapp',
      source: 'generator',
      classSet: new Set(['bg-brand', 'rounded-full', 'dark:text-foreground']),
      dependencies: ['/repo/tailwind.config.ts'],
      metadata: {
        file: options.file,
        majorVersion: 4,
        outputFile: options.outputFile,
      },
    }))
    vi.doMock('@/generation/service', () => ({
      generateTailwindV4Css,
    }))
    const { default: webpackLoader } = await import('@/bundlers/webpack/loaders/weapp-tw-css-generation-loader')
    const registerCssSource = vi.fn()
    const registerCssSourceFile = vi.fn()
    const registerGeneratedCss = vi.fn()
    const markGeneratedCssSource = vi.fn()
    const addDependency = vi.fn()
    const source = [
      '@import "tailwindcss" source(none);',
      '@config "../../tailwind.config.ts";',
      '@theme {',
      '  --radius-full: 9999px;',
      '}',
      '@source "../../src/**/*.{js,jsx,ts,tsx,md,mdx}";',
      '@source "../../docs/**/*.{md,mdx}";',
      '@source "../../blog/**/*.{md,mdx}";',
      '@source "../../config/**/*.{ts,tsx}";',
      '@source "../../docusaurus.config.ts";',
      '@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));',
    ].join('\n')

    const result = await webpackLoader.call({
      addDependency,
      getOptions: () => ({
        tailwindcssImportRewrite: {
          pkgDir,
          appType: 'taro',
          compilerOptions: {
            appType: 'taro',
            generator: {},
            mainCssChunkMatcher: () => false,
            tailwindcssRuntimeOptions: { tailwindcss: { v4: { cssEntries: ['/repo/website/src/css/custom.css'] } } },
            styleHandler: async (css: string) => ({ css }),
          },
          getRuntimeSet: async () => new Set(['bg-brand', 'rounded-full', 'dark:text-foreground']),
          markGeneratedCssSource,
          registerGeneratedCss,
          registerCssSource,
          registerCssSourceFile,
          runtimeState: {
            readyPromise: Promise.resolve(),
            tailwindRuntime: { majorVersion: 4 },
          },
        },
      }),
      resourcePath: '/repo/website/src/css/custom.css',
      rootContext: '/repo/website',
    } as any, source)

    expect(generateTailwindV4Css).toHaveBeenCalledWith(expect.objectContaining({
      rawSource: expect.stringContaining('@import "tailwindcss" source(none);'),
      file: '/repo/website/src/css/custom.css',
      outputFile: '/repo/website/src/css/custom.css',
      deferCssAdaptation: true,
      cssHandlerOptions: expect.objectContaining({
        isMainChunk: true,
      }),
    }))
    expect(generateTailwindV4Css).toHaveBeenCalledWith(expect.objectContaining({
      rawSource: expect.stringContaining('@config "/repo/website/tailwind.config.ts";'),
    }))
    expect(registerCssSource).toHaveBeenCalledWith({
      file: '/repo/website/src/css/custom.css',
      css: expect.stringContaining('@config "/repo/website/tailwind.config.ts";'),
    })
    expect(registerCssSourceFile).toHaveBeenCalledWith(expect.objectContaining({
      file: '/repo/website/src/css/custom.css',
      processed: false,
      css: expect.stringContaining('@source "../../src/**/*.{js,jsx,ts,tsx,md,mdx}";'),
    }))
    expect(result).toContain(createBundlerGeneratedCssMarker('webpack', '/repo/website/src/css/custom.css'))
    expect(result).toContain('.bg-brand{background-color:#123456}')
    expect(result).not.toContain('@import "tailwindcss"')
    expect(result).not.toContain('@media source(none)')
    expect(result).not.toContain('source(none)')
    expect(result).not.toContain(':not(#\\#)')
    expect(result).not.toContain('@config')
    expect(result).not.toContain('@source')
    expect(addDependency).toHaveBeenCalledWith('/repo/tailwind.config.ts')
    expect(markGeneratedCssSource).toHaveBeenCalledWith('/repo/website/src/css/custom.css')
    expect(registerGeneratedCss).toHaveBeenCalledWith({
      classSet: new Set(['bg-brand', 'rounded-full', 'dark:text-foreground']),
      css: expect.stringContaining('.bg-brand{background-color:#123456}'),
      dependencies: ['/repo/tailwind.config.ts'],
      file: '/repo/website/src/css/custom.css',
    })
    let sawGeneratedCss = false
    await postcss([{
      postcssPlugin: 'webpack-downstream-postcss-observer',
      Once(root) {
        root.walkRules('.bg-brand', () => {
          sawGeneratedCss = true
        })
      },
    }]).process(String(result), { from: undefined })
    expect(sawGeneratedCss).toBe(true)
  })

  it('generates Lynx split imports only from the explicit source loader stage', async () => {
    vi.resetModules()
    const generateTailwindV4Css = vi.fn(async () => ({
      css: [
        '@layer utilities {',
        '  .flex { display: flex; }',
        '  .bg-red-500 { background-color: var(--color-red-500); }',
        '}',
      ].join('\n'),
      target: 'web',
      source: 'generator',
      classSet: new Set(['flex', 'bg-red-500']),
      dependencies: [],
      metadata: {
        file: '/repo/examples/react-lynx/src/global.css',
        majorVersion: 4,
        outputFile: '/repo/examples/react-lynx/src/global.css',
      },
    }))
    vi.doMock('@/generation/service', () => ({
      generateTailwindV4Css,
    }))
    const { default: webpackLoader } = await import('@/bundlers/webpack/loaders/weapp-tw-css-import-rewrite-loader')
    const registerCssSource = vi.fn(async () => undefined)
    const registerGeneratedCss = vi.fn()
    const source = [
      '@layer theme, utilities;',
      '@import "tailwindcss/theme.css" layer(theme);',
      '@import "tailwindcss/utilities.css" layer(utilities) source(none);',
      '@source inline("flex bg-red-500");',
    ].join('\n')
    const residualSource = [
      '@source inline("flex bg-red-500");',
      '@theme { --color-brand: #123456; }',
    ].join('\n')
    const createContext = (generateCss?: boolean) => ({
      addDependency: vi.fn(),
      getOptions: () => ({
        ...(generateCss === undefined ? {} : { generateCss }),
        tailwindcssImportRewrite: {
          pkgDir,
          compilerOptions: {
            appType: 'weapp-vite',
            cssOptions: { platform: 'lynx' },
            generator: { target: 'web', webCompat: true },
            mainCssChunkMatcher: () => true,
            platform: 'lynx',
            styleHandler: async (css: string) => ({ css }),
          },
          getRuntimeSet: async () => new Set(['flex', 'bg-red-500']),
          registerCssSource,
          registerGeneratedCss,
          runtimeState: {
            readyPromise: Promise.resolve(),
            tailwindRuntime: { majorVersion: 4 },
          },
        },
      }),
      resourcePath: '/repo/examples/react-lynx/src/global.css',
      rootContext: '/repo/examples/react-lynx',
    })

    const [first, second] = await Promise.all([
      webpackLoader.call(createContext(true) as any, source),
      webpackLoader.call(createContext() as any, residualSource),
    ])

    expect(generateTailwindV4Css).toHaveBeenCalledOnce()
    expect(generateTailwindV4Css).toHaveBeenCalledWith(expect.objectContaining({ incrementalCache: false }))
    expect(registerCssSource).toHaveBeenCalledOnce()
    expect(registerGeneratedCss).toHaveBeenCalledOnce()
    expect(first).toContain('.flex { display: flex; }')
    expect(first).toContain('.bg-red-500')
    expect(first).not.toContain('@import "tailwindcss')
    expect(second).toBe(residualSource)
  })

  it.each([
    ['taro', '/repo/demo/taro-webpack-react-tailwindcss-v4/src/app.css'],
    ['mpx', '/repo/demo/mpx-tailwindcss-v4/src/app.css'],
  ] as const)('registers and rewrites %s CSS without generating a duplicate stylesheet', async (appType, resourcePath) => {
    vi.resetModules()
    const generateTailwindV4Css = vi.fn()
    vi.doMock('@/generation/service', () => ({
      generateTailwindV4Css,
    }))
    const { default: webpackLoader } = await import('@/bundlers/webpack/loaders/weapp-tw-css-import-rewrite-loader')
    const registerCssSource = vi.fn(async () => undefined)
    const source = [
      '@import "tailwindcss";',
      '.ordinary-css { color: red; }',
    ].join('\n')

    const result = await webpackLoader.call({
      getOptions: () => ({
        tailwindcssImportRewrite: {
          pkgDir,
          appType,
          compilerOptions: {
            appType,
            platform: appType,
            generator: { target: 'weapp' },
            mainCssChunkMatcher: () => true,
            styleHandler: async (css: string) => ({ css }),
          },
          registerCssSource,
          runtimeState: {
            readyPromise: Promise.resolve(),
            tailwindRuntime: { majorVersion: 4 },
          },
          getRuntimeSet: async () => new Set(['ordinary-css']),
        },
      }),
      resourcePath,
      rootContext: path.dirname(path.dirname(resourcePath)),
    } as any, source)

    expect(generateTailwindV4Css).not.toHaveBeenCalled()
    expect(registerCssSource).toHaveBeenCalledOnce()
    expect(registerCssSource).toHaveBeenCalledWith({
      file: resourcePath,
      css: source,
    })
    expect(result).toBe([
      `@import "${pkgDir}/index.css";`,
      '.ordinary-css { color: red; }',
    ].join('\n'))
  })

  it('removes Tailwind source directives from generated webpack H5 css', async () => {
    vi.resetModules()
    const generateTailwindV4Css = vi.fn(async (options: any) => ({
      css: [
        '@import "tailwindcss" source(none);',
        '@config "/repo/demo/taro-webpack-react-tailwindcss-v4/tailwind.config.sub-normal.js";',
        '@source "./src/**/*.{tsx,css}";',
        '.bg-red-500 { background-color: red; }',
      ].join('\n'),
      target: 'web',
      source: 'generator',
      classSet: new Set(['bg-red-500']),
      dependencies: ['/repo/demo/taro-webpack-react-tailwindcss-v4/tailwind.config.sub-normal.js'],
      metadata: {
        file: options.file,
        majorVersion: 4,
        outputFile: options.outputFile,
      },
    }))
    vi.doMock('@/generation/service', () => ({
      generateTailwindV4Css,
    }))
    const { default: webpackLoader } = await import('@/bundlers/webpack/loaders/weapp-tw-css-generation-loader')
    const registerCssSource = vi.fn()
    const registerCssSourceFile = vi.fn()
    const markGeneratedCssSource = vi.fn()
    const addDependency = vi.fn()
    const source = [
      '@import "tailwindcss" source(none);',
      '@config "../../../tailwind.config.sub-normal.js";',
      '@source "./src/**/*.{tsx,css}";',
    ].join('\n')

    const result = await webpackLoader.call({
      addDependency,
      getOptions: () => ({
        tailwindcssImportRewrite: {
          pkgDir,
          appType: 'taro',
          compilerOptions: {
            appType: 'taro',
            generator: { target: 'web' },
            mainCssChunkMatcher: () => false,
            styleHandler: async (css: string) => ({ css }),
          },
          getRuntimeSet: async () => new Set(['bg-red-500']),
          markGeneratedCssSource,
          registerCssSource,
          registerCssSourceFile,
          runtimeState: {
            readyPromise: Promise.resolve(),
            tailwindRuntime: { majorVersion: 4 },
          },
        },
      }),
      resourcePath: '/repo/demo/taro-webpack-react-tailwindcss-v4/src/sub-normal/pages/index.css',
      rootContext: '/repo/demo/taro-webpack-react-tailwindcss-v4',
    } as any, source)

    expect(generateTailwindV4Css).toHaveBeenCalledWith(expect.objectContaining({
      rawSource: expect.stringContaining('@config "/repo/demo/taro-webpack-react-tailwindcss-v4/tailwind.config.sub-normal.js";'),
    }))
    expect(registerCssSource).toHaveBeenCalledWith({
      file: '/repo/demo/taro-webpack-react-tailwindcss-v4/src/sub-normal/pages/index.css',
      css: expect.stringContaining('@config "/repo/demo/taro-webpack-react-tailwindcss-v4/tailwind.config.sub-normal.js";'),
    })
    expect(registerCssSourceFile).toHaveBeenCalledWith(expect.objectContaining({
      css: expect.stringContaining('@config "/repo/demo/taro-webpack-react-tailwindcss-v4/tailwind.config.sub-normal.js";'),
    }))
    expect(result).toContain(createBundlerGeneratedCssMarker('webpack', '/repo/demo/taro-webpack-react-tailwindcss-v4/src/sub-normal/pages/index.css'))
    expect(result).toContain('.bg-red-500 { background-color: red; }')
    expect(result).not.toContain('@config')
    expect(result).not.toContain('@source')
    expect(result).not.toContain('@import "tailwindcss"')
    expect(addDependency).toHaveBeenCalledWith('/repo/demo/taro-webpack-react-tailwindcss-v4/tailwind.config.sub-normal.js')
    expect(markGeneratedCssSource).toHaveBeenCalledWith('/repo/demo/taro-webpack-react-tailwindcss-v4/src/sub-normal/pages/index.css')
  })

  it('passes current @source candidates to webpack H5 css generation', async () => {
    vi.resetModules()
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-webpack-loader-source-'))
    createdDirs.push(projectRoot)
    const pageDir = path.join(projectRoot, 'src/pages/index')
    await mkdir(pageDir, { recursive: true })
    await writeFile(
      path.join(pageDir, 'index.tsx'),
      [
        'export default function Index() {',
        '  return <View className="bg-[#123] text-pink-200">11</View>',
        '}',
      ].join('\n'),
      'utf8',
    )
    await writeFile(
      path.join(pageDir, 'index.vue'),
      [
        '<template>',
        '  <t-button t-class="bg-[#0977ee] text-[31rpx]" t-class-content="px-[29rpx]">issue 977</t-button>',
        '</template>',
      ].join('\n'),
      'utf8',
    )

    const generateTailwindV4Css = vi.fn(async (options: any) => ({
      css: '.bg-\\[\\#123\\]{background-color:#112233}',
      target: 'web',
      source: 'generator',
      classSet: new Set(['bg-[#123]']),
      dependencies: [],
      metadata: {
        file: options.file,
        majorVersion: 4,
        outputFile: options.outputFile,
      },
    }))
    vi.doMock('@/generation/service', () => ({
      generateTailwindV4Css,
    }))
    const { default: webpackLoader } = await import('@/bundlers/webpack/loaders/weapp-tw-css-generation-loader')
    const addDependency = vi.fn()
    const source = [
      '@import "tailwindcss" source(none);',
      '@source "../src/pages/index";',
    ].join('\n')

    await webpackLoader.call({
      addDependency,
      getOptions: () => ({
        tailwindcssImportRewrite: {
          pkgDir,
          appType: 'taro',
          compilerOptions: {
            appType: 'taro',
            generator: { target: 'web' },
            customAttributesEntities: [['*', [/^t-class(?:-.+)?$/]]],
            mainCssChunkMatcher: () => true,
            outputDir: 'dist',
            tailwindcssBasedir: projectRoot,
            styleHandler: async (css: string) => ({ css }),
          },
          getRuntimeSet: async () => new Set(['bg-purple-800', 'text-pink-200']),
          runtimeState: {
            readyPromise: Promise.resolve(),
            tailwindRuntime: { majorVersion: 4 },
          },
        },
      }),
      resourcePath: path.join(projectRoot, 'src/app.css'),
      rootContext: projectRoot,
    } as any, source)

    const options = generateTailwindV4Css.mock.calls[0]?.[0]
    expect(options.sourceCandidates).toEqual(expect.any(Set))
    expect(options.sourceCandidates.has('bg-[#123]')).toBe(true)
    expect(options.sourceCandidates.has('text-pink-200')).toBe(true)
    expect(options.sourceCandidates.has('bg-[#0977ee]')).toBe(true)
    expect(options.sourceCandidates.has('text-[31rpx]')).toBe(true)
    expect(options.sourceCandidates.has('px-[29rpx]')).toBe(true)
    expect(options.getSourceCandidatesForEntries).toEqual(expect.any(Function))
    const scopedCandidates = options.getSourceCandidatesForEntries([
      {
        base: path.join(projectRoot, 'src/pages/index'),
        negated: false,
        pattern: '**/*',
      },
    ])
    expect(scopedCandidates).toEqual(expect.any(Set))
    expect(scopedCandidates.has('bg-[#123]')).toBe(true)
    expect(scopedCandidates.has('bg-[#0977ee]')).toBe(true)
    expect(scopedCandidates.has('text-[31rpx]')).toBe(true)
    expect(scopedCandidates.has('px-[29rpx]')).toBe(true)
    expect(addDependency).toHaveBeenCalledWith(await realpath(path.join(pageDir, 'index.tsx')))
    expect(addDependency).toHaveBeenCalledWith(await realpath(path.join(pageDir, 'index.vue')))
  })

  it('generates webpack H5 css for apply-only entries', async () => {
    vi.resetModules()
    const generateTailwindV4Css = vi.fn(async (options: any) => ({
      css: [
        '[data-tw-watch-web="marker"] {',
        '  background-color: rgb(18,52,86);',
        '  width: 88px;',
        '  height: 44px;',
        '}',
      ].join('\n'),
      target: 'web',
      source: 'generator',
      classSet: new Set(['bg-[#123456]', 'w-[88px]', 'h-[44px]']),
      dependencies: [],
      metadata: {
        file: options.file,
        majorVersion: 4,
        outputFile: options.outputFile,
      },
    }))
    vi.doMock('@/generation/service', () => ({
      generateTailwindV4Css,
    }))
    const { default: webpackLoader } = await import('@/bundlers/webpack/loaders/weapp-tw-css-generation-loader')
    const registerCssSource = vi.fn()
    const registerCssSourceFile = vi.fn()
    const markGeneratedCssSource = vi.fn()
    const registerGeneratedCss = vi.fn()
    const source = '[data-tw-watch-web="marker"] { @apply bg-[#123456] w-[88px] h-[44px]; }'

    const result = await webpackLoader.call({
      getOptions: () => ({
        tailwindcssImportRewrite: {
          pkgDir,
          appType: 'taro',
          compilerOptions: {
            appType: 'taro',
            generator: { target: 'web' },
            mainCssChunkMatcher: () => false,
            styleHandler: async (css: string) => ({ css }),
          },
          getRuntimeSet: async () => new Set(['bg-[#123456]', 'w-[88px]', 'h-[44px]']),
          markGeneratedCssSource,
          registerGeneratedCss,
          registerCssSource,
          registerCssSourceFile,
          runtimeState: {
            readyPromise: Promise.resolve(),
            tailwindRuntime: { majorVersion: 4 },
          },
        },
      }),
      resourcePath: '/repo/demo/taro-webpack-react-tailwindcss-v4/src/app.css',
      rootContext: '/repo/demo/taro-webpack-react-tailwindcss-v4',
    } as any, source)

    expect(generateTailwindV4Css).toHaveBeenCalledWith(expect.objectContaining({
      rawSource: source,
      file: '/repo/demo/taro-webpack-react-tailwindcss-v4/src/app.css',
      outputFile: '/repo/demo/taro-webpack-react-tailwindcss-v4/src/app.css',
    }))
    expect(registerCssSource).toHaveBeenCalledWith({
      file: '/repo/demo/taro-webpack-react-tailwindcss-v4/src/app.css',
      css: source,
    })
    expect(registerCssSourceFile).toHaveBeenCalledWith({
      file: '/repo/demo/taro-webpack-react-tailwindcss-v4/src/app.css',
      css: source,
      processed: false,
    })
    expect(result).toContain(createBundlerGeneratedCssMarker('webpack', '/repo/demo/taro-webpack-react-tailwindcss-v4/src/app.css'))
    expect(result).toContain('[data-tw-watch-web="marker"]')
    expect(result).toContain('width: 88px;')
    expect(registerGeneratedCss).toHaveBeenCalledWith(expect.objectContaining({
      classSet: new Set(['bg-[#123456]', 'w-[88px]', 'h-[44px]']),
      css: expect.stringContaining('[data-tw-watch-web="marker"]'),
      file: '/repo/demo/taro-webpack-react-tailwindcss-v4/src/app.css',
    }))
    expect(markGeneratedCssSource).toHaveBeenCalledWith('/repo/demo/taro-webpack-react-tailwindcss-v4/src/app.css')
  })

  it('registers sanitized preprocessor root css sources from the webpack loader', async () => {
    const registerCssSource = vi.fn()
    const result = loader.call({
      getOptions: () => ({
        tailwindcssImportRewrite: {
          pkgDir,
          registerCssSource,
        },
      }),
      resourcePath: '/src/app.scss',
    } as any, [
      '// source comment',
      '$brand: #123456;',
      '@import "weapp-tailwindcss";',
      '@source inline("w-4");',
      '.card { color: $brand; }',
    ].join('\n'))

    await Promise.resolve(result)

    expect(registerCssSource).toHaveBeenCalledWith({
      file: '/src/app.scss',
      css: '@import "tailwindcss";\n@source inline("w-4");',
    })
  })

  it('keeps legacy weapp-tailwindcss root imports resolvable as compatibility aliases', () => {
    const code = '@import "weapp-tailwindcss";'
    const rewritten = rewriteTailwindcssImportsInCode(code, pkgDir, { join: joinPosixPath })
    expect(rewritten).toBe(`@import "${pkgDir}/index.css";`)
  })

  it('rewrites tailwindcss import to package css entry for non-mpx', () => {
    const code = '@import "tailwindcss";'
    const rewritten = rewriteTailwindcssImportsInCode(code, pkgDir, { join: joinPosixPath })
    expect(rewritten).toBe(`@import "${pkgDir}/index.css";`)
  })
})
