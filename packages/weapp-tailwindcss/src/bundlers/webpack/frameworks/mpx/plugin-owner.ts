import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

const localRequire = createRequire(import.meta.url)
const MPX_WEBPACK_PLUGIN_PACKAGE_RE = /@mpxjs[\\/]webpack-plugin[\\/]package\.json$/
const MPX_WEBPACK_PLUGIN_LIB_RE = /^(.*[\\/]@mpxjs[\\/]webpack-plugin)[\\/]lib[\\/]/
const MPX_RECORD_RESOURCE_MAP_DEPENDENCY_RE = /@mpxjs[\\/]webpack-plugin[\\/]lib[\\/]dependencies[\\/]RecordResourceMapDependency(?:\.js)?$/
const compilationOwnerDirs = new WeakMap<object, string>()

function findMpxWebpackPluginDir(value: any): string | undefined {
  if (typeof value === 'string') {
    return value.match(MPX_WEBPACK_PLUGIN_LIB_RE)?.[1]
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findMpxWebpackPluginDir(item)
      if (result) {
        return result
      }
    }
    return undefined
  }
  if (value && typeof value === 'object') {
    for (const key of ['loader', 'use', 'rules', 'oneOf']) {
      const result = findMpxWebpackPluginDir(value[key])
      if (result) {
        return result
      }
    }
  }
  return undefined
}

function resolveContextPluginDir(context: unknown) {
  if (typeof context !== 'string' || context.length === 0) {
    return undefined
  }
  try {
    const projectRequire = createRequire(path.join(context, 'package.json'))
    return path.dirname(projectRequire.resolve('@mpxjs/webpack-plugin/package.json'))
  }
  catch {
    return undefined
  }
}

function resolveCompilationPluginDir(compilation: any, candidates: Iterable<string>) {
  const getTemplate = compilation?.dependencyTemplates?.get
  if (typeof getTemplate !== 'function') {
    return undefined
  }
  if (compilation && typeof compilation === 'object') {
    const cached = compilationOwnerDirs.get(compilation)
    if (cached) {
      return cached
    }
  }

  const rememberOwner = (pluginDir: string | undefined) => {
    if (pluginDir && compilation && typeof compilation === 'object') {
      compilationOwnerDirs.set(compilation, pluginDir)
    }
    return pluginDir
  }

  for (const [file, module] of Object.entries(localRequire.cache)) {
    if (!MPX_RECORD_RESOURCE_MAP_DEPENDENCY_RE.test(file)) {
      continue
    }
    if (getTemplate.call(compilation.dependencyTemplates, module?.exports)) {
      return rememberOwner(file.match(MPX_WEBPACK_PLUGIN_LIB_RE)?.[1])
    }
  }

  for (const pluginDir of candidates) {
    try {
      const pluginRequire = createRequire(path.join(pluginDir, 'package.json'))
      const dependency = pluginRequire(path.join(pluginDir, 'lib/dependencies/RecordResourceMapDependency'))
      if (getTemplate.call(compilation.dependencyTemplates, dependency)) {
        return rememberOwner(pluginDir)
      }
    }
    catch {
    }
  }
  return undefined
}

function collectMpxWebpackPluginDirs(owner: any, fallback?: string) {
  const activeLoaderPluginDir = findMpxWebpackPluginDir([
    owner?._module?.loaders,
    owner?.loaders,
  ])
  const contextPluginDirs = [
    owner?.rootContext,
    owner?.context,
    owner?.options?.context,
    process.cwd(),
  ].map(resolveContextPluginDir).filter((item): item is string => Boolean(item))
  const configuredRulePluginDir = findMpxWebpackPluginDir(owner?.options?.module?.rules)
  const cachedPluginDirs = Object.keys(localRequire.cache)
    .map(file => file.match(MPX_WEBPACK_PLUGIN_LIB_RE)?.[1]
      ?? (MPX_WEBPACK_PLUGIN_PACKAGE_RE.test(file) ? path.dirname(file) : undefined))
    .filter((item): item is string => Boolean(item))
  const localPluginDir = (() => {
    try {
      return path.dirname(localRequire.resolve('@mpxjs/webpack-plugin/package.json'))
    }
    catch {
      return undefined
    }
  })()
  const candidates = new Set([
    activeLoaderPluginDir,
    ...contextPluginDirs,
    configuredRulePluginDir,
    fallback,
    ...cachedPluginDirs,
    localPluginDir,
  ].filter((item): item is string => Boolean(item)))

  return {
    activeLoaderPluginDir,
    candidates,
    configuredRulePluginDir,
    contextPluginDirs,
    cachedPluginDirs,
    localPluginDir,
  }
}

export function resolveMpxWebpackPluginCompilationOwnerDir(
  owner: any,
  compilation: any,
  fallback?: string,
) {
  return resolveCompilationPluginDir(
    compilation,
    collectMpxWebpackPluginDirs(owner, fallback).candidates,
  )
}

export function resolveMpxWebpackPluginDir(
  owner: any,
  fallback?: string,
  compilation: any = owner?._compilation ?? owner?.compilation,
) {
  const {
    activeLoaderPluginDir,
    candidates,
    configuredRulePluginDir,
    contextPluginDirs,
    cachedPluginDirs,
    localPluginDir,
  } = collectMpxWebpackPluginDirs(owner, fallback)

  return resolveCompilationPluginDir(compilation, candidates)
    ?? activeLoaderPluginDir
    ?? contextPluginDirs[0]
    ?? configuredRulePluginDir
    ?? fallback
    ?? cachedPluginDirs[0]
    ?? localPluginDir
}
