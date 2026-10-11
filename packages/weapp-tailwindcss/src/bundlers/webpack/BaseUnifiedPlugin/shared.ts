import path from 'node:path'
import { isSourceStyleRequest, stripRequestQuery } from '@/generation/style-requests'

export function getCacheKey(filename: string) {
  return filename
}

export function stripResourceQuery(resource?: string): string | undefined {
  if (typeof resource !== 'string') {
    return resource
  }
  return stripRequestQuery(resource)
}

export function isCssLikeModuleResource(
  resource: string | undefined,
  cssMatcher: (file: string) => boolean,
) {
  if (typeof resource !== 'string') {
    return false
  }
  const normalizedResource = stripResourceQuery(resource)
  if (normalizedResource && cssMatcher(normalizedResource)) {
    return true
  }
  if (isSourceStyleRequest(resource)) {
    return true
  }
  return false
}

export function hasLoaderEntry(
  entries: Array<{ loader?: string }>,
  target?: string,
) {
  if (!target) {
    return false
  }
  return entries.some(entry => entry.loader?.includes?.(target))
}

interface ChunkLike {
  id?: string | number | null
  name?: string | undefined
  hash?: string | null
  files?: Iterable<string> | Array<string> | undefined
  hasRuntime?: (() => boolean) | undefined
}

interface ModuleLike {
  context?: string
  dependencies?: Array<unknown> | Iterable<unknown>
  identifier?: () => string
  modules?: ModuleLike[] | Iterable<ModuleLike>
  request?: string
  resource?: string
  rootModule?: ModuleLike
  userRequest?: string
  type?: string
}

interface DependencyLike {
  request?: string
  userRequest?: string
}

interface ChunkGraphLike {
  getChunkModulesIterable?: (chunk: ChunkLike) => Iterable<ModuleLike> | undefined
  getIssuer?: (module: ModuleLike) => ModuleLike | null | undefined
  getModule?: (dependency: unknown) => ModuleLike | null | undefined
}

interface WebpackWatchChangeLike {
  modifiedFiles?: Set<string>
  removedFiles?: Set<string>
}

interface RuntimeWatchDependenciesLike {
  files?: Iterable<string>
  contexts?: Iterable<string>
}

function normalizeWatchPath(file: string) {
  return path.resolve(file)
}

function isFileInContext(file: string, context: string) {
  const relative = path.relative(normalizeWatchPath(context), normalizeWatchPath(file))
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function toChunkFiles(files: ChunkLike['files']) {
  if (!files) {
    return []
  }
  if (Array.isArray(files)) {
    return files
  }
  return [...files]
}

export function inferWebpackMainCssFiles(
  chunks: Iterable<ChunkLike>,
  cssMatcher: (file: string) => boolean,
  options: {
    mainSourceFiles?: ReadonlySet<string> | undefined
    resourcesByAsset?: ReadonlyMap<string, ReadonlySet<string>> | undefined
  } = {},
) {
  const mainCssFiles = new Set<string>()
  const shouldCheckSourceResources = Boolean(options.mainSourceFiles?.size)
  for (const chunk of chunks) {
    const files = toChunkFiles(chunk.files)
    const isRuntimeChunk = chunk.hasRuntime?.() === true
    if (!isRuntimeChunk) {
      continue
    }
    for (const file of files) {
      if (!cssMatcher(file)) {
        continue
      }
      if (shouldCheckSourceResources) {
        const resources = options.resourcesByAsset?.get(file)
        if (!resources || ![...resources].some(resource => options.mainSourceFiles?.has(resource))) {
          continue
        }
      }
      mainCssFiles.add(file)
    }
  }
  return mainCssFiles
}

export function resolveSingleActiveWebpackCssResource(
  assetResources: ReadonlySet<string> | undefined,
  activeWebpackAssetResourceFiles: ReadonlySet<string>,
) {
  const activeAssetResourceMatches = [...(assetResources ?? [])]
    .map(sourceFile => path.resolve(sourceFile))
    .filter(sourceFile => activeWebpackAssetResourceFiles.has(sourceFile))
    .sort()
  return activeAssetResourceMatches.length === 1
    ? activeAssetResourceMatches[0]
    : undefined
}

function resolveWebpackCssModuleIdentifierResource(module: ModuleLike) {
  if (!module.type?.startsWith('css/') || typeof module.identifier !== 'function') {
    return undefined
  }
  const identifier = module.identifier()
  const request = identifier.startsWith('css|') ? identifier.slice(4) : identifier
  const resourceWithMetadata = request.slice(request.lastIndexOf('!') + 1)
  const metadataIndex = resourceWithMetadata.indexOf('|')
  return metadataIndex === -1
    ? resourceWithMetadata
    : resourceWithMetadata.slice(0, metadataIndex)
}

function createWebpackCssAssetResourceMapInternal(
  chunks: Iterable<ChunkLike>,
  chunkGraph: ChunkGraphLike | undefined,
  cssMatcher: (file: string) => boolean,
  normalizeResource: (resource: string, issuer?: { context?: string, resource?: string }) => string | undefined,
  onlyUnambiguousCssAssets: boolean,
) {
  const resourcesByAsset = new Map<string, Set<string>>()
  if (!chunkGraph?.getChunkModulesIterable) {
    return resourcesByAsset
  }
  const collectModuleResources = (module: ModuleLike, resources: Set<string>, seen = new Set<ModuleLike>()) => {
    if (!module || seen.has(module)) {
      return
    }
    seen.add(module)
    const candidates = [
      module.resource,
      module.request,
      module.userRequest,
    ]
    if (onlyUnambiguousCssAssets) {
      candidates.push(resolveWebpackCssModuleIdentifierResource(module))
    }
    for (const candidate of candidates) {
      if (typeof candidate !== 'string') {
        continue
      }
      const normalized = normalizeResource(candidate, module)
      if (normalized) {
        resources.add(normalized)
      }
    }
    for (const nested of [module.rootModule, chunkGraph.getIssuer?.(module)]) {
      if (nested) {
        collectModuleResources(nested, resources, seen)
      }
    }
    for (const nested of module.modules ?? []) {
      collectModuleResources(nested, resources, seen)
    }
    for (const dependency of module.dependencies ?? []) {
      const dependencyLike = dependency as DependencyLike
      for (const candidate of [dependencyLike.request, dependencyLike.userRequest]) {
        if (typeof candidate !== 'string') {
          continue
        }
        const normalized = normalizeResource(candidate, module)
        if (normalized) {
          resources.add(normalized)
        }
      }
      const dependencyModule = chunkGraph.getModule?.(dependency)
      if (dependencyModule) {
        collectModuleResources(dependencyModule, resources, seen)
      }
    }
  }
  for (const chunk of chunks) {
    const cssFiles = toChunkFiles(chunk.files).filter(file => cssMatcher(file))
    if (cssFiles.length === 0 || (onlyUnambiguousCssAssets && cssFiles.length !== 1)) {
      continue
    }
    const modules = chunkGraph.getChunkModulesIterable(chunk)
    if (!modules) {
      continue
    }
    const cssResources = new Set<string>()
    for (const module of modules) {
      collectModuleResources(module, cssResources)
    }
    if (cssResources.size === 0) {
      continue
    }
    for (const cssFile of cssFiles) {
      resourcesByAsset.set(cssFile, cssResources)
    }
  }
  return resourcesByAsset
}

export function createWebpackCssAssetResourceMap(
  chunks: Iterable<ChunkLike>,
  chunkGraph: ChunkGraphLike | undefined,
  cssMatcher: (file: string) => boolean,
  normalizeResource: (resource: string, issuer?: { context?: string, resource?: string }) => string | undefined,
) {
  return createWebpackCssAssetResourceMapInternal(chunks, chunkGraph, cssMatcher, normalizeResource, false)
}

export function createWebpackDirectCssAssetResourceMap(
  chunks: Iterable<ChunkLike>,
  chunkGraph: ChunkGraphLike | undefined,
  cssMatcher: (file: string) => boolean,
  normalizeResource: (resource: string, issuer?: { context?: string, resource?: string }) => string | undefined,
) {
  return createWebpackCssAssetResourceMapInternal(chunks, chunkGraph, cssMatcher, normalizeResource, true)
}

export function createAssetHashByChunkMap(chunks: Iterable<ChunkLike>) {
  const partsByFile = new Map<string, string[]>()

  for (const chunk of chunks) {
    const hash = typeof chunk.hash === 'string'
      ? chunk.hash
      : undefined
    if (!hash) {
      continue
    }

    const chunkId = String(chunk.id ?? chunk.name ?? '')
    for (const file of toChunkFiles(chunk.files)) {
      if (!file) {
        continue
      }
      let parts = partsByFile.get(file)
      if (!parts) {
        parts = []
        partsByFile.set(file, parts)
      }
      parts.push(`${chunkId}:${hash}`)
    }
  }

  const hashByFile = new Map<string, string>()
  for (const [file, parts] of partsByFile.entries()) {
    hashByFile.set(file, parts.sort().join('|'))
  }
  return hashByFile
}

export function createRuntimeAwareCssHash(
  assetHash: string | undefined,
  sourceHash: string,
  runtimeSetHash: string,
) {
  return `${assetHash ?? sourceHash}:${runtimeSetHash}`
}

export function hasWatchChanges(compiler: WebpackWatchChangeLike) {
  return (compiler.modifiedFiles?.size ?? 0) > 0
    || (compiler.removedFiles?.size ?? 0) > 0
}

export function isWatchFileInRuntimeDependencies(
  file: string,
  dependencies: RuntimeWatchDependenciesLike,
) {
  const normalizedFile = normalizeWatchPath(file)
  for (const dependency of dependencies.files ?? []) {
    if (normalizeWatchPath(dependency) === normalizedFile) {
      return true
    }
  }
  for (const context of dependencies.contexts ?? []) {
    if (isFileInContext(normalizedFile, context)) {
      return true
    }
  }
  return false
}
