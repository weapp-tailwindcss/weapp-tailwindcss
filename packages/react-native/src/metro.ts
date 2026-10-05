/* eslint-disable no-console, style/max-statements-per-line */

import type { NativeStyleManifest } from './types'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { compileNativeStylesheet } from './compiler'
import { writeManifestFile } from './metro/manifest-store'
import { compileStableInput, waitForCurrentRefresh } from './metro/refresh'
import { virtualModuleCode } from './metro/virtual-module'
import { watchInput } from './metro/watch'

export const VIRTUAL_MANIFEST_MODULE = '@weapp-tailwindcss/react-native/virtual'

export interface MetroConfigLike {
  resolver?: {
    extraNodeModules?: Record<string, string>
    sourceExts?: string[]
    resolveRequest?: (context: unknown, moduleName: string, platform?: string) => unknown
    [key: string]: unknown
  }
  transformer?: Record<string, unknown>
  transformerPath?: string
  watchFolders?: string[]
  server?: Record<string, unknown>
  [key: string]: unknown
}

interface MetroResolverContext {
  originModulePath?: string
  resolveRequest?: (context: unknown, moduleName: string, platform?: string) => unknown
}

export interface WeappReactNativeMetroOptions {
  projectRoot?: string | undefined
  input?: string | undefined
  css?: string | undefined
  manifest?: NativeStyleManifest | undefined
  classSet?: Iterable<string> | undefined
  sourceGlobs?: string[] | undefined
  watchFiles?: string[] | undefined
}

interface RegisteredManifest {
  version: number
  manifest: NativeStyleManifest
  projectRoot: string
  virtualPath: string
  manifestPath: string
  manifestReadyPath: string
  ready: Promise<void>
  refresh: () => Promise<void>
}

export interface NativeManifestPaths {
  manifestPath: string
  manifestReadyPath: string
}

const registry = new Map<string, RegisteredManifest>()
const appRootSingletonModules = new Set(['react'])
let nextId = 0

function packageNameFromModuleId(moduleName: string) {
  const segments = moduleName.split('/')
  return moduleName.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0]
}

function shouldResolveFromAppRoot(moduleName: string, platform?: string) {
  const packageName = packageNameFromModuleId(moduleName)
  if (appRootSingletonModules.has(packageName)) {
    return true
  }
  return platform !== 'web' && packageName === 'react-native'
}

function resolveAppRootSingleton(projectRoot: string, moduleName: string, platform?: string) {
  if (platform !== 'web' || !['react', 'react-dom', 'react-native-web'].includes(packageNameFromModuleId(moduleName))) {
    return undefined
  }
  try {
    const requireFromProject = createRequire(path.join(projectRoot, 'package.json'))
    return { type: 'sourceFile', filePath: requireFromProject.resolve(moduleName) }
  }
  catch {
    return undefined
  }
}

/** 为 Metro worker 提供不依赖进程内 registry 的 manifest 入口。 */
export function getManifestPathsForProjectRoot(projectRoot: string): NativeManifestPaths {
  const projectKey = createHash('sha256').update(path.resolve(projectRoot)).digest('hex').slice(0, 24)
  const base = path.join(os.tmpdir(), 'weapp-tailwindcss-native', `project-${projectKey}`)
  return {
    manifestPath: `${base}.manifest.json`,
    manifestReadyPath: `${base}.manifest.ready`,
  }
}

function resolveInput(input: string | undefined, projectRoot: string) {
  return input ? path.resolve(projectRoot, input) : undefined
}

function emptyManifest(): NativeStyleManifest {
  return { version: 1, classSet: [], rules: {}, variables: {}, warnings: [] }
}

function writeVirtualModule(entry: RegisteredManifest) {
  fs.mkdirSync(path.dirname(entry.virtualPath), { recursive: true })
  fs.mkdirSync(path.dirname(entry.manifestPath), { recursive: true })
  writeManifestFile(entry.virtualPath, virtualModuleCode(entry.manifest))
  writeManifestFile(entry.manifestPath, JSON.stringify(entry.manifest))
}

/**
 * Metro worker 会把文件路径先相对化再恢复为绝对路径。虚拟模块必须位于
 * 项目根目录内，否则 Windows 跨盘符路径会被错误拼接成 `D:\\C:\\...`。
 */
function getVirtualModulePath(projectRoot: string, id: string) {
  return path.join(projectRoot, 'node_modules', '.cache', 'weapp-tailwindcss-native', `${id}.js`)
}

function markManifestPending(entry: RegisteredManifest) {
  fs.rmSync(entry.manifestReadyPath, { force: true })
}

function markManifestReady(entry: RegisteredManifest) {
  writeManifestFile(entry.manifestReadyPath, JSON.stringify({ revision: randomUUID(), version: entry.version, virtualPath: entry.virtualPath }))
}

async function compileOptions(options: WeappReactNativeMetroOptions, projectRoot: string) {
  if (options.manifest) { return options.manifest }
  if (options.input) {
    const tailwindModulePath = import.meta.url.endsWith('.ts') ? './tailwind.ts' : './tailwind.js'
    const { generateNativeStylesheet } = await import(/* @vite-ignore */ tailwindModulePath)
    return generateNativeStylesheet({
      projectRoot,
      cssEntries: [resolveInput(options.input, projectRoot)!],
      candidates: options.classSet,
      sourceGlobs: options.sourceGlobs,
    })
  }
  return compileNativeStylesheet(options.css ?? '', { classSet: options.classSet })
}

function register(options: WeappReactNativeMetroOptions) {
  const id = `weapp-tailwindcss-native-${nextId++}`
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd())
  const manifestPaths = getManifestPathsForProjectRoot(projectRoot)
  const entry: RegisteredManifest = {
    version: 0,
    manifest: options.manifest ?? (options.css ? compileNativeStylesheet(options.css, { classSet: options.classSet }) : emptyManifest()),
    projectRoot,
    virtualPath: getVirtualModulePath(projectRoot, id),
    manifestPath: manifestPaths.manifestPath,
    manifestReadyPath: manifestPaths.manifestReadyPath,
    ready: Promise.resolve(),
    refresh: async () => {},
  }
  registry.set(id, entry)
  markManifestPending(entry)
  writeVirtualModule(entry)

  const inputFiles = [...new Set([...(options.watchFiles ?? []), ...(options.input ? [options.input] : [])]
    .map(file => path.resolve(projectRoot, file)))]
  let generation = 0
  entry.refresh = () => {
    const currentGeneration = ++generation
    markManifestPending(entry)
    entry.ready = (async () => {
      try {
        const manifest = await compileStableInput(inputFiles, () => compileOptions(options, projectRoot), () => currentGeneration === generation)
        if (manifest && currentGeneration === generation) {
          entry.manifest = manifest
          entry.version++
          writeVirtualModule(entry)
          markManifestReady(entry)
        }
      }
      catch (error) {
        if (currentGeneration !== generation) { return }
        const message = `生成 React Native manifest 失败：${error instanceof Error ? error.message : String(error)}`
        writeManifestFile(entry.manifestReadyPath, JSON.stringify({ error: message }))
        throw new Error(message, { cause: error })
      }
    })()
    // watcher 没有调用方接收 Promise；保留 ready 的拒绝供读取者处理，并记录原始失败。
    void entry.ready.catch(error => console.error(error.message))
    return entry.ready
  }
  void entry.refresh()

  const sourceRoots = (options.sourceGlobs ?? [])
    .map(pattern => pattern.split(/[*{[]/, 1)[0]?.replace(/[/\\]$/, ''))
    .filter(Boolean)
  const watched = [...(options.watchFiles ?? []), ...(options.input ? [options.input] : []), ...sourceRoots]
  const watchers = watched.map((file) => {
    const target = path.resolve(projectRoot, file)
    try {
      return watchInput(target, () => { void entry.refresh() })
    }
    catch {
      return undefined
    }
  })
  void watchers
  return { id, entry }
}

export function getRegisteredVirtualModule(filename: string) {
  for (const entry of registry.values()) {
    if (entry.virtualPath === filename) { return entry }
  }
  return undefined
}

export async function getRegisteredManifest(id: string) {
  const registered = registry.get(id)
  if (!registered) { return undefined }
  await waitForCurrentRefresh(registered)
  return registered.manifest
}

/** 等待并读取由 Metro 配置注册的 manifest 文件，兼容未透传自定义 Metro id 的 transformer。 */
export async function getRegisteredManifestByPath(filename: string) {
  for (const entry of registry.values()) {
    if (entry.manifestPath === filename) {
      await waitForCurrentRefresh(entry)
      return entry.manifest
    }
  }
  return undefined
}

/** 按 Metro 传入的项目根目录读取当前注册项，兼容 transformer 未透传自定义字段的实现。 */
export async function getRegisteredManifestByProjectRoot(projectRoot: string) {
  const resolvedRoot = path.resolve(projectRoot)
  const entries = [...registry.values()].filter(entry => entry.projectRoot === resolvedRoot)
  const entry = entries.at(-1)
  if (!entry) { return undefined }
  await waitForCurrentRefresh(entry)
  return entry.manifest
}

export function getVirtualModuleCode(filename: string) {
  const registered = getRegisteredVirtualModule(filename)
  if (!registered) { return undefined }
  return virtualModuleCode(registered.manifest)
}

export async function getVirtualModuleCodeAsync(filename: string) {
  const registered = getRegisteredVirtualModule(filename)
  if (!registered) { return undefined }
  await waitForCurrentRefresh(registered)
  return getVirtualModuleCode(filename)
}

export function withWeappTailwindcss<T extends MetroConfigLike>(config: T | Promise<T> | (() => T | Promise<T>), options: WeappReactNativeMetroOptions = {}): T | Promise<T> {
  if (typeof config === 'function' || (config && typeof (config as Promise<T>).then === 'function')) {
    return Promise.resolve(typeof config === 'function' ? config() : config).then(resolved => withWeappTailwindcss(resolved, options))
  }
  const resolvedConfig = config as T
  const { id, entry } = register(options)
  const originalResolver = resolvedConfig.resolver?.resolveRequest
  const sourceExts = resolvedConfig.resolver?.sourceExts ?? []
  const virtualResolver = (context: unknown, moduleName: string, platform?: string) => {
    if (moduleName === VIRTUAL_MANIFEST_MODULE) {
      return { type: 'sourceFile', filePath: entry.virtualPath }
    }
    const appRootSingleton = resolveAppRootSingleton(entry.projectRoot, moduleName, platform)
    if (appRootSingleton) {
      return appRootSingleton
    }
    const resolverContext = context as MetroResolverContext
    // React 核心包必须与原生工程使用同一实例；workspace symlink 不能从包目录加载另一套 peer。
    const anchoredContext = resolverContext.originModulePath === entry.virtualPath || shouldResolveFromAppRoot(moduleName, platform)
      ? { ...resolverContext, originModulePath: path.join(entry.projectRoot, 'package.json') }
      : resolverContext
    return originalResolver?.(anchoredContext, moduleName, platform)
      ?? resolverContext.resolveRequest?.(anchoredContext, moduleName, platform)
      ?? resolveAppRootSingleton(entry.projectRoot, moduleName, platform)
  }
  return {
    ...resolvedConfig,
    watchFolders: [...new Set([...(resolvedConfig.watchFolders ?? []), path.dirname(entry.virtualPath)])],
    transformerPath: fileURLToPath(new URL(import.meta.url.includes('.ts') ? './metro-transformer.ts' : './metro-transformer.js', import.meta.url)),
    transformer: {
      ...resolvedConfig.transformer,
      weappTailwindcssMetroId: id,
      weappTailwindcssOriginalTransformerPath: resolvedConfig.transformerPath,
      weappTailwindcssManifestPath: entry.manifestPath,
      weappTailwindcssManifestReadyPath: entry.manifestReadyPath,
      weappTailwindcssVirtualModulePath: entry.virtualPath,
    },
    resolver: {
      ...resolvedConfig.resolver,
      // Metro may resolve React from a dependency's nested peer context. Pin
      // the Web singleton to the app's dependency graph so React DOM and
      // React Native Web share the dispatcher used by the application.
      extraNodeModules: {
        ...resolvedConfig.resolver?.extraNodeModules,
        'react': path.resolve(entry.projectRoot, 'node_modules/react'),
        'react-dom': path.resolve(entry.projectRoot, 'node_modules/react-dom'),
      },
      sourceExts: sourceExts.includes('css') ? sourceExts : [...sourceExts, 'css'],
      resolveRequest: virtualResolver,
    },
  } as T
}
