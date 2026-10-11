import type { Plugin, ResolvedConfig } from 'vite'
import type { Compiler } from 'webpack'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { resolveConfig } from 'vite'
import { createStyleInjector } from '@/core'
import { createTaroSubPackageImportResolver } from '@/taro'
import {
  createUniAppSubPackageImportResolver,
  resolveUniAppStyleScopes,
  splitUniAppStyleScopes,
} from '@/uni-app'
import { resolveDefaultMpxAppPaths, resolveMpxSubPackages } from '@/mpx'
import weappStyleInjector from '@/vite'
import { StyleInjector as TaroStyleInjector } from '@/vite/taro'
import { StyleInjector as UniAppStyleInjector } from '@/vite/uni-app'
import { weappStyleInjectorWebpack } from '@/webpack'
import { StyleInjector as MpxStyleInjectorWebpack } from '@/webpack/mpx'
import { StyleInjector as TaroStyleInjectorWebpack } from '@/webpack/taro'
import { StyleInjector as UniAppStyleInjectorWebpack } from '@/webpack/uni-app'

const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const uniAppFixturesRoot = fileURLToPath(new URL('./fixtures/uni-app', import.meta.url))
const taroFixturesRoot = fileURLToPath(new URL('./fixtures/taro', import.meta.url))
const mpxFixturesRoot = fileURLToPath(new URL('./fixtures/mpx', import.meta.url))
const UNI_APP_SUB_PACKAGES_PLUGIN_NAME = 'weapp-style-injector:uni-app-sub-packages'
const WEAPP_STYLE_INJECTOR_PLUGIN_NAME = 'weapp-style-injector'

type AssetSource = string | Uint8Array

interface TestOutputAsset {
  type: 'asset'
  fileName: string
  name: string
  source?: AssetSource
}

type TestBundle = Record<string, TestOutputAsset>

function createAsset(source: AssetSource, fileName: string): TestOutputAsset {
  return {
    type: 'asset',
    fileName,
    name: fileName,
    source,
  }
}

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'weapp-style-injector-'))
}

function withCwd<T>(cwd: string, callback: () => T): T {
  const previous = process.cwd()
  process.chdir(cwd)
  try {
    const result = callback()
    if (result && typeof result === 'object' && 'finally' in result && typeof result.finally === 'function') {
      return result.finally(() => process.chdir(previous)) as T
    }
    process.chdir(previous)
    return result
  }
  catch (error) {
    process.chdir(previous)
    throw error
  }
}

let cachedResolvedConfig: ResolvedConfig | null = null

async function getResolvedViteConfig(): Promise<ResolvedConfig> {
  if (cachedResolvedConfig) {
    return cachedResolvedConfig
  }

  cachedResolvedConfig = await resolveConfig({
    root: packageRoot,
    logLevel: 'silent',
  }, 'build')

  return cachedResolvedConfig
}

async function invokeGenerateBundle(pluginOrPlugins: Plugin | Plugin[] | undefined, bundle: TestBundle) {
  if (!pluginOrPlugins) {
    return
  }

  const plugins = (Array.isArray(pluginOrPlugins) ? pluginOrPlugins : [pluginOrPlugins]).filter(Boolean)

  let resolvedConfig: ResolvedConfig | null = null

  for (const plugin of plugins) {
    if (plugin && typeof plugin.configResolved === 'function') {
      resolvedConfig ??= await getResolvedViteConfig()
      await (plugin.configResolved as unknown as (this: unknown, config: ResolvedConfig) => unknown).call(plugin, resolvedConfig)
    }
  }

  for (const plugin of plugins) {
    if (!plugin || typeof plugin.buildStart !== 'function') {
      continue
    }
    await (plugin.buildStart as unknown as (this: unknown) => unknown).call({
      addWatchFile() {},
    })
  }

  for (const plugin of plugins) {
    if (!plugin) {
      continue
    }

    const hook = plugin.generateBundle as unknown
    if (!hook) {
      continue
    }

    type GenerateBundleHandler = (this: unknown, options: unknown, bundle: TestBundle, isWrite: boolean) => unknown

    let handler: GenerateBundleHandler | undefined

    if (typeof hook === 'function') {
      handler = hook as GenerateBundleHandler
    }
    else if (hook && typeof hook === 'object' && 'handler' in hook && typeof (hook as { handler?: unknown }).handler === 'function') {
      handler = (hook as { handler: GenerateBundleHandler }).handler
    }

    if (!handler) {
      continue
    }

    await handler.call({
      emitFile(emittedFile: { type: 'asset', fileName?: string, name?: string, source?: AssetSource }) {
        if (emittedFile.type !== 'asset') {
          return ''
        }
        const fileName = emittedFile.fileName ?? emittedFile.name
        if (!fileName) {
          return ''
        }
        bundle[fileName] = createAsset(emittedFile.source ?? '', fileName)
        return fileName
      },
    } as unknown, {} as unknown, bundle, false)
  }
}

describe('package exports', () => {
  it('only exposes application-facing entry points', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
    ) as { exports: Record<string, unknown> }

    expect(Object.keys(packageJson.exports).sort()).toEqual([
      '.',
      './types',
      './vite',
      './vite/taro',
      './vite/uni-app',
      './webpack',
      './webpack/mpx',
      './webpack/taro',
      './webpack/uni-app',
    ])
  })
})

async function invokeGenerateBundleOnly(plugin: Plugin, bundle: TestBundle) {
  const hook = plugin.generateBundle as unknown
  if (!hook) {
    return
  }

  type GenerateBundleHandler = (this: unknown, options: unknown, bundle: TestBundle, isWrite: boolean) => unknown

  let handler: GenerateBundleHandler | undefined
  if (typeof hook === 'function') {
    handler = hook as GenerateBundleHandler
  }
  else if (hook && typeof hook === 'object' && 'handler' in hook && typeof (hook as { handler?: unknown }).handler === 'function') {
    handler = (hook as { handler: GenerateBundleHandler }).handler
  }

  if (!handler) {
    return
  }

  await handler.call({
    emitFile(emittedFile: { type: 'asset', fileName?: string, name?: string, source?: AssetSource }) {
      if (emittedFile.type !== 'asset') {
        return ''
      }
      const fileName = emittedFile.fileName ?? emittedFile.name
      if (!fileName) {
        return ''
      }
      bundle[fileName] = createAsset(emittedFile.source ?? '', fileName)
      return fileName
    },
  } as unknown, {} as unknown, bundle, false)
}

function findNamedPlugin(pluginOrPlugins: Plugin | Plugin[], name: string): Plugin {
  const plugin = (Array.isArray(pluginOrPlugins) ? pluginOrPlugins : [pluginOrPlugins])
    .find(entry => entry.name === name)
  expect(plugin).toBeDefined()
  return plugin as Plugin
}

describe('core style injector', () => {
  it('returns unchanged content when no imports are configured', () => {
    const injector = createStyleInjector()

    expect(injector.hasImports).toBe(false)
    expect(injector.shouldProcess('app.wxss')).toBe(true)
    expect(injector.inject('app.wxss', undefined as unknown as string)).toEqual({
      changed: false,
      content: '',
    })
  })

  it('normalizes Uint8Array sources and omits the separator for empty files', () => {
    const injector = createStyleInjector({
      imports: ['shared/[common].wxss'],
    })

    expect(injector.inject('app.wxss', new Uint8Array())).toEqual({
      changed: true,
      content: '@import "shared/[common].wxss";',
    })

    expect(injector.inject('app.wxss', Buffer.from('.page {}'))).toEqual({
      changed: true,
      content: '@import "shared/[common].wxss";\n.page {}',
    })
  })

  it('dedupes path imports with escaped regexp characters and caches per-file imports', () => {
    const resolver = vi.fn((fileName: string) => (
      fileName === 'pages/home.wxss'
        ? ['shared/[common].wxss', 'shared/[common].wxss', '']
        : null
    ))
    const injector = createStyleInjector({
      imports: ['shared/[common].wxss'],
      perFileImports: resolver,
    })

    const source = '@import url("shared/[common].wxss");\n.page {}'

    expect(injector.inject('pages/home.wxss', source)).toEqual({
      changed: false,
      content: source,
    })
    expect(injector.inject('pages/home.wxss', source)).toEqual({
      changed: false,
      content: source,
    })
    expect(resolver).toHaveBeenCalledTimes(1)
  })

  it('can process all files when include is empty', () => {
    const injector = createStyleInjector({
      include: [],
      imports: ['shared/common.wxss'],
    })

    expect(injector.shouldProcess('app.js')).toBe(true)
  })

  it('does not dedupe raw import statements that cannot be reduced to a path', () => {
    const injector = createStyleInjector({
      imports: ['@import "theme.css" screen'],
    })

    expect(injector.inject('app.wxss', '@import "theme.css";')).toEqual({
      changed: true,
      content: '@import "theme.css" screen;\n@import "theme.css";',
    })
  })

  it('keeps existing raw import statements that already include a semicolon', () => {
    const injector = createStyleInjector({
      imports: ['@import "theme.css";'],
    })

    expect(injector.inject('app.wxss', '@import "theme.css";\n.page {}')).toEqual({
      changed: false,
      content: '@import "theme.css";\n.page {}',
    })
  })
})

describe('uni-app style scope resolution', () => {
  it('ignores invalid pages.json inputs and malformed scope entries', () => {
    const tempDir = createTempDir()
    const malformedPagesJson = path.join(tempDir, 'pages.json')
    fs.writeFileSync(malformedPagesJson, '{ invalid json')

    const resolver = createUniAppSubPackageImportResolver([
      { pagesJsonPath: path.join(tempDir, 'missing.json') },
      { pagesJsonPath: malformedPagesJson },
    ])

    expect(resolver).toBeUndefined()
    expect(splitUniAppStyleScopes([
      null as unknown as any,
      { type: 'manual', style: '', scope: '' },
      { type: 'sub-packages', pagesJsonPath: malformedPagesJson, preprocess: false },
      { type: 'manual', style: 'manual.css', scope: 'pkg', output: './manual.css', preprocess: false },
      { type: 'sub-packages', pagesJsonPath: malformedPagesJson, indexFileName: 'index.css' },
    ])).toEqual({
      subPackages: [
        { pagesJsonPath: malformedPagesJson, preprocess: false },
        { pagesJsonPath: malformedPagesJson, indexFileName: 'index.css' },
      ],
      manual: [
        { style: '', scope: '' },
        { style: 'manual.css', scope: 'pkg', output: './manual.css', preprocess: false },
      ],
    })
  })

  it('resolves comments, escaped strings, custom outputs and duplicate scopes', () => {
    const tempDir = createTempDir()
    const scopedRoot = path.join(tempDir, 'pkg')
    fs.mkdirSync(scopedRoot, { recursive: true })
    fs.writeFileSync(path.join(scopedRoot, 'index.less'), '.pkg {}')
    fs.writeFileSync(path.join(tempDir, 'manual.scss'), '.manual {}')
    const pagesJsonPath = path.join(tempDir, 'pages.json')
    fs.writeFileSync(pagesJsonPath, `{
      "note": "keep // inside string",
      /* keep block comments out */
      "subPackages": [
        { "root": "./pkg" },
        { "root": "./" },
        { "root": "" },
        { "pages": [] }
      ]
    }`)

    const resolved = withCwd(tempDir, () => resolveUniAppStyleScopes(
      [
        { pagesJsonPath, indexFileName: [' ', 'index.less'], preprocess: false },
        { pagesJsonPath, indexFileName: 'index.less' },
      ],
      [
        {
          style: 'manual.scss',
          scope: ['pkg', '', 1 as unknown as string],
          output: './shared/manual.scss',
          preprocess: false,
        },
        { style: 'manual.scss', scope: ['', 1 as unknown as string] },
        { style: 'missing.scss', scope: 'missing' },
      ],
    ))

    expect(resolved).toHaveLength(2)
    expect(resolved[0]).toMatchObject({
      root: 'pkg',
      sourceRelativePath: 'pkg/index.less',
      sourceAbsolutePath: path.join(scopedRoot, 'index.less'),
      outputName: 'index',
      preprocess: false,
      framework: 'uni-app',
    })
    expect(resolved[1]).toMatchObject({
      root: 'pkg',
      sourceRelativePath: 'manual.scss',
      sourceAbsolutePath: fs.realpathSync(path.join(tempDir, 'manual.scss')),
      outputName: 'manual',
      preprocess: false,
      framework: 'uni-app',
    })

    const resolver = createUniAppSubPackageImportResolver(undefined, {
      style: path.join(tempDir, 'manual.scss'),
      scope: 'pkg',
      output: './shared/manual.scss',
      preprocess: false,
    })

    expect(resolver?.('pkg/pages/home.wxss')).toEqual(['../manual.wxss'])
    expect(resolver?.('pkg/manual.wxss')).toEqual([])
    expect(resolver?.('other/home.wxss')).toEqual([])
  })

  it('returns no relative import for files outside a valid sub-package page path', () => {
    const tempDir = createTempDir()
    fs.mkdirSync(path.join(tempDir, 'pkg'), { recursive: true })
    fs.writeFileSync(path.join(tempDir, 'pkg/index.css'), '.pkg {}')
    const pagesJsonPath = path.join(tempDir, 'pages.json')
    fs.writeFileSync(pagesJsonPath, JSON.stringify({
      subPackages: [{ root: 'pkg' }],
    }))

    const resolver = createUniAppSubPackageImportResolver({
      pagesJsonPath,
      indexFileName: 'index.css',
    })

    expect(resolver?.('pkg')).toEqual([])
  })
})

describe('taro sub-package config resolution', () => {
  it('handles missing, malformed and empty app configs', () => {
    const tempDir = createTempDir()
    const malformedJson = path.join(tempDir, 'app.config.json')
    const emptyConfig = path.join(tempDir, 'empty.config.js')
    const invalidScript = path.join(tempDir, 'invalid.config.ts')
    fs.writeFileSync(malformedJson, '{ invalid json')
    fs.writeFileSync(emptyConfig, 'export default { pages: [] }')
    fs.writeFileSync(invalidScript, 'export default (')

    expect(createTaroSubPackageImportResolver(null)).toBeUndefined()
    expect(createTaroSubPackageImportResolver({ appConfigPath: path.join(tempDir, 'missing.ts') })).toBeUndefined()
    expect(createTaroSubPackageImportResolver({ appConfigPath: malformedJson })).toBeUndefined()
    expect(createTaroSubPackageImportResolver({ appConfigPath: emptyConfig })).toBeUndefined()
    expect(createTaroSubPackageImportResolver({ appConfigPath: invalidScript })).toBeUndefined()
  })

  it('loads json and commonjs default app configs with custom style candidates', () => {
    const tempDir = createTempDir()
    fs.mkdirSync(path.join(tempDir, 'json-sub'), { recursive: true })
    fs.mkdirSync(path.join(tempDir, 'root-empty'), { recursive: true })
    fs.mkdirSync(path.join(tempDir, 'cjs-sub'), { recursive: true })
    fs.writeFileSync(path.join(tempDir, 'json-sub/custom.css'), '.json {}')
    fs.writeFileSync(path.join(tempDir, 'index.css'), '.empty {}')
    fs.writeFileSync(path.join(tempDir, 'cjs-sub/index.less'), '.cjs {}')

    const jsonConfig = path.join(tempDir, 'app.config.json')
    fs.writeFileSync(jsonConfig, JSON.stringify({
      subPackages: [
        { root: 'json-sub' },
        { root: './' },
        { root: '' },
        { pages: [] },
      ],
    }))

    const cjsConfig = path.join(tempDir, 'app.config.js')
    fs.writeFileSync(cjsConfig, 'module.exports = { default: { subpackages: [{ root: "cjs-sub" }] } }')

    const jsonResolver = createTaroSubPackageImportResolver({
      appConfigPath: jsonConfig,
      indexFileNames: ['', 'custom.css'],
    })
    const cjsResolver = createTaroSubPackageImportResolver({
      appConfigPath: cjsConfig,
    })

    expect(jsonResolver?.('json-sub/pages/home.css')).toEqual(['../custom.css'])
    expect(jsonResolver?.('json-sub/custom.css')).toEqual([])
    expect(jsonResolver?.('other/home.css')).toEqual([])
    expect(cjsResolver?.('cjs-sub/pages/home.css')).toEqual(['../index.css'])
  })
})

describe('mpx sub-package config resolution', () => {
  it('handles missing, malformed and empty app configs', () => {
    const tempDir = createTempDir()
    const malformedJson = path.join(tempDir, 'app.json')
    const emptyMpx = path.join(tempDir, 'app.mpx')
    fs.writeFileSync(malformedJson, '{ invalid json')
    fs.writeFileSync(emptyMpx, '<template></template>')

    expect(resolveMpxSubPackages({ appPath: path.join(tempDir, 'missing.json') })).toEqual([])
    expect(resolveMpxSubPackages({ appPath: malformedJson })).toEqual([])
    expect(resolveMpxSubPackages({ appPath: emptyMpx })).toEqual([])
  })

  it('resolves json and mpx app configs with source roots and app references', () => {
    const tempDir = createTempDir()
    const sourceRoot = path.join(tempDir, 'src')
    fs.mkdirSync(path.join(sourceRoot, 'pkg/pages'), { recursive: true })
    fs.mkdirSync(path.join(sourceRoot, 'legacy/pages'), { recursive: true })
    fs.writeFileSync(path.join(sourceRoot, 'pkg/index.less'), '.pkg {}')
    fs.writeFileSync(path.join(sourceRoot, 'pkg/pages/home.css'), '.home {}')
    fs.writeFileSync(path.join(sourceRoot, 'app.css'), '.app {}')

    const appJson = path.join(tempDir, 'app.json')
    fs.writeFileSync(appJson, JSON.stringify({
      subPackages: [
        { root: './pkg', pages: [{ path: './pages/home' }, '', { path: '' }] },
        { root: '', pages: ['pages/ignored'] },
        { pages: ['pages/ignored'] },
      ],
      subpackages: [
        { root: 'legacy', pages: [] },
      ],
    }))

    const resolved = resolveMpxSubPackages({
      appPath: appJson,
      sourceRoot,
      sourceFileName: ['', 'index.less'],
      outputName: 'bundle.wxss',
      files: 'pkg/pages/home.wxss',
      include: 'pages/**/*.wxss',
      exclude: 'pages/skip.wxss',
      preprocess: false,
    })

    expect(resolved).toHaveLength(1)
    expect(resolved[0]).toMatchObject({
      root: 'pkg',
      sourceRelativePath: 'pkg/index.less',
      sourceAbsolutePath: path.join(sourceRoot, 'pkg/index.less'),
      outputName: 'bundle.wxss',
      files: ['pkg/pages/home.wxss'],
      include: 'pages/**/*.wxss',
      exclude: 'pages/skip.wxss',
      preprocess: false,
      framework: 'mpx',
      targetFiles: ['pkg/pages/home'],
    })
    expect(resolved[0].targetSourceFiles).toEqual([
      {
        fileName: 'pkg/pages/home.css',
        sourceAbsolutePath: path.join(sourceRoot, 'pkg/pages/home.css'),
      },
    ])

    const appMpx = path.join(tempDir, 'app.mpx')
    fs.writeFileSync(appMpx, `<script type="application/json">${JSON.stringify({
      subPackages: [{ root: 'pkg', pages: ['pages/home'] }],
    })}</script>`)

    expect(resolveMpxSubPackages({
      appPath: appMpx,
      sourceRoot,
      rules: [{ from: { ref: 'app.css' }, to: { sourceInclude: 'pages/**/*.css' } }],
    })[0]).toMatchObject({
      root: 'pkg',
      sourceRelativePath: 'app.css',
      sourceAbsolutePath: path.join(sourceRoot, 'app.css'),
      referenceFileName: 'app.css',
      outputName: 'app',
      preprocess: false,
      sourceInclude: 'pages/**/*.css',
    })
  })

  it('returns default app paths from cwd', () => {
    const tempDir = createTempDir()

    withCwd(tempDir, () => {
      const cwd = fs.realpathSync(tempDir)
      expect(resolveDefaultMpxAppPaths()).toEqual([
        path.join(cwd, 'src/app.mpx'),
        path.join(cwd, 'app.mpx'),
        path.join(cwd, 'src/app.json'),
        path.join(cwd, 'app.json'),
      ])
    })
  })
})

describe('weapp-style-injector plugin', () => {
  async function runPlugin(bundle: TestBundle, options = {}) {
    const plugin = weappStyleInjector({
      imports: ['shared/common.wxss'],
      ...options,
    })

    await invokeGenerateBundle(plugin, bundle)
  }

  it('injects @import statements into matching assets', async () => {
    const bundle = {
      'app.wxss': createAsset('.btn { color: red; }', 'app.wxss'),
    }

    await runPlugin(bundle)

    expect(bundle['app.wxss'].source).toBe(`@import "shared/common.wxss";\n.btn { color: red; }`)
  })

  it('skips files that do not match include patterns', async () => {
    const bundle = {
      'app.js': createAsset('console.log("noop")', 'app.js'),
    }

    await runPlugin(bundle)

    expect(bundle['app.js'].source).toBe('console.log("noop")')
  })

  it('supports custom include and exclude patterns', async () => {
    const bundle = {
      'styles/page.wxss': createAsset('.foo {}', 'styles/page.wxss'),
      'styles/ignore.wxss': createAsset('.bar {}', 'styles/ignore.wxss'),
    }

    await runPlugin(bundle, {
      include: ['styles/**/*.wxss'],
      exclude: ['**/ignore.wxss'],
    })

    expect(bundle['styles/page.wxss'].source).toBe(`@import "shared/common.wxss";\n.foo {}`)
    expect(bundle['styles/ignore.wxss'].source).toBe('.bar {}')
  })

  it('dedupes imports by default', async () => {
    const bundle = {
      'app.wxss': createAsset(`@import "shared/common.wxss";\n.page {}`, 'app.wxss'),
    }

    await runPlugin(bundle)

    expect(bundle['app.wxss'].source).toBe(`@import "shared/common.wxss";\n.page {}`)
  })

  it('allows injecting raw @import statements', async () => {
    const bundle = {
      'app.wxss': createAsset('.page {}', 'app.wxss'),
    }

    const plugin = weappStyleInjector({
      imports: ['@import url("https://cdn.example.com/theme.css")'],
    })

    await invokeGenerateBundle(plugin, bundle)

    expect(bundle['app.wxss'].source).toBe(`@import url("https://cdn.example.com/theme.css");\n.page {}`)
  })

  it('can disable dedupe to force duplicate statements', async () => {
    const bundle = {
      'app.wxss': createAsset(`@import "shared/common.wxss";`, 'app.wxss'),
    }

    await runPlugin(bundle, {
      dedupe: false,
    })

    expect(bundle['app.wxss'].source).toBe(`@import "shared/common.wxss";\n@import "shared/common.wxss";`)
  })

  it('skips bundle work when no imports are configured', async () => {
    const bundle = {
      'app.wxss': createAsset('.page {}', 'app.wxss'),
    }

    await invokeGenerateBundle(weappStyleInjector(), bundle)

    expect(bundle['app.wxss'].source).toBe('.page {}')
  })

  it('skips non-asset chunks and unchanged assets', async () => {
    const bundle = {
      'app.wxss': createAsset('@import "shared/common.wxss";\n.page {}', 'app.wxss'),
      'app.js': {
        type: 'chunk',
        fileName: 'app.js',
      },
      'empty.wxss': createAsset(undefined as unknown as string, 'empty.wxss'),
    } as unknown as TestBundle

    await runPlugin(bundle)

    expect(bundle['app.wxss'].source).toBe('@import "shared/common.wxss";\n.page {}')
    expect(bundle['empty.wxss'].source).toBe('@import "shared/common.wxss";')
  })

  it('injects sub-package index imports discovered from uni-app pages.json', async () => {
    const bundle = {
      'sub-packages/pages/home.wxss': createAsset('.home {}', 'sub-packages/pages/home.wxss'),
      'sub-packages/pages/detail/item.wxss': createAsset('.item {}', 'sub-packages/pages/detail/item.wxss'),
      'sub-packages/index.wxss': createAsset('.root {}', 'sub-packages/index.wxss'),
    }

    const plugin = weappStyleInjector({
      uniAppSubPackages: {
        pagesJsonPath: path.join(uniAppFixturesRoot, 'pages.json'),
      },
    })

    await invokeGenerateBundle(plugin, bundle)

    expect(bundle['sub-packages/pages/home.wxss']!.source).toBe(`@import "../index.wxss";\n.home {}`)
    expect(bundle['sub-packages/pages/detail/item.wxss']!.source).toBe(`@import "../../index.wxss";\n.item {}`)
    // the index file should not import itself
    expect(bundle['sub-packages/index.wxss'].source).toBe('.root {}')
  })

  it('supports custom uni-app sub-package index file names', async () => {
    const bundle = {
      'sub-packages/pages/home.wxss': createAsset('.home {}', 'sub-packages/pages/home.wxss'),
      'sub-packages/index.css': createAsset('.root {}', 'sub-packages/index.css'),
    }

    const plugin = weappStyleInjector({
      uniAppSubPackages: {
        pagesJsonPath: path.join(uniAppFixturesRoot, 'pages.json'),
        indexFileName: 'index.css',
      },
    })

    await invokeGenerateBundle(plugin, bundle)

    expect(bundle['sub-packages/pages/home.wxss']!.source).toBe(`@import "../index.wxss";\n.home {}`)
    expect(bundle['sub-packages/index.css']!.source).toBe('.root {}')
  })

  it('generates scoped page style assets when sub-package pages have no style file', async () => {
    const bundle: TestBundle = {
      'sub-packages/pages/home.js': createAsset('console.log("home")', 'sub-packages/pages/home.js'),
      'sub-packages/pages/home.json': createAsset('{}', 'sub-packages/pages/home.json'),
    }

    const plugin = weappStyleInjector({
      subpackageStyleScopes: [
        {
          root: 'sub-packages',
          sourceRelativePath: 'sub-packages/index.css',
          sourceAbsolutePath: path.join(uniAppFixturesRoot, 'sub-packages/index.css'),
          outputName: 'index',
          preprocess: false,
          framework: 'test',
          files: ['sub-packages/pages/home.wxss'],
        },
      ],
      generateSubpackageStyle() {
        return '.root {}'
      },
    })

    await invokeGenerateBundle(plugin, bundle)

    expect(bundle['sub-packages/pages/home.wxss']?.source).toBe('@import "../index.wxss";')
    expect(bundle['sub-packages/index.wxss']?.source).toBe('.root {}')
    expect(bundle['sub-packages/pages/home.js']?.source).toBe('console.log("home")')
  })

  it('generates css page style assets for h5-like bundles and preserves source css', async () => {
    const sourceAbsolutePath = path.join(uniAppFixturesRoot, 'sub-packages/pages/home.css')
    const bundle: TestBundle = {
      'sub-packages/pages/home.js': createAsset('console.log("home")', 'sub-packages/pages/home.js'),
    }

    const plugin = weappStyleInjector({
      subpackageStyleScopes: [
        {
          root: 'sub-packages',
          sourceRelativePath: 'sub-packages/index.css',
          sourceAbsolutePath: path.join(uniAppFixturesRoot, 'sub-packages/index.css'),
          outputName: 'index',
          preprocess: false,
          framework: 'test',
          targetFiles: ['sub-packages/pages/home'],
          targetSourceFiles: [
            {
              fileName: 'sub-packages/pages/home.css',
              sourceAbsolutePath,
            },
          ],
        },
      ],
      loadSubpackageTargetStyle(_fileName, targetSourceAbsolutePath) {
        return fs.readFileSync(targetSourceAbsolutePath, 'utf8')
      },
      generateSubpackageStyle() {
        return '.root {}'
      },
    })

    await invokeGenerateBundle(plugin, bundle)

    expect(bundle['sub-packages/pages/home.wxss']).toBeUndefined()
    expect(bundle['sub-packages/pages/home.css']?.source).toBe(
      `@import "../index.css";\n${fs.readFileSync(sourceAbsolutePath, 'utf8')}`,
    )
    expect(bundle['sub-packages/index.css']?.source).toBe('.root {}')
  })

  it('respects scoped exclude rules when generating page style assets', async () => {
    const bundle: TestBundle = {
      'sub-packages/pages/home.js': createAsset('console.log("home")', 'sub-packages/pages/home.js'),
      'sub-packages/pages/detail.js': createAsset('console.log("detail")', 'sub-packages/pages/detail.js'),
    }

    const plugin = weappStyleInjector({
      subpackageStyleScopes: [
        {
          root: 'sub-packages',
          sourceRelativePath: 'sub-packages/index.css',
          sourceAbsolutePath: path.join(uniAppFixturesRoot, 'sub-packages/index.css'),
          outputName: 'index',
          preprocess: false,
          framework: 'test',
          files: ['sub-packages/pages/home.wxss', 'sub-packages/pages/detail.wxss'],
          exclude: ['pages/detail.wxss'],
        },
      ],
      generateSubpackageStyle() {
        return '.root {}'
      },
    })

    await invokeGenerateBundle(plugin, bundle)

    expect(bundle['sub-packages/pages/home.wxss']?.source).toBe('@import "../index.wxss";')
    expect(bundle['sub-packages/pages/detail.wxss']).toBeUndefined()
  })

  it('supports multiple style entries in the same sub-package scope', async () => {
    const bundle: TestBundle = {
      'sub-packages/pages/home.wxss': createAsset('.home {}', 'sub-packages/pages/home.wxss'),
      'sub-packages/components/card.wxss': createAsset('.card {}', 'sub-packages/components/card.wxss'),
    }

    const plugin = weappStyleInjector({
      subpackageStyleScopes: [
        {
          root: 'sub-packages',
          sourceRelativePath: 'sub-packages/page.css',
          sourceAbsolutePath: path.join(uniAppFixturesRoot, 'sub-packages/page.css'),
          outputName: 'page',
          preprocess: false,
          framework: 'test',
          include: ['pages/**/*.wxss'],
        },
        {
          root: 'sub-packages',
          sourceRelativePath: 'sub-packages/component.css',
          sourceAbsolutePath: path.join(uniAppFixturesRoot, 'sub-packages/component.css'),
          outputName: 'component',
          preprocess: false,
          framework: 'test',
          include: ['components/**/*.wxss'],
        },
      ],
      generateSubpackageStyle(context) {
        return path.basename(context.sourcePath) === 'page.css'
          ? '.fixture-page-entry {}'
          : '.fixture-component-entry {}'
      },
    })

    await invokeGenerateBundle(plugin, bundle)

    expect(bundle['sub-packages/pages/home.wxss']?.source).toBe('@import "../page.wxss";\n.home {}')
    expect(bundle['sub-packages/components/card.wxss']?.source).toBe('@import "../component.wxss";\n.card {}')
    expect(bundle['sub-packages/page.wxss']?.source).toBe('.fixture-page-entry {}')
    expect(bundle['sub-packages/component.wxss']?.source).toBe('.fixture-component-entry {}')
    expect(bundle['sub-packages/page.wxss']?.source).not.toContain('@import')
    expect(bundle['sub-packages/component.wxss']?.source).not.toContain('@import')
  })
})

describe('vite presets', () => {
  it('injects sub-package imports via uni-app preset', async () => {
    const bundle: TestBundle = {
      'sub-packages/pages/home.wxss': createAsset('.home {}', 'sub-packages/pages/home.wxss'),
      'sub-packages/pages/detail/item.wxss': createAsset('.item {}', 'sub-packages/pages/detail/item.wxss'),
    }

    const plugin = UniAppStyleInjector({
      pagesJsonPath: path.join(uniAppFixturesRoot, 'pages.json'),
      indexFileName: 'index.wxss',
    })

    await invokeGenerateBundle(plugin, bundle)

    const generatedIndex = bundle['sub-packages/index.wxss']

    expect(bundle['sub-packages/pages/home.wxss']!.source).toBe(`@import "../index.wxss";\n.home {}`)
    expect(bundle['sub-packages/pages/detail/item.wxss']!.source).toBe(`@import "../../index.wxss";\n.item {}`)
    expect(generatedIndex).toBeDefined()
    expect(generatedIndex?.source).toBe(
      fs.readFileSync(path.join(uniAppFixturesRoot, 'sub-packages/index.wxss'), 'utf8'),
    )
  })

  it('generates h5 css page style assets via uni-app preset', async () => {
    const bundle: TestBundle = {
      'sub-packages/pages/home.js': createAsset('console.log("home")', 'sub-packages/pages/home.js'),
    }

    const plugin = UniAppStyleInjector({
      pagesJsonPath: path.join(uniAppFixturesRoot, 'pages.json'),
      indexFileName: 'index.css',
    })

    await invokeGenerateBundle(plugin, bundle)

    expect(bundle['sub-packages/pages/home.wxss']).toBeUndefined()
    expect(bundle['sub-packages/pages/home.css']?.source).toBe(
      `@import "../index.css";\n${fs.readFileSync(path.join(uniAppFixturesRoot, 'sub-packages/pages/home.css'), 'utf8')}`,
    )
    expect(bundle['sub-packages/index.css']?.source).toBe(
      fs.readFileSync(path.join(uniAppFixturesRoot, 'sub-packages/index.css'), 'utf8'),
    )
  })

  it('resolves multiple style entries via uni-app preset', async () => {
    const bundle: TestBundle = {
      'sub-packages/pages/home.wxss': createAsset('.home {}', 'sub-packages/pages/home.wxss'),
    }

    const plugin = UniAppStyleInjector({
      pagesJsonPath: path.join(uniAppFixturesRoot, 'pages.json'),
      subPackages: {
        pagesJsonPath: path.join(uniAppFixturesRoot, 'pages.json'),
        rules: [
          ['page.css', 'pages/**/*.wxss'],
          ['component.css', 'components/**/*.wxss'],
          ['weapp.css', { sourceInclude: ['pages/**/*.weapp.vue'] }],
          ['ali.css', { sourceInclude: ['pages/**/*.ali.vue'] }],
        ],
        preprocess: false,
      },
    })

    await invokeGenerateBundle(plugin, bundle)

    expect(bundle['sub-packages/pages/home.wxss']?.source).toBe('@import "../page.wxss";\n.home {}')
    expect(bundle['sub-packages/components/card.wxss']?.source).toBe(
      `@import "../component.wxss";\n${fs.readFileSync(path.join(uniAppFixturesRoot, 'sub-packages/components/card.css'), 'utf8')}`,
    )
    expect(bundle['sub-packages/page.wxss']?.source).toBe(
      fs.readFileSync(path.join(uniAppFixturesRoot, 'sub-packages/page.css'), 'utf8'),
    )
    expect(bundle['sub-packages/component.wxss']?.source).toBe(
      fs.readFileSync(path.join(uniAppFixturesRoot, 'sub-packages/component.css'), 'utf8'),
    )
    expect(bundle['sub-packages/pages/home.weapp.wxss']?.source).toBe('@import "../weapp.wxss";')
    expect(bundle['sub-packages/pages/home.ali.wxss']?.source).toBe('@import "../ali.wxss";')
    expect(bundle['sub-packages/weapp.wxss']?.source).toBe(
      fs.readFileSync(path.join(uniAppFixturesRoot, 'sub-packages/weapp.css'), 'utf8'),
    )
    expect(bundle['sub-packages/ali.wxss']?.source).toBe(
      fs.readFileSync(path.join(uniAppFixturesRoot, 'sub-packages/ali.css'), 'utf8'),
    )
  })

  it('resolves explicit source-to-target imports via uni-app sub-package config', async () => {
    const bundle: TestBundle = {
      'sub-packages/pages/home.wxss': createAsset('.home {}', 'sub-packages/pages/home.wxss'),
      'sub-packages/components/card.wxss': createAsset('.card {}', 'sub-packages/components/card.wxss'),
    }

    const plugin = UniAppStyleInjector({
      subPackages: {
        pagesJsonPath: path.join(uniAppFixturesRoot, 'pages.json'),
        rules: [
          ['page.css', 'pages/**/*.wxss'],
          [{ file: 'component.css', as: 'component-entry' }, 'components/**/*.wxss'],
        ],
        preprocess: false,
      },
    })

    await invokeGenerateBundle(plugin, bundle)

    expect(bundle['sub-packages/pages/home.wxss']?.source).toBe('@import "../page.wxss";\n.home {}')
    expect(bundle['sub-packages/components/card.wxss']?.source).toBe('@import "../component-entry.wxss";\n.card {}')
    expect(bundle['sub-packages/page.wxss']?.source).toBe(
      fs.readFileSync(path.join(uniAppFixturesRoot, 'sub-packages/page.css'), 'utf8'),
    )
    expect(bundle['sub-packages/component-entry.wxss']?.source).toBe(
      fs.readFileSync(path.join(uniAppFixturesRoot, 'sub-packages/component.css'), 'utf8'),
    )
  })

  it('uses app style references by default via uni-app preset', async () => {
    const bundle: TestBundle = {
      'sub-packages/pages/home.wxss': createAsset('.home {}', 'sub-packages/pages/home.wxss'),
    }

    const plugin = UniAppStyleInjector({
      pagesJsonPath: path.join(uniAppFixturesRoot, 'pages.json'),
    })

    await invokeGenerateBundle(plugin, bundle)

    expect(bundle['sub-packages/pages/home.wxss']?.source).toBe('@import "../../app.wxss";\n.home {}')
    expect(bundle['sub-packages/app.wxss']).toBeUndefined()
  })

  it('supports app style references with entry-level include via uni-app preset', async () => {
    const bundle: TestBundle = {
      'sub-packages/pages/home.wxss': createAsset('.home {}', 'sub-packages/pages/home.wxss'),
      'sub-packages/components/card.wxss': createAsset('.card {}', 'sub-packages/components/card.wxss'),
    }

    const plugin = UniAppStyleInjector({
      pagesJsonPath: path.join(uniAppFixturesRoot, 'pages.json'),
      rules: [{ from: { ref: 'app.css' }, to: 'pages/**/*.wxss' }],
    })

    await invokeGenerateBundle(plugin, bundle)

    expect(bundle['sub-packages/pages/home.wxss']?.source).toBe('@import "../../app.wxss";\n.home {}')
    expect(bundle['sub-packages/components/card.wxss']?.source).toBe('.card {}')
  })

  it('supports app style references with entry-level include via taro preset', async () => {
    const bundle: TestBundle = {
      'taro-sub/pages/home.css': createAsset('.home {}', 'taro-sub/pages/home.css'),
      'taro-sub/components/card.css': createAsset('.card {}', 'taro-sub/components/card.css'),
    }

    const plugin = TaroStyleInjector({
      appConfigPath: path.join(taroFixturesRoot, 'app.config.ts'),
      rules: [{ from: { ref: 'app.css' }, to: 'pages/**/*.css' }],
    })

    await invokeGenerateBundle(plugin, bundle)

    expect(bundle['taro-sub/pages/home.css']?.source).toBe('@import "../../app.css";\n.home {}')
    expect(bundle['taro-sub/components/card.css']?.source).toBe('.card {}')
  })

  it('keeps top-level include working for default app style references', async () => {
    const bundle: TestBundle = {
      'taro-sub/pages/home.css': createAsset('.home {}', 'taro-sub/pages/home.css'),
      'taro-sub/components/card.css': createAsset('.card {}', 'taro-sub/components/card.css'),
    }

    const plugin = TaroStyleInjector({
      appConfigPath: path.join(taroFixturesRoot, 'app.config.ts'),
      include: ['pages/**/*.css'],
    })

    await invokeGenerateBundle(plugin, bundle)

    expect(bundle['taro-sub/pages/home.css']?.source).toBe('@import "../../app.css";\n.home {}')
    expect(bundle['taro-sub/components/card.css']?.source).toBe('.card {}')
  })

  it('supports custom index file names via uni-app preset', async () => {
    const bundle: TestBundle = {
      'sub-packages/pages/home.wxss': createAsset('.home {}', 'sub-packages/pages/home.wxss'),
    }

    const plugin = UniAppStyleInjector({
      pagesJsonPath: path.join(uniAppFixturesRoot, 'pages.json'),
      indexFileName: 'index.css',
    })

    await invokeGenerateBundle(plugin, bundle)

    const generatedIndex = bundle['sub-packages/index.wxss']

    expect(bundle['sub-packages/pages/home.wxss']!.source).toBe(`@import "../index.wxss";\n.home {}`)
    expect(generatedIndex).toBeDefined()
    expect(generatedIndex?.source).toBe(
      fs.readFileSync(path.join(uniAppFixturesRoot, 'sub-packages/index.css'), 'utf8'),
    )
  })

  it('injects manual style scopes via uni-app preset', async () => {
    const bundle: TestBundle = {
      'custom/pages/home.wxss': createAsset('.home {}', 'custom/pages/home.wxss'),
      'custom/pages/detail.wxss': createAsset('.detail {}', 'custom/pages/detail.wxss'),
    }

    const plugin = UniAppStyleInjector({
      styleScopes: {
        type: 'manual',
        style: path.join(uniAppFixturesRoot, 'custom/global.scss'),
        scope: 'custom',
      },
    })

    await invokeGenerateBundle(plugin, bundle)

    const generatedIndex = bundle['custom/global.wxss']

    expect(bundle['custom/pages/home.wxss']!.source).toBe(`@import "../global.wxss";\n.home {}`)
    expect(bundle['custom/pages/detail.wxss']!.source).toBe(`@import "../global.wxss";\n.detail {}`)
    expect(generatedIndex).toBeDefined()
    expect(generatedIndex?.source).toBe('.global {\n  color: #10b981;\n}')
  })

  it('compiles sass sub-package indexes via uni-app preset', async () => {
    const bundle: TestBundle = {
      'sub-packages-scss/pages/home.wxss': createAsset('.home {}', 'sub-packages-scss/pages/home.wxss'),
    }

    const plugin = UniAppStyleInjector({
      pagesJsonPath: path.join(uniAppFixturesRoot, 'pages-scss.json'),
      indexFileName: 'index.scss',
    })

    await invokeGenerateBundle(plugin, bundle)

    const generatedIndex = bundle['sub-packages-scss/index.wxss']

    expect(bundle['sub-packages-scss/pages/home.wxss']!.source).toBe(`@import "../index.wxss";\n.home {}`)
    expect(generatedIndex).toBeDefined()
    expect(generatedIndex?.source).toContain('@layer theme, base, components, utilities')
    expect(generatedIndex?.source).toContain('color: #1c64f2')
  })

  it('compiles less sub-package indexes with tailwind imports via uni-app preset', async () => {
    const bundle: TestBundle = {
      'sub-packages-less/pages/home.wxss': createAsset('.home {}', 'sub-packages-less/pages/home.wxss'),
    }

    const plugin = UniAppStyleInjector({
      pagesJsonPath: path.join(uniAppFixturesRoot, 'pages-less.json'),
      indexFileName: 'index.less',
    })

    await invokeGenerateBundle(plugin, bundle)

    const generatedIndex = bundle['sub-packages-less/index.wxss']

    expect(bundle['sub-packages-less/pages/home.wxss']!.source).toBe(`@import "../index.wxss";\n.home {}`)
    expect(generatedIndex).toBeDefined()
    expect(generatedIndex?.source).toContain('@layer theme, base, components, utilities')
    expect(generatedIndex?.source).toContain('color: #7c3aed')
  })

  it('supports generated sub-package style entries with custom output names', async () => {
    const bundle: TestBundle = {
      'sub-packages/pages/home.wxss': createAsset('.home {}', 'sub-packages/pages/home.wxss'),
    }

    const plugin = UniAppStyleInjector({
      pagesJsonPath: path.join(uniAppFixturesRoot, 'pages.json'),
      subPackages: {
        pagesJsonPath: path.join(uniAppFixturesRoot, 'pages.json'),
        outputName: 'tailwind',
        generate(context) {
          return `.generated { content: "${context.outputFileName}"; }`
        },
      },
    })

    await invokeGenerateBundle(plugin, bundle)

    expect(bundle['sub-packages/pages/home.wxss']!.source).toBe(`@import "../tailwind.wxss";\n.home {}`)
    expect(bundle['sub-packages/tailwind.wxss']?.source).toBe('.generated { content: "sub-packages/tailwind.wxss"; }')
  })

  it('updates an existing emitted uni-app index asset from direct subPackages config', async () => {
    const bundle = {
      'sub-packages/pages/home.wxss': createAsset('.home {}', 'sub-packages/pages/home.wxss'),
      'sub-packages/index.wxss': createAsset('.stale {}', 'sub-packages/index.wxss'),
    }

    const plugin = UniAppStyleInjector({
      subPackages: {
        pagesJsonPath: path.join(uniAppFixturesRoot, 'pages.json'),
      },
    })

    await invokeGenerateBundle(plugin, bundle)

    expect(bundle['sub-packages/pages/home.wxss'].source).toBe(`@import "../index.wxss";\n.home {}`)
    expect(bundle['sub-packages/index.wxss'].source).toBe(
      fs.readFileSync(path.join(uniAppFixturesRoot, 'sub-packages/index.wxss'), 'utf8'),
    )
  })

  it('skips uni-app index emission when the resolved source disappears before bundle generation', async () => {
    const tempDir = createTempDir()
    fs.mkdirSync(path.join(tempDir, 'gone'), { recursive: true })
    const stylePath = path.join(tempDir, 'gone/index.css')
    fs.writeFileSync(stylePath, '.gone {}')
    fs.writeFileSync(path.join(tempDir, 'pages.json'), JSON.stringify({
      subPackages: [{ root: 'gone' }],
    }))

    const plugin = UniAppStyleInjector({
      pagesJsonPath: path.join(tempDir, 'pages.json'),
      indexFileName: 'index.css',
    })
    fs.rmSync(stylePath)

    const bundle = {
      'gone/pages/home.wxss': createAsset('.home {}', 'gone/pages/home.wxss'),
    }

    await invokeGenerateBundle(plugin, bundle)

    expect(bundle['gone/index.wxss']).toBeUndefined()
  })

  it('skips uni-app index emission when reading the resolved source fails', async () => {
    const tempDir = createTempDir()
    fs.writeFileSync(path.join(tempDir, 'manual.css'), '.manual {}')
    const plugins = UniAppStyleInjector({
      styleScopes: {
        style: path.join(tempDir, 'manual.css'),
        scope: 'manual',
        preprocess: false,
      },
    }) as Plugin[]
    const injector = findNamedPlugin(plugins, WEAPP_STYLE_INJECTOR_PLUGIN_NAME)
    const readFile = vi.spyOn(fs.promises, 'readFile').mockRejectedValueOnce(new Error('read failed'))

    const bundle = {
      'manual/pages/home.wxss': createAsset('.home {}', 'manual/pages/home.wxss'),
    }
    await invokeGenerateBundleOnly(injector, bundle)

    expect((bundle as TestBundle)['manual/manual.wxss']).toBeUndefined()
    readFile.mockRestore()
  })

  it('emits manual uni-app indexes without preprocessing when disabled', async () => {
    const tempDir = createTempDir()
    fs.writeFileSync(path.join(tempDir, 'manual.css'), '.manual { color: red; }')
    const plugins = UniAppStyleInjector({
      styleScopes: {
        style: path.join(tempDir, 'manual.css'),
        scope: 'manual',
        preprocess: false,
      },
    }) as Plugin[]

    const bundle = {
      'manual/pages/home.wxss': createAsset('.home {}', 'manual/pages/home.wxss'),
    }
    await invokeGenerateBundleOnly(findNamedPlugin(plugins, WEAPP_STYLE_INJECTOR_PLUGIN_NAME), bundle)

    expect((bundle as TestBundle)['manual/manual.wxss'].source).toBe('.manual { color: red; }')
  })

  it('wraps preprocess failures with source context', async () => {
    const tempDir = createTempDir()
    fs.writeFileSync(path.join(tempDir, 'broken.scss'), '@use "')
    const plugins = UniAppStyleInjector({
      styleScopes: {
        style: path.join(tempDir, 'broken.scss'),
        scope: 'broken',
      },
    }) as Plugin[]
    const emitter = findNamedPlugin(plugins, UNI_APP_SUB_PACKAGES_PLUGIN_NAME)
    const injector = findNamedPlugin(plugins, WEAPP_STYLE_INJECTOR_PLUGIN_NAME)
    const resolvedConfig = await getResolvedViteConfig()
    const configResolved = emitter.configResolved as (this: unknown, config: ResolvedConfig) => void
    configResolved.call(emitter, resolvedConfig)

    const bundle = {
      'broken/pages/home.wxss': createAsset('.home {}', 'broken/pages/home.wxss'),
    }

    await expect(invokeGenerateBundleOnly(injector, bundle)).rejects.toThrow(
      '[weapp-style-injector] Failed to preprocess',
    )
  })

  it('uses Vite pluginContainer transforms when emitting uni-app indexes', async () => {
    const tempDir = createTempDir()
    fs.writeFileSync(path.join(tempDir, 'manual.css'), '.manual { color: red; }')
    const plugins = UniAppStyleInjector({
      styleScopes: {
        style: path.join(tempDir, 'manual.css'),
        scope: 'manual',
      },
    }) as Plugin[]
    const emitter = findNamedPlugin(plugins, UNI_APP_SUB_PACKAGES_PLUGIN_NAME)
    const injector = findNamedPlugin(plugins, WEAPP_STYLE_INJECTOR_PLUGIN_NAME)
    const resolvedConfig = await getResolvedViteConfig()
    const pluginContainer = {
      resolveId: vi.fn(async () => ({ id: path.join(tempDir, 'resolved.css') })),
      transform: vi.fn(async () => ({ code: '.transformed { color: blue; }' })),
    }
    const configResolved = emitter.configResolved as (this: unknown, config: ResolvedConfig) => void
    configResolved.call(emitter, {
      ...resolvedConfig,
      pluginContainer,
      plugins: [],
    } as unknown as ResolvedConfig)

    const bundle = {
      'manual/pages/home.wxss': createAsset('.home {}', 'manual/pages/home.wxss'),
    }
    await invokeGenerateBundleOnly(injector, bundle)

    expect(pluginContainer.resolveId).toHaveBeenCalledWith(path.join(tempDir, 'manual.css'))
    expect(pluginContainer.transform).toHaveBeenCalled()
    expect((bundle as TestBundle)['manual/manual.wxss'].source).toContain('color: blue')
  })

  it('watches scoped sources and refreshes generated styles on each build', async () => {
    const tempDir = createTempDir()
    const source = path.join(tempDir, 'manual.css')
    fs.writeFileSync(source, '.manual { height: 8px; }')
    const plugins = UniAppStyleInjector({ styleScopes: { style: source, scope: 'manual' } }) as Plugin[]
    const emitter = findNamedPlugin(plugins, UNI_APP_SUB_PACKAGES_PLUGIN_NAME)
    const injector = findNamedPlugin(plugins, WEAPP_STYLE_INJECTOR_PLUGIN_NAME)
    const buildStart = emitter.buildStart as (this: unknown) => Promise<void>
    const addWatchFile = vi.fn()
    for (const height of [8, 12, 20, 8]) {
      fs.writeFileSync(source, `.manual { height: ${height}px; }`)
      await buildStart.call({ addWatchFile })
      const bundle: TestBundle = { 'manual/pages/home.wxss': createAsset('.home {}', 'manual/pages/home.wxss') }
      await invokeGenerateBundleOnly(injector, bundle)
      expect(bundle['manual/manual.wxss']!.source).toContain(`height: ${height}px`)
    }
    expect(addWatchFile).toHaveBeenCalledWith(source)
  })

  it('falls back to Tailwind transform handlers when pluginContainer is unavailable', async () => {
    const tempDir = createTempDir()
    fs.writeFileSync(path.join(tempDir, 'manual.css'), '.manual { color: red; }')
    const plugins = UniAppStyleInjector({
      styleScopes: {
        style: path.join(tempDir, 'manual.css'),
        scope: 'manual',
      },
    }) as Plugin[]
    const emitter = findNamedPlugin(plugins, UNI_APP_SUB_PACKAGES_PLUGIN_NAME)
    const injector = findNamedPlugin(plugins, WEAPP_STYLE_INJECTOR_PLUGIN_NAME)
    const resolvedConfig = await getResolvedViteConfig()
    const transform = vi.fn(async () => ({ code: '.tailwind { color: green; }' }))
    const configResolved = emitter.configResolved as (this: unknown, config: ResolvedConfig) => void
    configResolved.call(emitter, {
      ...resolvedConfig,
      plugins: [
        [
          false,
          {
            name: '@tailwindcss/vite:generate:build',
            transform: {
              handler: transform,
            },
          },
        ],
      ],
    } as unknown as ResolvedConfig)

    const bundle = {
      'manual/pages/home.wxss': createAsset('.home {}', 'manual/pages/home.wxss'),
    }
    await invokeGenerateBundleOnly(injector, bundle)

    expect(transform).toHaveBeenCalled()
    expect((bundle as TestBundle)['manual/manual.wxss'].source).toContain('color: green')
  })

  it('supports Tailwind transform handlers declared directly as functions', async () => {
    const tempDir = createTempDir()
    fs.writeFileSync(path.join(tempDir, 'manual.css'), '.manual { color: red; }')
    const plugins = UniAppStyleInjector({
      styleScopes: {
        style: path.join(tempDir, 'manual.css'),
        scope: 'manual',
      },
    }) as Plugin[]
    const emitter = findNamedPlugin(plugins, UNI_APP_SUB_PACKAGES_PLUGIN_NAME)
    const injector = findNamedPlugin(plugins, WEAPP_STYLE_INJECTOR_PLUGIN_NAME)
    const resolvedConfig = await getResolvedViteConfig()
    const transform = vi.fn(async () => ({ code: '.tailwind-fn { color: purple; }' }))
    const configResolved = emitter.configResolved as (this: unknown, config: ResolvedConfig) => void
    configResolved.call(emitter, {
      ...resolvedConfig,
      plugins: [
        {
          name: '@tailwindcss/vite:generate:build',
          transform,
        },
        {
          name: '@tailwindcss/vite:generate:build',
        },
      ],
    } as unknown as ResolvedConfig)

    const bundle = {
      'manual/pages/home.wxss': createAsset('.home {}', 'manual/pages/home.wxss'),
    }
    await invokeGenerateBundleOnly(injector, bundle)

    expect(transform).toHaveBeenCalled()
    expect((bundle as TestBundle)['manual/manual.wxss'].source).toContain('color: purple')
  })

  it('ignores Tailwind transform candidates without callable handlers', async () => {
    const tempDir = createTempDir()
    fs.writeFileSync(path.join(tempDir, 'manual.css'), '.manual { color: red; }')
    const plugins = UniAppStyleInjector({
      styleScopes: {
        style: path.join(tempDir, 'manual.css'),
        scope: 'manual',
      },
    }) as Plugin[]
    const emitter = findNamedPlugin(plugins, UNI_APP_SUB_PACKAGES_PLUGIN_NAME)
    const injector = findNamedPlugin(plugins, WEAPP_STYLE_INJECTOR_PLUGIN_NAME)
    const resolvedConfig = await getResolvedViteConfig()
    const configResolved = emitter.configResolved as (this: unknown, config: ResolvedConfig) => void
    configResolved.call(emitter, {
      ...resolvedConfig,
      plugins: [
        {
          name: '@tailwindcss/vite:generate:build',
          transform: {},
        },
      ],
    } as unknown as ResolvedConfig)

    const bundle = {
      'manual/pages/home.wxss': createAsset('.home {}', 'manual/pages/home.wxss'),
    }
    await invokeGenerateBundleOnly(injector, bundle)

    expect((bundle as TestBundle)['manual/manual.wxss'].source).toContain('color: red')
  })

  it('injects sub-package imports via taro preset', async () => {
    const bundle = {
      'taro-sub/pages/home.css': createAsset('.home {}', 'taro-sub/pages/home.css'),
      'taro-missing/pages/detail.css': createAsset('.detail {}', 'taro-missing/pages/detail.css'),
      'legacy-sub/pages/main.css': createAsset('.legacy {}', 'legacy-sub/pages/main.css'),
      'taro-sub/index.scss': createAsset('.root {}', 'taro-sub/index.scss'),
      'legacy-sub/index.css': createAsset('.legacy-root {}', 'legacy-sub/index.css'),
    }

    const resolver = createTaroSubPackageImportResolver({
      appConfigPath: path.join(taroFixturesRoot, 'app.config.ts'),
    })

    expect(resolver?.('taro-sub/pages/home.css')).toEqual(['../index.css'])

    const plugin = TaroStyleInjector({
      appConfigPath: path.join(taroFixturesRoot, 'app.config.ts'),
      sourceFileName: ['index.scss', 'index.css'],
    })

    await invokeGenerateBundle(plugin, bundle)

    expect(bundle['taro-sub/pages/home.css'].source).toBe(`@import "../index.css";\n.home {}`)
    expect(bundle['legacy-sub/pages/main.css'].source).toBe(`@import "../index.css";\n.legacy {}`)
    expect(bundle['taro-missing/pages/detail.css'].source).toBe('.detail {}')
    expect(bundle['taro-sub/index.scss'].source).toBe('.root {}')
    expect(bundle['legacy-sub/index.css'].source).toBe(
      fs.readFileSync(path.join(taroFixturesRoot, 'legacy-sub/index.css'), 'utf8'),
    )
  })

  it('uses app style references by default via taro preset', async () => {
    const bundle: TestBundle = {
      'taro-sub/pages/home.css': createAsset('.home {}', 'taro-sub/pages/home.css'),
      'legacy-sub/pages/main.css': createAsset('.legacy {}', 'legacy-sub/pages/main.css'),
    }

    const plugin = TaroStyleInjector({
      appConfigPath: path.join(taroFixturesRoot, 'app.config.ts'),
    })

    await invokeGenerateBundle(plugin, bundle)

    expect(bundle['taro-sub/pages/home.css']?.source).toBe('@import "../../app.css";\n.home {}')
    expect(bundle['legacy-sub/pages/main.css']?.source).toBe('@import "../../app.css";\n.legacy {}')
    expect(bundle['taro-sub/app.css']).toBeUndefined()
  })

  it('does not inject app style references during taro source transform', async () => {
    const plugin = TaroStyleInjector({
      appConfigPath: path.join(taroFixturesRoot, 'app.config.ts'),
    })

    const plugins = Array.isArray(plugin) ? plugin : [plugin]
    const sourcePlugin = plugins.find(entry => entry.name === 'weapp-style-injector:taro-source-style')
    const transform = sourcePlugin?.transform
    const handler = typeof transform === 'function'
      ? transform
      : transform && typeof transform === 'object' && 'handler' in transform
        ? transform.handler
        : undefined

    type TestTransformHandler = (this: unknown, code: string, id: string) => unknown
    const result = await (handler as TestTransformHandler | undefined)?.call(
      { addWatchFile() {} },
      '.home {}',
      path.join(taroFixturesRoot, 'taro-sub/pages/home.css'),
    )

    expect(result).toBeUndefined()
  })

  it('injects taro source styles during transform and reuses cached target sources', async () => {
    const tempDir = createTempDir()
    fs.mkdirSync(path.join(tempDir, 'pkg/pages'), { recursive: true })
    fs.writeFileSync(path.join(tempDir, 'app.config.json'), JSON.stringify({
      subPackages: [{ root: 'pkg', pages: ['pages/home'] }],
    }))
    fs.writeFileSync(path.join(tempDir, 'pkg/index.css'), '.root {}')
    const pageStylePath = path.join(tempDir, 'pkg/pages/home.css')
    fs.writeFileSync(pageStylePath, '.home {}')

    const plugin = TaroStyleInjector({
      appConfigPath: path.join(tempDir, 'app.config.json'),
      sourceFileName: 'index.css',
    })
    const plugins = Array.isArray(plugin) ? plugin : [plugin]
    const sourcePlugin = findNamedPlugin(plugins, 'weapp-style-injector:taro-source-style')
    const transform = sourcePlugin.transform as (this: unknown, code: string, id: string) => unknown
    const buildStart = sourcePlugin.buildStart as (this: unknown) => unknown
    const addWatchFile = vi.fn()

    await buildStart.call({ addWatchFile })
    expect(addWatchFile).toHaveBeenCalledWith(pageStylePath)

    expect(transform.call({}, '.noop {}', path.join(tempDir, 'pkg/pages/home.js'))).toBeUndefined()
    expect(transform.call({}, '.outside {}', path.join(tempDir, 'outside.css'))).toBeUndefined()

    const result = await transform.call({}, '.home {}', `${pageStylePath}?type=style`)
    expect(result).toEqual({
      code: '@import "../index.css";\n.home {}',
      map: null,
    })

    const bundle: TestBundle = {
      'pkg/pages/home.css': createAsset('.stale {}', 'pkg/pages/home.css'),
    }
    await invokeGenerateBundle(plugins, bundle)
    expect(bundle['pkg/index.css']?.source).toBe('.root {}')
  })

  it('resolves multiple style entries via taro preset', async () => {
    const bundle: TestBundle = {
      'taro-sub/pages/home.css': createAsset('.home {}', 'taro-sub/pages/home.css'),
    }

    const plugin = TaroStyleInjector({
      appConfigPath: path.join(taroFixturesRoot, 'app.config.ts'),
      rules: [
        ['scss.scss', 'pages/**/*.css'],
        ['less.less', 'pages/**/*.css'],
      ],
    })

    await invokeGenerateBundle(plugin, bundle)

    expect(bundle['taro-sub/pages/home.css']?.source).toBe('@import "../scss.css";\n@import "../less.css";\n.home {}')
    expect(bundle['taro-sub/scss.css']?.source).toBe(
      fs.readFileSync(path.join(taroFixturesRoot, 'taro-sub/scss.scss'), 'utf8'),
    )
    expect(bundle['taro-sub/less.css']?.source).toBe(
      fs.readFileSync(path.join(taroFixturesRoot, 'taro-sub/less.less'), 'utf8'),
    )
  })

  it('resolves explicit source-to-target imports via taro preset option', async () => {
    const bundle: TestBundle = {
      'taro-sub/pages/home.css': createAsset('.home {}', 'taro-sub/pages/home.css'),
      'taro-sub/components/card.css': createAsset('.card {}', 'taro-sub/components/card.css'),
    }

    const plugin = TaroStyleInjector({
      appConfigPath: path.join(taroFixturesRoot, 'app.config.ts'),
      rules: [
        ['scss.scss', 'pages/**/*.css'],
        [{ file: 'less.less', as: 'component-entry' }, 'components/**/*.css'],
      ],
    })

    await invokeGenerateBundle(plugin, bundle)

    expect(bundle['taro-sub/pages/home.css']?.source).toBe('@import "../scss.css";\n.home {}')
    expect(bundle['taro-sub/components/card.css']?.source).toBe('@import "../component-entry.css";\n.card {}')
    expect(bundle['taro-sub/scss.css']?.source).toBe(
      fs.readFileSync(path.join(taroFixturesRoot, 'taro-sub/scss.scss'), 'utf8'),
    )
    expect(bundle['taro-sub/component-entry.css']?.source).toBe(
      fs.readFileSync(path.join(taroFixturesRoot, 'taro-sub/less.less'), 'utf8'),
    )
  })

  it('supports a single tuple rule with array targets via taro preset option', async () => {
    const bundle: TestBundle = {
      'taro-sub/pages/home.css': createAsset('.home {}', 'taro-sub/pages/home.css'),
      'taro-sub/components/card.css': createAsset('.card {}', 'taro-sub/components/card.css'),
    }

    const plugin = TaroStyleInjector({
      appConfigPath: path.join(taroFixturesRoot, 'app.config.ts'),
      rules: ['scss.scss', ['pages/**/*.css', 'components/**/*.css']],
    })

    await invokeGenerateBundle(plugin, bundle)

    expect(bundle['taro-sub/pages/home.css']?.source).toBe('@import "../scss.css";\n.home {}')
    expect(bundle['taro-sub/components/card.css']?.source).toBe('@import "../scss.css";\n.card {}')
    expect(bundle['taro-sub/scss.css']?.source).toBe(
      fs.readFileSync(path.join(taroFixturesRoot, 'taro-sub/scss.scss'), 'utf8'),
    )
  })

  it('does not generate sub-package style entries from non-style assets', async () => {
    const bundle: TestBundle = {
      'sub-packages/pages/home.wxss': createAsset('.home {}', 'sub-packages/pages/home.wxss'),
      'sub-packages/pages/home.js': createAsset('console.log("home")', 'sub-packages/pages/home.js'),
    }

    const plugin = weappStyleInjector({
      subpackageStyleScopes: [
        {
          root: 'sub-packages',
          sourceRelativePath: 'sub-packages/index.css',
          sourceAbsolutePath: path.join(uniAppFixturesRoot, 'sub-packages/index.css'),
          outputName: 'index',
          preprocess: false,
          framework: 'test',
        },
      ],
      generateSubpackageStyle() {
        return '.root {}'
      },
    })

    await invokeGenerateBundle(plugin, bundle)

    expect(bundle['sub-packages/index.wxss']?.source).toBe('.root {}')
    expect(bundle['sub-packages/index.js']).toBeUndefined()
    expect(bundle['sub-packages/pages/home.js']?.source).toBe('console.log("home")')
  })

  it('injects taro imports from direct subPackages config', async () => {
    const bundle = {
      'taro-sub/pages/home.css': createAsset('.home {}', 'taro-sub/pages/home.css'),
    }

    const plugin = TaroStyleInjector({
      subPackages: {
        appConfigPath: path.join(taroFixturesRoot, 'app.config.ts'),
      },
    })

    await invokeGenerateBundle(plugin, bundle)

    expect(bundle['taro-sub/pages/home.css'].source).toBe(`@import "../index.css";\n.home {}`)
  })

  it('returns a taro plugin without per-file imports when no config is resolved', async () => {
    const bundle = {
      'app.wxss': createAsset('.page {}', 'app.wxss'),
    }

    const plugin = TaroStyleInjector({
      appConfigPath: path.join(taroFixturesRoot, 'missing.config.ts'),
    })

    await invokeGenerateBundle(plugin, bundle)

    expect(bundle['app.wxss'].source).toBe('.page {}')
  })

  it('discovers default taro app config paths from cwd and merges custom imports', async () => {
    const tempDir = createTempDir()
    fs.mkdirSync(path.join(tempDir, 'src/default-sub'), { recursive: true })
    fs.writeFileSync(path.join(tempDir, 'src/app.config.json'), JSON.stringify({
      subPackages: [{ root: 'default-sub' }],
    }))
    fs.writeFileSync(path.join(tempDir, 'src/default-sub/index.css'), '.root {}')

    const bundle = {
      'default-sub/pages/home.css': createAsset('.home {}', 'default-sub/pages/home.css'),
    }

    await withCwd(tempDir, async () => {
      const plugin = TaroStyleInjector({
        perFileImports: fileName => fileName.endsWith('.css') ? 'custom/global.css' : null,
      })
      await invokeGenerateBundle(plugin, bundle)
    })

    expect(bundle['default-sub/pages/home.css'].source).toBe(
      '@import "../../app.css";\n@import "custom/global.css";\n.home {}',
    )
  })

  it('discovers default uni-app pages.json paths from cwd', async () => {
    const tempDir = createTempDir()
    fs.mkdirSync(path.join(tempDir, 'src/default-sub'), { recursive: true })
    fs.writeFileSync(path.join(tempDir, 'src/pages.json'), JSON.stringify({
      subPackages: [{ root: 'default-sub' }],
    }))
    fs.writeFileSync(path.join(tempDir, 'src/default-sub/index.css'), '.root {}')

    const bundle = {
      'default-sub/pages/home.wxss': createAsset('.home {}', 'default-sub/pages/home.wxss'),
    }

    await withCwd(tempDir, async () => {
      const plugin = UniAppStyleInjector({
        indexFileName: 'index.css',
      })
      await invokeGenerateBundle(plugin, bundle)
    })

    expect(bundle['default-sub/pages/home.wxss'].source).toBe(`@import "../index.wxss";\n.home {}`)
    expect(bundle['default-sub/index.wxss'].source).toBe('.root {}')
  })

  it('returns a single uni-app plugin when no sub-package or manual scope is resolved', () => {
    const plugin = UniAppStyleInjector({
      pagesJsonPath: path.join(uniAppFixturesRoot, 'missing.json'),
      imports: ['shared/common.wxss'],
    })

    expect(Array.isArray(plugin)).toBe(false)
  })
})

describe('weapp-style-injector webpack plugin', () => {
  class RawSource {
    constructor(private readonly value: string) {}

    source() {
      return this.value
    }

    size() {
      return this.value.length
    }
  }

  function createCompiler(stubAssets: Record<string, string>) {
    const assets: Record<string, RawSource> = Object.fromEntries(
      Object.entries(stubAssets).map(([name, value]) => [name, new RawSource(value)]),
    )

    const compilation: any = {
      hooks: {
        processAssets: {
          tap(_options: unknown, handler: () => void) {
            handler()
          },
        },
      },
      getAssets() {
        return Object.entries(assets).map(([name, source]) => ({ name, source }))
      },
      getAsset(name: string) {
        const source = assets[name]
        return source ? { name, source } : undefined
      },
      emitAsset(name: string, source: RawSource) {
        assets[name] = source
      },
      updateAsset(name: string, factory: ((source: RawSource) => RawSource) | RawSource) {
        const current = assets[name]
        if (!current) {
          throw new Error(`Called Compilation.updateAsset for not existing filename ${name}`)
        }
        assets[name] = typeof factory === 'function' ? factory(current) : factory
      },
    }

    const compiler: any = {
      webpack: {
        Compilation: {
          PROCESS_ASSETS_STAGE_SUMMARIZE: 1000,
          PROCESS_ASSETS_STAGE_ADDITIONS: 2000,
        },
        sources: {
          RawSource,
        },
      },
      hooks: {
        thisCompilation: {
          tap(_name: string, callback: (compilation: unknown) => void) {
            callback(compilation)
          },
        },
      },
    }

    return {
      compiler: compiler as unknown as Compiler,
      getAsset(name: string) {
        return assets[name]?.source()
      },
    }
  }

  function createLegacyCompiler(stubAssets: Record<string, string>) {
    const assets: Record<string, string | RawSource> = { ...stubAssets }

    const compilation: any = {
      hooks: {
        optimizeAssets: {
          tap(_name: string, handler: (assets: Record<string, unknown>) => void) {
            handler(assets)
          },
        },
      },
    }

    const thisCompilationTap = vi.fn((_name: string, callback: (compilation: unknown) => void) => {
      callback(compilation)
    })

    const compiler: any = {
      hooks: {
        thisCompilation: {
          tap: thisCompilationTap,
        },
      },
    }

    return {
      compiler: compiler as unknown as Compiler,
      getAsset(name: string) {
        const asset = assets[name]
        return typeof asset === 'string' ? asset : asset?.source()
      },
      thisCompilationTap,
    }
  }

  it('does not register compilation hooks when no imports can be resolved', () => {
    const { compiler, thisCompilationTap } = createLegacyCompiler({
      'app.wxss': '.page {}',
    })

    weappStyleInjectorWebpack().apply(compiler)

    expect(thisCompilationTap).not.toHaveBeenCalled()
  })

  it('injects @import statements into matching assets', () => {
    const { compiler, getAsset } = createCompiler({
      'app.wxss': '.btn { color: red; }',
    })

    const plugin = weappStyleInjectorWebpack({
      imports: ['shared/common.wxss'],
    })

    plugin.apply(compiler)

    expect(getAsset('app.wxss')).toBe(`@import "shared/common.wxss";\n.btn { color: red; }`)
  })

  it('respects include and exclude patterns', () => {
    const { compiler, getAsset } = createCompiler({
      'styles/page.wxss': '.foo {}',
      'styles/ignore.wxss': '.bar {}',
    })

    const plugin = weappStyleInjectorWebpack({
      imports: ['shared/common.wxss'],
      include: ['styles/**/*.wxss'],
      exclude: ['**/ignore.wxss'],
    })

    plugin.apply(compiler)

    expect(getAsset('styles/page.wxss')).toBe(`@import "shared/common.wxss";\n.foo {}`)
    expect(getAsset('styles/ignore.wxss')).toBe('.bar {}')
  })

  it('can disable dedupe to allow repeated statements', () => {
    const { compiler, getAsset } = createCompiler({
      'app.wxss': `@import "shared/common.wxss";`,
    })

    const plugin = weappStyleInjectorWebpack({
      imports: ['shared/common.wxss'],
      dedupe: false,
    })

    plugin.apply(compiler)

    expect(getAsset('app.wxss')).toBe(`@import "shared/common.wxss";\n@import "shared/common.wxss";`)
  })

  it('uses webpack 4 optimizeAssets fallback and fallback RawSource implementation', () => {
    const { compiler, getAsset } = createLegacyCompiler({
      'app.wxss': '.page {}',
      'app.js': 'console.log("noop")',
    })

    const plugin = weappStyleInjectorWebpack({
      imports: ['shared/common.wxss'],
    })

    plugin.apply(compiler)

    expect(getAsset('app.wxss')).toBe(`@import "shared/common.wxss";\n.page {}`)
    expect(getAsset('app.js')).toBe('console.log("noop")')
  })

  it('falls back to the additions stage when summarize is unavailable', () => {
    const assets: Record<string, RawSource> = {
      'app.wxss': new RawSource('.page {}'),
    }
    let tappedStage: number | undefined
    const compiler: any = {
      webpack: {
        Compilation: {
          PROCESS_ASSETS_STAGE_ADDITIONS: 2000,
        },
        sources: {
          RawSource,
        },
      },
      hooks: {
        thisCompilation: {
          tap(_name: string, callback: (compilation: unknown) => void) {
            callback({
              hooks: {
                processAssets: {
                  tap(options: { stage: number }, handler: () => void) {
                    tappedStage = options.stage
                    handler()
                  },
                },
              },
              getAssets() {
                return Object.entries(assets).map(([name, source]) => ({ name, source }))
              },
              updateAsset(name: string, factory: (source: RawSource) => RawSource) {
                assets[name] = factory(assets[name])
              },
            })
          },
        },
      },
    }

    weappStyleInjectorWebpack({ imports: ['shared/common.wxss'] }).apply(compiler as Compiler)

    expect(tappedStage).toBe(2000)
    expect(assets['app.wxss'].source()).toBe(`@import "shared/common.wxss";\n.page {}`)
  })

  it('injects sub-package index imports discovered from uni-app pages.json', () => {
    const { compiler, getAsset } = createCompiler({
      'sub-packages/pages/home.wxss': '.home {}',
      'sub-packages/pages/detail/item.wxss': '.item {}',
      'sub-packages/index.wxss': '.root {}',
    })

    const plugin = weappStyleInjectorWebpack({
      uniAppSubPackages: {
        pagesJsonPath: path.join(uniAppFixturesRoot, 'pages.json'),
      },
    })

    plugin.apply(compiler)

    expect(getAsset('sub-packages/pages/home.wxss')).toBe(`@import "../index.wxss";\n.home {}`)
    expect(getAsset('sub-packages/pages/detail/item.wxss')).toBe(`@import "../../index.wxss";\n.item {}`)
    expect(getAsset('sub-packages/index.wxss')).toBe('.root {}')
  })

  it('supports custom uni-app sub-package index file names in webpack plugin', () => {
    const { compiler, getAsset } = createCompiler({
      'sub-packages/pages/home.wxss': '.home {}',
      'sub-packages/index.css': '.root {}',
    })

    const plugin = weappStyleInjectorWebpack({
      uniAppSubPackages: {
        pagesJsonPath: path.join(uniAppFixturesRoot, 'pages.json'),
        indexFileName: 'index.css',
      },
    })

    plugin.apply(compiler)

    expect(getAsset('sub-packages/pages/home.wxss')).toBe(`@import "../index.wxss";\n.home {}`)
    expect(getAsset('sub-packages/index.css')).toBe('.root {}')
  })

  it('generates webpack scoped page style assets when sub-package pages have no style file', () => {
    const { compiler, getAsset } = createCompiler({
      'sub-packages/pages/home.js': 'console.log("home")',
      'sub-packages/pages/home.json': '{}',
    })

    const plugin = weappStyleInjectorWebpack({
      subpackageStyleScopes: [
        {
          root: 'sub-packages',
          sourceRelativePath: 'sub-packages/index.css',
          sourceAbsolutePath: path.join(uniAppFixturesRoot, 'sub-packages/index.css'),
          outputName: 'index',
          preprocess: false,
          framework: 'test',
          files: ['sub-packages/pages/home.wxss'],
        },
      ],
      generateSubpackageStyle() {
        return '.root {}'
      },
    })

    plugin.apply(compiler)

    expect(getAsset('sub-packages/pages/home.wxss')).toBe('@import "../index.wxss";')
    expect(getAsset('sub-packages/index.wxss')).toBe('.root {}')
    expect(getAsset('sub-packages/pages/home.js')).toBe('console.log("home")')
  })

  it('injects sub-package imports via uni-app webpack preset', () => {
    const { compiler, getAsset } = createCompiler({
      'sub-packages/pages/home.wxss': '.home {}',
      'sub-packages/pages/detail/item.wxss': '.item {}',
      'sub-packages/index.wxss': '.root {}',
    })

    const plugin = UniAppStyleInjectorWebpack({
      pagesJsonPath: path.join(uniAppFixturesRoot, 'pages.json'),
      indexFileName: 'index.wxss',
    })

    plugin.apply(compiler)

    expect(getAsset('sub-packages/pages/home.wxss')).toBe(`@import "../index.wxss";\n.home {}`)
    expect(getAsset('sub-packages/pages/detail/item.wxss')).toBe(`@import "../../index.wxss";\n.item {}`)
    expect(getAsset('sub-packages/index.wxss')).toBe(
      fs.readFileSync(path.join(uniAppFixturesRoot, 'sub-packages/index.wxss'), 'utf8'),
    )
  })

  it('uses app style references by default via uni-app webpack preset', () => {
    const { compiler, getAsset } = createCompiler({
      'sub-packages/pages/home.wxss': '.home {}',
    })

    const plugin = UniAppStyleInjectorWebpack({
      pagesJsonPath: path.join(uniAppFixturesRoot, 'pages.json'),
    })

    plugin.apply(compiler)

    expect(getAsset('sub-packages/pages/home.wxss')).toBe('@import "../../app.wxss";\n.home {}')
    expect(getAsset('sub-packages/app.wxss')).toBeUndefined()
  })

  it('injects uni-app webpack imports from direct subPackages config', () => {
    const { compiler, getAsset } = createCompiler({
      'sub-packages/pages/home.wxss': '.home {}',
      'sub-packages/index.wxss': '.root {}',
    })

    const plugin = UniAppStyleInjectorWebpack({
      subPackages: {
        pagesJsonPath: path.join(uniAppFixturesRoot, 'pages.json'),
      },
    })

    plugin.apply(compiler)

    expect(getAsset('sub-packages/pages/home.wxss')).toBe(`@import "../index.wxss";\n.home {}`)
  })

  it('discovers default uni-app webpack pages.json paths from cwd', () => {
    const tempDir = createTempDir()
    fs.mkdirSync(path.join(tempDir, 'default-sub'), { recursive: true })
    fs.writeFileSync(path.join(tempDir, 'pages.json'), JSON.stringify({
      subPackages: [{ root: 'default-sub' }],
    }))
    fs.writeFileSync(path.join(tempDir, 'default-sub/index.css'), '.root {}')
    const { compiler, getAsset } = createCompiler({
      'default-sub/pages/home.wxss': '.home {}',
      'default-sub/index.wxss': '.root {}',
    })

    withCwd(tempDir, () => {
      const plugin = UniAppStyleInjectorWebpack({
        indexFileName: 'index.css',
      })
      plugin.apply(compiler)
    })

    expect(getAsset('default-sub/pages/home.wxss')).toBe(`@import "../index.wxss";\n.home {}`)
  })

  it('returns a webpack uni-app plugin without sub-package options when nothing is resolved', () => {
    const { compiler, thisCompilationTap } = createLegacyCompiler({
      'app.wxss': '.page {}',
    })

    UniAppStyleInjectorWebpack({
      pagesJsonPath: path.join(uniAppFixturesRoot, 'missing.json'),
    }).apply(compiler)

    expect(thisCompilationTap).not.toHaveBeenCalled()
  })

  it('injects uni-app webpack manual style scopes', () => {
    const { compiler, getAsset } = createCompiler({
      'manual/pages/home.wxss': '.home {}',
      'manual/manual.wxss': '.manual {}',
    })

    UniAppStyleInjectorWebpack({
      styleScopes: {
        style: path.join(uniAppFixturesRoot, 'custom/global.scss'),
        scope: 'manual',
        output: 'manual/manual.wxss',
        preprocess: false,
      },
    }).apply(compiler)

    expect(getAsset('manual/pages/home.wxss')).toBe(`@import "../manual.wxss";\n.home {}`)
  })

  it('supports custom index file names via uni-app webpack preset', () => {
    const { compiler, getAsset } = createCompiler({
      'sub-packages/pages/home.wxss': '.home {}',
      'sub-packages/index.css': '.root {}',
    })

    const plugin = UniAppStyleInjectorWebpack({
      pagesJsonPath: path.join(uniAppFixturesRoot, 'pages.json'),
      indexFileName: 'index.css',
    })

    plugin.apply(compiler)

    expect(getAsset('sub-packages/pages/home.wxss')).toBe(`@import "../index.wxss";\n.home {}`)
    expect(getAsset('sub-packages/index.css')).toBe('.root {}')
  })

  it('injects sub-package imports via taro webpack preset', () => {
    const { compiler, getAsset } = createCompiler({
      'taro-sub/pages/home.css': '.home {}',
      'taro-missing/pages/detail.css': '.detail {}',
      'legacy-sub/pages/main.css': '.legacy {}',
      'taro-sub/index.scss': '.root {}',
      'legacy-sub/index.css': '.legacy-root {}',
    })

    const plugin = TaroStyleInjectorWebpack({
      appConfigPath: path.join(taroFixturesRoot, 'app.config.ts'),
      sourceFileName: ['index.scss', 'index.css'],
    })

    plugin.apply(compiler)

    expect(getAsset('taro-sub/pages/home.css')).toBe(`@import "../index.css";\n.home {}`)
    expect(getAsset('legacy-sub/pages/main.css')).toBe(`@import "../index.css";\n.legacy {}`)
    expect(getAsset('taro-missing/pages/detail.css')).toBe('.detail {}')
    expect(getAsset('taro-sub/index.scss')).toBe('.root {}')
    expect(getAsset('legacy-sub/index.css')).toBe(
      fs.readFileSync(path.join(taroFixturesRoot, 'legacy-sub/index.css'), 'utf8'),
    )
  })

  it('uses app style references by default via taro webpack preset', () => {
    const { compiler, getAsset } = createCompiler({
      'taro-sub/pages/home.css': '.home {}',
      'legacy-sub/pages/main.css': '.legacy {}',
    })

    const plugin = TaroStyleInjectorWebpack({
      appConfigPath: path.join(taroFixturesRoot, 'app.config.ts'),
    })

    plugin.apply(compiler)

    expect(getAsset('taro-sub/pages/home.css')).toBe('@import "../../app.css";\n.home {}')
    expect(getAsset('legacy-sub/pages/main.css')).toBe('@import "../../app.css";\n.legacy {}')
    expect(getAsset('taro-sub/app.css')).toBeUndefined()
  })

  it('resolves multiple style entries via taro webpack preset', () => {
    const { compiler, getAsset } = createCompiler({
      'taro-sub/pages/home.css': '.home {}',
    })

    const plugin = TaroStyleInjectorWebpack({
      appConfigPath: path.join(taroFixturesRoot, 'app.config.ts'),
      rules: [
        ['scss.scss', 'pages/**/*.css'],
        ['less.less', 'pages/**/*.css'],
      ],
    })

    plugin.apply(compiler)

    expect(getAsset('taro-sub/pages/home.css')).toBe('@import "../scss.css";\n@import "../less.css";\n.home {}')
    expect(getAsset('taro-sub/scss.css')).toBe(
      fs.readFileSync(path.join(taroFixturesRoot, 'taro-sub/scss.scss'), 'utf8'),
    )
    expect(getAsset('taro-sub/less.css')).toBe(
      fs.readFileSync(path.join(taroFixturesRoot, 'taro-sub/less.less'), 'utf8'),
    )
  })

  it('injects sub-package imports via mpx webpack preset', () => {
    const { compiler, getAsset } = createCompiler({
      'sub-normal/pages/index.wxss': '.page {}',
      'sub-independent/pages/index.wxss': '.independent {}',
    })

    const plugin = MpxStyleInjectorWebpack({
      appPath: path.join(mpxFixturesRoot, 'app.mpx'),
      rules: [
        ['index.css'],
        ['scss.scss', 'pages/**/*.wxss'],
        ['less.less', 'pages/**/*.wxss'],
      ],
    })

    plugin.apply(compiler)

    expect(getAsset('sub-normal/pages/index.wxss')).toBe('@import "../index.wxss";\n@import "../scss.wxss";\n@import "../less.wxss";\n.page {}')
    expect(getAsset('sub-normal/index.wxss')).toContain('.fixture-mpx-normal')
    expect(getAsset('sub-normal/scss.wxss')).toContain('.fixture-mpx-scss')
    expect(getAsset('sub-normal/less.wxss')).toContain('.fixture-mpx-less')
    expect(getAsset('sub-independent/pages/index.wxss')).toBe('@import "../index.wxss";\n.independent {}')
    expect(getAsset('sub-independent/index.wxss')).toContain('.fixture-mpx-independent')
  })

  it('supports app style references with entry-level include via mpx webpack preset', () => {
    const { compiler, getAsset } = createCompiler({
      'sub-normal/pages/index.wxss': '.page {}',
      'sub-normal/components/card.wxss': '.card {}',
    })

    const plugin = MpxStyleInjectorWebpack({
      appPath: path.join(mpxFixturesRoot, 'app.mpx'),
      rules: [{ from: { ref: 'app.css' }, to: 'pages/**/*.wxss' }],
    })

    plugin.apply(compiler)

    expect(getAsset('sub-normal/pages/index.wxss')).toBe('@import "../../app.wxss";\n.page {}')
    expect(getAsset('sub-normal/components/card.wxss')).toBe('.card {}')
  })

  it('does not generate webpack sub-package style entries from non-style assets', () => {
    const { compiler, getAsset } = createCompiler({
      'sub-packages/pages/home.wxss': '.home {}',
      'sub-packages/pages/home.js': 'console.log("home")',
    })

    const plugin = weappStyleInjectorWebpack({
      subpackageStyleScopes: [
        {
          root: 'sub-packages',
          sourceRelativePath: 'sub-packages/index.css',
          sourceAbsolutePath: path.join(uniAppFixturesRoot, 'sub-packages/index.css'),
          outputName: 'index',
          preprocess: false,
          framework: 'test',
        },
      ],
      generateSubpackageStyle() {
        return '.root {}'
      },
    })

    plugin.apply(compiler)

    expect(getAsset('sub-packages/index.wxss')).toBe('.root {}')
    expect(getAsset('sub-packages/index.js')).toBeUndefined()
    expect(getAsset('sub-packages/pages/home.js')).toBe('console.log("home")')
  })

  it('injects taro webpack imports from direct subPackages config and default cwd config', () => {
    const direct = createCompiler({
      'taro-sub/pages/home.css': '.home {}',
    })

    TaroStyleInjectorWebpack({
      subPackages: {
        appConfigPath: path.join(taroFixturesRoot, 'app.config.ts'),
      },
    }).apply(direct.compiler)

    expect(direct.getAsset('taro-sub/pages/home.css')).toBe(`@import "../index.css";\n.home {}`)

    const tempDir = createTempDir()
    fs.mkdirSync(path.join(tempDir, 'src/default-sub'), { recursive: true })
    fs.writeFileSync(path.join(tempDir, 'src/app.config.json'), JSON.stringify({
      subPackages: [{ root: 'default-sub' }],
    }))
    fs.writeFileSync(path.join(tempDir, 'src/default-sub/index.css'), '.root {}')
    const defaults = createCompiler({
      'default-sub/pages/home.css': '.home {}',
    })

    withCwd(tempDir, () => {
      TaroStyleInjectorWebpack().apply(defaults.compiler)
    })

    expect(defaults.getAsset('default-sub/pages/home.css')).toBe(`@import "../../app.css";\n.home {}`)
  })

  it('returns a taro webpack plugin without per-file imports when no config is resolved', () => {
    const { compiler, thisCompilationTap } = createLegacyCompiler({
      'app.wxss': '.page {}',
    })

    TaroStyleInjectorWebpack({
      appConfigPath: path.join(taroFixturesRoot, 'missing.config.ts'),
    }).apply(compiler)

    expect(thisCompilationTap).not.toHaveBeenCalled()
  })
})
