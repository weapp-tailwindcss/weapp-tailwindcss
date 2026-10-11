import type { TailwindV4CssSource } from '@weapp-tailwindcss/engine'
import type { TailwindRuntimeState } from '@/tailwindcss/runtime'
import type { AppType, InternalUserDefinedOptions } from '@/types'

export interface WebpackRuntimeClassSetLoaderOptions {
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
}

const runtimeRegistryHolder = globalThis as WebpackLoaderRuntimeRegistryHolder
const runtimeRegistry = runtimeRegistryHolder.__WEAPP_TW_WEBPACK_LOADER_RUNTIME_REGISTRY__
  ?? (runtimeRegistryHolder.__WEAPP_TW_WEBPACK_LOADER_RUNTIME_REGISTRY__ = new Map())

export function setWebpackLoaderRuntime(key: string, entry: WebpackLoaderRuntimeEntry) {
  runtimeRegistry.set(key, entry)
}

export function deleteWebpackLoaderRuntime(key: string) {
  runtimeRegistry.delete(key)
}

export function getWebpackLoaderRuntime(key?: string) {
  return key ? runtimeRegistry.get(key) : undefined
}

/** 获取当前编译器注册的最新运行时，供 Rspeedy 静态 CSS 规则使用。 */
export function getLatestWebpackLoaderRuntime() {
  const entries = [...runtimeRegistry.values()]
  return entries.at(-1)
}
