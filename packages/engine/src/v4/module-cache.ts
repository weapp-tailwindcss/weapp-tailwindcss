import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire, findPackageJSON } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { clearRequireCache } from '@tailwindcss/node/require-cache'
import { resolveSourceScanPath } from '@weapp-tailwindcss/source-scan'

interface ModuleLoader {
  loadModule?: (id: string, base: string, onDependency: (dependency: string) => void) => Promise<{ module: unknown }>
}

interface ModuleEntry {
  dependencies: string[]
  fingerprint: string
  value: { default: unknown }
}

type ModuleHook = (url: string) => unknown | Promise<unknown>

interface ModuleContext {
  loader: ModuleLoader
  files: Set<string>
  onDependency?: ((file: string) => void) | undefined
}

const context = new AsyncLocalStorage<ModuleContext | undefined>()
const caches = new WeakMap<ModuleLoader, { revision: number, entries: Map<string, Promise<ModuleEntry>> }>()
let revision = 0
const hooks = globalThis as typeof globalThis & { __tw_load?: ModuleHook }
let installedHook: ModuleHook | undefined
let activeContexts = 0
const MODULE_CACHE_LIMIT = 128
const require = createRequire(import.meta.url)

function canUseCommonJsGraph(file: string) {
  const extension = path.extname(file)
  if (extension === '.cjs' || extension === '.cts') {
    return true
  }
  if (extension !== '.js') {
    return false
  }
  const manifest = findPackageJSON(pathToFileURL(file).href)
  // 无 package.json 时，Node 的解析结果可能回退到模块文件本身。
  return !manifest || path.basename(manifest) !== 'package.json' || JSON.parse(readFileSync(manifest, 'utf8')).type !== 'module'
}

function collectCommonJsDependencies(file: string, dependencies: Set<string>) {
  const module = require.cache[file]
  if (!module?.loaded) {
    return false
  }
  const visited = new Set<NodeJS.Module>()
  const packageRoot = path.dirname(findPackageJSON(pathToFileURL(file).href) ?? file)
  function visit(current: NodeJS.Module) {
    if (visited.has(current) || !current.filename) {
      return
    }
    visited.add(current)
    let directory = path.dirname(current.filename)
    const relative = path.relative(packageRoot, current.filename)
    while (path.dirname(directory) !== directory) {
      if (path.basename(directory) === 'node_modules' && (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))) {
        return
      }
      directory = path.dirname(directory)
    }
    dependencies.add(current.filename)
    for (const child of current.children) {
      visit(child)
    }
  }
  visit(module)
  return true
}

function fingerprint(files: string[]) {
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(file)
    hash.update(readFileSync(file))
  }
  return hash.digest('hex')
}

async function loadCachedModule(loader: ModuleLoader, file: string): Promise<ModuleEntry> {
  let state = caches.get(loader)
  if (!state || state.revision !== revision) {
    state = { revision, entries: new Map() }
    caches.set(loader, state)
  }
  const cache = state.entries
  const previous = cache.get(file)
  if (previous) {
    const entry = await previous
    try {
      if (fingerprint(entry.dependencies) === entry.fingerprint) {
        return entry
      }
    }
    catch {
    }
    if (cache.get(file) !== previous) {
      return loadCachedModule(loader, file)
    }
    clearRequireCache(entry.dependencies)
  }

  const pending = context.run(undefined, async () => {
    const dependencies = new Set<string>([file])
    const base = path.dirname(file)
    const onDependency = (dependency: string) => {
      dependencies.add(dependency)
    }
    let loaded: { module: unknown }
    if (path.extname(file) === '.cjs') {
      // CJS 必须与 require.cache 使用同一加载通道；带查询参数的 ESM 包装仍可能持有旧 exports。
      loaded = { module: require(file) }
      collectCommonJsDependencies(file, dependencies)
    }
    else {
      const initial = previous || !canUseCommonJsGraph(file) ? undefined : await loader.loadModule!(file, base, onDependency)
      loaded = initial && collectCommonJsDependencies(file, dependencies)
        ? initial
        : await loader.loadModule!(`./${path.basename(file)}`, base, onDependency)
    }
    const files = [...dependencies].sort()
    return {
      dependencies: files,
      fingerprint: fingerprint(files),
      value: { default: loaded.module },
    }
  })
  cache.set(file, pending)
  while (cache.size > MODULE_CACHE_LIMIT) {
    cache.delete(cache.keys().next().value!)
  }
  try {
    return await pending
  }
  catch (error) {
    if (cache.get(file) === pending) {
      cache.delete(file)
    }
    throw error
  }
}

function installHook() {
  if (installedHook && hooks.__tw_load === installedHook) {
    return
  }
  const previous = hooks.__tw_load
  installedHook = async (url) => {
    const overridden = await previous?.(url)
    if (overridden) {
      return overridden
    }
    const active = context.getStore()
    if (!active?.loader.loadModule || !url.startsWith('file:')) {
      return undefined
    }
    const parsed = new URL(url)
    const file = resolveSourceScanPath(fileURLToPath(parsed))
    if (!parsed.searchParams.has('id') && !active.files.has(file)) {
      return undefined
    }
    const entry = await loadCachedModule(active.loader, file)
    for (const dependency of entry.dependencies) {
      active.onDependency?.(dependency)
    }
    return entry.value
  }
  hooks.__tw_load = installedHook
}

export function invalidateGenerationModuleCache() {
  revision += 1
}

/** 仅在本引擎调用内复用本地模块；Tailwind 仍负责解析与依赖跟踪。 */
export async function withGenerationModuleCache<T>(loader: ModuleLoader, run: () => Promise<T>, files: string[] = [], onDependency?: (file: string) => void) {
  installHook()
  const resolved = files.map((file) => {
    for (const candidate of [file, `${file}.ts`, path.join(file, 'index.ts')]) {
      try {
        return resolveSourceScanPath(require.resolve(candidate))
      }
      catch {
      }
    }
    return resolveSourceScanPath(file)
  })
  activeContexts += 1
  try {
    return await context.run({ loader, files: new Set(resolved), onDependency }, run)
  }
  finally {
    // 仅在最后一个并发调用结束后关闭跟踪，避免后续构建持续承担 async_hooks 开销。
    activeContexts -= 1
    if (activeContexts === 0) {
      context.disable()
    }
  }
}
