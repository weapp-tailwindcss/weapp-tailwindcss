import type { SetupWebpackV5ProcessAssetsHookOptions } from '../helpers'
import type { WebpackGeneratorUserCssSource } from './sources'
import path from 'node:path'
import { isCssLikeModuleResource, stripResourceQuery } from '../../shared'

function isWindowsAbsoluteResourcePath(file: string) {
  return /^[a-z]:[\\/]/i.test(file) || /^[/\\]{2}[^/\\]/.test(file)
}

function isPosixAbsoluteResourcePath(file: string) {
  return file.startsWith('/')
}

function resolveWebpackResourcePath(file: string, base?: string | undefined) {
  if (isWindowsAbsoluteResourcePath(file)) {
    return path.win32.resolve(file)
  }
  if (isPosixAbsoluteResourcePath(file)) {
    return path.posix.resolve(file)
  }
  if (base) {
    if (isWindowsAbsoluteResourcePath(base)) {
      return path.win32.resolve(base, file)
    }
    if (isPosixAbsoluteResourcePath(base)) {
      return path.posix.resolve(base, file)
    }
    return path.resolve(base, file)
  }
  return undefined
}

function dirnameWebpackResourcePath(file: string) {
  if (isWindowsAbsoluteResourcePath(file)) {
    return path.win32.dirname(file)
  }
  if (isPosixAbsoluteResourcePath(file)) {
    return path.posix.dirname(file)
  }
  return path.dirname(file)
}

export function resolveWebpackCssAssetModuleResource(
  resource: string,
  issuer: { context?: string, resource?: string } | undefined,
  options: {
    appType?: SetupWebpackV5ProcessAssetsHookOptions['appType'] | undefined
    cssMatcher: (file: string) => boolean
  },
) {
  if (!isCssLikeModuleResource(resource, options.cssMatcher)) {
    return undefined
  }
  const normalized = stripResourceQuery(resource)
  if (!normalized) {
    return undefined
  }
  const absoluteResource = resolveWebpackResourcePath(normalized)
  if (absoluteResource) {
    return absoluteResource
  }
  const issuerResource = issuer?.resource ? stripResourceQuery(issuer.resource) : undefined
  const issuerResourcePath = issuerResource ? resolveWebpackResourcePath(issuerResource) : undefined
  const issuerContext = issuerResourcePath
    ? dirnameWebpackResourcePath(issuerResourcePath)
    : issuer?.context
  return resolveWebpackResourcePath(normalized, issuerContext)
}

export function isSameWebpackCssSourceScope(options: {
  candidateSourceFile: string
  currentSourceFile?: string | undefined
  outputFile: string
  resourcesByAsset: ReadonlyMap<string, ReadonlySet<string>>
}) {
  if (!options.currentSourceFile) {
    return false
  }
  const candidateKey = resolveWebpackResourcePath(options.candidateSourceFile) ?? path.resolve(options.candidateSourceFile)
  const currentKey = resolveWebpackResourcePath(options.currentSourceFile) ?? path.resolve(options.currentSourceFile)
  if (candidateKey === currentKey) {
    return true
  }
  const outputResources = options.resourcesByAsset.get(options.outputFile)
  if (!outputResources) {
    return false
  }
  return [...outputResources].some((resource) => {
    return (resolveWebpackResourcePath(resource) ?? path.resolve(resource)) === candidateKey
  })
}

export function shouldAppendCurrentWebpackAssetUserCss(options: {
  currentAssetHasBundlerGeneratedMarker: boolean
  currentAssetHasUserCss: boolean
  currentAssetLooksGenerated: boolean
  registeredUserRawSource: WebpackGeneratorUserCssSource | undefined
  shouldPreserveGeneratedWebAssetUserCss: boolean
  sourceCssProcessed: boolean
}) {
  const hasGeneratedAssetUserCss = options.currentAssetLooksGenerated && options.currentAssetHasUserCss
  return !options.currentAssetHasBundlerGeneratedMarker
    && !options.shouldPreserveGeneratedWebAssetUserCss
    && (
      hasGeneratedAssetUserCss
      || (!options.sourceCssProcessed || options.registeredUserRawSource === undefined || options.currentAssetHasUserCss)
    )
    && !(options.sourceCssProcessed && options.currentAssetLooksGenerated && !options.currentAssetHasUserCss)
}

export function createWebpackCurrentAssetUserRawSource(options: {
  currentAssetHasUserCss: boolean
  currentAssetLooksGenerated: boolean
  currentAssetUserCssSource: string
  shouldAppendCurrentAssetUserCss: boolean
  sourceCssProcessed: boolean
}): WebpackGeneratorUserCssSource | undefined {
  if (!options.shouldAppendCurrentAssetUserCss) {
    return undefined
  }
  if (options.sourceCssProcessed) {
    return {
      css: options.currentAssetUserCssSource,
      processed: true,
    }
  }
  if (!options.currentAssetHasUserCss) {
    return undefined
  }
  return {
    css: options.currentAssetUserCssSource,
    processed: options.currentAssetLooksGenerated,
  }
}
