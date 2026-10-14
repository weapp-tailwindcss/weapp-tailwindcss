import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import webpack from 'webpack'
import {
  ensureMpxTailwindcssAliases,
  getTailwindcssCssEntry,
  injectMpxCssRewritePreRules,
  isMpx,
  patchMpxLoaderResolve,
  patchMpxWebpackPluginNormalizeLib,
  patchMpxWebpackPluginRequests,
  rewriteMpxWebpackPluginRequests,
  setupMpxTailwindcssRedirect,
} from '@/shared/mpx'

vi.mock('@/shared/tailwindcss-css-redirect', () => ({
  installTailwindcssCssRedirect: vi.fn(),
}))

const createdDirs: string[] = []
const packageRoot = fileURLToPath(new URL('../../', import.meta.url))
const packageRequire = createRequire(new URL('../../package.json', import.meta.url))
const demoRequire = createRequire(new URL('../../../../demo/mpx-tailwindcss-v4/package.json', import.meta.url))

afterEach(async () => {
  await Promise.all(createdDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

async function createMpxWebpackPluginFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-mpx-plugin-'))
  createdDirs.push(root)
  const pluginDir = path.join(root, 'node_modules/@mpxjs/webpack-plugin')
  const normalizeDir = path.join(pluginDir, 'lib/utils')
  const dependencyDir = path.join(pluginDir, 'lib/dependencies')
  await mkdir(normalizeDir, { recursive: true })
  await mkdir(dependencyDir, { recursive: true })
  await writeFile(path.join(pluginDir, 'package.json'), JSON.stringify({
    name: '@mpxjs/webpack-plugin',
    version: '0.0.0-test',
    main: 'index.js',
  }))
  await writeFile(path.join(pluginDir, 'index.js'), 'module.exports = {}\n')
  await writeFile(path.join(normalizeDir, 'normalize.js'), [
    'exports.lib = function lib(file) {',
    '  return "original:" + file',
    '}',
    '',
  ].join('\n'))
  await writeFile(path.join(dependencyDir, 'RecordResourceMapDependency.js'), [
    'class RecordResourceMapDependency {}',
    'module.exports = RecordResourceMapDependency',
    '',
  ].join('\n'))
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ private: true }))
  return {
    pluginDir: await realpath(pluginDir),
    root,
  }
}

describe('mpx integration helpers', () => {
  it('detects mpx app type and resolves tailwind css entry', () => {
    expect(isMpx('mpx' as any)).toBe(true)
    expect(isMpx('taro' as any)).toBe(false)
    expect(getTailwindcssCssEntry('/pkg')).toBe(path.join('/pkg', 'index.css'))
  })

  it('resolves the workspace and demo mpx peer to the same plugin instance', async () => {
    const packagePluginPath = await realpath(packageRequire.resolve('@mpxjs/webpack-plugin/package.json'))
    const demoPluginPath = await realpath(demoRequire.resolve('@mpxjs/webpack-plugin/package.json'))
    const packagePlugin = packageRequire(packagePluginPath)
    const demoPlugin = demoRequire(demoPluginPath)

    expect(packagePlugin.version).toBe(demoPlugin.version)
    expect(packagePluginPath).toBe(demoPluginPath)
  })

  it('adds resolve aliases for object and array alias forms', () => {
    const compiler = { options: { resolve: { alias: {} } } }

    expect(ensureMpxTailwindcssAliases(compiler, '/tailwind')).toBe(path.join('/tailwind', 'index.css'))
    expect(compiler.options.resolve.alias).toMatchObject({
      tailwindcss: path.join('/tailwind', 'index.css'),
      tailwindcss$: path.join('/tailwind', 'index.css'),
    })

    const arrayCompiler = { options: { resolve: { alias: [] as any[] } } }
    ensureMpxTailwindcssAliases(arrayCompiler, '/tailwind')
    expect(arrayCompiler.options.resolve.alias).toEqual(expect.arrayContaining([
      { name: 'tailwindcss', alias: path.join('/tailwind', 'index.css') },
      { name: 'tailwindcss$', alias: path.join('/tailwind', 'index.css') },
    ]))

    const emptyCompiler: any = {}
    ensureMpxTailwindcssAliases(emptyCompiler, '/tailwind')
    expect(emptyCompiler.options.resolve.alias.tailwindcss).toBe(path.join('/tailwind', 'index.css'))
  })

  it('adds mpx webpack plugin aliases when the plugin can be resolved from project context', () => {
    const pluginPackageJson = packageRequire.resolve('@mpxjs/webpack-plugin/package.json')
    const pluginDir = path.dirname(pluginPackageJson)
    const compiler = {
      context: packageRoot,
      options: {
        context: packageRoot,
        resolve: { alias: {} },
      },
    }

    ensureMpxTailwindcssAliases(compiler, '/tailwind')

    expect(compiler.options.resolveLoader.alias).toMatchObject({
      '@mpxjs/webpack-plugin': pluginDir,
      '@mpxjs/webpack-plugin$': pluginDir,
      '@mpxjs/webpack-plugin/lib/record-loader': path.join(pluginDir, 'lib/record-loader'),
    })
    expect(compiler.options.resolve.alias).toMatchObject({
      '@mpxjs/webpack-plugin': pluginDir,
      '@mpxjs/webpack-plugin$': pluginDir,
      '@mpxjs/webpack-plugin/lib/style-compiler/index': path.join(pluginDir, 'lib/style-compiler/index'),
    })
  })

  it('prefers the project mpx plugin over a secondary peer instance in configured rules', async () => {
    const projectPlugin = await createMpxWebpackPluginFixture()
    const secondaryPlugin = await createMpxWebpackPluginFixture()
    const compiler = {
      context: projectPlugin.root,
      options: {
        context: projectPlugin.root,
        module: {
          rules: [
            {
              use: [
                { loader: path.join(secondaryPlugin.pluginDir, 'lib/record-loader') },
              ],
            },
          ],
        },
        resolve: { alias: {} },
      },
    }

    ensureMpxTailwindcssAliases(compiler, '/tailwind')

    expect(compiler.options.resolveLoader.alias).toMatchObject({
      '@mpxjs/webpack-plugin': projectPlugin.pluginDir,
      '@mpxjs/webpack-plugin/lib/record-loader': path.join(projectPlugin.pluginDir, 'lib/record-loader'),
    })
    expect(compiler.options.resolve.alias).toMatchObject({
      '@mpxjs/webpack-plugin': projectPlugin.pluginDir,
      '@mpxjs/webpack-plugin/lib/style-compiler/index': path.join(projectPlugin.pluginDir, 'lib/style-compiler/index'),
    })
  })

  it('prefers the plugin instance that owns the compilation dependency template', async () => {
    const compilationPlugin = await createMpxWebpackPluginFixture()
    const secondaryPlugin = await createMpxWebpackPluginFixture()
    const compilationRequire = createRequire(path.join(compilationPlugin.root, 'package.json'))
    const RecordResourceMapDependency = compilationRequire(
      path.join(compilationPlugin.pluginDir, 'lib/dependencies/RecordResourceMapDependency'),
    )
    const originalResolve = vi.fn((_context, request, callback) => callback(null, `origin:${request}`))
    const originalImportModule = vi.fn((request: string) => Promise.resolve(request))
    const loaderContext = {
      context: secondaryPlugin.root,
      _compilation: {
        dependencyTemplates: {
          get: (dependency: unknown) => dependency === RecordResourceMapDependency ? {} : undefined,
        },
      },
      _module: {
        loaders: [
          { loader: path.join(secondaryPlugin.pluginDir, 'lib/style-compiler/index') },
        ],
      },
      resolve: originalResolve,
      importModule: originalImportModule,
    }

    patchMpxLoaderResolve(loaderContext, '/tailwind', true)

    const callback = vi.fn()
    loaderContext.resolve('/ctx', '@mpxjs/webpack-plugin/lib/record-loader', callback)
    loaderContext.importModule('!!@mpxjs/webpack-plugin/lib/style-compiler/index!/tailwind/index.css')

    expect(callback).toHaveBeenCalledWith(
      null,
      path.join(compilationPlugin.pluginDir, 'lib/record-loader'),
    )
    expect(originalImportModule).toHaveBeenCalledWith(
      `!!${path.join(compilationPlugin.pluginDir, 'lib/style-compiler/index')}!/tailwind/index.css`,
    )
  })

  it('patches normalize.lib from the compiler-owned mpx plugin instance once', async () => {
    const { pluginDir, root } = await createMpxWebpackPluginFixture()
    const compiler = {
      context: packageRoot,
      options: { context: packageRoot },
    }
    const projectRequire = createRequire(path.join(root, 'package.json'))
    const normalize = projectRequire('@mpxjs/webpack-plugin/lib/utils/normalize')
    const originalLib = normalize.lib

    expect(originalLib('file.js')).toBe('original:file.js')
    expect(patchMpxWebpackPluginNormalizeLib(compiler, pluginDir)).toBe(true)
    expect(patchMpxWebpackPluginNormalizeLib(compiler, pluginDir)).toBe(true)
    expect(normalize.lib('record-loader')).toBe(path.join(pluginDir, 'lib/record-loader'))
    expect((normalize.lib as any).__weappTwPatched).toBe(true)
    expect((normalize.lib as any).__weappTwOriginal).toBe(originalLib)
  })

  it('rewrites generated mpx inline loader requests to compiler-owned absolute paths', () => {
    const request = '@mpxjs/webpack-plugin/lib/extractor!@mpxjs/webpack-plugin/lib/style-compiler/index!/tailwind/index.css?type=styles'

    expect(rewriteMpxWebpackPluginRequests(request, 'D:\\repo\\node_modules\\@mpxjs\\webpack-plugin', path.win32)).toBe(
      'D:\\repo\\node_modules\\@mpxjs\\webpack-plugin\\lib\\extractor!D:\\repo\\node_modules\\@mpxjs\\webpack-plugin\\lib\\style-compiler\\index!/tailwind/index.css?type=styles',
    )
  })

  it('replaces stale absolute mpx loader paths with the compilation owner on Windows', () => {
    const stalePluginDir = 'D:\\repo\\node_modules\\.pnpm\\@mpxjs+webpack-plugin@2.10.24\\node_modules\\@mpxjs\\webpack-plugin'
    const compilationPluginDir = 'D:\\repo\\node_modules\\.pnpm\\@mpxjs+webpack-plugin@2.11.0\\node_modules\\@mpxjs\\webpack-plugin'
    const request = [
      `${stalePluginDir}\\lib\\record-loader.js`,
      `${stalePluginDir}\\lib\\style-compiler\\index.js?scoped=false`,
      'D:\\repo\\src\\app.css?type=styles',
    ].join('!')

    expect(rewriteMpxWebpackPluginRequests(request, compilationPluginDir, path.win32)).toBe([
      `${compilationPluginDir}\\lib\\record-loader.js`,
      `${compilationPluginDir}\\lib\\style-compiler\\index.js?scoped=false`,
      'D:\\repo\\src\\app.css?type=styles',
    ].join('!'))
  })

  it('replaces stale absolute mpx loader paths with the compilation owner on POSIX', () => {
    const stalePluginDir = '/repo/node_modules/.pnpm/@mpxjs+webpack-plugin@2.10.24/node_modules/@mpxjs/webpack-plugin'
    const compilationPluginDir = '/repo/node_modules/.pnpm/@mpxjs+webpack-plugin@2.11.0/node_modules/@mpxjs/webpack-plugin'
    const request = `${stalePluginDir}/lib/record-loader.js!${stalePluginDir}/lib/style-compiler/index.js!/repo/src/app.css?type=styles`

    expect(rewriteMpxWebpackPluginRequests(request, compilationPluginDir, path.posix)).toBe(
      `${compilationPluginDir}/lib/record-loader.js!${compilationPluginDir}/lib/style-compiler/index.js!/repo/src/app.css?type=styles`,
    )
  })

  it('patches parent and child compiler requests before webpack resolves generated loaders', () => {
    let normalModuleFactoryHandler: ((factory: any) => void) | undefined
    let beforeResolveHandler: ((data: any) => void) | undefined
    let compilationHandler: ((compilation: any) => void) | undefined
    let childCompilerHandler: ((compiler: any) => void) | undefined
    const compiler = {
      options: {},
      hooks: {
        compilation: {
          tap: vi.fn((_name, handler) => {
            compilationHandler = handler
          }),
        },
        normalModuleFactory: {
          tap: vi.fn((_name, handler) => {
            normalModuleFactoryHandler = handler
          }),
        },
      },
    }

    expect(patchMpxWebpackPluginRequests(compiler, '/project/node_modules/@mpxjs/webpack-plugin')).toBe(true)
    normalModuleFactoryHandler?.({
      hooks: {
        beforeResolve: {
          tap: vi.fn((_name, handler) => {
            beforeResolveHandler = handler
          }),
        },
      },
    })
    const resolveData = {
      request: '@mpxjs/webpack-plugin/lib/record-loader!/tailwind/index.css?type=styles',
    }
    beforeResolveHandler?.(resolveData)

    expect(resolveData.request).toBe('/project/node_modules/@mpxjs/webpack-plugin/lib/record-loader!/tailwind/index.css?type=styles')

    compilationHandler?.({
      hooks: {
        childCompiler: {
          tap: vi.fn((_name, handler) => {
            childCompilerHandler = handler
          }),
        },
      },
    })
    let childNormalModuleFactoryHandler: ((factory: any) => void) | undefined
    let childBeforeResolveHandler: ((data: any) => void) | undefined
    const childCompiler = {
      options: {},
      hooks: {
        normalModuleFactory: {
          tap: vi.fn((_name, handler) => {
            childNormalModuleFactoryHandler = handler
          }),
        },
      },
    }
    childCompilerHandler?.(childCompiler)
    childNormalModuleFactoryHandler?.({
      hooks: {
        beforeResolve: {
          tap: vi.fn((_name, handler) => {
            childBeforeResolveHandler = handler
          }),
        },
      },
    })
    const childResolveData = {
      request: '@mpxjs/webpack-plugin/lib/record-loader!D:\\repo\\index.css?type=styles',
    }
    childBeforeResolveHandler?.(childResolveData)

    expect(childResolveData.request).toBe('/project/node_modules/@mpxjs/webpack-plugin/lib/record-loader!D:\\repo\\index.css?type=styles')
    expect(childCompiler.options.resolveLoader.alias).toMatchObject({
      '@mpxjs/webpack-plugin/lib/record-loader': '/project/node_modules/@mpxjs/webpack-plugin/lib/record-loader',
    })
    expect(patchMpxWebpackPluginRequests({}, undefined)).toBe(false)
  })

  it('refreshes compiler request rewriting from the compilation dependency owner', async () => {
    const compilationPlugin = await createMpxWebpackPluginFixture()
    const secondaryPlugin = await createMpxWebpackPluginFixture()
    const compilationRequire = createRequire(path.join(compilationPlugin.root, 'package.json'))
    const RecordResourceMapDependency = compilationRequire(
      path.join(compilationPlugin.pluginDir, 'lib/dependencies/RecordResourceMapDependency'),
    )
    let normalModuleFactoryHandler: ((factory: any) => void) | undefined
    let beforeResolveHandler: ((data: any) => void) | undefined
    let compilationHandler: ((compilation: any) => void) | undefined
    const compiler = {
      options: {
        resolve: { alias: {} },
      },
      hooks: {
        compilation: {
          tap: vi.fn((_name, handler) => {
            compilationHandler = handler
          }),
        },
        normalModuleFactory: {
          tap: vi.fn((_name, handler) => {
            normalModuleFactoryHandler = handler
          }),
        },
      },
    }

    patchMpxWebpackPluginRequests(compiler, secondaryPlugin.pluginDir)
    normalModuleFactoryHandler?.({
      hooks: {
        beforeResolve: {
          tap: vi.fn((_name, handler) => {
            beforeResolveHandler = handler
          }),
        },
      },
    })
    compilationHandler?.({
      dependencyTemplates: {
        get: (dependency: unknown) => dependency === RecordResourceMapDependency ? {} : undefined,
      },
      hooks: {},
    })

    const resolveData = {
      request: '@mpxjs/webpack-plugin/lib/record-loader!/tailwind/index.css?type=styles',
    }
    beforeResolveHandler?.(resolveData)

    expect(resolveData.request).toBe(
      `${path.join(compilationPlugin.pluginDir, 'lib/record-loader')}!/tailwind/index.css?type=styles`,
    )
    expect(compiler.options.resolve.alias).toMatchObject({
      '@mpxjs/webpack-plugin/lib/style-compiler/index': path.join(compilationPlugin.pluginDir, 'lib/style-compiler/index'),
    })
    expect(compiler.options.resolveLoader.alias).toMatchObject({
      '@mpxjs/webpack-plugin/lib/record-loader': path.join(compilationPlugin.pluginDir, 'lib/record-loader'),
    })
  })

  it('refreshes array aliases in place with exact mpx requests before the fallback pattern', async () => {
    const compilationPlugin = await createMpxWebpackPluginFixture()
    const secondaryPlugin = await createMpxWebpackPluginFixture()
    const compilationRequire = createRequire(path.join(compilationPlugin.root, 'package.json'))
    const RecordResourceMapDependency = compilationRequire(
      path.join(compilationPlugin.pluginDir, 'lib/dependencies/RecordResourceMapDependency'),
    )
    let compilationHandler: ((compilation: any) => void) | undefined
    const alias = [
      { name: 'custom-loader', alias: '/custom-loader' },
      {
        name: '@mpxjs/webpack-plugin/lib/record-loader',
        alias: path.join(secondaryPlugin.pluginDir, 'lib/record-loader'),
      },
      { name: /^@mpxjs\/webpack-plugin\//, alias: secondaryPlugin.pluginDir },
    ]
    const compiler = {
      options: {
        resolve: { alias },
        resolveLoader: { alias },
      },
      hooks: {
        compilation: {
          tap: vi.fn((_name, handler) => {
            compilationHandler = handler
          }),
        },
      },
    }

    patchMpxWebpackPluginRequests(compiler, secondaryPlugin.pluginDir)
    compilationHandler?.({
      dependencyTemplates: {
        get: (dependency: unknown) => dependency === RecordResourceMapDependency ? {} : undefined,
      },
      hooks: {},
    })

    expect(compiler.options.resolve.alias).toBe(alias)
    expect(alias.slice(0, 4)).toEqual([
      {
        name: '@mpxjs/webpack-plugin/lib/record-loader',
        alias: path.join(compilationPlugin.pluginDir, 'lib/record-loader'),
      },
      {
        name: '@mpxjs/webpack-plugin/lib/style-compiler/index',
        alias: path.join(compilationPlugin.pluginDir, 'lib/style-compiler/index'),
      },
      {
        name: '@mpxjs/webpack-plugin/lib/style-compiler/strip-conditional-loader',
        alias: path.join(compilationPlugin.pluginDir, 'lib/style-compiler/strip-conditional-loader'),
      },
      { name: /^@mpxjs\/webpack-plugin\//, alias: compilationPlugin.pluginDir },
    ])
    expect(alias).toContainEqual({ name: 'custom-loader', alias: '/custom-loader' })
    expect(alias.some(entry => entry.alias.includes(secondaryPlugin.pluginDir))).toBe(false)
  })

  it('resolves generated mpx loaders from the weapp-tailwindcss package context', async () => {
    const require = createRequire(import.meta.url)
    const pluginDir = path.dirname(require.resolve('@mpxjs/webpack-plugin/package.json'))
    const packageContext = path.resolve(__dirname, '../..')
    const compiler = webpack({
      context: packageContext,
      entry: './index.css',
      mode: 'development',
    })
    const loaderResolver = compiler.resolverFactory.get('loader')
    const resolveRecordLoader = () => new Promise<string>((resolve, reject) => {
      loaderResolver.resolve(
        {},
        packageContext,
        '@mpxjs/webpack-plugin/lib/record-loader',
        {},
        (error, result) => {
          if (error) {
            reject(error)
            return
          }
          resolve(result as string)
        },
      )
    })

    expect(await resolveRecordLoader()).toBe(path.join(pluginDir, 'lib/record-loader.js'))

    patchMpxWebpackPluginRequests(compiler, pluginDir)
    compiler.hooks.normalModuleFactory.call({
      getResolver: () => loaderResolver,
      hooks: {
        beforeResolve: {
          tap: vi.fn(),
        },
      },
    } as any)

    expect(await resolveRecordLoader()).toBe(path.join(pluginDir, 'lib/record-loader.js'))
  })

  it('returns false when mpx normalize module does not expose lib', async () => {
    const noLibRoot = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-mpx-plugin-no-lib-'))
    createdDirs.push(noLibRoot)
    const noLibPluginDir = path.join(noLibRoot, 'node_modules/@mpxjs/webpack-plugin')
    const noLibNormalizeDir = path.join(noLibPluginDir, 'lib/utils')
    await mkdir(noLibNormalizeDir, { recursive: true })
    await writeFile(path.join(noLibPluginDir, 'package.json'), JSON.stringify({
      name: '@mpxjs/webpack-plugin',
      version: '0.0.0-test',
      main: 'index.js',
    }))
    await writeFile(path.join(noLibPluginDir, 'index.js'), 'module.exports = {}\n')
    await writeFile(path.join(noLibNormalizeDir, 'normalize.js'), 'exports.lib = "not-a-function"\n')
    await writeFile(path.join(noLibRoot, 'package.json'), JSON.stringify({ private: true }))

    expect(patchMpxWebpackPluginNormalizeLib({
      context: noLibRoot,
      options: { context: noLibRoot },
    }, noLibPluginDir)).toBe(false)
  })

  it('adds object and array aliases for a project-local mpx webpack plugin fixture', async () => {
    const { pluginDir, root } = await createMpxWebpackPluginFixture()
    const compiler = {
      context: root,
      options: {
        context: root,
        resolve: { alias: {} },
      },
    }

    ensureMpxTailwindcssAliases(compiler, '/tailwind')

    expect(compiler.options.resolveLoader.alias).toMatchObject({
      '@mpxjs/webpack-plugin': pluginDir,
      '@mpxjs/webpack-plugin$': pluginDir,
      '@mpxjs/webpack-plugin/lib/style-compiler/strip-conditional-loader': path.join(pluginDir, 'lib/style-compiler/strip-conditional-loader'),
    })
    expect(compiler.options.resolve.alias).toMatchObject({
      '@mpxjs/webpack-plugin': pluginDir,
      '@mpxjs/webpack-plugin$': pluginDir,
      '@mpxjs/webpack-plugin/lib/record-loader': path.join(pluginDir, 'lib/record-loader'),
    })

    const arrayCompiler = {
      context: root,
      options: {
        context: root,
        resolve: { alias: [] as any[] },
      },
    }
    ensureMpxTailwindcssAliases(arrayCompiler, '/tailwind')
    expect(arrayCompiler.options.resolve.alias).toEqual(expect.arrayContaining([
      { name: '@mpxjs/webpack-plugin/lib/record-loader', alias: path.join(pluginDir, 'lib/record-loader') },
      { name: /^@mpxjs\/webpack-plugin\//, alias: pluginDir },
    ]))
  })

  it('patches loader resolve for tailwindcss requests once', () => {
    const originalResolve = vi.fn((_context, request, callback) => callback(null, `origin:${request}`))
    const loaderContext = {
      context: '/missing',
      options: { context: '/missing' },
      resolve: originalResolve,
    }

    patchMpxLoaderResolve(loaderContext, '/tailwind', true)
    patchMpxLoaderResolve(loaderContext, '/tailwind', true)

    const callback = vi.fn()
    loaderContext.resolve('/ctx', 'tailwindcss', callback)
    loaderContext.resolve('/ctx', 'tailwindcss$', callback)
    loaderContext.resolve('/ctx', 'tailwindcss/colors', callback)
    loaderContext.resolve('/ctx', 'other', callback)

    expect(callback).toHaveBeenNthCalledWith(1, null, path.join('/tailwind', 'index.css'))
    expect(callback).toHaveBeenNthCalledWith(2, null, path.join('/tailwind', 'index.css'))
    expect(callback).toHaveBeenNthCalledWith(3, null, path.join('/tailwind', 'colors'))
    expect(callback).toHaveBeenNthCalledWith(4, null, 'origin:other')
    expect(originalResolve).toHaveBeenCalledTimes(1)
  })

  it('patches loader resolve for mpx webpack plugin requests when resolvable', () => {
    const pluginDir = path.dirname(packageRequire.resolve('@mpxjs/webpack-plugin/package.json'))
    const originalResolve = vi.fn((_context, request, callback) => callback(null, `origin:${request}`))
    const loaderContext = {
      context: packageRoot,
      options: { context: packageRoot },
      resolve: originalResolve,
    }

    patchMpxLoaderResolve(loaderContext, '/tailwind', true)

    const callback = vi.fn()
    loaderContext.resolve('/ctx', '@mpxjs/webpack-plugin', callback)
    loaderContext.resolve('/ctx', '@mpxjs/webpack-plugin/lib/record-loader', callback)
    loaderContext.resolve('/ctx', undefined, callback)

    expect(callback).toHaveBeenNthCalledWith(1, null, pluginDir)
    expect(callback).toHaveBeenNthCalledWith(2, null, path.join(pluginDir, 'lib/record-loader'))
    expect(callback).toHaveBeenNthCalledWith(3, null, 'origin:undefined')
    expect(originalResolve).toHaveBeenCalledTimes(1)
  })

  it('patches loader resolve for a project-local mpx webpack plugin fixture', async () => {
    const { pluginDir, root } = await createMpxWebpackPluginFixture()
    const originalResolve = vi.fn((_context, request, callback) => callback(null, `origin:${request}`))
    const loaderContext = {
      context: root,
      options: { context: root },
      resolve: originalResolve,
    }

    patchMpxLoaderResolve(loaderContext, '/tailwind', true)

    const callback = vi.fn()
    loaderContext.resolve('/ctx', '@mpxjs/webpack-plugin', callback)
    loaderContext.resolve('/ctx', '@mpxjs/webpack-plugin/lib/style-compiler/index', callback)
    loaderContext.resolve('/ctx', '@mpxjs/webpack-plugin-extra', callback)

    expect(callback).toHaveBeenNthCalledWith(1, null, pluginDir)
    expect(callback).toHaveBeenNthCalledWith(2, null, path.join(pluginDir, 'lib/style-compiler/index'))
    expect(callback).toHaveBeenNthCalledWith(3, null, 'origin:@mpxjs/webpack-plugin-extra')
    expect(originalResolve).toHaveBeenCalledTimes(1)
  })

  it('rewrites mpx loaders created dynamically through loader importModule', () => {
    const activePluginDir = path.join('/project', 'node_modules/@mpxjs/webpack-plugin')
    const originalImportModule = vi.fn((request: string, options?: any) => Promise.resolve({ request, options }))
    const loaderContext = {
      context: packageRoot,
      _module: {
        loaders: [
          { loader: path.join(activePluginDir, 'lib/extractor') },
        ],
      },
      importModule: originalImportModule,
    }

    patchMpxLoaderResolve(loaderContext, '/tailwind', true)
    patchMpxLoaderResolve(loaderContext, '/tailwind', true)
    const options = { layer: 'mpx' }
    loaderContext.importModule('!!@mpxjs/webpack-plugin/lib/record-loader!/tailwind/index.css', options)

    expect(originalImportModule).toHaveBeenCalledOnce()
    expect(originalImportModule).toHaveBeenCalledWith(
      `!!${path.join(activePluginDir, 'lib/record-loader')}!/tailwind/index.css`,
      options,
    )
  })

  it('skips loader resolve and normalize patches when inputs are unavailable', () => {
    const loaderContext = { resolve: vi.fn() }

    patchMpxLoaderResolve(loaderContext, '/tailwind', false)
    expect((loaderContext.resolve as any).__weappTwPatched).toBeUndefined()
    patchMpxLoaderResolve({ resolve: undefined }, '/tailwind', true)
    expect(patchMpxWebpackPluginNormalizeLib({}, undefined)).toBe(false)
  })

  it('injects css rewrite pre rules and ignores missing loader', () => {
    const compiler: any = { options: { module: { rules: [] } } }

    injectMpxCssRewritePreRules(compiler, undefined, {})
    expect(compiler.options.module.rules).toEqual([])

    injectMpxCssRewritePreRules(compiler, '/loader', { flag: true })
    expect(compiler.options.module.rules).toHaveLength(2)
    expect(compiler.options.module.rules[0].resourceQuery('type=styles')).toBe(true)
    expect(compiler.options.module.rules[0].resourceQuery(undefined as any)).toBe(false)
    expect(compiler.options.module.rules[0].resourceQuery('foo=1&type=styles&bar=2')).toBe(true)
    expect(compiler.options.module.rules[1].resourceQuery('type=styles')).toBe(false)
    expect(compiler.options.module.rules[1].resourceQuery('lang=css')).toBe(true)
  })

  it('sets up tailwindcss css redirect only when enabled', async () => {
    const { installTailwindcssCssRedirect } = await import('@/shared/tailwindcss-css-redirect')

    setupMpxTailwindcssRedirect('/tailwind', false)
    setupMpxTailwindcssRedirect('/tailwind', true)

    expect(installTailwindcssCssRedirect).toHaveBeenCalledTimes(1)
    expect(installTailwindcssCssRedirect).toHaveBeenCalledWith('/tailwind')
  })
})
