import type { AppType } from '@/types'
import path from 'node:path'
import { installTailwindcssCssRedirect } from '@/shared/tailwindcss-css-redirect'
import { resolveMpxWebpackPluginDir } from './plugin-owner'
import { addMpxWebpackPluginAlias, ensureResolveLoaderAlias, isMpxWebpackPluginRequest, patchMpxWebpackPluginNormalizeLib, patchMpxWebpackPluginRequests, resolveMpxWebpackPluginRequest, rewriteMpxWebpackPluginRequests } from './resolver'

const MPX_STYLE_RESOURCE_QUERY_RE = /(?:^|[?&])type=styles(?:&|$)/

function isMpxStyleResourceQuery(query?: string) {
  if (typeof query !== 'string') {
    return false
  }
  return MPX_STYLE_RESOURCE_QUERY_RE.test(query)
}

export function isMpx(appType?: AppType) {
  return appType === 'mpx'
}

export function getTailwindcssCssEntry(pkgDir: string) {
  return path.join(pkgDir, 'index.css')
}

export function ensureMpxTailwindcssAliases(compiler: any, pkgDir: string) {
  const tailwindcssCssEntry = getTailwindcssCssEntry(pkgDir)
  compiler.options = compiler.options || {}
  compiler.options.resolve = compiler.options.resolve || {}
  const mpxWebpackPluginDir = resolveMpxWebpackPluginDir(compiler)
  patchMpxWebpackPluginNormalizeLib(compiler, mpxWebpackPluginDir)
  patchMpxWebpackPluginRequests(compiler, mpxWebpackPluginDir)
  if (mpxWebpackPluginDir) {
    ensureResolveLoaderAlias(compiler, mpxWebpackPluginDir)
  }
  const alias = compiler.options.resolve.alias ?? {}
  compiler.options.resolve.alias = alias
  if (Array.isArray(alias)) {
    alias.push(
      { name: 'tailwindcss', alias: tailwindcssCssEntry },
      { name: 'tailwindcss$', alias: tailwindcssCssEntry },
    )
  }
  else {
    alias.tailwindcss = tailwindcssCssEntry
    alias.tailwindcss$ = tailwindcssCssEntry
  }
  if (mpxWebpackPluginDir) {
    addMpxWebpackPluginAlias(alias, mpxWebpackPluginDir)
  }
  return tailwindcssCssEntry
}

export function patchMpxLoaderResolve(
  loaderContext: any,
  pkgDir: string,
  enabled: boolean,
) {
  if (!enabled) {
    return
  }
  const tailwindcssCssEntry = getTailwindcssCssEntry(pkgDir)
  const getMpxWebpackPluginDir = () => resolveMpxWebpackPluginDir(loaderContext)
  const originalResolve = loaderContext.resolve
  if (typeof originalResolve === 'function' && !(originalResolve as any).__weappTwPatched) {
    const wrappedResolve = function (this: any, context: any, request: string, callback: any) {
      if (request === 'tailwindcss' || request === 'tailwindcss$') {
        return callback(null, tailwindcssCssEntry)
      }
      if (request?.startsWith('tailwindcss/')) {
        return callback(null, path.join(pkgDir, request.slice('tailwindcss/'.length)))
      }
      const mpxWebpackPluginDir = getMpxWebpackPluginDir()
      if (mpxWebpackPluginDir && isMpxWebpackPluginRequest(request)) {
        return callback(null, resolveMpxWebpackPluginRequest(request, mpxWebpackPluginDir))
      }
      return originalResolve.call(this, context, request, callback)
    }
    ;(wrappedResolve as any).__weappTwPatched = true
    loaderContext.resolve = wrappedResolve as any
  }

  const originalImportModule = loaderContext.importModule
  if (typeof originalImportModule === 'function' && !(originalImportModule as any).__weappTwPatched) {
    const wrappedImportModule = function (this: any, request: string, ...args: any[]) {
      const mpxWebpackPluginDir = getMpxWebpackPluginDir()
      const resolvedRequest = mpxWebpackPluginDir && typeof request === 'string'
        ? rewriteMpxWebpackPluginRequests(request, mpxWebpackPluginDir)
        : request
      return originalImportModule.call(this, resolvedRequest, ...args)
    }
    ;(wrappedImportModule as any).__weappTwPatched = true
    loaderContext.importModule = wrappedImportModule as any
  }
}

export function setupMpxTailwindcssRedirect(
  pkgDir: string,
  enabled: boolean,
) {
  if (enabled) {
    installTailwindcssCssRedirect(pkgDir)
  }
}

const CSS_EXT_RE = /\.css$/i

export function injectMpxCssRewritePreRules(
  compiler: any,
  loader: string | undefined,
  loaderOptions: any,
) {
  if (!loader) {
    return
  }
  const moduleOptions = (compiler.options.module ??= { rules: [] } as any)
  moduleOptions.rules = moduleOptions.rules || []
  const createRule = (match: { test?: RegExp, resourceQuery?: RegExp | ((query: string) => boolean) }) => ({
    ...match,
    enforce: 'pre' as const,
    use: [
      {
        loader,
        options: loaderOptions,
      },
    ],
  })
  moduleOptions.rules.unshift(
    createRule({ resourceQuery: (query: string) => isMpxStyleResourceQuery(query) }),
    createRule({
      test: CSS_EXT_RE,
      resourceQuery: (query: string) => !isMpxStyleResourceQuery(query),
    }),
  )
}

export { patchMpxWebpackPluginNormalizeLib, patchMpxWebpackPluginRequests, rewriteMpxWebpackPluginRequests } from './resolver'
