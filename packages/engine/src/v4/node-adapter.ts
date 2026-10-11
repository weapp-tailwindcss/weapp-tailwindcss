import type {
  TailwindV4CompiledSourceRoot,
  TailwindV4DesignSystem,
  TailwindV4ResolvedSource,
  TailwindV4SourcePattern,
} from './types.ts'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { withGenerationModuleCache } from './module-cache.ts'
import { prepareGenerationModuleRequests } from './module-requests.ts'
import { BoundedCache } from './node-adapter/cache.ts'

interface TailwindV4CompiledSource {
  sources: TailwindV4SourcePattern[]
  root: TailwindV4CompiledSourceRoot
  build: (candidates: string[]) => string
}

interface TailwindV4NodeModule {
  loadModule?: (id: string, base: string, onDependency: (dependency: string) => void) => Promise<{ module: unknown }>
  compile: (css: string, options: {
    base: string
    onDependency: (dependency: string) => void
    customCssResolver?: (id: string, base: string) => Promise<string | false | undefined>
  }) => Promise<TailwindV4CompiledSource>
  __unstable__loadDesignSystem: (css: string, options: { base: string }) => Promise<TailwindV4DesignSystem>
}

const nodeModulePromiseCache = new BoundedCache<string, Promise<TailwindV4NodeModule>>(64)
interface DesignSystemCacheEntry {
  promise: Promise<TailwindV4DesignSystem>
  dependencies: Set<string>
  fingerprint?: string
}

const designSystemPromiseCache = new BoundedCache<string, DesignSystemCacheEntry>(64)

function fingerprintDesignDependencies(files: Iterable<string>) {
  const hash = createHash('sha256')
  for (const file of [...files].sort()) {
    hash.update(file)
    try {
      hash.update(readFileSync(file))
    }
    catch {
      hash.update('missing')
    }
  }
  return hash.digest('hex')
}

function unique(values: Iterable<string>) {
  return Array.from(new Set(Array.from(values).filter(Boolean).map(value => path.resolve(value))))
}

function createRequireBase(base: string) {
  return path.join(base, 'package.json')
}

function isRelativeSpecifier(id: string) {
  return id.startsWith('./') || id.startsWith('../') || id === '.' || id === '..'
}

function isAbsoluteSpecifier(id: string) {
  return path.isAbsolute(id)
}

function isCssSpecifier(id: string) {
  return path.extname(id) === '.css'
}

function createCssResolutionCandidates(id: string) {
  if (isCssSpecifier(id)) {
    return [id]
  }
  return [`${id}/index.css`, id]
}

function createFallbackCssResolver(baseCandidates: string[]) {
  const bases = unique(baseCandidates)
  return async (id: string) => {
    if (isRelativeSpecifier(id) || isAbsoluteSpecifier(id)) {
      return undefined
    }

    for (const base of bases) {
      const requireFromBase = createRequire(createRequireBase(base))
      for (const candidate of createCssResolutionCandidates(id)) {
        try {
          return requireFromBase.resolve(candidate)
        }
        catch {}
      }
    }
    return undefined
  }
}

async function importResolvedModule(resolved: string): Promise<TailwindV4NodeModule> {
  return import(pathToFileURL(resolved).href) as unknown as Promise<TailwindV4NodeModule>
}

async function importTailwindNodeFromBase(base: string): Promise<TailwindV4NodeModule | undefined> {
  try {
    const resolved = createRequire(createRequireBase(base)).resolve('@tailwindcss/node')
    return await importResolvedModule(resolved)
  }
  catch {
    return undefined
  }
}

async function importFallbackTailwindNode(): Promise<TailwindV4NodeModule> {
  return import('@tailwindcss/node') as unknown as Promise<TailwindV4NodeModule>
}

export async function loadTailwindV4NodeModule(baseCandidates: string[]): Promise<TailwindV4NodeModule> {
  const bases = unique(baseCandidates)
  const cacheKey = JSON.stringify(bases)
  const cached = nodeModulePromiseCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const promise = (async () => {
    for (const base of bases) {
      const loaded = await importTailwindNodeFromBase(base)
      if (loaded) {
        return loaded
      }
    }

    return importFallbackTailwindNode()
  })()

  nodeModulePromiseCache.set(cacheKey, promise)
  promise.catch(() => {
    if (nodeModulePromiseCache.get(cacheKey) === promise) {
      nodeModulePromiseCache.delete(cacheKey)
    }
  })
  return promise
}

function createDesignSystemCacheKey(css: string, bases: string[]) {
  return JSON.stringify({
    css,
    bases: unique(bases),
  })
}

export function getTailwindV4DesignSystemCacheKey(source: Pick<TailwindV4ResolvedSource, 'css' | 'base' | 'baseFallbacks'>) {
  return createDesignSystemCacheKey(source.css, [source.base, ...source.baseFallbacks])
}

async function createTailwindV4DesignSystem(source: TailwindV4ResolvedSource, onDependency?: (file: string) => void): Promise<TailwindV4DesignSystem> {
  const bases = unique([source.base, ...source.baseFallbacks])
  if (bases.length === 0) {
    throw new Error('No base directories provided for Tailwind CSS v4 design system.')
  }
  const node = await loadTailwindV4NodeModule([source.projectRoot, ...bases])
  let lastError: unknown

  for (const base of bases) {
    try {
      const prepared = prepareGenerationModuleRequests(source.css, base)
      return await withGenerationModuleCache(node, () => node.__unstable__loadDesignSystem(prepared.css, { base }), prepared.files, onDependency)
    }
    catch (error) {
      lastError = error
    }
  }

  if (lastError instanceof Error) {
    throw lastError
  }
  throw new Error('Failed to load Tailwind CSS v4 design system.')
}

export async function loadTailwindV4DesignSystem(
  source: TailwindV4ResolvedSource,
  options?: { cache?: boolean },
): Promise<TailwindV4DesignSystem> {
  if (options?.cache === false) {
    return createTailwindV4DesignSystem(source)
  }

  const cacheKey = JSON.stringify([source.projectRoot, getTailwindV4DesignSystemCacheKey(source)])
  const cached = designSystemPromiseCache.get(cacheKey)
  if (cached && (cached.fingerprint === undefined || cached.fingerprint === fingerprintDesignDependencies(cached.dependencies))) {
    return cached.promise
  }

  const dependencies = new Set(source.dependencies)
  const promise = createTailwindV4DesignSystem(source, file => dependencies.add(file))
  const entry: DesignSystemCacheEntry = { promise, dependencies }
  designSystemPromiseCache.set(cacheKey, entry)
  // 记录实际加载的模块依赖，配置的间接依赖变化也必须使 design system 失效。
  void promise.then(() => {
    entry.fingerprint = fingerprintDesignDependencies(dependencies)
  }, () => {
    if (designSystemPromiseCache.get(cacheKey) === entry) {
      designSystemPromiseCache.delete(cacheKey)
    }
  })
  return promise
}

export async function compileTailwindV4Source(source: TailwindV4ResolvedSource) {
  const bases = unique([source.base, ...source.baseFallbacks])
  if (bases.length === 0) {
    throw new Error('No base directories provided for Tailwind CSS v4 compiler.')
  }

  const node = await loadTailwindV4NodeModule([source.projectRoot, ...bases])
  let lastError: unknown

  for (const base of bases) {
    const dependencies = new Set(source.dependencies)
    try {
      const prepared = prepareGenerationModuleRequests(source.css, base)
      const onDependency = (dependency: string) => dependencies.add(path.resolve(dependency))
      const compiled = await withGenerationModuleCache(node, () => node.compile(prepared.css, {
        base,
        customCssResolver: createFallbackCssResolver([source.projectRoot, ...bases]),
        onDependency,
      }), prepared.files, onDependency)
      return {
        compiled,
        dependencies,
      }
    }
    catch (error) {
      lastError = error
    }
  }

  if (lastError instanceof Error) {
    throw lastError
  }
  throw new Error('Failed to compile Tailwind CSS v4 source.')
}
