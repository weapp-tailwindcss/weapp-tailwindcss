import type { TailwindV4CssSource } from '@weapp-tailwindcss/engine'
import type { Compiler } from 'webpack'
import type { WebpackFrameworkName } from '../../../framework-selector'
import type { WebpackCssSourceRegistration, WebpackGeneratedCssRegistration } from '../../loaders/runtime-registry'
import type { LoaderAnchorFinders } from '../loader-anchors'
import type { WebpackStyleInjectorDelegateFactory } from '@/style-injector/internal'
import type { AppType, IBaseWebpackPlugin, InternalUserDefinedOptions, UserDefinedOptions } from '@/types'
import path from 'node:path'
import process from 'node:process'
import { createCompilationDependencyChanges, recordCompilationDependencyChanges } from '@/compiler'
import { COMPILATION_EVENT_SCHEMA_VERSION } from '@/compiler/events'
import { createCompilerRuntimeState } from '@/compiler/runtime-state'
import { pluginName } from '@/constants'
import { getCompilerContext } from '@/context'
import { createBuiltinWebpackStyleInjectorPlugin } from '@/style-injector/internal'
import { createTailwindRuntimeReadyPromise, ensureRuntimeClassSet, refreshTailwindRuntimeState } from '@/tailwindcss/runtime'
import { resolveTailwindcssOptions } from '@/tailwindcss/runtime-options'
import { getRuntimeClassSetSignature } from '@/tailwindcss/runtime/cache'
import { hasConfiguredTailwindV4CssRoots, upsertTailwindV4CssSource } from '@/tailwindcss/v4/css-sources'
import { resolvePluginDisabledState } from '@/utils/disabled'
import { normalizeTailwindConfigDirectives } from '../../../../generation/directives'
import { hasTailwindGeneratedCss, hasTailwindGeneratedCssMarkers } from '../../../../generation/index'
import { resolveWebpackFrameworkProfile } from '../../../framework-selector'
import { isWatchFileInRuntimeDependencies } from '../../BaseUnifiedPlugin/shared'
import { setupWebpackV5ProcessAssetsHook } from '../../BaseUnifiedPlugin/v5-assets'
import { setupWebpackV5Loaders } from '../../BaseUnifiedPlugin/v5-loaders'
import { createWebpackLoaderRuntimePreparation } from './runtime-preparation'
import { debug, setupWebpackWatchOutputIgnore, shouldKeepPreviousWebpackCssSource, weappTailwindcssPackageDir } from './watch-output'

function isInternalUserDefinedOptions(options: UserDefinedOptions | InternalUserDefinedOptions): options is InternalUserDefinedOptions {
  return typeof (options as InternalUserDefinedOptions).onLoad === 'function'
    && typeof (options as InternalUserDefinedOptions).mainCssChunkMatcher === 'function'
    && typeof (options as InternalUserDefinedOptions).tailwindRuntime === 'object'
    && typeof (options as InternalUserDefinedOptions).refreshTailwindcssRuntime === 'function'
}

/**
 * Webpack 各框架分支共享的核心实现。具体框架入口位于 frameworks/*，避免公共入口承载框架细节。
 */

export interface WebpackFrameworkBranchContext {
  frameworkName: WebpackFrameworkName
  loaderAnchorFinders: LoaderAnchorFinders
  mpxCssImportRewrite?: boolean | undefined
  setupCssImportRewriteRedirect?: ((packageDir: string) => void) | undefined
  styleInjectorDelegate: WebpackStyleInjectorDelegateFactory
}

export class WebpackFrameworkPlugin implements IBaseWebpackPlugin {
  options: InternalUserDefinedOptions
  appType: AppType | undefined
  private hasInitialTailwindCssRoots: boolean
  private frameworkBranch: WebpackFrameworkBranchContext

  constructor(options: UserDefinedOptions | InternalUserDefinedOptions = {}, frameworkBranch: WebpackFrameworkBranchContext) {
    this.frameworkBranch = frameworkBranch
    this.hasInitialTailwindCssRoots = hasConfiguredTailwindV4CssRoots(options)
    this.options = isInternalUserDefinedOptions(options)
      ? options
      : getCompilerContext({
          ...options,
          __internalDeferMissingCssEntriesWarning: true,
        } as UserDefinedOptions)
    this.appType = this.options.appType
  }

  apply(compiler: Compiler) {
    debug('apply webpack framework plugin framework=%s', this.frameworkBranch.frameworkName)
    compiler.options = compiler.options || {} as any
    const {
      disabled,
      onLoad,
      runtimeLoaderPath,
      tailwindRuntime,
      refreshTailwindcssRuntime,
      styleInjector,
    } = this.options
    const initialTailwindRuntime = tailwindRuntime
    const refreshTailwindRuntime = refreshTailwindcssRuntime

    const disabledOptions = resolvePluginDisabledState(disabled)
    const shouldRewriteCssImports = this.options.rewriteCssImports === true
    const frameworkProfile = resolveWebpackFrameworkProfile({
      appType: this.appType,
      detectEnv: true,
      env: process.env,
      root: compiler.options.context ?? compiler.context,
      uniAppX: this.options.uniAppX,
    })
    this.appType = (frameworkProfile.appType as AppType | undefined) ?? this.appType
    if (shouldRewriteCssImports) {
      this.frameworkBranch.setupCssImportRewriteRedirect?.(weappTailwindcssPackageDir)
    }
    if (disabledOptions.plugin) {
      return
    }
    if (initialTailwindRuntime.majorVersion !== 4) {
      throw new Error('weapp-tailwindcss/webpack 新生成管线仅支持 Tailwind CSS v4，请升级 tailwindcss 或停留在旧版 weapp-tailwindcss。')
    }
    setupWebpackWatchOutputIgnore(compiler)
    const readyPromise = createTailwindRuntimeReadyPromise(initialTailwindRuntime)
    const runtimeState = createCompilerRuntimeState({
      tailwindRuntime: initialTailwindRuntime,
      readyPromise,
      refreshTailwindcssRuntime: refreshTailwindRuntime,
    })
    void runtimeState.events.emit({ schemaVersion: COMPILATION_EVENT_SCHEMA_VERSION, type: 'diagnostic', timestamp: new Date().toISOString(), adapter: 'webpack', phase: 'hmr', revision: runtimeState.revision, operationId: `webpack-init-${Date.now()}`, evidence: ['compiler.apply'] })

    let runtimeSetSignature: string | undefined
    let runtimeRefreshRequiredForCompilation = false
    let watchRunObserved = false
    const runtimeWatchDependencyFiles = new Set<string>()
    const runtimeWatchDependencyContexts = new Set<string>()
    const webpackProcessedCssSourceFiles = new Set<string>()
    const webpackCssSources = new Map<string, { css: string | undefined, processed?: boolean | undefined }>()
    const webpackGeneratedCssSources = new Map<string, WebpackGeneratedCssRegistration>()
    const currentWebpackCssSourceFiles = new Set<string>()
    const currentWebpackCssSourceModules = new Set<string>()
    let runtimeMetadataPrepared = false
    let compilationChangeRecord: {
      changes: ReturnType<typeof createCompilationDependencyChanges>
      affectedScopes: Set<string>
    } | undefined

    const updateRuntimeWatchDependencies = async () => {
      runtimeWatchDependencyFiles.clear()
      runtimeWatchDependencyContexts.clear()

      // 配置和插件的间接依赖由生成器发现，来源配置本身未必包含它们。
      for (const source of webpackGeneratedCssSources.values()) {
        for (const dependency of source.dependencies) {
          runtimeWatchDependencyFiles.add(dependency)
        }
      }

      const tailwindOptions = resolveTailwindcssOptions(runtimeState.tailwindRuntime.options)
      if (tailwindOptions?.config) {
        runtimeWatchDependencyFiles.add(tailwindOptions.config)
      }
      for (const entry of tailwindOptions?.v4?.cssEntries ?? []) {
        runtimeWatchDependencyFiles.add(entry)
      }
      for (const source of tailwindOptions?.v4?.cssSources ?? []) {
        if (source.file) {
          runtimeWatchDependencyFiles.add(source.file)
        }
        for (const dependency of source.dependencies ?? []) {
          runtimeWatchDependencyFiles.add(dependency)
        }
      }
      for (const source of tailwindOptions?.v4?.sources ?? []) {
        if (source?.base) {
          runtimeWatchDependencyContexts.add(source.base)
        }
      }

      if (typeof runtimeState.tailwindRuntime.collectContentTokens !== 'function') {
        return
      }

      try {
        const report = await runtimeState.tailwindRuntime.collectContentTokens()
        for (const entry of report.entries ?? []) {
          const file = typeof entry === 'object' && entry !== null && 'file' in entry
            ? entry.file
            : undefined
          if (typeof file === 'string') {
            runtimeWatchDependencyFiles.add(file)
          }
        }
        for (const source of report.sources ?? []) {
          const base = typeof source === 'object' && source !== null && 'base' in source
            ? source.base
            : undefined
          if (typeof base === 'string') {
            runtimeWatchDependencyContexts.add(base)
          }
        }
      }
      catch (error) {
        debug('collect runtime watch dependencies failed: %O', error)
      }
    }

    const ensureRuntimeMetadata = async (force = false) => {
      if (runtimeMetadataPrepared && !force) {
        return
      }
      await updateRuntimeWatchDependencies()
      runtimeMetadataPrepared = true
    }

    const collectWatchChangedFiles = () => {
      const compilerLike = compiler as Compiler & {
        modifiedFiles?: Set<string>
        removedFiles?: Set<string>
      }
      return new Set([
        ...(compilerLike.modifiedFiles ?? []),
        ...(compilerLike.removedFiles ?? []),
      ])
    }

    const hasRuntimeDependencyChanges = (files: Iterable<string>) => {
      for (const file of files) {
        if (isWatchFileInRuntimeDependencies(file, {
          contexts: runtimeWatchDependencyContexts,
          files: runtimeWatchDependencyFiles,
        })) {
          return true
        }
      }
      return false
    }

    const syncRuntimeRefreshRequirement = (markWatchRun = false) => {
      if (markWatchRun) {
        watchRunObserved = true
      }
      const changedFiles = collectWatchChangedFiles()
      if (markWatchRun && debug.enabled) {
        debug('webpack watch changed files=%O', [...changedFiles])
      }
      runtimeRefreshRequiredForCompilation = runtimeRefreshRequiredForCompilation
        || hasRuntimeDependencyChanges(changedFiles)
    }

    const resetRuntimePreparation = () => {
      loaderRuntimePreparation.invalidate()
      syncRuntimeRefreshRequirement()
      const changes = createCompilationDependencyChanges(collectWatchChangedFiles())
      // loader 会消费生成会话，必须在它执行前失效；processAssets 只复用本轮记录。
      compilationChangeRecord = { changes, affectedScopes: recordCompilationDependencyChanges(runtimeState, changes) }
    }

    const registerAutoCssSource = async (source: TailwindV4CssSource) => {
      if (
        !source.file
      ) {
        return
      }
      const changed = upsertTailwindV4CssSource(this.options, source)
      if (!changed) {
        return
      }
      loaderRuntimePreparation.invalidate()
      runtimeMetadataPrepared = false
      runtimeRefreshRequiredForCompilation = true
      await refreshTailwindRuntimeState(runtimeState, {
        force: true,
        clearCache: true,
      })
      debug('detected tailwindcss v4 css source from webpack css module: %s', source.file)
    }
    const markWebpackProcessedCssSource = (file: string) => {
      webpackProcessedCssSourceFiles.add(path.resolve(file))
    }
    const markWebpackCssSourceModule = (file: string) => {
      currentWebpackCssSourceModules.add(path.resolve(file))
    }
    const registerWebpackCssSourceFile = (source: WebpackCssSourceRegistration) => {
      const file = path.resolve(source.file)
      const previous = webpackCssSources.get(file)
      const next = {
        css: typeof source.css === 'string'
          ? normalizeTailwindConfigDirectives(source.css, path.dirname(file))
          : source.css,
        processed: source.processed,
      }
      if (previous && shouldKeepPreviousWebpackCssSource(previous, next)) {
        currentWebpackCssSourceFiles.add(file)
        return
      }
      webpackCssSources.set(file, next)
      currentWebpackCssSourceFiles.add(file)
    }
    const registerWebpackGeneratedCss = (source: WebpackGeneratedCssRegistration) => {
      const file = path.resolve(source.file)
      debug('webpack generated css dependencies: %s count=%d', file, source.dependencies.length)
      webpackGeneratedCssSources.set(file, {
        ...source,
        file,
      })
      currentWebpackCssSourceFiles.add(file)
      for (const dependency of source.dependencies) {
        runtimeWatchDependencyFiles.add(dependency)
      }
    }
    const updateWebpackGeneratedCss = (source: { css: string, file: string }) => {
      const file = path.resolve(source.file)
      const previous = webpackGeneratedCssSources.get(file)
      if (!previous) {
        return
      }
      webpackGeneratedCssSources.set(file, {
        ...previous,
        css: source.css,
      })
    }
    const pruneWebpackCssSources = (activeSourceFiles: ReadonlySet<string>, _options: { watchMode?: boolean | undefined } = {}) => {
      const tailwindOptions = resolveTailwindcssOptions(runtimeState.tailwindRuntime.options)
      const configuredSourceFiles = new Set<string>()
      for (const entry of this.options.cssEntries ?? []) {
        configuredSourceFiles.add(path.resolve(entry))
      }
      for (const entry of tailwindOptions?.v4?.cssEntries ?? []) {
        configuredSourceFiles.add(path.resolve(entry))
      }
      for (const source of tailwindOptions?.v4?.cssSources ?? []) {
        if (source.file) {
          configuredSourceFiles.add(path.resolve(source.file))
        }
      }
      for (const file of webpackCssSources.keys()) {
        if (!activeSourceFiles.has(file) && !configuredSourceFiles.has(file)) {
          webpackCssSources.delete(file)
        }
      }
      for (const file of webpackGeneratedCssSources.keys()) {
        if (!activeSourceFiles.has(file) && !configuredSourceFiles.has(file)) {
          webpackGeneratedCssSources.delete(file)
        }
      }
    }
    const prepareWebpackCssSources = (activeAssetResources: ReadonlySet<string> = new Set()) => {
      const tailwindOptions = resolveTailwindcssOptions(runtimeState.tailwindRuntime.options)
      const configuredSourceFiles = new Set<string>()
      for (const entry of this.options.cssEntries ?? []) {
        configuredSourceFiles.add(path.resolve(entry))
      }
      for (const entry of tailwindOptions?.v4?.cssEntries ?? []) {
        configuredSourceFiles.add(path.resolve(entry))
      }
      for (const source of tailwindOptions?.v4?.cssSources ?? []) {
        if (source.file) {
          configuredSourceFiles.add(path.resolve(source.file))
        }
      }
      const activeSourceFiles = new Set([
        ...configuredSourceFiles,
        ...currentWebpackCssSourceModules,
        ...activeAssetResources,
        ...[...currentWebpackCssSourceFiles].filter(file => currentWebpackCssSourceModules.has(file)),
        ...[...currentWebpackCssSourceFiles].filter(file => activeAssetResources.has(file)),
      ])
      currentWebpackCssSourceFiles.clear()
      currentWebpackCssSourceModules.clear()
      return activeSourceFiles
    }
    const isWebpackProcessedTailwindEntryAsset = (isMainCssChunk?: boolean | undefined) => {
      if (
        isMainCssChunk !== true
        || webpackProcessedCssSourceFiles.size === 0
      ) {
        return false
      }
      const tailwindOptions = resolveTailwindcssOptions(runtimeState.tailwindRuntime.options)
      for (const entry of this.options.cssEntries ?? []) {
        if (webpackProcessedCssSourceFiles.has(path.resolve(entry))) {
          return true
        }
      }
      for (const entry of tailwindOptions?.v4?.cssEntries ?? []) {
        if (webpackProcessedCssSourceFiles.has(path.resolve(entry))) {
          return true
        }
      }
      for (const source of tailwindOptions?.v4?.cssSources ?? []) {
        if (source.file && webpackProcessedCssSourceFiles.has(path.resolve(source.file))) {
          return true
        }
      }
      return false
    }

    const loaderRuntimePreparation = createWebpackLoaderRuntimePreparation(async (isCurrent) => {
      const signature = getRuntimeClassSetSignature(runtimeState.tailwindRuntime)
      const forceRefresh = runtimeRefreshRequiredForCompilation || signature !== runtimeSetSignature
      debug('runtime loader ensure class set forceRefresh=%s watchDirty=%s signatureChanged=%s', forceRefresh, runtimeRefreshRequiredForCompilation, signature !== runtimeSetSignature)
      const runtimeSet = await ensureRuntimeClassSet(runtimeState, {
        forceRefresh,
        forceCollect: forceRefresh || !watchRunObserved,
        clearCache: forceRefresh,
        allowEmpty: true,
      })
      await ensureRuntimeMetadata(forceRefresh)
      if (isCurrent()) {
        runtimeSetSignature = signature
        runtimeRefreshRequiredForCompilation = false
      }
      return runtimeSet
    })

    compiler.hooks.invalid?.tap?.(pluginName, (fileName: string | null) => {
      if (!fileName) {
        return
      }
      runtimeRefreshRequiredForCompilation = runtimeRefreshRequiredForCompilation
        || hasRuntimeDependencyChanges([path.resolve(fileName)])
    })
    compiler.hooks.watchRun?.tap?.(pluginName, () => syncRuntimeRefreshRequirement(true))
    if (compiler.hooks.thisCompilation?.tap) {
      compiler.hooks.thisCompilation.tap(pluginName, resetRuntimePreparation)
    }
    else if (compiler.hooks.compilation?.tap) {
      compiler.hooks.compilation.tap(pluginName, resetRuntimePreparation)
    }

    async function getClassSetInLoader() {
      await loaderRuntimePreparation.getRuntimeSet()
    }

    const getRuntimeSetInLoader = loaderRuntimePreparation.getRuntimeSet

    onLoad()
    setupWebpackV5Loaders({
      compiler,
      options: this.options,
      appType: this.appType,
      weappTailwindcssPackageDir,
      shouldRewriteCssImports,
      runtimeLoaderPath,
      registerAutoCssSource,
      runtimeState,
      getClassSetInLoader,
      getRuntimeSetInLoader,
      markWebpackProcessedCssSource,
      markWebpackCssSourceModule,
      registerWebpackCssSourceFile,
      registerWebpackGeneratedCss,
      updateWebpackGeneratedCss,
      getRuntimeWatchDependencies() {
        return {
          files: runtimeWatchDependencyFiles,
          contexts: runtimeWatchDependencyContexts,
        }
      },
      loaderAnchorFinders: this.frameworkBranch.loaderAnchorFinders,
      mpxCssImportRewrite: this.frameworkBranch.mpxCssImportRewrite,
      debug,
    })

    setupWebpackV5ProcessAssetsHook({
      compiler,
      options: this.options,
      appType: this.appType,
      runtimeState,
      getRuntimeRefreshRequirement: () => runtimeRefreshRequiredForCompilation,
      refreshRuntimeMetadata: ensureRuntimeMetadata,
      isKnownWebpackProcessedCssAsset(file, metadata) {
        return webpackProcessedCssSourceFiles.has(path.resolve(file))
          || isWebpackProcessedTailwindEntryAsset(metadata?.isMainCssChunk)
      },
      isWebpackProcessedCssAsset(file, rawSource, metadata) {
        return webpackProcessedCssSourceFiles.has(path.resolve(file))
          || isWebpackProcessedTailwindEntryAsset(metadata?.isMainCssChunk)
          || hasTailwindGeneratedCss(rawSource)
          || hasTailwindGeneratedCssMarkers(rawSource)
          || rawSource.includes('weapp-tailwindcss webpack-generated-css')
      },
      consumeRuntimeRefreshRequirement() {
        runtimeRefreshRequiredForCompilation = false
      },
      isWatchMode: () => watchRunObserved || compiler.options?.watch === true,
      getWatchChangedFiles: collectWatchChangedFiles,
      getCompilationChangeRecord: () => compilationChangeRecord,
      runtimeClassSetManager: (this.options as any).__internalWebpackRuntimeClassSetManager,
      getWebpackCssSources: () => webpackCssSources,
      getWebpackGeneratedCssSources: () => webpackGeneratedCssSources,
      pruneWebpackCssSources,
      prepareWebpackCssSources,
      debug,
    })
    createBuiltinWebpackStyleInjectorPlugin(styleInjector, this.frameworkBranch.styleInjectorDelegate)?.apply(compiler)
  }
}
