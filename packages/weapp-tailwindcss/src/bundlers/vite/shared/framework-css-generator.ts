import type { ResolvedConfig } from 'vite'
import type { createHmrTimingRecorder } from '../../shared/hmr-timing'
import type { createCssHandlerOptionsCache } from '../css-handler-options'
import type { ViteCssSourceLease } from '../css-memory/source-lifecycle'
import type { createViteRuntimeClassSet } from '../runtime-class-set'
import type { SourceCandidateCollector } from '../source-candidates'
import type { ViteFrameworkBranchContext } from './create-framework-plugins'
import type { createFrameworkCssAssets } from './framework-css-assets'
import type { createViteHmrCandidateState } from './framework-hmr-candidate-state'
import type { createFrameworkSourceDiscovery } from './framework-source-discovery'
import type { createFrameworkSourceScanSession } from './framework-source-scan-session'
import type { ViteFrameworkCssPipelineContext } from './framework-strategy'
import type { CssStage } from '@/compiler'
import type { createDebug } from '@/debug'
import type { normalizeWeappTailwindcssGeneratorOptions } from '@/generator'
import type { resolveGeneratorRuntimeBranch } from '@/runtime-branch'
import type { InternalUserDefinedOptions } from '@/types'
import path from 'node:path'
import process from 'node:process'
import { transformWebCssCompat } from '@weapp-tailwindcss/postcss/transform'
import { getCompilationScopeDependencyRevision, getRegisteredCompilationScopeDependencyRevision, getRegisteredCompilationScopeVersion } from '@/compiler'
import { generateTailwindV4Css } from '@/context/generation'
import { hasTailwindApplyDirective, hasTailwindRootDirectives, hasTailwindSourceDirectives } from '@/generation/directives'
import { normalizeEmptyTailwindCustomVariants } from '@/generation/user-css'
import { filterUnsupportedMiniProgramTailwindV4Candidates } from '@/tailwindcss/v4-engine/candidates'
import { normalizeMiniProgramGeneratorCssSource } from '../../../generation/output-import-shell'
import { annotateCssSourceTrace, createCssTokenSourceMap } from '../../shared/css-source-trace'
import { createBundlerGeneratedCssEndMarker, createBundlerGeneratedCssMarker } from '../../shared/generated-css-marker'
import { normalizeOutputPathKey } from '../../shared/module-graph'
import { resolveViteCssPipelineOutputFile } from '../generate-bundle'
import { compiledCssSourceScopeId, createCompiledCssSourceHash } from '../generate-bundle/compiled-css-source'
import { extractSfcStyleBlocks, isSfcStyleSourceFile, resolveSfcStyleRequestFromKnownSource } from '../generate-bundle/sfc-style-source'
import { removeScopedTailwindPreflightCss } from '../processed-css-assets'
import { parseVueRequest } from '../query'
import { resolveViteServeRootMiniProgramImportShell } from '../serve-root-import-shell'
import { cleanUrl, isCSSRequest, isHTMLRequest, resolveViteCssPipelineRequestFile } from '../utils'
import { resolveWeappViteSourceRoot } from '../weapp-vite-config'
import { resolveViteWebCssCompatOptions, shouldApplyViteWebCssCompat } from '../web-css-compat'
import { extendFrameworkCssContext } from './framework-css-context'
import { createFrameworkCssGenerationQueue } from './framework-css-generation-queue'

interface FrameworkCssGeneratorOptions extends Pick<ReturnType<typeof createFrameworkCssAssets>, 'cssMemory' | 'cleanGeneratedCssByFile' | 'tracedGeneratedCssByFile' | 'generatedClassSetByFile' | 'recordViteProcessedCssAssetResult'> {
  opts: InternalUserDefinedOptions
  runtimeState: ReturnType<typeof createViteRuntimeClassSet>['runtimeState']
  shouldOwnTailwindGeneration: boolean
  sourceScanSession: ReturnType<typeof createFrameworkSourceScanSession>
  getResolvedConfig: () => ResolvedConfig | undefined
  resolveCurrentGeneratorOptions: () => ReturnType<typeof normalizeWeappTailwindcssGeneratorOptions>
  resolveCurrentGeneratorBranch: () => ReturnType<typeof resolveGeneratorRuntimeBranch>
  createCssPipelineContext: (overrides?: Partial<ViteFrameworkCssPipelineContext>) => ViteFrameworkCssPipelineContext
  frameworkCssPipelineStrategy: ViteFrameworkBranchContext['cssPipelineStrategy']
  normalizeGeneratedCssCacheFile: (file: string) => string
  getSourceCandidates: SourceCandidateCollector['values']
  getRecordedGeneratorCandidates: () => Set<string> | undefined
  ensureRuntimeClassSet: ReturnType<typeof createViteRuntimeClassSet>['ensureRuntimeClassSet']
  hmrCandidateState: ReturnType<typeof createViteHmrCandidateState>
  getSourceCandidatesForEntries: SourceCandidateCollector['valuesForEntries']
  getSourceCandidateSourcesForEntries: SourceCandidateCollector['sourcesForEntries']
  markViteProcessedCssSource: (file: string) => void
  rememberTailwindRootCssModule: (id: string) => void
  recordGeneratorCandidates: (candidates: Iterable<string>) => void
  debug: ReturnType<typeof createDebug>
  normalizeViteProcessedCssFile: (file: string) => string
  transformCssHandlerOptions: ReturnType<typeof createCssHandlerOptionsCache>
  transientAutoCssSources: ReturnType<typeof createFrameworkSourceDiscovery>['transientAutoCssSources']
  hmrTimingRecorder: ReturnType<typeof createHmrTimingRecorder>
  resolveGeneratorPlatform: () => InternalUserDefinedOptions['platform']
  styleHandler: InternalUserDefinedOptions['styleHandler']
  shouldAdaptFrameworkWatchCss: () => boolean
  finalizeViteMiniProgramCss: (css: string) => string
  mainCssChunkMatcher: InternalUserDefinedOptions['mainCssChunkMatcher']
}
/** 生成队列消费显式状态，资产写入仍经调用方的 bundler API 完成。 */
export function createFrameworkCssGenerator(options: FrameworkCssGeneratorOptions) {
  const { opts, runtimeState, shouldOwnTailwindGeneration, sourceScanSession, getResolvedConfig, resolveCurrentGeneratorOptions, resolveCurrentGeneratorBranch, createCssPipelineContext, frameworkCssPipelineStrategy, normalizeGeneratedCssCacheFile, getSourceCandidates, getRecordedGeneratorCandidates, ensureRuntimeClassSet, hmrCandidateState, getSourceCandidatesForEntries, getSourceCandidateSourcesForEntries, markViteProcessedCssSource, rememberTailwindRootCssModule, recordGeneratorCandidates, debug, normalizeViteProcessedCssFile, transformCssHandlerOptions, transientAutoCssSources, hmrTimingRecorder, resolveGeneratorPlatform, styleHandler, shouldAdaptFrameworkWatchCss, finalizeViteMiniProgramCss, mainCssChunkMatcher, cssMemory, cleanGeneratedCssByFile, tracedGeneratedCssByFile, generatedClassSetByFile, recordViteProcessedCssAssetResult } = options
  const generateTailwindCssForVitePipelineNow = async (id: string, code: string, hookContext: {
    addWatchFile?: ((id: string) => void) | undefined
    emitFile?: (asset: {
      type: 'asset'
      fileName: string
      source: string
    }) => string
    cssStage?: CssStage | undefined
    disableSourceScan?: boolean | undefined
    sourceCandidates?: Iterable<string> | undefined
    transient?: boolean | undefined
  } | undefined, isSourceCurrent: ViteCssSourceLease) => {
    if (!shouldOwnTailwindGeneration) {
      return void 0
    }
    await runtimeState.readyPromise
    await sourceScanSession.waitForPendingSyncs()
    if (!isSourceCurrent()) {
      return undefined
    }
    const resolvedConfig = getResolvedConfig()
    const file = cleanUrl(id)
    const inferredSfcStyleRequest = isSfcStyleSourceFile(file) ? resolveSfcStyleRequestFromKnownSource(file, cssMemory.getKnownSfcSource(file), code, id) : file
    const requestFile = isCSSRequest(id) ? inferredSfcStyleRequest === file ? resolveViteCssPipelineRequestFile(id) : inferredSfcStyleRequest : inferredSfcStyleRequest
    if (!isCSSRequest(requestFile) || opts.htmlMatcher(file) || isHTMLRequest(file)) {
      return void 0
    }
    const generatorCode = normalizeEmptyTailwindCustomVariants(code)
    const rootDir = resolvedConfig?.root ? path.resolve(resolvedConfig.root) : process.cwd()
    const currentGeneratorOptions = resolveCurrentGeneratorOptions()
    const currentGeneratorBranch = resolveCurrentGeneratorBranch()
    const cssPipelineContext = createCssPipelineContext({ currentGeneratorBranch, currentGeneratorOptions })
    const shouldPreserveStyleOutputExtension = frameworkCssPipelineStrategy?.styles?.shouldPreserveStyleOutputExtension?.(cssPipelineContext) ?? frameworkCssPipelineStrategy?.generation?.isNativeAppStyleTarget?.(cssPipelineContext) === true
    const sourceRoot = resolveWeappViteSourceRoot(resolvedConfig, opts.appType)
    const outputFile = resolveViteCssPipelineOutputFile(requestFile, opts, rootDir, currentGeneratorBranch.isWeb, shouldPreserveStyleOutputExtension, sourceRoot)
    const markerFile = currentGeneratorBranch.isWeb ? normalizeViteProcessedCssFile(file) : normalizeOutputPathKey(requestFile)
    const moduleScopeId = compiledCssSourceScopeId(requestFile)
    const moduleScope = !currentGeneratorBranch.isWeb && hasTailwindApplyDirective(code) && !hasTailwindRootDirectives(code, { importFallback: true })
      ? { id: moduleScopeId, kind: 'component' as const }
      : undefined
    const sourceRevision = getCompilationScopeDependencyRevision(runtimeState, moduleScopeId)
    const knownSfcSource = isSfcStyleSourceFile(file) ? cssMemory.getKnownSfcSource(file) : undefined
    const authorSource = knownSfcSource == null
      ? cssMemory.getKnownCssSource(requestFile) ?? code
      : extractSfcStyleBlocks(knownSfcSource).find(style => style.index === (parseVueRequest(requestFile).query.index ?? 0))?.source ?? code
    let compiledSourceHash: string | undefined
    const createGeneratedMarker = () => createBundlerGeneratedCssMarker('vite', markerFile, compiledSourceHash)
    const generatorTransformCode = currentGeneratorBranch.isWeb ? generatorCode : normalizeMiniProgramGeneratorCssSource(generatorCode, outputFile)
    const fileKey = normalizeGeneratedCssCacheFile(file)
    const fullRuntime = getSourceCandidates() ?? getRecordedGeneratorCandidates() ?? await ensureRuntimeClassSet()
    if (!isSourceCurrent()) {
      return undefined
    }
    const transient = hookContext?.transient === true
    const pendingHmrChange = transient ? void 0 : hmrCandidateState.resolve(generatorCode, file)
    const forceFullHmrCssRegeneration = hmrCandidateState.shouldForceFullRegeneration(file, pendingHmrChange !== undefined)
    const runtime = hookContext?.sourceCandidates === undefined
      ? new Set(fullRuntime)
      : new Set(hookContext.sourceCandidates)
    if (pendingHmrChange) {
      for (const candidate of pendingHmrChange.addedCandidates) {
        runtime.add(candidate)
      }
    }
    const getGenerationSourceCandidatesForEntries: SourceCandidateCollector['valuesForEntries'] = pendingHmrChange
      ? (entries, options2) => {
          const candidates = new Set(getSourceCandidatesForEntries(entries, options2))
          for (const candidate of pendingHmrChange.addedCandidates) {
            candidates.add(candidate)
          }
          return candidates
        }
      : getSourceCandidatesForEntries
    const importShellCss = resolveViteServeRootMiniProgramImportShell({ css: generatorTransformCode, cssPipelineContext, cssPipelineStrategy: frameworkCssPipelineStrategy, isWebGeneratorTarget: currentGeneratorBranch.isWeb, outputFile })
    if (importShellCss !== void 0) {
      cleanGeneratedCssByFile.set(fileKey, importShellCss)
      tracedGeneratedCssByFile.set(fileKey, importShellCss)
      generatedClassSetByFile.set(fileKey, new Set())
      recordViteProcessedCssAssetResult(file, importShellCss, { injectIntoMain: false, outputFile })
      markViteProcessedCssSource(file)
      rememberTailwindRootCssModule(id)
      recordGeneratorCandidates(fullRuntime)
      if (pendingHmrChange || forceFullHmrCssRegeneration) {
        hmrCandidateState.finishTarget(file)
      }
      else if (!hmrCandidateState.hasPendingChange()) {
        hmrCandidateState.clear()
      }
      cssMemory.rememberCssSource({ kind: 'output-import-shell', outputFile, rawSource: importShellCss, sourceFile: requestFile })
      debug('css preserved root mini-program import shell for vite postcss pipeline: %s bytes=%d', requestFile, importShellCss.length)
      return importShellCss
    }
    if (pendingHmrChange && currentGeneratorOptions.target === 'weapp' && filterUnsupportedMiniProgramTailwindV4Candidates(pendingHmrChange.addedCandidates).size === 0) {
      const previousTracedCss = tracedGeneratedCssByFile.get(fileKey)
      if (previousTracedCss !== void 0) {
        hmrCandidateState.finishTarget(file)
        return `${createGeneratedMarker()}
${previousTracedCss}`
      }
    }
    const sourceCssHandlerOptions = transformCssHandlerOptions.getCssHandlerOptions(requestFile)
    const outputCssHandlerOptions = transformCssHandlerOptions.getCssHandlerOptions(outputFile)
    const cssHandlerOptions = { ...sourceCssHandlerOptions, isMainChunk: outputCssHandlerOptions.isMainChunk }
    const transientCssSource = transientAutoCssSources.get(file) ?? (hasTailwindRootDirectives(generatorTransformCode, { importFallback: currentGeneratorOptions.importFallback }) || hasTailwindSourceDirectives(generatorTransformCode, { importFallback: currentGeneratorOptions.importFallback }) || hasTailwindApplyDirective(generatorTransformCode) ? { base: path.dirname(path.resolve(file)), css: generatorTransformCode, file: path.resolve(file) } : void 0)
    const shouldDeferEmptyScopedCssSource = transientCssSource == null && (frameworkCssPipelineStrategy?.generation?.shouldDeferEmptyScopedCssSource?.(extendFrameworkCssContext(cssPipelineContext, { cssHandlerOptions, generatorCode: generatorTransformCode })) ?? true)
    const previousCss = pendingHmrChange && !forceFullHmrCssRegeneration ? cleanGeneratedCssByFile.get(fileKey) : void 0
    const previousGeneratorCss = previousCss && !currentGeneratorBranch.isWeb ? normalizeMiniProgramGeneratorCssSource(previousCss, outputFile) : previousCss
    const hmrDebugState = hmrCandidateState.snapshotDebugState()
    const generated = await hmrTimingRecorder.measure(`generateCss.${resolvedConfig?.command ?? 'unknown'}`, () => generateTailwindV4Css({ opts, runtimeState, runtime, rawSource: generatorTransformCode, file, outputFile, scope: moduleScope, cssHandlerOptions, cssUserHandlerOptions: transformCssHandlerOptions.getCssUserHandlerOptions(requestFile), cssSources: transientCssSource ? [transientCssSource] : void 0, getSourceCandidatesForEntries: getGenerationSourceCandidatesForEntries, generatorPlatform: resolveGeneratorPlatform(), styleHandler, debug, previousCss: previousGeneratorCss, previousClassSet: pendingHmrChange && !forceFullHmrCssRegeneration ? generatedClassSetByFile.get(fileKey) : void 0, deferWebCssPropertyFallback: resolvedConfig?.command === 'build', deferEmptyScopedCssSource: shouldDeferEmptyScopedCssSource, deferCssAdaptation: resolvedConfig?.command === 'build' && !transient && !currentGeneratorBranch.isWeb && !shouldAdaptFrameworkWatchCss(), disableSourceScan: hookContext?.disableSourceScan === true, cssStage: hookContext?.cssStage, restoreLocalCssImports: !currentGeneratorBranch.isWeb }), { file, memoryDebug: { cleanCacheHit: cleanGeneratedCssByFile.has(fileKey), forceFullHmrCssRegeneration, ...hmrDebugState, pendingResolved: pendingHmrChange !== void 0, runtimeCandidates: runtime.size, target: currentGeneratorOptions.target } })
    if (!isSourceCurrent()) {
      return undefined
    }
    if (!generated) {
      if (pendingHmrChange) {
        hmrCandidateState.finishTarget(file)
      }
      else if (!hmrCandidateState.hasPendingChange()) {
        hmrCandidateState.clear()
      }
      return void 0
    }
    const scopeVersion = moduleScope ? getRegisteredCompilationScopeVersion(runtimeState, moduleScopeId) : undefined
    if (moduleScope && generated.artifact && scopeVersion
      && authorSource.trim() === code.trim()
      && getRegisteredCompilationScopeDependencyRevision(runtimeState, moduleScopeId) === sourceRevision) {
      compiledSourceHash = createCompiledCssSourceHash(authorSource, scopeVersion, requestFile)
    }
    debug('vite compiled source proof: %s scope=%s artifact=%s current=%s authorMatches=%s', requestFile, scopeVersion, generated.artifact != null, compiledSourceHash != null, authorSource.trim() === code.trim())
    const finalizedCss = finalizeViteMiniProgramCss(generated.css)
    const shouldApplyWebCssCompat = shouldApplyViteWebCssCompat(cssPipelineContext, frameworkCssPipelineStrategy)
    const outputCss = frameworkCssPipelineStrategy?.generation?.transformGeneratedCss?.(finalizedCss, extendFrameworkCssContext(cssPipelineContext, { defaultWebCssCompat: (css: string) => transformWebCssCompat(css, resolveViteWebCssCompatOptions(cssPipelineContext), { deferPropertyFallback: resolvedConfig?.command === 'build' }), removeScopedPreflight: removeScopedTailwindPreflightCss, shouldApplyWebCssCompat })) ?? removeScopedTailwindPreflightCss(shouldApplyWebCssCompat ? transformWebCssCompat(finalizedCss, resolveViteWebCssCompatOptions(cssPipelineContext), { deferPropertyFallback: resolvedConfig?.command === 'build' }) : finalizedCss)
    if (transient) {
      for (const dependency of generated.dependencies) {
        hookContext?.addWatchFile?.(dependency)
      }
      return outputCss
    }
    const tracedCss = annotateCssSourceTrace(outputCss, { opts, tokenSources: createCssTokenSourceMap(getSourceCandidateSourcesForEntries(void 0), opts) })
    for (const dependency of generated.dependencies) {
      hookContext?.addWatchFile?.(dependency)
    }
    cleanGeneratedCssByFile.set(fileKey, outputCss)
    tracedGeneratedCssByFile.set(fileKey, tracedCss)
    generatedClassSetByFile.set(fileKey, new Set(generated.classSet))
    // Web 模块仍需经过真实框架 PostCSS；生成缓存不能提前作为已处理产物重放。
    if (!currentGeneratorBranch.isWeb) {
      const shouldInjectGeneratedCssIntoMain = mainCssChunkMatcher(outputFile, opts.appType) || (hasTailwindRootDirectives(generatorTransformCode, { importFallback: currentGeneratorOptions.importFallback }) && !normalizeOutputPathKey(outputFile).includes('/'))
      recordViteProcessedCssAssetResult(file, tracedCss, { injectIntoMain: shouldInjectGeneratedCssIntoMain, outputFile })
    }
    if (shouldPreserveStyleOutputExtension && outputFile.endsWith('.css')) {
      hookContext?.emitFile?.({ type: 'asset', fileName: outputFile, source: tracedCss })
    }
    markViteProcessedCssSource(file)
    if (hasTailwindRootDirectives(generatorTransformCode, { importFallback: currentGeneratorOptions.importFallback })) {
      rememberTailwindRootCssModule(id)
    }
    recordGeneratorCandidates(fullRuntime)
    if (pendingHmrChange || forceFullHmrCssRegeneration) {
      hmrCandidateState.finishTarget(file)
    }
    else if (!hmrCandidateState.hasPendingChange()) {
      hmrCandidateState.clear()
    }
    cssMemory.rememberCssSource({ outputFile, rawSource: code, sourceFile: requestFile, delivery: currentGeneratorBranch.isWeb ? 'vite-module' : undefined })
    debug('css generated for vite postcss pipeline: %s bytes=%d', requestFile, tracedCss.length)
    return `${createGeneratedMarker()}
${tracedCss}${currentGeneratorBranch.isWeb ? `\n${createBundlerGeneratedCssEndMarker('vite', markerFile)}` : ''}`
  }
  const queue = createFrameworkCssGenerationQueue(normalizeGeneratedCssCacheFile, generateTailwindCssForVitePipelineNow)
  // 排队时固定来源代次，不能让删除前接收的任务借用同名新文件的提交权。
  const generateTailwindCssForVitePipeline = (
    id: string,
    code: string,
    hookContext?: Parameters<typeof generateTailwindCssForVitePipelineNow>[2],
  ) => {
    const isCurrent = cssMemory.captureSource(id)
    return queue(id, code, hookContext, isCurrent).finally(isCurrent.release)
  }
  return Object.assign(generateTailwindCssForVitePipeline, { dispose: queue.dispose })
}
