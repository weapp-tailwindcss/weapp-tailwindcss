import type { Transform } from 'node:stream'
import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import postcss from 'postcss'
import Vinyl from 'vinyl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPlugins } from '@/bundlers/gulp'
import { createCache } from '@/cache'
import { createJsHandler } from '@/js'

interface InternalContext {
  templateHandler: ReturnType<typeof vi.fn>
  styleHandler: ReturnType<typeof vi.fn>
  jsHandler: ReturnType<typeof vi.fn>
  cache: ReturnType<typeof createCache>
  cssMatcher?: ReturnType<typeof vi.fn>
  jsMatcher?: ReturnType<typeof vi.fn>
  wxsMatcher?: ReturnType<typeof vi.fn>
  mainCssChunkMatcher: ReturnType<typeof vi.fn>
  tailwindRuntime: {
    getClassSet: ReturnType<typeof vi.fn>
    getClassSetSync: ReturnType<typeof vi.fn>
    extract: ReturnType<typeof vi.fn>
    majorVersion: number
  }
  tailwindcss?: any
  refreshTailwindcssRuntime?: ReturnType<typeof vi.fn>
}

let currentContext: InternalContext
const createCompilerContextMock = vi.fn<(options?: unknown) => InternalContext>(() => currentContext)

vi.mock('@/context', () => ({
  createCompilerContext: (options?: unknown) => createCompilerContextMock(options),
}))

function createFile(path: string, contents: string) {
  return new Vinyl({
    cwd: '/',
    base: '/src',
    path,
    contents: Buffer.from(contents),
  })
}

function createNullFile(path: string) {
  return new Vinyl({
    cwd: '/',
    base: '/src',
    path,
    contents: null,
  })
}

async function runTransform(transform: Transform, file: Vinyl) {
  return await new Promise<Vinyl>((resolve, reject) => {
    transform.once('data', resolve)
    transform.once('error', reject)
    transform.write(file)
    transform.end()
  })
}

describe('bundlers/gulp createPlugins', () => {
  let styleHandler: ReturnType<typeof vi.fn>
  let templateHandler: ReturnType<typeof vi.fn>
  let jsHandler: ReturnType<typeof vi.fn>
  let runtimeSet: Set<string>
  let tailwindRuntime: any

  beforeEach(() => {
    const cache = createCache()
    runtimeSet = new Set(['foo'])

    styleHandler = vi.fn(async (source: string) => ({
      css: `css:${source}`,
    }))
    templateHandler = vi.fn(async (source: string) => `tpl:${source}`)
    jsHandler = vi.fn(async (source: string) => ({ code: `js:${source}` }))
    tailwindRuntime = {
      getClassSet: vi.fn(async () => runtimeSet),
      getClassSetSync: vi.fn(() => runtimeSet),
      extract: vi.fn(async () => ({ classSet: runtimeSet })),
      majorVersion: 4,
    }

    currentContext = {
      templateHandler,
      styleHandler,
      jsHandler,
      cache,
      jsMatcher: vi.fn((id: string) => id.endsWith('.js')),
      wxsMatcher: vi.fn((id: string) => id.endsWith('.wxs')),
      mainCssChunkMatcher: vi.fn((name: string) => path.basename(name) === 'app.wxss'),
      tailwindRuntime,
      refreshTailwindcssRuntime: vi.fn(async () => tailwindRuntime),
    }

    createCompilerContextMock.mockClear()
  })

  afterEach(() => {
    delete process.env.WEAPP_TW_HMR_MEMORY_DEBUG
    delete process.env.WEAPP_TW_WATCH_REGRESSION
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('disposes compiler-owned sessions and resets the runtime manager', async () => {
    const runtimeManager = {
      reset: vi.fn(async () => undefined),
      sync: vi.fn(),
    }
    const plugins = createPlugins({
      __internalGulpRuntimeClassSetManager: runtimeManager,
    } as any)

    await plugins.dispose()
    await plugins.dispose()

    expect(runtimeManager.reset).toHaveBeenCalledTimes(1)
  })

  it('processes files and caches results across runs', async () => {
    const plugins = createPlugins()
    expect(createCompilerContextMock).toHaveBeenCalled()

    const cssFile = createFile('/src/app.wxss', '.foo { color: red; }')
    const processedCss = await runTransform(plugins.transformWxss(), cssFile)
    expect(processedCss.contents?.toString()).toBe('css:.foo { color: red; }')
    expect(styleHandler).toHaveBeenCalledTimes(1)
    expect(tailwindRuntime.extract).toHaveBeenCalledTimes(1)

    const cachedCssFile = createFile('/src/app.wxss', '.foo { color: red; }')
    const cachedCss = await runTransform(plugins.transformWxss(), cachedCssFile)
    expect(styleHandler.mock.calls.length).toBeGreaterThanOrEqual(1)
    expect(styleHandler.mock.calls.length).toBeLessThanOrEqual(2)
    expect(cachedCss.contents?.toString()).toBe('css:.foo { color: red; }')
    expect(tailwindRuntime.extract).toHaveBeenCalledTimes(1)

    // Ensure runtime set is reused for JS handler
    const jsFile = createFile('/src/app.js', 'import "./init"; console.log("hi")')
    const processedJs = await runTransform(plugins.transformJs(), jsFile)
    expect(jsHandler).toHaveBeenCalledTimes(1)
    expect(tailwindRuntime.extract).toHaveBeenCalledTimes(1)
    expect(jsHandler).toHaveBeenCalledWith(
      'import "./init"; console.log("hi")',
      new Set(),
      expect.objectContaining({
        filename: expect.stringContaining('app.js'),
        moduleGraph: expect.objectContaining({
          resolve: expect.any(Function),
          load: expect.any(Function),
        }),
        babelParserOptions: expect.objectContaining({
          sourceFilename: expect.stringContaining('app.js'),
        }),
      }),
    )
    expect(processedJs.contents?.toString()).toBe('js:import "./init"; console.log("hi")')

    const cachedJsFile = createFile('/src/app.js', 'import "./init"; console.log("hi")')
    await runTransform(plugins.transformJs(), cachedJsFile)
    expect(jsHandler).toHaveBeenCalledTimes(1)

    const wxmlFile = createFile('/src/app.wxml', '<view class="foo"></view>')
    const processedHtml = await runTransform(plugins.transformWxml(), wxmlFile)
    expect(templateHandler).toHaveBeenCalledTimes(1)
    expect(processedHtml.contents?.toString()).toBe('tpl:<view class="foo"></view>')

    const cachedHtmlFile = createFile('/src/app.wxml', '<view class="foo"></view>')
    await runTransform(plugins.transformWxml(), cachedHtmlFile)
    expect(templateHandler).toHaveBeenCalledTimes(1)
  })

  it('runs final css adaptation independently from generation', async () => {
    const plugins = createPlugins()
    const adapted = await runTransform(
      plugins.adaptWxss(),
      createFile('/src/app.wxss', '.postcss-output { display: flex; }'),
    )

    expect(adapted.contents?.toString()).toBe('css:.postcss-output { display: flex; }')
    expect(styleHandler).toHaveBeenCalledWith(
      '.postcss-output { display: flex; }',
      expect.objectContaining({
        isMainChunk: true,
        majorVersion: 4,
      }),
    )
    expect(tailwindRuntime.extract).not.toHaveBeenCalled()
  })

  it('removes empty at-rules only from final gulp css outputs', async () => {
    const source = [
      '@media (prefers-color-scheme: light) {}',
      '@media screen { @supports (display: grid) { /* removed */ } }',
      '@media (prefers-color-scheme: dark) { .theme { background: #232323; } }',
    ].join('\n')
    styleHandler.mockImplementation(async (css: string) => ({ css }))
    const plugins = createPlugins()

    const generated = await runTransform(plugins.generateWxss(), createFile('/src/app.wxss', source))
    const transformed = await runTransform(plugins.transformWxss(), createFile('/src/page.wxss', source))
    const adapted = await runTransform(plugins.adaptWxss(), createFile('/src/component.wxss', source))

    expect(generated.contents?.toString()).toContain('@media (prefers-color-scheme: light) {}')
    for (const finalOutput of [transformed, adapted]) {
      const css = finalOutput.contents?.toString() ?? ''
      expect(css).not.toContain('prefers-color-scheme: light')
      expect(css).not.toContain('@supports')
      expect(css).toContain('@media (prefers-color-scheme: dark) { .theme { background: #232323; } }')
    }
  })

  it('refreshes gulp runtime candidates before transforming changed js sources', async () => {
    let currentRuntimeSet = new Set(['w-[1px]'])
    tailwindRuntime.getClassSetSync.mockImplementation(() => currentRuntimeSet)
    tailwindRuntime.extract.mockImplementation(async () => ({ classSet: currentRuntimeSet }))
    jsHandler.mockImplementation(async (_source: string, classSet?: Set<string>) => ({
      code: classSet?.has('w-[2px]') ? 'hit:w-[2px]' : 'miss:w-[2px]',
    }))

    const plugins = createPlugins()

    await runTransform(plugins.transformJs(), createFile('/src/app.js', 'const cls = "w-[1px]"'))
    currentRuntimeSet = new Set(['w-[1px]', 'w-[2px]'])
    const processed = await runTransform(plugins.transformJs(), createFile('/src/app.js', 'const cls = "w-[2px]"'))

    expect(processed.contents?.toString()).toBe('hit:w-[2px]')
    expect(tailwindRuntime.extract).toHaveBeenCalledTimes(0)
  })

  it('fails closed when gulp has no Tailwind-confirmed runtime classes', async () => {
    const strictJsHandler = createJsHandler({
      jsArbitraryValueFallback: true,
      tailwindcssMajorVersion: 4,
    })
    jsHandler.mockImplementation((source: string, classSet?: Set<string>, options?: Record<string, unknown>) =>
      strictJsHandler(source, classSet, options as any))
    const runtimeManager = {
      reset: vi.fn(async () => undefined),
      sync: vi.fn(async () => new Set<string>()),
    }
    const plugins = createPlugins({
      __internalGulpRuntimeClassSetManager: runtimeManager,
    } as any)
    const source = 'const cls = "w-[100px]"; store.dispatch("user/getUserInfo")'

    const processed = await runTransform(plugins.transformJs(), createFile('/src/app.js', source))

    expect(processed.contents?.toString()).toBe(source)
    expect(runtimeManager.sync).toHaveBeenCalledTimes(1)
  })

  it('uses incremental runtime candidates for tailwindcss v4 gulp js updates', async () => {
    tailwindRuntime.majorVersion = 4
    const incrementalRuntimeSet = new Set<string>()
    const incrementalRuntimeManager = {
      reset: vi.fn(async () => undefined),
      sync: vi.fn(async (_runtime: unknown, snapshot: { runtimeAffectingChangedByType: { js: Set<string> }, entries: Array<{ file: string, source: string }> }) => {
        for (const file of snapshot.runtimeAffectingChangedByType.js) {
          const entry = snapshot.entries.find(item => item.file === file)
          if (!entry) {
            continue
          }
          const matches = entry.source.match(/[a-z]-\[[^\]]+\]/g) ?? []
          for (const match of matches) {
            incrementalRuntimeSet.add(match)
          }
        }
        return new Set(incrementalRuntimeSet)
      }),
    }
    jsHandler.mockImplementation(async (_source: string, classSet?: Set<string>) => ({
      code: classSet?.has('w-[2px]') ? 'hit:w-[2px]' : 'miss:w-[2px]',
    }))

    const plugins = createPlugins({
      __internalGulpRuntimeClassSetManager: incrementalRuntimeManager,
    } as any)

    await runTransform(plugins.transformJs(), createFile('/src/app.js', 'const cls = "w-[1px]"'))
    const processed = await runTransform(plugins.transformJs(), createFile('/src/app.js', 'const cls = "w-[2px]"'))

    expect(processed.contents?.toString()).toBe('hit:w-[2px]')
    expect(incrementalRuntimeManager.sync).toHaveBeenCalledTimes(2)
    expect(tailwindRuntime.extract).not.toHaveBeenCalled()
  })

  it('does not force collect tailwindcss v4 runtime when gulp css follows js updates', async () => {
    tailwindRuntime.majorVersion = 4
    const incrementalRuntimeSet = new Set<string>()
    const incrementalRuntimeManager = {
      reset: vi.fn(async () => undefined),
      sync: vi.fn(async (_runtime: unknown, snapshot: { runtimeAffectingChangedByType: { js: Set<string> }, entries: Array<{ file: string, source: string }> }) => {
        for (const file of snapshot.runtimeAffectingChangedByType.js) {
          const entry = snapshot.entries.find(item => item.file === file)
          if (!entry) {
            continue
          }
          const matches = entry.source.match(/[a-z]-\[[^\]]+\]/g) ?? []
          for (const match of matches) {
            incrementalRuntimeSet.add(match)
          }
        }
        return new Set(incrementalRuntimeSet)
      }),
    }
    const plugins = createPlugins({
      __internalGulpRuntimeClassSetManager: incrementalRuntimeManager,
    } as any)

    await runTransform(plugins.transformJs(), createFile('/src/app.js', 'const cls = "w-[2px]"'))
    const processed = await runTransform(plugins.transformWxss({
      isMainChunk: true,
    }), createFile('/src/app.wxss', '@import "./foo.css";'))

    expect(processed.contents?.toString()).toBe('css:@import "./foo.css";')
    expect(incrementalRuntimeManager.sync).toHaveBeenCalledTimes(1)
    expect(tailwindRuntime.extract).not.toHaveBeenCalled()
  })

  it('registers tailwindcss v4 cssSources without local css imports', async () => {
    tailwindRuntime.majorVersion = 4
    currentContext.cssMatcher = vi.fn((id: string) => id.endsWith('.wxss'))
    const generateMock = vi.fn(async ({ candidates }: { candidates: Set<string> }) => ({
      css: [...candidates].sort().map(candidate => `.adapted-${candidate}{}`).join('\n'),
      rawCss: [...candidates].sort().map(candidate => `.raw-${candidate}{}`).join('\n'),
      target: 'weapp',
      classSet: new Set(candidates),
      dependencies: [],
      sources: [],
      root: null,
    }))
    vi.resetModules()
    vi.doMock('@/generator/runtime', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: vi.fn(() => ({
        enabled: true,
        importFallback: false,
        target: 'weapp',
        styleOptions: {},
      })),
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: '/',
        base: options.base ?? options.cssSources?.[0]?.base ?? '/',
        baseFallbacks: [],
        css: options.css ?? options.cssSources?.[0]?.css,
        dependencies: [],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: '/',
        base: '/',
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: '/',
        base: '/',
        baseFallbacks: [],
        cssSources: currentContext.tailwindcss?.v4?.cssSources ?? [],
      })),
    }))

    try {
      const { createPlugins: createMockedPlugins } = await import('@/bundlers/gulp')
      const plugins = createMockedPlugins()

      const source = [
        '@import "tailwindcss";',
        '@import "./src/third-party-ui.css";',
        '@source inline("w-4");',
      ].join('\n')
      const cssFile = createFile('/src/app.css', source)
      const processed = await runTransform(plugins.generateWxss(), cssFile)
      const downstream = await postcss([{
        postcssPlugin: 'gulp-downstream-postcss-observer',
        OnceExit(root) {
          root.append({ selector: '.gulp-postcss-saw-generated-css', nodes: [] })
        },
      }]).process(processed.contents?.toString() ?? '', { from: undefined })

      expect(currentContext.tailwindcss?.v4?.cssSources).toEqual([
        {
          file: '/src/app.css',
          base: '/src',
          css: [
            '@import "tailwindcss";',
            '@source inline("w-4");',
          ].join('\n'),
        },
      ])
      expect(processed.contents?.toString()).toContain('@import "./src/third-party-ui.css";')
      expect(processed.contents?.toString()).toContain('.raw-foo{}')
      expect(processed.contents?.toString()).not.toContain('.adapted-foo{}')
      expect(processed.contents?.toString()).not.toContain('.weapp-tw-user-ui-card')
      expect(generateMock).toHaveBeenCalledWith(expect.objectContaining({
        target: 'weapp',
      }))
      expect(tailwindRuntime.extract).toHaveBeenCalled()
      expect(downstream.css).toContain('.gulp-postcss-saw-generated-css')
    }
    finally {
      vi.doUnmock('@/generator')
      vi.resetModules()
    }
  })

  it('scopes gulp Tailwind v4 css generation to each css root @source entries', async () => {
    tailwindRuntime.majorVersion = 4
    runtimeSet = new Set(['app-only', 'normal-only', 'independent-only'])
    tailwindRuntime.getClassSetSync.mockImplementation(() => runtimeSet)
    tailwindRuntime.extract.mockImplementation(async () => ({ classSet: runtimeSet }))

    const dir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-gulp-v4-'))
    ;(currentContext as any).tailwindcssBasedir = dir
    const srcDir = path.join(dir, 'src')
    const appCss = path.join(srcDir, 'app.css')
    const normalCss = path.join(srcDir, 'sub-normal/pages/index.css')
    const independentCss = path.join(srcDir, 'sub-independent/pages/index.css')
    const appWxml = path.join(srcDir, 'pages/index/index.wxml')
    const normalWxml = path.join(srcDir, 'sub-normal/pages/index.wxml')
    const independentWxml = path.join(srcDir, 'sub-independent/pages/index.wxml')
    await fs.promises.mkdir(path.dirname(appWxml), { recursive: true })
    await fs.promises.mkdir(path.dirname(normalCss), { recursive: true })
    await fs.promises.mkdir(path.dirname(independentCss), { recursive: true })
    await writeFile(appCss, [
      '@import "tailwindcss";',
      '@source "./**/*.{wxml,ts}";',
      '@source not "./sub-normal/**/*";',
      '@source not "./sub-independent/**/*";',
    ].join('\n'))
    await writeFile(normalCss, [
      '@import "tailwindcss" source(none);',
      '@source "../**/*.{wxml,ts}";',
    ].join('\n'))
    await writeFile(independentCss, [
      '@import "tailwindcss" source(none);',
      '@source "../**/*.{wxml,ts}";',
    ].join('\n'))
    await writeFile(appWxml, '<view class="app-only"></view>')
    await writeFile(normalWxml, '<view class="normal-only"></view>')
    await writeFile(independentWxml, '<view class="independent-only"></view>')

    const generateMock = vi.fn(async ({ candidates }: { candidates: Set<string> }) => ({
      css: [...candidates].sort().map(candidate => `.${candidate}{}`).join('\n'),
      rawCss: [...candidates].sort().map(candidate => `.${candidate}{}`).join('\n'),
      target: 'weapp',
      classSet: new Set(candidates),
      dependencies: [],
      sources: [],
      root: null,
    }))
    vi.resetModules()
    vi.doMock('@/generator/runtime', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: vi.fn(() => ({
        enabled: true,
        importFallback: false,
        target: 'weapp',
        styleOptions: {},
      })),
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: dir,
        base: options.base ?? options.cssSources?.[0]?.base ?? dir,
        baseFallbacks: [],
        css: options.css ?? options.cssSources?.[0]?.css,
        dependencies: [],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: dir,
        base: dir,
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: dir,
        base: dir,
        baseFallbacks: [],
        cssSources: currentContext.tailwindcss?.v4?.cssSources ?? [],
      })),
    }))

    try {
      const { createPlugins: createMockedPlugins } = await import('@/bundlers/gulp')
      const plugins = createMockedPlugins({
        tailwindcssBasedir: dir,
      })
      await runTransform(plugins.transformWxss(), new Vinyl({
        cwd: dir,
        base: srcDir,
        path: appCss,
        contents: Buffer.from(await fs.promises.readFile(appCss, 'utf8')),
      }))
      await runTransform(plugins.transformWxss(), new Vinyl({
        cwd: dir,
        base: srcDir,
        path: normalCss,
        contents: Buffer.from(await fs.promises.readFile(normalCss, 'utf8')),
      }))
      await runTransform(plugins.transformWxss(), new Vinyl({
        cwd: dir,
        base: srcDir,
        path: independentCss,
        contents: Buffer.from(await fs.promises.readFile(independentCss, 'utf8')),
      }))

      const [appCall, normalCall, independentCall] = generateMock.mock.calls.map(call => call[0]?.candidates as Set<string>)
      expect(appCall).toEqual(new Set(['app-only']))
      expect(normalCall).toEqual(new Set(['normal-only']))
      expect(independentCall).toEqual(new Set(['independent-only']))
    }
    finally {
      vi.doUnmock('@/generator')
      vi.resetModules()
      await rm(dir, { force: true, recursive: true })
    }
  })

  it('refreshes gulp Tailwind v4 css source candidates after wxml updates', async () => {
    tailwindRuntime.majorVersion = 4
    const dir = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-gulp-v4-hot-'))
    ;(currentContext as any).tailwindcssBasedir = dir
    ;(currentContext as any).cssSourceTrace = true
    const srcDir = path.join(dir, 'src')
    const appCss = path.join(srcDir, 'app.css')
    const appWxml = path.join(srcDir, 'pages/index/index.wxml')
    await fs.promises.mkdir(path.dirname(appWxml), { recursive: true })
    await writeFile(appCss, [
      '@import "tailwindcss";',
      '@source "./pages/**/*.wxml";',
    ].join('\n'))
    await writeFile(appWxml, '<view class="app-before"></view>')

    const incrementalRuntimeManager = {
      reset: vi.fn(async () => undefined),
      sync: vi.fn(async (_runtime: unknown, snapshot: { entries: Array<{ source: string }> }) => {
        const candidates = new Set<string>()
        for (const entry of snapshot.entries) {
          const matches = entry.source.match(/app-(?:before|after)/g) ?? []
          for (const match of matches) {
            candidates.add(match)
          }
        }
        return candidates
      }),
    }
    const generateMock = vi.fn(async ({ candidates }: { candidates: Set<string> }) => ({
      css: [...candidates].sort().map(candidate => `.${candidate}{}`).join('\n'),
      rawCss: [...candidates].sort().map(candidate => `.${candidate}{}`).join('\n'),
      target: 'weapp',
      classSet: new Set(candidates),
      dependencies: [],
      sources: [],
      root: null,
    }))
    vi.resetModules()
    vi.doMock('@/generator/runtime', () => ({
      createWeappTailwindcssGenerator: vi.fn(() => ({
        generate: generateMock,
      })),
      normalizeWeappTailwindcssGeneratorOptions: vi.fn(() => ({
        enabled: true,
        importFallback: false,
        target: 'weapp',
        styleOptions: {},
      })),
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: dir,
        base: options.base ?? options.cssSources?.[0]?.base ?? dir,
        baseFallbacks: [],
        css: options.css ?? options.cssSources?.[0]?.css,
        dependencies: [],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: dir,
        base: dir,
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: dir,
        base: dir,
        baseFallbacks: [],
        cssSources: currentContext.tailwindcss?.v4?.cssSources ?? [],
      })),
    }))

    try {
      const { createPlugins: createMockedPlugins } = await import('@/bundlers/gulp')
      const plugins = createMockedPlugins({
        tailwindcssBasedir: dir,
        __internalGulpRuntimeClassSetManager: incrementalRuntimeManager,
      } as any)
      await runTransform(plugins.transformWxss(), new Vinyl({
        cwd: dir,
        base: srcDir,
        path: appCss,
        contents: Buffer.from(await fs.promises.readFile(appCss, 'utf8')),
      }))

      await writeFile(appWxml, '<view class="app-after"></view>')
      await runTransform(plugins.transformWxml(), new Vinyl({
        cwd: dir,
        base: srcDir,
        path: appWxml,
        contents: Buffer.from(await fs.promises.readFile(appWxml, 'utf8')),
      }))
      await runTransform(plugins.transformWxss(), new Vinyl({
        cwd: dir,
        base: srcDir,
        path: appCss,
        contents: Buffer.from(await fs.promises.readFile(appCss, 'utf8')),
      }))

      const lastCandidates = generateMock.mock.calls.at(-1)?.[0]?.candidates as Set<string>
      expect(lastCandidates).toEqual(new Set(['app-after']))
    }
    finally {
      vi.doUnmock('@/generator')
      vi.resetModules()
      await rm(dir, { force: true, recursive: true })
    }
  })

  it('rebuilds graph css when gulp watch reports generation dependency updates and deletes', async () => {
    vi.stubEnv('WEAPP_TAILWINDCSS_COMPILER', 'graph')
    tailwindRuntime.majorVersion = 4
    currentContext.cssMatcher = vi.fn((id: string) => id.endsWith('.css'))
    currentContext.mainCssChunkMatcher = vi.fn((name: string) => name === 'styles/root.css')
    const dependency = '/project/tailwind.config.ts'
    let generation = 0
    const generateMock = vi.fn(async ({ candidates }: { candidates: Set<string> }) => {
      generation += 1
      const css = `.generation-${generation}{display:block}`
      return {
        css,
        rawCss: css,
        target: 'weapp',
        classSet: new Set(candidates),
        dependencies: [dependency],
        sources: [],
        root: null,
      }
    })
    const dispose = vi.fn()
    const createGenerator = vi.fn(() => ({
      dispose,
      generate: generateMock,
    }))
    vi.resetModules()
    vi.doMock('@/generator/runtime', () => ({
      createWeappTailwindcssGenerator: createGenerator,
      normalizeWeappTailwindcssGeneratorOptions: vi.fn(() => ({
        enabled: true,
        hmr: { preserveDeletedCss: false },
        importFallback: false,
        target: 'weapp',
        styleOptions: {},
      })),
      resolveTailwindV4Source: vi.fn(async (options: any) => ({
        projectRoot: '/project',
        base: options.base ?? '/src/styles',
        baseFallbacks: [],
        css: options.css,
        dependencies: [],
      })),
      resolveTailwindV4SourceFromRuntime: vi.fn(async () => ({
        projectRoot: '/project',
        base: '/src/styles',
        baseFallbacks: [],
        css: '@import "tailwindcss";',
        dependencies: [],
      })),
      resolveTailwindV4SourceOptionsFromRuntime: vi.fn(() => ({
        projectRoot: '/project',
        baseFallbacks: [],
      })),
    }))

    try {
      const { createPlugins: createMockedPlugins } = await import('@/bundlers/gulp')
      const plugins = createMockedPlugins()
      const createCssFile = () => createFile('/src/styles/root.css', '@import "tailwindcss";')

      expect(plugins.getCompilerShadowRunSnapshot().revision).toBe(0)
      expect(plugins.beginCompilerShadowRun()).toBe(1)
      expect(plugins.completeCompilerShadowRun()).toBeUndefined()

      const first = await runTransform(plugins.generateWxss(), createCssFile())
      const cached = await runTransform(plugins.generateWxss(), createCssFile())

      expect(first.contents?.toString()).toContain('.generation-1{display:block}')
      expect(cached.contents?.toString()).toBe(first.contents?.toString())
      expect(generateMock).toHaveBeenCalledTimes(1)

      await expect(plugins.watchChange(dependency)).resolves.toEqual(new Set(['styles/root.css']))
      expect(plugins.getCompilerShadowRunSnapshot().revision).toBe(2)
      const updated = await runTransform(plugins.generateWxss(), createCssFile())
      expect(updated.contents?.toString()).toContain('.generation-2{display:block}')
      expect(generateMock).toHaveBeenCalledTimes(2)

      await expect(plugins.watchChange(dependency, { event: 'delete' })).resolves.toEqual(new Set(['styles/root.css']))
      expect(plugins.getCompilerShadowRunSnapshot().revision).toBe(3)
      const deleted = await runTransform(plugins.generateWxss(), createCssFile())
      expect(deleted.contents?.toString()).toContain('.generation-3{display:block}')
      expect(generateMock).toHaveBeenCalledTimes(3)
      expect(createGenerator).toHaveBeenCalledTimes(3)
      expect(dispose).toHaveBeenCalledTimes(2)

      expect(currentContext.tailwindcss?.v4?.cssSources).toEqual([
        expect.objectContaining({ file: '/src/styles/root.css' }),
      ])
      await plugins.watchChange('/src/styles/root.css', { event: 'delete' })
      expect(currentContext.tailwindcss?.v4?.cssSources).toEqual([])
    }
    finally {
      vi.doUnmock('@/generator')
      vi.resetModules()
    }
  })

  it('re-runs handlers when cache is disabled', async () => {
    currentContext.cache = createCache(false)

    const plugins = createPlugins()

    const cssFile = createFile('/src/app.wxss', '.foo { color: blue; }')
    await runTransform(plugins.transformWxss(), cssFile)
    const cssFileSecond = createFile('/src/app.wxss', '.foo { color: blue; }')
    await runTransform(plugins.transformWxss(), cssFileSecond)
    expect(styleHandler).toHaveBeenCalledTimes(2)

    const jsFile = createFile('/src/app.js', 'import "./init"; console.log("cache-off")')
    await runTransform(plugins.transformJs(), jsFile)
    const jsFileSecond = createFile('/src/app.js', 'import "./init"; console.log("cache-off")')
    await runTransform(plugins.transformJs(), jsFileSecond)
    expect(jsHandler).toHaveBeenCalledTimes(2)

    const htmlFile = createFile('/src/app.wxml', '<view>cache</view>')
    await runTransform(plugins.transformWxml(), htmlFile)
    const htmlFileSecond = createFile('/src/app.wxml', '<view>cache</view>')
    await runTransform(plugins.transformWxml(), htmlFileSecond)
    expect(templateHandler).toHaveBeenCalledTimes(2)
  })

  it('reuses default css handler options across transformWxss invocations', async () => {
    const plugins = createPlugins()

    await runTransform(plugins.transformWxss(), createFile('/src/app.wxss', '.foo { color: blue; }'))
    await runTransform(plugins.transformWxss(), createFile('/src/page.wxss', '.bar { color: green; }'))

    expect(styleHandler).toHaveBeenCalledTimes(2)
    expect(styleHandler.mock.calls[0]?.[1]).toEqual({
      isMainChunk: true,
      majorVersion: 4,
      postcssOptions: {
        options: {
          from: '/src/app.wxss',
        },
      },
      sourceOptions: {
        outputRoot: '/',
        sourceCss: '.foo { color: blue; }',
        sourceFile: '/src/app.wxss',
      },
    })
    expect(styleHandler.mock.calls[1]?.[1]).toEqual({
      isMainChunk: false,
      majorVersion: 4,
      postcssOptions: {
        options: {
          from: '/src/page.wxss',
        },
      },
      sourceOptions: {
        outputRoot: '/',
        sourceCss: '.bar { color: green; }',
        sourceFile: '/src/page.wxss',
      },
    })
  })

  it('uses mainCssChunkMatcher to resolve css main chunk', async () => {
    const mainCssChunkMatcher = vi.fn((name: string) => name === 'styles/index.css')
    currentContext.mainCssChunkMatcher = mainCssChunkMatcher
    const plugins = createPlugins()

    await runTransform(
      plugins.transformWxss(),
      new Vinyl({
        cwd: '/',
        base: '/src',
        path: '/src/styles/index.css',
        contents: Buffer.from('.foo { color: red; }'),
      }),
    )

    expect(mainCssChunkMatcher).toHaveBeenCalledWith('styles/index.css', undefined)
    expect(styleHandler.mock.calls[0]?.[1]).toEqual({
      isMainChunk: true,
      majorVersion: 4,
      postcssOptions: {
        options: {
          from: '/src/styles/index.css',
        },
      },
      sourceOptions: {
        outputRoot: '/',
        sourceCss: '.foo { color: red; }',
        sourceFile: '/src/styles/index.css',
      },
    })
  })

  it('reuses default template handler options across transformWxml invocations', async () => {
    const plugins = createPlugins()

    await runTransform(plugins.transformWxml(), createFile('/src/app.wxml', '<view class="foo"></view>'))
    await runTransform(plugins.transformWxml(), createFile('/src/page.wxml', '<view class="bar"></view>'))

    expect(templateHandler).toHaveBeenCalledTimes(2)
    expect(templateHandler.mock.calls[0]?.[1]).toEqual({
      runtimeSet: new Set(),
    })
    expect(templateHandler.mock.calls[1]?.[1]).toEqual({
      runtimeSet: new Set(),
    })
  })

  it('resolves directory index files when building module graph', async () => {
    const plugins = createPlugins()

    const jsFile = createFile('/src/app.js', 'import "./init"; console.log("graph")')
    await runTransform(plugins.transformJs(), jsFile)

    const handlerCalls = jsHandler.mock.calls
    const handlerOptions = handlerCalls.at(-1)?.[2]
    expect(handlerOptions?.moduleGraph).toBeDefined()
    const moduleGraph = handlerOptions?.moduleGraph
    const importer = handlerOptions?.filename
    expect(importer).toBeTruthy()

    const moduleDir = path.resolve(path.dirname(importer!), './utils')
    const indexTs = path.join(moduleDir, 'index.ts')
    const statSpy = vi.spyOn(fs, 'statSync')
    const directoryStats = {
      isFile: () => false,
      isDirectory: () => true,
    } as unknown as fs.Stats
    const fileStats = {
      isFile: () => true,
      isDirectory: () => false,
    } as unknown as fs.Stats

    statSpy.mockImplementation((target: fs.PathLike) => {
      if (target === moduleDir) {
        return directoryStats
      }
      if (target === indexTs) {
        return fileStats
      }
      const error = new Error(`ENOENT: no such file or directory, stat '${target.toString()}'`) as NodeJS.ErrnoException
      error.code = 'ENOENT'
      throw error
    })

    try {
      const resolved = moduleGraph?.resolve?.('./utils', importer!)
      expect(resolved).toBe(indexTs)
    }
    finally {
      statSpy.mockRestore()
    }
  })

  it('reuses the default moduleGraph across transformJs invocations', async () => {
    const plugins = createPlugins()

    await runTransform(plugins.transformJs(), createFile('/src/app.js', 'import "./init"; console.log("a")'))
    await runTransform(plugins.transformJs(), createFile('/src/page.js', 'import "./init"; console.log("b")'))

    const firstOptions = jsHandler.mock.calls[0]?.[2]
    const secondOptions = jsHandler.mock.calls[1]?.[2]

    expect(firstOptions?.moduleGraph).toBe(secondOptions?.moduleGraph)
  })

  it('bounds gulp watch caches across many changed vinyl files', async () => {
    const plugins = createPlugins()

    for (let index = 0; index < 620; index += 1) {
      const file = createFile(`/src/pages/page-${index}.js`, `const cls = "w-[${index}px]"`)
      await runTransform(plugins.transformJs(), file)
    }

    expect(currentContext.cache.instance.size).toBeLessThanOrEqual(512)
    expect(currentContext.cache.hashMap.size).toBeLessThanOrEqual(512)
    expect(currentContext.cache.has('/src/pages/page-0.js')).toBe(false)
    expect(currentContext.cache.has('/src/pages/page-619.js')).toBe(true)
  })

  it('emits gulp memory debug stats for watch regression guards', async () => {
    process.env.WEAPP_TW_WATCH_REGRESSION = '1'
    process.env.WEAPP_TW_HMR_MEMORY_DEBUG = '1'
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const plugins = createPlugins()

    await runTransform(plugins.transformJs(), createFile('/src/pages/index.js', 'const cls = "foo"'))

    const payloadLine = write.mock.calls
      .map(([chunk]) => String(chunk))
      .find(line => line.startsWith('[weapp-tailwindcss:hmr] '))
    expect(payloadLine).toBeTruthy()
    const payload = JSON.parse(payloadLine!.replace('[weapp-tailwindcss:hmr] ', ''))
    expect(payload.memoryDebug).toMatchObject({
      phase: 'js',
      runtime: {
        runtimeSet: 0,
        runtimeSourceHashByFile: 1,
        runtimeSourcesByFile: 1,
        maxRuntimeSources: 256,
      },
      processCache: {
        activeCacheKeys: 1,
        maxCacheKeys: 512,
      },
      gulpOptions: {
        defaultStyleHandlerOptions: 0,
      },
    })
    expect(payload.memoryDebug.process.heapUsedMb).toEqual(expect.any(Number))
  })

  it('passes through empty vinyl files without invoking handlers', async () => {
    const plugins = createPlugins()

    await runTransform(plugins.transformWxss(), createNullFile('/src/app.wxss'))
    await runTransform(plugins.transformJs(), createNullFile('/src/app.js'))
    await runTransform(plugins.transformWxml(), createNullFile('/src/app.wxml'))

    expect(styleHandler).not.toHaveBeenCalled()
    expect(jsHandler).not.toHaveBeenCalled()
    expect(templateHandler).not.toHaveBeenCalled()
  })

  it('forwards handler errors through the vinyl transform stream', async () => {
    const plugins = createPlugins()
    styleHandler.mockRejectedValueOnce(new Error('css failed'))

    await expect(runTransform(
      plugins.transformWxss(),
      createFile('/src/error.wxss', '.bad{}'),
    )).rejects.toThrow('css failed')
  })

  it('merges explicit css and template handler options', async () => {
    const plugins = createPlugins()
    const customRuntimeSet = new Set(['custom'])

    await runTransform(plugins.transformWxss({
      isMainChunk: false,
      cssRemoveProperty: false,
    }), createFile('/src/custom.wxss', '.foo{}'))
    await runTransform(plugins.transformWxml({
      runtimeSet: customRuntimeSet,
      customAttributesEntities: [],
    }), createFile('/src/custom.wxml', '<view />'))

    expect(styleHandler.mock.calls[0]?.[1]).toMatchObject({
      isMainChunk: false,
      majorVersion: 4,
      cssRemoveProperty: false,
    })
    expect(templateHandler.mock.calls[0]?.[1]).toMatchObject({
      runtimeSet: customRuntimeSet,
      customAttributesEntities: [],
    })
  })

  it('keeps js unchanged when precheck skips transformation', async () => {
    const plugins = createPlugins()

    const processed = await runTransform(
      plugins.transformJs(),
      createFile('/src/plain.js', 'const value = 1'),
    )

    expect(processed.contents?.toString()).toBe('const value = 1')
    expect(jsHandler).not.toHaveBeenCalled()
  })

  it('uses custom module graph options when provided', async () => {
    const plugins = createPlugins()
    const moduleGraph = {
      resolve: vi.fn(),
      load: vi.fn(),
      filter: vi.fn(),
    }

    await runTransform(plugins.transformJs({
      moduleGraph,
      babelParserOptions: {
        plugins: ['typescript'],
      },
    }), createFile('/src/custom.ts', 'import "./dep"; const cls = "w-[1px]"'))

    expect(jsHandler.mock.calls[0]?.[2]).toMatchObject({
      moduleGraph,
      babelParserOptions: {
        plugins: ['typescript'],
        sourceFilename: expect.stringContaining('custom.ts'),
      },
    })
  })

  it('resolves module graph files, extension fallbacks, loads and filters ids', async () => {
    const plugins = createPlugins()

    await runTransform(plugins.transformJs(), createFile('/src/app.js', 'import "./init"; console.log("graph")'))

    const handlerOptions = jsHandler.mock.calls.at(-1)?.[2]
    const moduleGraph = handlerOptions?.moduleGraph
    const importer = handlerOptions?.filename
    expect(moduleGraph).toBeDefined()
    expect(importer).toBeTruthy()

    const directFile = path.resolve(path.dirname(importer!), './direct.js')
    const extBase = path.resolve(path.dirname(importer!), './with-ext')
    const extFile = `${extBase}.tsx`
    const statSpy = vi.spyOn(fs, 'statSync')
    const readSpy = vi.spyOn(fs, 'readFileSync')
    const fileStats = {
      isFile: () => true,
      isDirectory: () => false,
    } as unknown as fs.Stats

    statSpy.mockImplementation((target: fs.PathLike) => {
      if (target === directFile || target === extFile) {
        return fileStats
      }
      const error = new Error(`ENOENT: no such file or directory, stat '${target.toString()}'`) as NodeJS.ErrnoException
      error.code = 'ENOENT'
      throw error
    })
    readSpy.mockImplementation((target: fs.PathOrFileDescriptor) => {
      if (target === directFile) {
        return 'export const value = 1'
      }
      throw new Error('read failed')
    })

    try {
      expect(moduleGraph?.resolve?.('', importer!)).toBeUndefined()
      expect(moduleGraph?.resolve?.('pkg', importer!)).toBeUndefined()
      expect(moduleGraph?.resolve?.('./direct.js', importer!)).toBe(directFile)
      expect(moduleGraph?.resolve?.('./with-ext', importer!)).toBe(extFile)
      expect(moduleGraph?.resolve?.('./missing.css', importer!)).toBeUndefined()
      expect(moduleGraph?.load?.(directFile)).toBe('export const value = 1')
      expect(moduleGraph?.load?.('/missing.js')).toBeUndefined()
      expect(moduleGraph?.filter?.(path.join(process.cwd(), 'src/app.js'))).toBe(true)
      expect(moduleGraph?.filter?.(path.join(process.cwd(), 'src/app.wxs'))).toBe(true)
      expect(moduleGraph?.filter?.(path.join(process.cwd(), 'src/app.css'))).toBe(false)
    }
    finally {
      statSpy.mockRestore()
      readSpy.mockRestore()
    }
  })
})
