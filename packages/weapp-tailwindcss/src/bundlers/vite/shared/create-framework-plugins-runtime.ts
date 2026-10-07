/* eslint-disable style/max-statements-per-line, style/no-mixed-operators */
import type { OutputAsset } from 'rollup'
import type { HmrContext, Plugin, ResolvedConfig } from 'vite'
import type { ViteCapabilityProfile } from '../capability-profile'
import type { CssFinalizerContext } from '../css-finalizer/options'
import type { GenerateBundleContext } from '../generate-bundle/types'
import type { SourceCandidateCollector } from '../source-candidates'
import type { ViteFrameworkBranchContext } from './create-framework-plugins'
import type { ViteFrameworkRuntimeOptions } from './framework-runtime-options'
import type { InternalUserDefinedOptions } from '@/types'
import path from 'node:path'
import process from 'node:process'
import { compileCssMacroConditionalComments, unwrapUnsupportedCascadeLayers } from '@weapp-tailwindcss/postcss/transform'
import { vitePluginName } from '@/constants'
import { getCompilerContext } from '@/context'
import { toCustomAttributesEntities } from '@/context/custom-attributes'
import { createDebug } from '@/debug'
import { hasTailwindRootDirectives } from '@/generation/directives'
import { hasUserCssLayerBlocks } from '@/generation/user-css'
import { normalizeWeappTailwindcssGeneratorOptions } from '@/generator'
import { resolveGeneratorRuntimeBranch } from '@/runtime-branch'
import { createBuiltinViteStyleInjectorPlugins } from '@/style-injector/internal'
import { extractCandidatesFromSource } from '@/tailwindcss/candidates'
import { hasConfiguredTailwindV4CssRoots } from '@/tailwindcss/v4/css-sources'
import { resolvePluginDisabledState } from '@/utils/disabled'
import { resolvePackageDir } from '@/utils/resolve-package'
import { isCssSourceTraceEnabled } from '../../shared/css-source-trace'
import { createHmrTimingRecorder } from '../../shared/hmr-timing'
import { frameworkViteCapabilityProfile } from '../capability-profile'
import { createViteCssAssetIdentityResolver } from '../css-asset-identity'
import { createViteCssCalcStage } from '../css-calc-stage'
import { createViteCssFinalizerOutputPlugin } from '../css-finalizer'
import { createViteWebCssFinalizerOutputPlugin } from '../css-finalizer/web-plugin'
import { createCssHandlerOptionsCache, resolveViteCssHandlerExtraOptions } from '../css-handler-options'
import { createGenerateBundleHook } from '../generate-bundle'
import { createJsHandlerOptionsFactory } from '../generate-bundle/js-handler-options'
import { normalizeVitePersistentCacheKey } from '../plugin-cache'
import { createRewriteCssImportsPlugins, hasVitePipelineTailwindGenerationDirective } from '../rewrite-css-imports'
import { createViteRuntimeClassSet } from '../runtime-class-set'
import { installRuntimeClassSetLifecycle } from '../runtime-class-set/lifecycle'
import { createViteCssGenerationPlugins } from '../serve-css-generation'
import { createViteServeJsTransformPlugin } from '../serve-js-transform'
import { createSourceCandidateCollector, isSourceCandidateRequest } from '../source-candidates'
import { cleanUrl, slash } from '../utils'
import { shouldAdaptFrameworkWatchCssBeforeCache } from '../watch-css-post'
import { createConfiguredCssEntryDiagnostics } from './configured-css-entry-observer'
import { createFrameworkCssAssets } from './framework-css-assets'
import { createFrameworkCssEmissionFinalizerPlugin } from './framework-css-emission'
import { createFrameworkCssGenerator } from './framework-css-generator'
import { createViteHmrCandidateState } from './framework-hmr-candidate-state'
import { createViteHmrCssModuleVersionFilterPlugin, createViteHmrCssModuleVersionTracker } from './framework-hmr-module-version'
import { createFrameworkModuleCandidateRegistrar } from './framework-module-candidates'
import { orderFrameworkSourceCandidatePlugins } from './framework-plugin-order'
import { createFrameworkPostPlugin } from './framework-post-plugin'
import { createFrameworkCssEntrySync, resolveFrameworkStylePlatform } from './framework-runtime-configuration'
import { createFrameworkRuntimeLifecycle } from './framework-runtime-lifecycle'
import { collectConfiguredCssEntries, isInternalUserDefinedOptions, isNuxtPageHotModule, isWebOrNativeAppPlatform } from './framework-runtime-utils'
import { createFrameworkSourceCandidatesPlugin } from './framework-source-candidates-plugin'
import { createFrameworkSourceDiscovery } from './framework-source-discovery'
import { createFrameworkSourceScanSession, syncFrameworkSourceCandidatesForHotUpdate } from './framework-source-scan-session'
import { createFrameworkTailwindRootCss } from './framework-tailwind-root-css'
import { createFrameworkWatchCssCacheAdapter } from './framework-watch-css-adapter'
import { createGenericWebProductionBundleHooks, createGenericWebProductionSourceCandidatesApply, shouldSkipGenericWebProductionSourceCandidates } from './generic-web-production-fast-path'

const debug = createDebug()
const weappTailwindcssPackageDir = resolvePackageDir('weapp-tailwindcss'); const weappTailwindcssDirPosix = slash(weappTailwindcssPackageDir); const generatorPlaceholderCssFile = path.join(weappTailwindcssPackageDir, 'generator-placeholder.css')
export function createViteFrameworkPlugins(options: ViteFrameworkRuntimeOptions = {}, frameworkBranch: ViteFrameworkBranchContext): any {
  debug('create vite framework plugins framework=%s', frameworkBranch.frameworkName)
  const capability: ViteCapabilityProfile = options.__internalViteCapabilityProfile ?? frameworkViteCapabilityProfile
  const rawOptions = options.__internalViteRawOptions ?? options
  const hasExplicitAppType = typeof options.__internalViteRawExplicitAppType === 'boolean' ? options.__internalViteRawExplicitAppType : typeof options.appType === 'string' && options.appType.trim().length > 0
  const hasExplicitTailwindcssBasedir = typeof options.__internalViteRawExplicitTailwindcssBasedir === 'boolean' ? options.__internalViteRawExplicitTailwindcssBasedir : typeof options.tailwindcssBasedir === 'string' && options.tailwindcssBasedir.trim().length > 0
  const rawCssEntries = collectConfiguredCssEntries(rawOptions)
  const deferredOptions = { ...options, __internalDeferMissingCssEntriesWarning: true }
  let resolvedConfig: ResolvedConfig | undefined
  const originalOpts = isInternalUserDefinedOptions(options) ? options : getCompilerContext(deferredOptions)
  const cssCalcStage = createViteCssCalcStage(originalOpts, () => resolvedConfig?.command === 'build', () => resolveFrameworkStylePlatform(originalOpts, resolvedConfig?.build?.outDir))
  const opts = cssCalcStage.options
  const syncCssEntriesFromAnchor = createFrameworkCssEntrySync(opts, rawCssEntries)
  syncCssEntriesFromAnchor(opts.tailwindcssBasedir)
  const { disabled, customAttributes, onLoad, mainCssChunkMatcher, styleHandler, jsHandler, tailwindRuntime, refreshTailwindcssRuntime, uniAppX, disabledDefaultTemplateHandler, styleInjector } = opts
  const initialTailwindRuntime = tailwindRuntime
  const refreshTailwindRuntime = refreshTailwindcssRuntime
  const frameworkCssPipelineStrategy = frameworkBranch.cssPipelineStrategy
  const uniAppXEnabled = frameworkBranch.isRuntimeClassSetFeatureEnabled?.({ uniAppX }) === true
  const shouldEnableFrameworkExtraPlugins = () => capability.frameworkExtras && frameworkBranch.createExtraPlugins !== void 0
  const disabledOptions = resolvePluginDisabledState(disabled)
  const tailwindcssMajorVersion = initialTailwindRuntime.majorVersion ?? 0
  if (!disabledOptions.plugin && tailwindcssMajorVersion !== 4) {
    throw new Error('weapp-tailwindcss/vite \u65B0\u751F\u6210\u7BA1\u7EBF\u4EC5\u652F\u6301 Tailwind CSS v4\uFF0C\u8BF7\u5347\u7EA7 tailwindcss \u6216\u505C\u7559\u5728\u65E7\u7248 weapp-tailwindcss\u3002')
  }
  const shouldRewriteCssImports = opts.rewriteCssImports === true
  const { observer: webCssEntryDiagnostics, plugin: webCssEntryObserverPlugin } = createConfiguredCssEntryDiagnostics({ getEntries: () => opts.cssEntries, getRoot: () => resolvedConfig?.root, isWeb: () => resolveCurrentGeneratorBranch().isWeb }); const hmrCssModuleVersions = createViteHmrCssModuleVersionTracker()
  const resolveViteStylePlatform = () => resolveFrameworkStylePlatform(opts, resolvedConfig?.build?.outDir)
  const resolveGeneratorPlatform = () => opts.cssOptions?.platform ?? opts.platform ?? resolveViteStylePlatform()
  const resolveCurrentGeneratorOptions = () => normalizeWeappTailwindcssGeneratorOptions(opts.generator, { appType: opts.appType, platform: resolveGeneratorPlatform(), tailwindcssMajorVersion, uniAppX })
  const shouldOwnTailwindGeneration = !disabledOptions.plugin && resolveCurrentGeneratorOptions().enabled
  const resolveCurrentGeneratorBranch = () => resolveGeneratorRuntimeBranch(resolveCurrentGeneratorOptions(), { appType: opts.appType, platform: resolveGeneratorPlatform(), tailwindcssMajorVersion, uniAppX })
  const createCssPipelineContext = (overrides = {}) => ({ currentGeneratorBranch: resolveCurrentGeneratorBranch(), currentGeneratorOptions: resolveCurrentGeneratorOptions(), opts, resolvedConfig, resolveStylePlatform: resolveViteStylePlatform, ...overrides })
  const initialGeneratorBranch = resolveCurrentGeneratorBranch()
  const transformEarlyMiniProgramCss = (code: string) => {
    const platform = resolveViteStylePlatform(); if (!shouldOwnTailwindGeneration || (platform ? isWebOrNativeAppPlatform(platform) : resolveCurrentGeneratorBranch().isWeb)) {
      return code
    } let transformedCode = code; if (transformedCode.includes('#if')) {
      transformedCode = compileCssMacroConditionalComments(transformedCode, { ...(platform ? { platform } : {}) })
    } if (transformedCode.includes('@layer')) {
      transformedCode = unwrapUnsupportedCascadeLayers(transformedCode)
    } return transformedCode
  }
  const finalizeViteMiniProgramCss = (css: string) => {
    const platform = resolveViteStylePlatform(); if (!shouldOwnTailwindGeneration || (platform ? isWebOrNativeAppPlatform(platform) : resolveCurrentGeneratorBranch().isWeb)) {
      return css
    } return unwrapUnsupportedCascadeLayers(css)
  }
  const shouldInferAppType = !hasExplicitAppType && !initialGeneratorBranch.isWeb
  const hasInitialTailwindCssRoots = hasConfiguredTailwindV4CssRoots({ ...rawOptions, cssEntries: opts.cssEntries ?? rawOptions.cssEntries })
  const customAttributesEntities = toCustomAttributesEntities(customAttributes)
  let recordedGeneratorCandidates: Set<string> | undefined
  const sourceCandidateCollector = createSourceCandidateCollector({ bareArbitraryValues: opts.arbitraryValues?.bareArbitraryValues, customAttributesEntities, disabledDefaultTemplateHandler })
  const cssAssets = createFrameworkCssAssets({ debug, getSourceCandidateSource: file => sourceCandidateCollector.source(file) })
  const { originalCssLayerSourceByFile, rememberOriginalCssLayerSource, cleanGeneratedCssByFile, generatedClassSetByFile, processedCssRegistry, cssMemory, markCssAssetProcessed, isCssAssetProcessed, recordCssAssetResult, recordViteProcessedCssAssetResult, getViteProcessedCssAssetResults, getViteProcessedCssAssetResult, pruneViteCssCaches, frameworkRootImportShellTargetByFile } = cssAssets
  const { runtimeState, refreshRuntimeState, invalidateRuntimeClassSet, ensureRuntimeClassSet, ensureBundleRuntimeClassSet } = createViteRuntimeClassSet({ opts, initialTailwindRuntime, refreshTailwindcssRuntime: refreshTailwindRuntime, uniAppXEnabled, customAttributesEntities, disabledDefaultTemplateHandler, debug })
  const hmrTimingRecorder = createHmrTimingRecorder('vite')
  const refreshRuntimeStateForAutoCssSources = refreshRuntimeState
  onLoad()
  const getResolvedConfig = () => resolvedConfig
  const recordGeneratorCandidates = (candidates: Iterable<string>) => { recordedGeneratorCandidates = new Set(candidates) }
  const getRecordedGeneratorCandidates = () => recordedGeneratorCandidates
  const invalidateRecordedGeneratorCandidates = () => { recordedGeneratorCandidates = void 0 }
  const getSourceCandidates = () => sourceCandidateCollector.values()
  const getSourceCandidatesForEntries: SourceCandidateCollector['valuesForEntries'] = (entries, options2) => sourceCandidateCollector.valuesForEntries(entries, options2)
  const getSourceCandidateSourcesForEntries: SourceCandidateCollector['sourcesForEntries'] = (entries, options2) => sourceCandidateCollector.sourcesForEntries(entries, options2)
  const isWatchBuild = () => resolvedConfig?.command === 'build' && resolvedConfig.build.watch != null
  const isWatchLikeBuild = () => isWatchBuild() || resolvedConfig?.command === 'serve' || process.env['WEAPP_TW_WATCH_REGRESSION'] === '1' || process.env['WEAPP_TW_HMR_TIMING'] === '1'
  const shouldSkipSourceCandidateState = () => shouldSkipGenericWebProductionSourceCandidates({ command: resolvedConfig?.command, frameworkName: frameworkBranch.frameworkName, isWebGeneratorTarget: resolveCurrentGeneratorBranch().isWeb, requiresSourceCandidateState: isCssSourceTraceEnabled(opts), watch: resolvedConfig?.build?.watch })
  const isCurrentWebLikeStylePlatform = () => { const platform = resolveViteStylePlatform(); return platform ? isWebOrNativeAppPlatform(platform) : resolveCurrentGeneratorBranch().isWeb }
  const normalizeGeneratedCssCacheFile = (file: string) => normalizeVitePersistentCacheKey(cleanUrl(file))
  const hmrCandidateState = createViteHmrCandidateState({
    cleanGeneratedCssByFile,
    generatedClassSetByFile,
    getCommand: () => resolvedConfig?.command,
    getGeneratorOptions: resolveCurrentGeneratorOptions,
    isRuntimeAffectingSource: file => uniAppXEnabled
      && !resolveCurrentGeneratorBranch().isWeb
      && /\.(?:uvue|nvue)$/i.test(cleanUrl(file)),
  })
  const sourceScanSession = createFrameworkSourceScanSession({
    cssMemory,
    debug,
    getResolvedConfig: () => resolvedConfig,
    hmrCandidateState,
    isCandidateRequest: isSourceCandidateRequest,
    isWatchLikeBuild,
    opts,
    runtimeState,
    shouldOwnTailwindGeneration,
    sourceCandidateCollector,
  })
  const sourceDiscovery = createFrameworkSourceDiscovery({ opts, hasInitialTailwindCssRoots, shouldOwnTailwindGeneration, tailwindcssMajorVersion, weappTailwindcssPackageDir, debug, sourceCandidateCollector, sourceScanSession, cssMemory, refreshRuntimeState, getResolvedConfig })
  const { registerAutoCssSource, transientAutoCssSources, discoverAndRegisterAutoCssSources } = sourceDiscovery
  const tailwindRootCss = createFrameworkTailwindRootCss({ getImportFallback: () => resolveCurrentGeneratorOptions().importFallback, refreshRuntimeState, registerAutoCssSource, shouldOwnTailwindGeneration, sourceScanSession })
  const { moduleIds: tailwindRootCssModuleIds, refreshSource: refreshTailwindRootCssSource, register: registerTailwindRootCss, rememberModule: rememberTailwindRootCssModule } = tailwindRootCss
  const getViteCssCacheStats = () => ({ ...cssAssets.getStats(), ...sourceScanSession.getStats() })
  const normalizeViteProcessedCssFile = (file: string) => path.resolve(cleanUrl(file))
  const markViteProcessedCssSource = processedCssRegistry.markSource
  const isUniViteProject = () => { return resolvedConfig?.plugins?.some(plugin => plugin.name.includes('uni')) ?? false }
  const resolveCssAssetIdentity = createViteCssAssetIdentityResolver({ generatorPlaceholderFile: generatorPlaceholderCssFile, isKnownProcessedSource: processedCssRegistry.matchesIdentity })
  const isViteProcessedCssAsset = (asset: OutputAsset, file?: string) => resolveCssAssetIdentity(asset, file).kind === 'bundler-generated'
  const transformCssHandlerOptions = createCssHandlerOptionsCache({ getAppType: () => opts.appType, mainCssChunkMatcher, getMajorVersion: () => runtimeState.tailwindRuntime.majorVersion, getOutputRoot: () => resolvedConfig?.build?.outDir ? path.resolve(resolvedConfig.root, resolvedConfig.build.outDir) : resolvedConfig?.root, getExtraOptions: file => ({ ...resolveViteCssHandlerExtraOptions(file), ...frameworkCssPipelineStrategy?.getCssHandlerExtraOptions?.({ ...createCssPipelineContext(), file }) ?? {} }), getDynamicCssOptions: () => ({ cssPreflight: opts.cssPreflight }) })
  const serveJsHandlerOptions = createJsHandlerOptionsFactory({ getExperimentalJsFastPath: () => opts.experimentalJsFastPath ?? 'oxc', getMajorVersion: () => runtimeState.tailwindRuntime.majorVersion, moduleGraph: void 0 })
  const shouldAdaptFrameworkWatchCss = () => { const platform = resolveViteStylePlatform(); return shouldAdaptFrameworkWatchCssBeforeCache({ enabled: frameworkBranch.adaptWatchCssBeforeFrameworkCache === true, ownsTailwindGeneration: shouldOwnTailwindGeneration, isWatchBuild: isWatchBuild(), isWebGeneratorBranch: resolveCurrentGeneratorBranch().isWeb, platform }) }
  const generateTailwindCssForVitePipeline = createFrameworkCssGenerator({ ...cssAssets, opts, runtimeState, shouldOwnTailwindGeneration, sourceScanSession, getResolvedConfig, resolveCurrentGeneratorOptions, resolveCurrentGeneratorBranch, createCssPipelineContext, frameworkCssPipelineStrategy, normalizeGeneratedCssCacheFile, getSourceCandidates, getRecordedGeneratorCandidates, ensureRuntimeClassSet, hmrCandidateState, getSourceCandidatesForEntries, getSourceCandidateSourcesForEntries, markViteProcessedCssSource, rememberTailwindRootCssModule, recordGeneratorCandidates, debug, normalizeViteProcessedCssFile, transformCssHandlerOptions, transientAutoCssSources, hmrTimingRecorder, resolveGeneratorPlatform, styleHandler, shouldAdaptFrameworkWatchCss, finalizeViteMiniProgramCss, mainCssChunkMatcher })
  const shouldDeferFrameworkPreTransformGeneration = (id: string, code: string) => frameworkCssPipelineStrategy?.shouldDeferPreTransformTailwindGeneration?.({ ...createCssPipelineContext(), code, id }) === true
  const rewritePlugins = createRewriteCssImportsPlugins({ getAppType: () => opts.appType, generateTailwindCss: generateTailwindCssForVitePipeline, rootImport: shouldOwnTailwindGeneration ? `${weappTailwindcssDirPosix}/generator-placeholder.css` : void 0, onTailwindRootCss: registerTailwindRootCss, onCssSourceTransform: (id, code) => cssMemory.refreshRememberedCssSourceBySourceFile(id, code), shouldGenerateCss: (_id, code) => hasVitePipelineTailwindGenerationDirective(code), shouldDeferGeneration: (id, code) => !shouldRewriteCssImports && hasTailwindRootDirectives(code, { importFallback: resolveCurrentGeneratorOptions().importFallback }) || shouldDeferFrameworkPreTransformGeneration(id, code), shouldOwnTailwindGeneration, shouldRewrite: shouldRewriteCssImports, weappTailwindcssDirPosix })
  if (disabledOptions.plugin) {
    return rewritePlugins.length ? rewritePlugins : void 0
  }
  const generateBundleContext: GenerateBundleContext = { opts, runtimeState, ensureRuntimeClassSet, ensureBundleRuntimeClassSet, debug, getResolvedConfig, markCssAssetProcessed, isCssAssetProcessed, isViteProcessedCssAsset, resolveCssAssetIdentity, recordCssAssetResult, recordViteProcessedCssAssetResult, getViteProcessedCssAssetResults, getViteProcessedCssAssetResult, getSourceCandidates, getSourceCandidateSource: file => sourceCandidateCollector.source(file), getSourceCandidateSources: () => sourceCandidateCollector.sources(), extractSourceCandidates: (file, source) => extractCandidatesFromSource(source, path.extname(cleanUrl(file)).slice(1) || 'html', { bareArbitraryValues: opts.arbitraryValues?.bareArbitraryValues, customAttributesEntities, disabledDefaultTemplateHandler }), getSourceCandidatesForEntries, getSourceCandidateSourcesForEntries, waitForSourceCandidateSyncs: sourceScanSession.waitForPendingSyncs, rememberCssSource: cssMemory.rememberCssSource, getRememberedCssSources: cssMemory.getRememberedCssSources, getRememberedCssSignature: cssMemory.getRememberedCssSignature, setRememberedCssSignature: cssMemory.setRememberedCssSignature, getKnownCssSource: cssMemory.getKnownCssSource, getKnownSfcSource: cssMemory.getKnownSfcSource, getOriginalCssLayerSource: file => originalCssLayerSourceByFile.get(cleanUrl(file)), recordGeneratorCandidates, pruneViteCssCaches, getViteCssCacheStats, hmrTimingRecorder, cssPipelineStrategy: frameworkCssPipelineStrategy, frameworkRootImportShellTargetByFile }
  const shouldSplitGenerateBundlePhases = () => opts.appType === 'weapp-vite' && getResolvedConfig()?.mode !== 'production'
  const preGenerateBundleHook = capability.cssOnly ? undefined : createGenerateBundleHook({ ...generateBundleContext, processMarkupAndScripts: false, shouldProcessBundle: shouldSplitGenerateBundlePhases })
  const generateBundleHook = capability.cssOnly ? undefined : createGenerateBundleHook({ ...generateBundleContext, ...createGenericWebProductionBundleHooks({ frameworkName: frameworkBranch.frameworkName, getHasProcessedCss: () => processedCssRegistry.getStats().viteProcessedCssAssetResults > 0, getIsWebGeneratorTarget: () => resolveCurrentGeneratorBranch().isWeb, getResolvedConfig, onEnd: opts.onEnd, onStart: opts.onStart }), shouldProcessStyles: () => !shouldSplitGenerateBundlePhases() })
  const cssFinalizerContext: CssFinalizerContext = { opts, getFinalCssCalcOptions: cssCalcStage.getFinalOptions, runtimeState, ensureRuntimeClassSet, cssPipelineStrategy: frameworkCssPipelineStrategy, debug, frameworkName: frameworkBranch.frameworkName, getResolvedConfig, hmrTimingRecorder, markCssAssetProcessed, isCssAssetProcessed, isViteProcessedCssAsset, resolveCssAssetIdentity, recordCssAssetResult, recordViteProcessedCssAssetResult, getViteProcessedCssAssetResults, getRecordedGeneratorCandidates, getSourceCandidates, getSourceCandidatesForEntries, getSourceCandidateSourcesForEntries, waitForSourceCandidateSyncs: sourceScanSession.waitForPendingSyncs, frameworkRootImportShellTargetByFile, rememberMainCssSource: (file, rawSource) => cssMemory.rememberCssSource({ outputFile: file, rawSource, sourceFile: file }), getRememberedMainCssSource: cssMemory.getRememberedCssSourceEntry }
  const cssFinalizerOutputPlugin = capability.cssOnly ? createViteWebCssFinalizerOutputPlugin(cssFinalizerContext) : createViteCssFinalizerOutputPlugin(cssFinalizerContext)
  const extraPluginPlatform = frameworkBranch.getExtraPluginPlatform?.() ?? {}; const syncSourceCandidatesForHotUpdate = (ctx: HmrContext) => syncFrameworkSourceCandidatesForHotUpdate(sourceScanSession, ctx); const registerModuleGraphCandidates = createFrameworkModuleCandidateRegistrar({ cacheCurrent: sourceScanSession.cacheCurrent, debug, getCssHandlerOptions: transformCssHandlerOptions.getCssHandlerOptions, getGeneratorPlatform: resolveGeneratorPlatform, invalidateRecordedGeneratorCandidates, opts, runtimeState, sourceCandidateCollector, styleHandler })
  const prepareTailwindGeneration = async () => {
    if (sourceScanSession.shouldDiscoverAutoCssSources(sourceDiscovery.isDiscovered())) {
      await discoverAndRegisterAutoCssSources()
    } await sourceScanSession.sync()
  }
  const extraPlugins = capability.frameworkExtras ? frameworkBranch.createExtraPlugins?.({ cssPreflight: (opts as InternalUserDefinedOptions).cssPreflight, cssPreflightRange: (opts as InternalUserDefinedOptions).cssPreflightRange, customAttributesEntities, disabledDefaultTemplateHandler, ensureRuntimeClassSet, generateCss: generateTailwindCssForVitePipeline, getResolvedConfig, hmrCssModuleVersions, isEnabled: shouldEnableFrameworkExtraPlugins, isIosPlatform: extraPluginPlatform.isIosPlatform === true, isNativeAppStyleTarget: () => frameworkCssPipelineStrategy?.isNativeAppStyleTarget?.(createCssPipelineContext()) === true, isWebGeneratorTarget: () => resolveCurrentGeneratorBranch().isWeb, jsHandler, mainCssChunkMatcher, registerModuleGraphCandidates, runtimeState, styleHandler, syncSourceCandidatesForHotUpdate, tailwindRootCssModuleIds, uniAppX, viteProcessedCssSourceFiles: processedCssRegistry.sourceFiles, webCssEntryDiagnostics }) ?? [] : []
  const installFrameworkWatchCssCacheAdapter = createFrameworkWatchCssCacheAdapter({
    shouldAdapt: shouldAdaptFrameworkWatchCss,
    getKnownSfcSource: cssMemory.getKnownSfcSource,
    getCssHandlerOptions: transformCssHandlerOptions.getCssHandlerOptions,
    styleHandler,
    debug,
  })
  /* eslint-disable antfu/consistent-list-newline */
  const sourceCandidatesPlugin = createFrameworkSourceCandidatesPlugin({
    cssMemory, hasUserCssLayerBlocks, hmrCandidateState, hmrCssModuleVersions, hmrTimingRecorder, invalidateRecordedGeneratorCandidates,
    isCurrentWebLikeStylePlatform, isNuxtPageHotModule, isUniViteProject, isWebOrNativeAppPlatform,
    prepareTailwindGeneration, preGenerateBundleHook, refreshRuntimeStateForAutoCssSources, refreshTailwindRootCssSource,
    rememberOriginalCssLayerSource, rememberTailwindRootCssModule, resolveCurrentGeneratorBranch, resolveCurrentGeneratorOptions,
    resolveViteStylePlatform, runtimeState, shouldOwnTailwindGeneration, sourceCandidateCollector, sourceScanSession,
    tailwindRootCssModuleIds, transformEarlyMiniProgramCss, viteProcessedCssSourceFiles: processedCssRegistry.sourceFiles,
    collectSourceCandidates: capability.sourceCandidates,
    shouldSkipSourceCandidateState,
  }, createGenericWebProductionSourceCandidatesApply({ frameworkName: frameworkBranch.frameworkName, getIsWebGeneratorTarget: () => resolveCurrentGeneratorBranch().isWeb, requiresSourceCandidateState: isCssSourceTraceEnabled(opts) }))
  /* eslint-enable antfu/consistent-list-newline */
  const transformEmittedWebCss = frameworkCssPipelineStrategy?.transformEmittedWebCss
  const postPlugin = createFrameworkPostPlugin({
    api: {
      registerProcessedCssAsset(entry: {
        css: string
        injectIntoMain?: boolean
        outputFile: string
        sourceFile: string
      }) {
        markViteProcessedCssSource(entry.sourceFile)
        recordViteProcessedCssAssetResult(entry.sourceFile, entry.css, {
          injectIntoMain: entry.injectIntoMain,
          outputFile: entry.outputFile,
        })
      },
    },
    debug,
    generateBundleHook,
    generatorPlaceholderCssFile,
    hasExplicitTailwindcssBasedir,
    hasExplicitGeneratorTarget: typeof options.__internalViteRawExplicitGeneratorTarget === 'boolean' ? options.__internalViteRawExplicitGeneratorTarget : false,
    frameworkName: frameworkBranch.frameworkName,
    hmrTimingRecorder,
    opts,
    resolveViteStylePlatform,
    refreshRuntimeState,
    getResolvedConfig: () => resolvedConfig,
    setResolvedConfig: (config: ResolvedConfig) => { resolvedConfig = config },
    shouldInferAppType,
    shouldOwnTailwindGeneration,
    syncCssEntriesFromAnchor,
    transformEmittedWebCss: transformEmittedWebCss
      ? (css: string) => transformEmittedWebCss(css, createCssPipelineContext())
      : undefined,
    shouldRehashEmittedWebCssAsset: frameworkCssPipelineStrategy?.shouldRehashEmittedWebCssAsset,
  })
  const sourceAndRewritePlugins = orderFrameworkSourceCandidatePlugins(extraPlugins, rewritePlugins, sourceCandidatesPlugin, frameworkBranch.sourceCandidatesBeforeExtraPlugin)
  const serveJsPlugin = capability.serveJsTransform ? createViteServeJsTransformPlugin({ createHandlerOptions: file => serveJsHandlerOptions(file, frameworkCssPipelineStrategy?.getServeJsHandlerOptions?.({ ...createCssPipelineContext(), file })), getCommand: () => resolvedConfig?.command, jsHandler, shouldTransform: () => shouldOwnTailwindGeneration && (frameworkCssPipelineStrategy?.shouldTransformServeJs?.(createCssPipelineContext()) ?? !resolveCurrentGeneratorBranch().isWeb), transformRuntime: (id, code) => registerModuleGraphCandidates(id, code, 'js') }) : undefined
  const plugins: Plugin[] = [...sourceAndRewritePlugins, webCssEntryObserverPlugin, ...createViteCssGenerationPlugins({ generateCss: generateTailwindCssForVitePipeline, getCommand: () => resolvedConfig?.command, onTailwindRootCss: registerTailwindRootCss, shouldDeferGeneration: shouldDeferFrameworkPreTransformGeneration, shouldGenerate: () => shouldOwnTailwindGeneration, shouldGenerateBuild: () => resolveCurrentGeneratorBranch().isWeb }), ...(serveJsPlugin ? [serveJsPlugin] : []), ...(capability.cssOnly ? [] : [{ name: `${vitePluginName}:watch-css-cache`, configResolved: { order: 'post' as const, handler: installFrameworkWatchCssCacheAdapter } }]), postPlugin]
  installRuntimeClassSetLifecycle({ plugins, uniAppX: frameworkBranch.frameworkName === 'uni-app-x', invalidate: invalidateRuntimeClassSet, isEnabled: shouldEnableFrameworkExtraPlugins, isRelevant: id => sourceScanSession.isDependency(id) || isSourceCandidateRequest(id), dispose: runtimeState.dispose, getResolvedConfig })
  plugins.push(cssFinalizerOutputPlugin)
  plugins.push(createViteHmrCssModuleVersionFilterPlugin(hmrCssModuleVersions))
  if (capability.styleInjector) { plugins.push(...capability.cssOnly && typeof (options as any).__internalViteWebStyleInjectorFactory === 'function' ? (options as any).__internalViteWebStyleInjectorFactory(styleInjector) : createBuiltinViteStyleInjectorPlugins(styleInjector, () => frameworkBranch.styleInjectorDelegate)) }
  plugins.push(createFrameworkRuntimeLifecycle({
    getResolvedConfig,
    async dispose() {
      await generateTailwindCssForVitePipeline.dispose()
      try {
        await sourceDiscovery.dispose()
        await sourceScanSession.dispose()
      }
      finally {
        tailwindRootCss.dispose()
        webCssEntryDiagnostics.dispose()
        runtimeState.dispose()
        cssAssets.dispose()
        invalidateRecordedGeneratorCandidates()
      }
    },
  }))
  if (transformEmittedWebCss) {
    plugins.push(createFrameworkCssEmissionFinalizerPlugin(getResolvedConfig))
  }
  return plugins
}
