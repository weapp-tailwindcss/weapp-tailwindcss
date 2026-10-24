import type { TailwindV4CssSource } from '@weapp-tailwindcss/engine'
import type { TailwindRuntimeState } from '@/tailwindcss/runtime'
import type { AppType, InternalUserDefinedOptions } from '@/types'

export type WebpackLoaderActivity = <T>(activity: () => T | Promise<T>) => Promise<Awaited<T>>

export interface WebpackRuntimeClassSetLoaderOptions {
  run?: WebpackLoaderActivity
  getClassSet?: () => void | Promise<void>
  getWatchDependencies?: () => RuntimeLoaderWatchDependencies | Promise<RuntimeLoaderWatchDependencies | void> | void
  registerCssSourceFile?: (source: WebpackCssSourceRegistration) => void
  updateGeneratedCss?: (source: WebpackGeneratedCssUpdate) => void
}

export interface RuntimeLoaderWatchDependencies {
  files?: Iterable<string>
  contexts?: Iterable<string>
}

export interface WebpackCssSourceRegistration {
  css?: string | undefined
  file: string
  processed?: boolean | undefined
}

export interface WebpackGeneratedCssRegistration {
  classSet: Set<string>
  css: string
  dependencies: string[]
  file: string
}

export interface WebpackGeneratedCssUpdate {
  css: string
  file: string
}

export interface WebpackCssImportRewriteRuntimeOptions {
  run?: WebpackLoaderActivity
  pkgDir: string
  appType?: AppType
  compilerOptions?: InternalUserDefinedOptions
  runtimeState?: TailwindRuntimeState
  registerCssSource?: (source: TailwindV4CssSource) => Promise<void> | void
  getRuntimeSet?: () => Promise<Set<string>> | Set<string>
  markGeneratedCssSource?: (file: string) => void
  registerGeneratedCss?: (source: WebpackGeneratedCssRegistration) => void
  registerCssSourceFile?: (source: WebpackCssSourceRegistration) => void
}

export interface WebpackCssImportRewriteLoaderOptions {
  generateCss?: boolean | undefined
  tailwindcssImportRewrite?: WebpackCssImportRewriteRuntimeOptions
  tailwindcssImportRewriteRuntimeKey?: string
}

export interface WebpackLoaderRuntimeEntry {
  classSet?: WebpackRuntimeClassSetLoaderOptions
  cssImportRewrite?: WebpackCssImportRewriteRuntimeOptions
}

interface WebpackLoaderRuntimeRegistryHolder {
  __WEAPP_TW_WEBPACK_LOADER_RUNTIME_REGISTRY__?: Map<string, WebpackLoaderRuntimeEntry>
  __WEAPP_TW_WEBPACK_COMPILER_RUNTIME_REGISTRY__?: WeakMap<object, WebpackLoaderRuntimeEntry>
  __WEAPP_TW_WEBPACK_CLOSED_COMPILERS__?: WeakSet<object>
}

const runtimeRegistryHolder = globalThis as WebpackLoaderRuntimeRegistryHolder
const runtimeRegistry = runtimeRegistryHolder.__WEAPP_TW_WEBPACK_LOADER_RUNTIME_REGISTRY__
  ?? (runtimeRegistryHolder.__WEAPP_TW_WEBPACK_LOADER_RUNTIME_REGISTRY__ = new Map())

const compilerRegistry = runtimeRegistryHolder.__WEAPP_TW_WEBPACK_COMPILER_RUNTIME_REGISTRY__
  ?? (runtimeRegistryHolder.__WEAPP_TW_WEBPACK_COMPILER_RUNTIME_REGISTRY__ = new WeakMap())
const closedCompilers = runtimeRegistryHolder.__WEAPP_TW_WEBPACK_CLOSED_COMPILERS__
  ?? (runtimeRegistryHolder.__WEAPP_TW_WEBPACK_CLOSED_COMPILERS__ = new WeakSet())

export function setWebpackLoaderRuntime(key: string, entry: WebpackLoaderRuntimeEntry, compiler?: object) {
  runtimeRegistry.set(key, entry)
  if (compiler) {
    compilerRegistry.set(compiler, entry)
    closedCompilers.delete(compiler)
  }
}

export function deleteWebpackLoaderRuntime(key: string, compiler?: object) {
  runtimeRegistry.delete(key)
  if (compiler) {
    compilerRegistry.delete(compiler)
    closedCompilers.add(compiler)
  }
}

export function getWebpackLoaderRuntime(key?: string) {
  return key ? runtimeRegistry.get(key) : undefined
}

/** 静态规则通过 loader 的编译器身份查找，不能借用其他实例的运行时。 */
export function resolveWebpackLoaderRuntime(key?: string, compiler?: object) {
  if (key) {
    const entry = runtimeRegistry.get(key)
    if (!entry) {
      throw new Error('Webpack loader 所属编译会话已释放或未注册。')
    }
    return entry
  }
  if (compiler && closedCompilers.has(compiler)) {
    throw new Error('Webpack loader 所属编译会话已释放。')
  }
  return compiler ? compilerRegistry.get(compiler) : undefined
}
