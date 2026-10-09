import type { Plugin, ResolvedConfig } from 'vite'
import type { CssStage } from '@/compiler'
import type { InternalUserDefinedOptions, UserDefinedOptions } from '@/types'
import path from 'node:path'
import process from 'node:process'
import { getCompilerContext } from '@/context'
import { createDebug } from '@/debug'
import { normalizeTailwindConfigDirectives, normalizeTailwindSourceForGenerator } from '@/generation/directives'
import { normalizeEmptyTailwindCustomVariants } from '@/generation/user-css'
import { normalizeWeappTailwindcssGeneratorOptions } from '@/generator'
import { resolveGeneratorRuntimeBranch } from '@/runtime-branch'
import { resolvePackageDir } from '@/utils/resolve-package'
import { generateTailwindV4Css } from '../../../generation/service'
import { annotateCssSourceTrace, createCssTokenSourceMap, isCssSourceTraceEnabled } from '../../shared/css-source-trace'
import { createBundlerGeneratedCssMarker } from '../../shared/generated-css-marker'
import { createHmrTimingRecorder } from '../../shared/hmr-timing'
import { createViteCssAssetIdentityResolver } from '../css-asset-identity'
import { createViteCssCalcStage } from '../css-calc-stage'
import { createViteWebCssFinalizerOutputPlugin } from '../css-finalizer/web-plugin'
import { createCssHandlerOptionsCache } from '../css-handler-options'
import { createViteCssMemory } from '../css-memory'
import { resolveViteCssPipelineOutputFile } from '../css-output'
import { createRewriteCssImportsPlugins, hasVitePipelineTailwindGenerationDirective } from '../rewrite-css-imports'
import { createViteRuntimeClassSet } from '../runtime-class-set'
import { createViteCssGenerationPlugins } from '../serve-css-generation'
import { createSourceCandidateCollector, isSourceCandidateRequest } from '../source-candidates'
import { cleanUrl, isCSSRequest } from '../utils'
import { createFrameworkSourceCandidatesPluginForCssOnly } from './css-only-source-candidates'
import { createFrameworkCssGenerationQueue } from './framework-css-generation-queue'
import { createViteHmrCandidateState } from './framework-hmr-candidate-state'
import { createViteHmrCssModuleVersionFilterPlugin, createViteHmrCssModuleVersionTracker } from './framework-hmr-module-version'
import { createFrameworkPostPlugin } from './framework-post-plugin'
import { createFrameworkProcessedCssRegistry } from './framework-processed-css-registry'
import { createFrameworkRuntimeLifecycle } from './framework-runtime-lifecycle'
import { createFrameworkSourceScanSession } from './framework-source-scan-session'
import { createFrameworkTailwindRootCss } from './framework-tailwind-root-css'

const debug = createDebug()

function resolveWebGeneratorOptions(opts: InternalUserDefinedOptions) {
  return normalizeWeappTailwindcssGeneratorOptions(opts.generator, {
    appType: undefined,
    platform: 'web',
    tailwindcssMajorVersion: opts.tailwindRuntime.majorVersion,
    uniAppX: false,
  })
}

/** 创建不含 JS/template、分包和小程序 bundle 处理的 Generic Web Vite 插件。 */
export function createCssOnlyVitePlugins(
  options: UserDefinedOptions | InternalUserDefinedOptions = {},
): Plugin[] | undefined {
  const rawOptions = options as UserDefinedOptions
  let resolvedConfig: ResolvedConfig | undefined
  const originalOpts = 'tailwindRuntime' in options
    ? options as InternalUserDefinedOptions
    : getCompilerContext({
        ...rawOptions,
        appType: undefined,
        platform: 'web',
        generator: rawOptions.generator && typeof rawOptions.generator === 'object'
          ? { ...rawOptions.generator, target: 'web' }
          : { target: 'web' },
        __internalDeferMissingCssEntriesWarning: true,
        __internalViteDeferRuntimeLogs: true,
      } as UserDefinedOptions)
  const cssCalcStage = createViteCssCalcStage(originalOpts, () => resolvedConfig?.command === 'build')
  const opts = cssCalcStage.options
  const disabled = opts.disabled === true || (typeof opts.disabled === 'object' && opts.disabled.plugin === true)
  const shouldGenerate = !disabled && resolveWebGeneratorOptions(opts).enabled
  const sourceCandidateCollector = createSourceCandidateCollector({
    bareArbitraryValues: opts.arbitraryValues?.bareArbitraryValues,
    customAttributesEntities: opts.customAttributesEntities,
    disabledDefaultTemplateHandler: opts.disabledDefaultTemplateHandler,
  })
  const cssMemory = createViteCssMemory({ debug, getSourceCandidateSource: file => sourceCandidateCollector.source(file) })
  const hmrCssModuleVersions = createViteHmrCssModuleVersionTracker()
  const hmrTimingRecorder = createHmrTimingRecorder('vite')
  const runtimeClassSet = createViteRuntimeClassSet({
    opts,
    initialTailwindRuntime: opts.tailwindRuntime,
    refreshTailwindcssRuntime: opts.refreshTailwindcssRuntime,
    uniAppXEnabled: false,
    customAttributesEntities: opts.customAttributesEntities,
    disabledDefaultTemplateHandler: opts.disabledDefaultTemplateHandler,
    debug,
  })
  const { runtimeState, refreshRuntimeState } = runtimeClassSet
  const hmrCandidateState = createViteHmrCandidateState({
    cleanGeneratedCssByFile: new Map(),
    generatedClassSetByFile: new Map(),
    getCommand: () => resolvedConfig?.command,
    getGeneratorOptions: () => resolveWebGeneratorOptions(opts),
    isRuntimeAffectingSource: () => false,
  })
  let recordedCandidates: Set<string> | undefined
  const processedCssRegistry = createFrameworkProcessedCssRegistry()
  const processedCssAssets = new WeakSet<object>()
  const sourceScanSession = createFrameworkSourceScanSession({
    cssMemory,
    debug,
    getResolvedConfig: () => resolvedConfig,
    hmrCandidateState,
    isCandidateRequest: isSourceCandidateRequest,
    isWatchLikeBuild: () => resolvedConfig?.command === 'serve' || resolvedConfig?.build.watch != null,
    opts,
    runtimeState,
    shouldOwnTailwindGeneration: shouldGenerate,
    sourceCandidateCollector,
  })
  async function collectCssSourceCandidates() {
    await runtimeState.readyPromise
    await sourceScanSession.waitForPendingSyncs()
    // Web 只生成 CSS；候选来自构建图，CSS 声明的来源由生成器扫描，无需额外生成运行时类集合。
    return sourceCandidateCollector.values()
  }
  const tailwindRootCss = createFrameworkTailwindRootCss({
    getImportFallback: () => resolveWebGeneratorOptions(opts).importFallback,
    refreshRuntimeState: async () => { await refreshRuntimeState(true) },
    registerAutoCssSource: async (id, css) => {
      cssMemory.refreshRememberedCssSourceBySourceFile(id, normalizeTailwindSourceForGenerator(normalizeTailwindConfigDirectives(css, path.dirname(cleanUrl(id))), { importFallback: true }))
    },
    shouldOwnTailwindGeneration: shouldGenerate,
    sourceScanSession,
  })
  const { moduleIds: tailwindRootCssModuleIds, refreshSource: refreshTailwindRootCssSource, register: registerTailwindRootCss, rememberModule: rememberTailwindRootCssModule } = tailwindRootCss
  const cssHandlerOptions = createCssHandlerOptionsCache({
    getAppType: () => undefined,
    mainCssChunkMatcher: opts.mainCssChunkMatcher,
    getMajorVersion: () => runtimeState.tailwindRuntime.majorVersion,
    getOutputRoot: () => resolvedConfig?.root,
  })
  const generatedCssByFile = new Map<string, string>()
  const generateCss = createFrameworkCssGenerationQueue(
    id => cleanUrl(id),
    async (id: string, code: string, hookContext?: { sourceCandidates?: Iterable<string>, cssStage?: CssStage | undefined, addWatchFile?: (file: string) => void }) => {
      if (!shouldGenerate || !isCSSRequest(id)) {
        return undefined
      }
      await runtimeState.readyPromise
      await sourceScanSession.waitForPendingSyncs()
      const file = cleanUrl(id)
      const outputFile = resolveViteCssPipelineOutputFile(file, opts, resolvedConfig?.root ?? process.cwd(), true, false, undefined)
      const runtime = hookContext?.sourceCandidates ? new Set(hookContext.sourceCandidates) : await collectCssSourceCandidates()
      const generated = await generateTailwindV4Css({
        opts,
        runtimeState,
        runtime,
        compilerMode: 'legacy',
        rawSource: normalizeEmptyTailwindCustomVariants(code),
        file,
        outputFile,
        cssHandlerOptions: cssHandlerOptions.getCssHandlerOptions(file),
        cssUserHandlerOptions: cssHandlerOptions.getCssUserHandlerOptions(file),
        getSourceCandidatesForEntries: entries => sourceCandidateCollector.valuesForEntries(entries),
        generatorPlatform: 'web',
        styleHandler: opts.styleHandler,
        debug,
        cssStage: hookContext?.cssStage,
      })
      if (!generated) {
        return undefined
      }
      const tracedCss = annotateCssSourceTrace(generated.css, {
        opts,
        tokenSources: isCssSourceTraceEnabled(opts)
          ? createCssTokenSourceMap(sourceCandidateCollector.sourcesForEntries(undefined), opts)
          : undefined,
      })
      generatedCssByFile.set(file, tracedCss)
      processedCssRegistry.record(file, tracedCss, { injectIntoMain: opts.mainCssChunkMatcher(outputFile, undefined), outputFile })
      processedCssRegistry.markSource(file)
      recordedCandidates = new Set(runtime)
      for (const dependency of generated.dependencies) {
        hookContext?.addWatchFile?.(dependency)
      }
      return `${createBundlerGeneratedCssMarker('vite', file)}\n${tracedCss}`
    },
  )
  const rewritePlugins = createRewriteCssImportsPlugins({
    getAppType: () => undefined,
    generateTailwindCss: generateCss,
    rootImport: `${path.join(resolvePackageDir('weapp-tailwindcss'), 'generator-placeholder.css').replaceAll(path.sep, '/')}`,
    onTailwindRootCss: registerTailwindRootCss,
    onCssSourceTransform: (id, code) => cssMemory.refreshRememberedCssSourceBySourceFile(id, code),
    shouldGenerateCss: (_id, code) => hasVitePipelineTailwindGenerationDirective(code),
    shouldDeferGeneration: () => false,
    shouldOwnTailwindGeneration: shouldGenerate,
    shouldRewrite: opts.rewriteCssImports === true,
    weappTailwindcssDirPosix: path.dirname(path.resolve(process.cwd(), 'generator-placeholder.css')).replaceAll(path.sep, '/'),
  })
  if (disabled) {
    return rewritePlugins
  }
  const sourceCandidatesPlugin = createFrameworkSourceCandidatesPluginForCssOnly({
    cssMemory,
    hmrCandidateState,
    hmrCssModuleVersions,
    hmrTimingRecorder,
    invalidateRecordedGeneratorCandidates: () => { recordedCandidates = undefined },
    prepareTailwindGeneration: () => sourceScanSession.sync(),
    refreshRuntimeStateForAutoCssSources: async () => { await refreshRuntimeState(true) },
    refreshTailwindRootCssSource,
    rememberTailwindRootCssModule,
    resolveCurrentGeneratorBranch: () => resolveGeneratorRuntimeBranch(resolveWebGeneratorOptions(opts), { appType: undefined, platform: 'web', tailwindcssMajorVersion: runtimeState.tailwindRuntime.majorVersion, uniAppX: false }),
    resolveCurrentGeneratorOptions: () => resolveWebGeneratorOptions(opts),
    runtimeState,
    sourceCandidateCollector,
    sourceScanSession,
    tailwindRootCssModuleIds,
    viteProcessedCssSourceFiles: processedCssRegistry.sourceFiles,
  })
  const postPlugin = createFrameworkPostPlugin({
    debug,
    generateBundleHook: undefined,
    generatorPlaceholderCssFile: path.join(resolvePackageDir('weapp-tailwindcss'), 'generator-placeholder.css'),
    hasExplicitTailwindcssBasedir: false,
    hasExplicitGeneratorTarget: true,
    frameworkName: 'generic',
    hmrTimingRecorder,
    opts,
    resolveViteStylePlatform: () => 'web',
    refreshRuntimeState: async () => { await refreshRuntimeState(true) },
    setResolvedConfig: (config: ResolvedConfig) => { resolvedConfig = config },
    shouldInferAppType: false,
    shouldOwnTailwindGeneration: shouldGenerate,
    syncCssEntriesFromAnchor: () => false,
  })
  const finalizer = createViteWebCssFinalizerOutputPlugin({
    opts,
    getFinalCssCalcOptions: cssCalcStage.getFinalOptions,
    runtimeState,
    ensureRuntimeClassSet: collectCssSourceCandidates,
    debug,
    frameworkName: 'generic',
    getResolvedConfig: () => resolvedConfig,
    markCssAssetProcessed: (asset) => { processedCssAssets.add(asset) },
    isCssAssetProcessed: asset => processedCssAssets.has(asset),
    isViteProcessedCssAsset: () => true,
    resolveCssAssetIdentity: createViteCssAssetIdentityResolver({ generatorPlaceholderFile: path.join(resolvePackageDir('weapp-tailwindcss'), 'generator-placeholder.css'), getProjectRoot: () => resolvedConfig?.root, isKnownProcessedSource: processedCssRegistry.matchesIdentity }),
    recordCssAssetResult: (file, css) => { generatedCssByFile.set(file, css) },
    recordViteProcessedCssAssetResult: processedCssRegistry.record,
    getViteProcessedCssAssetResults: processedCssRegistry.entries,
    getRecordedGeneratorCandidates: () => recordedCandidates,
    getSourceCandidates: () => sourceCandidateCollector.values(),
    getSourceCandidatesForEntries: entries => sourceCandidateCollector.valuesForEntries(entries),
    getSourceCandidateSourcesForEntries: entries => sourceCandidateCollector.sourcesForEntries(entries),
    waitForSourceCandidateSyncs: sourceScanSession.waitForPendingSyncs,
    hmrTimingRecorder,
  })
  const plugins: Plugin[] = [
    ...rewritePlugins,
    sourceCandidatesPlugin,
    ...createViteCssGenerationPlugins({ generateCss, getCommand: () => resolvedConfig?.command, onTailwindRootCss: registerTailwindRootCss, shouldGenerate: () => shouldGenerate, shouldGenerateBuild: () => true }),
    postPlugin,
    finalizer,
    createViteHmrCssModuleVersionFilterPlugin(hmrCssModuleVersions),
  ]
  const styleInjectorFactory = (options as any).__internalViteWebStyleInjectorFactory
  if (opts.styleInjector !== undefined && typeof styleInjectorFactory === 'function') {
    plugins.push(...styleInjectorFactory(opts.styleInjector))
  }
  plugins.push(createFrameworkRuntimeLifecycle({
    getResolvedConfig: () => resolvedConfig,
    async dispose() {
      await generateCss.dispose()
      try {
        await sourceScanSession.dispose()
      }
      finally {
        tailwindRootCss.dispose()
        runtimeState.dispose()
        cssMemory.dispose()
        processedCssRegistry.dispose()
        generatedCssByFile.clear()
        recordedCandidates = undefined
      }
    },
  }))
  return plugins
}
