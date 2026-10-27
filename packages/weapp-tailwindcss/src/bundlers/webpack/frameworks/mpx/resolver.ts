import { createRequire } from 'node:module'
import path from 'node:path'
import { resolveMpxWebpackPluginCompilationOwnerDir } from './plugin-owner'

const MPX_WEBPACK_PLUGIN_REQUEST_PATH_RE = /(?:^|[\\/])@mpxjs[\\/]webpack-plugin(?:[\\/](.+))?$/

export function rewriteMpxWebpackPluginRequests(
  request: string,
  mpxWebpackPluginDir: string,
  pathImpl: Pick<typeof path, 'join'> = path,
) {
  return request.split('!').map((segment) => {
    const queryIndex = segment.indexOf('?')
    const requestPath = queryIndex === -1 ? segment : segment.slice(0, queryIndex)
    const query = queryIndex === -1 ? '' : segment.slice(queryIndex)
    const match = requestPath.match(MPX_WEBPACK_PLUGIN_REQUEST_PATH_RE)
    if (!match) {
      return segment
    }
    const subpath = match[1]
    const resolved = subpath
      ? pathImpl.join(mpxWebpackPluginDir, ...subpath.split(/[\\/]/))
      : mpxWebpackPluginDir
    return `${resolved}${query}`
  }).join('!')
}

export function patchMpxWebpackPluginRequests(compiler: any, mpxWebpackPluginDir: string | undefined) {
  if (!mpxWebpackPluginDir || !compiler) {
    return false
  }
  const pluginName = 'weapp-tailwindcss-mpx-loader-resolve'
  const patchedCompilers = new WeakSet<object>()
  const patchedLoaderResolvers = new WeakSet<object>()
  const patchedResolverFactories = new WeakSet<object>()
  let activePluginDir = mpxWebpackPluginDir
  const getActivePluginDir = () => activePluginDir
  const install = (targetCompiler: any) => {
    if (!targetCompiler || typeof targetCompiler !== 'object' || patchedCompilers.has(targetCompiler)) {
      return
    }
    patchedCompilers.add(targetCompiler)
    ensureResolveLoaderAlias(targetCompiler, activePluginDir)
    const resolverFactory = targetCompiler.resolverFactory
    if (resolverFactory && typeof resolverFactory === 'object' && !patchedResolverFactories.has(resolverFactory)) {
      patchedResolverFactories.add(resolverFactory)
      installMpxResolveLoaderAlias(targetCompiler, getActivePluginDir)
    }
    targetCompiler.hooks?.normalModuleFactory?.tap?.(pluginName, (normalModuleFactory: any) => {
      const loaderResolver = normalModuleFactory.getResolver?.('loader')
      if (loaderResolver && typeof loaderResolver === 'object' && !patchedLoaderResolvers.has(loaderResolver)) {
        patchedLoaderResolvers.add(loaderResolver)
        patchMpxLoaderResolver(loaderResolver, getActivePluginDir)
      }
      normalModuleFactory.hooks.beforeResolve.tap(pluginName, (resolveData: any) => {
        const pluginDir = getActivePluginDir()
        if (pluginDir && typeof resolveData?.request === 'string') {
          resolveData.request = rewriteMpxWebpackPluginRequests(resolveData.request, pluginDir)
        }
      })
    })
    targetCompiler.hooks?.compilation?.tap?.(pluginName, (compilation: any) => {
      const compilationPluginDir = resolveMpxWebpackPluginCompilationOwnerDir(
        targetCompiler,
        compilation,
        activePluginDir,
      )
      if (compilationPluginDir) {
        activePluginDir = compilationPluginDir
        patchMpxWebpackPluginNormalizeLib(targetCompiler, compilationPluginDir)
        ensureResolveLoaderAlias(targetCompiler, compilationPluginDir)
        const alias = targetCompiler.options?.resolve?.alias
        if (alias) {
          addMpxWebpackPluginAlias(alias, compilationPluginDir)
        }
      }
      compilation.hooks?.childCompiler?.tap?.(pluginName, (childCompiler: any) => {
        install(childCompiler)
      })
    })
  }
  install(compiler)
  return true
}

export function isMpxWebpackPluginRequest(request: string | undefined) {
  return request === '@mpxjs/webpack-plugin' || Boolean(request?.startsWith('@mpxjs/webpack-plugin/'))
}

export function resolveMpxWebpackPluginRequest(request: string, mpxWebpackPluginDir: string) {
  if (request === '@mpxjs/webpack-plugin') {
    return mpxWebpackPluginDir
  }
  return path.join(mpxWebpackPluginDir, request.slice('@mpxjs/webpack-plugin/'.length))
}

export function addMpxWebpackPluginAlias(alias: any, pkgDir: string) {
  const recordLoader = path.join(pkgDir, 'lib/record-loader')
  const styleCompiler = path.join(pkgDir, 'lib/style-compiler/index')
  const stripConditionalLoader = path.join(pkgDir, 'lib/style-compiler/strip-conditional-loader')
  if (Array.isArray(alias)) {
    const entries = [
      { name: '@mpxjs/webpack-plugin/lib/record-loader', alias: recordLoader },
      { name: '@mpxjs/webpack-plugin/lib/style-compiler/index', alias: styleCompiler },
      { name: '@mpxjs/webpack-plugin/lib/style-compiler/strip-conditional-loader', alias: stripConditionalLoader },
      {
        name: /^@mpxjs\/webpack-plugin\//,
        alias: pkgDir,
      },
    ]
    const managedNames = new Set(entries
      .filter(entry => typeof entry.name === 'string')
      .map(entry => entry.name))
    const managedPatterns = new Set(entries
      .flatMap(entry => entry.name instanceof RegExp ? [`${entry.name.source}/${entry.name.flags}`] : []))
    for (let index = alias.length - 1; index >= 0; index--) {
      const name = alias[index]?.name
      if (managedNames.has(name)
        || (name instanceof RegExp && managedPatterns.has(`${name.source}/${name.flags}`))) {
        alias.splice(index, 1)
      }
    }
    alias.unshift(...entries)
  }
  else {
    alias['@mpxjs/webpack-plugin'] = pkgDir
    alias['@mpxjs/webpack-plugin$'] = pkgDir
    alias['@mpxjs/webpack-plugin/lib/record-loader'] = recordLoader
    alias['@mpxjs/webpack-plugin/lib/style-compiler/index'] = styleCompiler
    alias['@mpxjs/webpack-plugin/lib/style-compiler/strip-conditional-loader'] = stripConditionalLoader
  }
}

export function ensureResolveLoaderAlias(compiler: any, mpxWebpackPluginDir: string) {
  compiler.options.resolveLoader = compiler.options.resolveLoader || {}
  const alias = compiler.options.resolveLoader.alias ?? {}
  compiler.options.resolveLoader.alias = alias
  addMpxWebpackPluginAlias(alias, mpxWebpackPluginDir)
}

function installMpxResolveLoaderAlias(compiler: any, getMpxWebpackPluginDir: () => string | undefined) {
  const resolveOptionsHook = compiler?.resolverFactory?.hooks?.resolveOptions?.for?.('loader')
  if (!resolveOptionsHook?.tap) {
    return
  }
  resolveOptionsHook.tap(
    { name: 'weapp-tailwindcss-mpx-loader-resolve', stage: 100 },
    (resolveOptions: any) => {
      const mpxWebpackPluginDir = getMpxWebpackPluginDir()
      if (!mpxWebpackPluginDir) {
        return resolveOptions
      }
      const alias = Array.isArray(resolveOptions.alias)
        ? [...resolveOptions.alias]
        : { ...resolveOptions.alias }
      addMpxWebpackPluginAlias(alias, mpxWebpackPluginDir)
      return {
        ...resolveOptions,
        alias,
      }
    },
  )
}

function patchMpxLoaderResolver(resolver: any, getMpxWebpackPluginDir: () => string | undefined) {
  const originalResolve = resolver?.resolve
  if (typeof originalResolve !== 'function' || (originalResolve as any).__weappTwPatched) {
    return
  }
  const wrappedResolve = function (this: any, ...args: any[]) {
    const requestIndex = typeof args[0] === 'string' ? 1 : 2
    const request = args[requestIndex]
    const mpxWebpackPluginDir = getMpxWebpackPluginDir()
    if (mpxWebpackPluginDir && typeof request === 'string' && isMpxWebpackPluginRequest(request)) {
      args[requestIndex] = resolveMpxWebpackPluginRequest(request, mpxWebpackPluginDir)
    }
    return originalResolve.apply(this, args)
  }
  ;(wrappedResolve as any).__weappTwPatched = true
  ;(wrappedResolve as any).__weappTwOriginal = originalResolve
  resolver.resolve = wrappedResolve
}

export function patchMpxWebpackPluginNormalizeLib(_compiler: any, mpxWebpackPluginDir: string | undefined) {
  if (!mpxWebpackPluginDir) {
    return false
  }
  let normalize: { lib?: (file: string) => string }
  try {
    const pluginRequire = createRequire(path.join(mpxWebpackPluginDir, 'package.json'))
    normalize = pluginRequire(path.join(mpxWebpackPluginDir, 'lib/utils/normalize'))
  }
  catch {
    return false
  }

  if (typeof normalize.lib !== 'function') {
    return false
  }
  if ((normalize.lib as any).__weappTwPatched) {
    return true
  }

  const wrappedLib = (file: string) => path.join(mpxWebpackPluginDir, 'lib', file)
  ;(wrappedLib as any).__weappTwPatched = true
  ;(wrappedLib as any).__weappTwOriginal = normalize.lib
  normalize.lib = wrappedLib
  return true
}
