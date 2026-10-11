import type { OutputAsset, OutputBundle, OutputChunk } from 'rollup'
import type { Plugin } from 'vite'
import type { ViteFrameworkCssPipelineContext } from '../shared/framework-strategy'
import type { CssFinalizerContext, CssFinalizerThis } from './options'
import path from 'node:path'
import process from 'node:process'
import { AssetEmissionPlan, disposeCompilerOwner, finalizeCompilerShadowRun } from '@/compiler'
import { normalizeWeappTailwindcssGeneratorOptions } from '@/generator'
import { resolveGeneratorRuntimeBranch, shouldUseMiniProgramCssBranch } from '@/runtime-branch'
import { filterUnsupportedMiniProgramTailwindV4Candidates } from '@/tailwindcss/v4-engine/candidates'
import { collectUniAppXHarmonyApplyStyleSources, collectUniAppXHarmonyApplyUtilities, createUniAppXHarmonyApplyGeneratorSource, injectUniAppXHarmonyBundleStyles } from '@/uni-app-x/style-asset'
import { resolveUniUtsPlatform } from '@/utils'
import { isPureLocalCssImportWrapper } from '../../../generation/local-imports'
import { normalizeMiniProgramGeneratorCssSource } from '../../../generation/output-import-shell'
import { generateTailwindV4Css } from '../../../generation/service'
import { annotateCssSourceTrace, createCssTokenSourceMap } from '../../shared/css-source-trace'
import { stripBundlerGeneratedCssMarkers } from '../../shared/generated-css-marker'
import { resolveMiniProgramStyleOutputExtension, resolveViteCssPipelineOutputFile } from '../generate-bundle'
import { applyViteAssetEmissionPlan } from '../generate-bundle/asset-emission-plan'
import { linkEntryChunkStyles } from '../generate-bundle/entry-style-graph'
import { normalizeRootMiniProgramImportShellAssets } from '../generate-bundle/finalize'
import { linkFrameworkRootStyleToRuntimeEntry, restoreFrameworkRootMiniProgramImportShellAssets } from '../generate-bundle/root-style-output'
import { collectViteProcessedCssAssetResults, injectViteProcessedCssIntoMainCssAssets } from '../processed-css-assets'
import { isHTMLRequest } from '../utils'
import { resolveSourceRootFromBundleGraph, resolveWeappViteSourceRoot } from '../weapp-vite-config'
import { finalizeWebCssCalc } from './css-calc'
import { finalizeCssAssets } from './final-assets'
import { tryFinalizeGenericWebCss } from './generic-web-fast-path'
import { collectViteProcessedCssSources, createCssHandlerOptions, finalizeWebCss, inferPlatformFromViteOutDir, registerGeneratorDependencies, shouldGenerateCssByGenerator } from './options'

export function createViteCssFinalizerOutputPlugin(context: CssFinalizerContext): Plugin {
  return {
    name: 'weapp-tailwindcss:adaptor:css-finalizer',
    enforce: 'post',
    async closeBundle() {
      if (context.getResolvedConfig()?.build?.watch != null) {
        return
      }
      await disposeCompilerOwner(context.runtimeState)
    },
    async closeWatcher() {
      await disposeCompilerOwner(context.runtimeState)
    },
    generateBundle: {
      order: 'post',
      async handler(this: CssFinalizerThis, _options, bundle: OutputBundle) {
        const {
          opts,
          runtimeState,
          ensureRuntimeClassSet,
          cssPipelineStrategy,
          isCssAssetProcessed,
          markCssAssetProcessed,
          debug,
          getResolvedConfig,
          recordCssAssetResult,
          recordViteProcessedCssAssetResult,
          getViteProcessedCssAssetResults,
          getRecordedGeneratorCandidates,
          getSourceCandidates,
          getSourceCandidatesForEntries,
          getSourceCandidateSourcesForEntries,
          waitForSourceCandidateSyncs,
          rememberMainCssSource,
          getRememberedMainCssSource,
          isViteProcessedCssAsset,
          frameworkRootImportShellTargetByFile,
        } = context
        const resolvedConfig = getResolvedConfig()
        const uniUtsPlatform = resolveUniUtsPlatform()
        const generatorPlatform = opts.cssOptions?.platform
          ?? opts.platform
          ?? inferPlatformFromViteOutDir(resolvedConfig?.build?.outDir)
        const generatorOptions = normalizeWeappTailwindcssGeneratorOptions(opts.generator, {
          appType: opts.appType,
          platform: generatorPlatform,
          tailwindcssMajorVersion: runtimeState.tailwindRuntime.majorVersion,
          uniAppX: opts.uniAppX,
          uniUtsPlatform,
        })
        const generatorBranch = resolveGeneratorRuntimeBranch(generatorOptions, {
          appType: opts.appType,
          platform: generatorPlatform,
          tailwindcssMajorVersion: runtimeState.tailwindRuntime.majorVersion,
          uniAppX: opts.uniAppX,
          uniUtsPlatform,
        })
        const isWebGeneratorTarget = generatorBranch.isWeb
        const createCssPipelineContext = (_file: string): ViteFrameworkCssPipelineContext => ({
          bundle,
          currentGeneratorBranch: generatorBranch,
          currentGeneratorOptions: generatorOptions,
          opts,
          resolvedConfig,
          resolveStylePlatform: () => generatorPlatform,
        })
        const timingDetails: Record<string, number> = {}
        const recordTiming = (phase: string, startedAt: number) => {
          timingDetails[phase] = (timingDetails[phase] ?? 0) + Math.max(0, performance.now() - startedAt)
        }
        const finishTiming = () => {
          context.hmrTimingRecorder?.record('cssFinalizer', performance.now() - finalizerStartedAt, {
            timingDetails,
          })
          context.hmrTimingRecorder?.emitTotal()
        }
        const finalizeWebCssAsset = (css: string, file: string) => {
          const startedAt = performance.now()
          const finalized = finalizeWebCss(css, {
            ...createCssPipelineContext(file),
            file,
          }, cssPipelineStrategy)
          recordTiming('finalizeWebCss', startedAt)
          return finalized
        }
        const isHarmonyAppStyleTarget = cssPipelineStrategy?.isHarmonyAppStyleTarget?.(createCssPipelineContext('')) === true
        const isNativeAppStyleTarget = cssPipelineStrategy?.isNativeAppStyleTarget?.(createCssPipelineContext('')) === true
        if (resolvedConfig?.command !== 'build' && !isNativeAppStyleTarget) {
          return
        }
        const rootDir = resolvedConfig?.root ? path.resolve(resolvedConfig.root) : process.cwd()
        const outDir = resolvedConfig?.build?.outDir
          ? path.resolve(rootDir, resolvedConfig.build.outDir)
          : rootDir
        const sourceRoot = resolveWeappViteSourceRoot(resolvedConfig, opts.appType)
          ?? resolveSourceRootFromBundleGraph(resolvedConfig, bundle)
        const finalizerStartedAt = performance.now()
        if (tryFinalizeGenericWebCss({
          bundle,
          context,
          createCssPipelineContext,
          isHarmonyAppStyleTarget,
          isNativeAppStyleTarget,
          isWebGeneratorTarget,
          recordTiming,
          rootDir,
          sourceRoot,
        })) {
          await finalizeWebCssCalc(bundle, context)
          finalizeCompilerShadowRun(runtimeState)
          finishTiming()
          return
        }
        const finalCssAssetFiles = new Set<string>()
        const trackFinalCssAssetUpdate = (file: string, original: string, generated: string) => {
          finalCssAssetFiles.add(file)
          opts.onUpdate(file, original, generated)
        }
        const linkEntryStyles = () => {
          if (isWebGeneratorTarget) {
            return
          }
          linkEntryChunkStyles(bundle, {
            matchesCss: opts.cssMatcher,
            onUpdate: trackFinalCssAssetUpdate,
            resolveOutputFile: (id) => {
              if (!opts.cssMatcher(id) || id.includes('?')) {
                return undefined
              }
              return resolveViteCssPipelineOutputFile(id, opts, rootDir, false, false, sourceRoot, resolveMiniProgramStyleOutputExtension({ files: Object.keys(bundle) }), Object.keys(bundle))
            },
          })
        }
        restoreFrameworkRootMiniProgramImportShellAssets(bundle, {
          debug,
          isWebGeneratorTarget,
          matchesCss: opts.cssMatcher,
          onUpdate: trackFinalCssAssetUpdate,
          recordCssAssetResult,
          shouldKeep: (file, css) => cssPipelineStrategy?.shouldKeepRootMiniProgramStyleAsImportShell?.({
            ...createCssPipelineContext(file),
            css,
            file,
          }),
          targetByFile: frameworkRootImportShellTargetByFile ?? new Map(),
        })
        if (!isWebGeneratorTarget) {
          linkFrameworkRootStyleToRuntimeEntry(bundle, {
            debug,
            matchesCss: opts.cssMatcher,
            onUpdate: trackFinalCssAssetUpdate,
            recordCssAssetResult,
            targetByFile: frameworkRootImportShellTargetByFile ?? new Map(),
          })
        }
        const sourceTraceTokenSources = getSourceCandidateSourcesForEntries
          ? createCssTokenSourceMap(getSourceCandidateSourcesForEntries(undefined), opts)
          : undefined
        const annotateCss = (css: string) => annotateCssSourceTrace(css, {
          opts,
          tokenSources: sourceTraceTokenSources,
        })

        const collectViteProcessedCssAssets = () => {
          const startedAt = performance.now()
          collectViteProcessedCssAssetResults(bundle, {
            opts,
            cssPipelineStrategy,
            createCssPipelineContext,
            isViteProcessedCssAsset,
            markCssAssetProcessed,
            recordCssAssetResult,
            recordViteProcessedCssAssetResult,
            onAssetWrite: file => finalCssAssetFiles.add(file),
            resolveViteProcessedCssOutputFile: file => resolveViteCssPipelineOutputFile(file, opts, rootDir, isWebGeneratorTarget, isNativeAppStyleTarget, sourceRoot, resolveMiniProgramStyleOutputExtension({
              files: Object.keys(bundle),
            }), Object.keys(bundle)),
            transformCss: finalizeWebCssAsset,
            debug,
          })
          recordTiming('processedCss.collect', startedAt)
        }

        const injectViteProcessedCssIntoMainCss = () => {
          const startedAt = performance.now()
          const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
            opts,
            cssPipelineStrategy,
            createCssPipelineContext,
            getViteProcessedCssAssetResults,
            markCssAssetProcessed,
            recordCssAssetResult,
            transformCss: finalizeWebCssAsset,
            debug,
            onUpdate: trackFinalCssAssetUpdate,
          })
          recordTiming('processedCss.inject', startedAt)
          return injected
        }

        collectViteProcessedCssAssets()

        const createHarmonyBundleStyleSources = async () => {
          const cssSources = collectViteProcessedCssSources(getViteProcessedCssAssetResults)
          const applyUtilities = collectUniAppXHarmonyApplyUtilities(bundle)
          const applyStyleSources = collectUniAppXHarmonyApplyStyleSources(bundle)
          if (applyUtilities.size === 0 || applyStyleSources.length === 0) {
            return cssSources
          }
          const harmonyCssHandlerOptions = createCssHandlerOptions(
            opts,
            runtimeState.tailwindRuntime.majorVersion,
            'uni-app-x-harmony-apply.css',
            outDir,
            cssPipelineStrategy?.getCssHandlerExtraOptions?.({
              ...createCssPipelineContext('uni-app-x-harmony-apply.css'),
              file: 'uni-app-x-harmony-apply.css',
            }) ?? {},
          )
          const generated = await generateTailwindV4Css({
            opts,
            runtimeState,
            runtime: new Set(),
            rawSource: createUniAppXHarmonyApplyGeneratorSource(applyStyleSources, applyUtilities),
            file: 'uni-app-x-harmony-apply.css',
            outputFile: 'uni-app-x-harmony-apply.css',
            cssHandlerOptions: harmonyCssHandlerOptions,
            cssUserHandlerOptions: {
              ...harmonyCssHandlerOptions,
              isMainChunk: false,
            },
            cssStage: 'framework-processed',
            disableSourceScan: true,
            getSourceCandidatesForEntries,
            generatorPlatform,
            styleHandler: opts.styleHandler,
            debug,
          })
          if (generated?.css) {
            cssSources.push(annotateCss(generated.css))
          }
          return cssSources
        }

        const injectHarmonyBundleStyles = async () => {
          if (!isHarmonyAppStyleTarget) {
            return
          }
          const changed = injectUniAppXHarmonyBundleStyles(bundle, {
            cssSources: await createHarmonyBundleStyleSources(),
          })
          if (changed) {
            debug('uni-app-x harmony bundle styles inject')
          }
        }

        const isCssOutputAssetEntry = (
          entry: [string, OutputAsset | OutputChunk],
        ): entry is [string, OutputAsset] => {
          const [bundleFile, output] = entry
          const fileName = output.fileName || bundleFile
          return (
            output.type === 'asset'
            && opts.cssMatcher(fileName)
            && !opts.htmlMatcher(fileName)
            && !isHTMLRequest(fileName)
            && !isCssAssetProcessed(output, fileName)
          )
        }

        const enumerateStartedAt = performance.now()
        const entries = Object.entries(bundle).filter(isCssOutputAssetEntry)
        recordTiming('assets.enumerate', enumerateStartedAt)

        if (entries.length === 0) {
          await injectHarmonyBundleStyles()
          collectViteProcessedCssAssets()
          injectViteProcessedCssIntoMainCss()
          linkEntryStyles()
          normalizeRootMiniProgramImportShellAssets(bundle, {
            cssMatcher: opts.cssMatcher,
            debug,
            enabled: cssPipelineStrategy?.shouldNormalizeRootMiniProgramImportShell?.(createCssPipelineContext('')) === true,
            onUpdate: trackFinalCssAssetUpdate,
            recordCssAssetResult,
          })
          await finalizeCssAssets(bundle, context, isWebGeneratorTarget, finalCssAssetFiles)
          finalizeCompilerShadowRun(runtimeState)
          finishTiming()
          return
        }

        await runtimeState.readyPromise
        await waitForSourceCandidateSyncs?.()
        const runtime = getRecordedGeneratorCandidates?.() ?? getSourceCandidates?.() ?? await ensureRuntimeClassSet()
        const collectedGeneratorCandidates = new Set([
          ...runtime,
          ...(getSourceCandidates?.() ?? []),
        ])
        const generatorRuntime = shouldUseMiniProgramCssBranch(generatorBranch)
          ? filterUnsupportedMiniProgramTailwindV4Candidates(collectedGeneratorCandidates)
          : collectedGeneratorCandidates
        const emissionPlan = new AssetEmissionPlan()
        const writeTargets = new Map<string, OutputAsset>()
        const writeCssAsset = (file: string, output: OutputAsset, source: string) => {
          emissionPlan.write(file, source)
          finalCssAssetFiles.add(file)
          writeTargets.set(file, output)
        }
        await Promise.all(entries.map(async ([bundleFile, output]) => {
          const file = output.fileName || bundleFile
          const rawSource = output.source.toString()
          if (isViteProcessedCssAsset?.(output, file)) {
            const cleanRawSource = stripBundlerGeneratedCssMarkers(rawSource)
            const cssHandlerOptions = createCssHandlerOptions(
              opts,
              runtimeState.tailwindRuntime.majorVersion,
              file,
              outDir,
              cssPipelineStrategy?.getCssHandlerExtraOptions?.({
                ...createCssPipelineContext(file),
                file,
              }) ?? {},
            )
            const nextCss = annotateCss(generatorBranch.isWeb
              ? finalizeWebCssAsset(cleanRawSource, file)
              : (await opts.styleHandler(cleanRawSource, cssHandlerOptions)).css)
            writeCssAsset(file, output, nextCss)
            markCssAssetProcessed(output, file)
            recordCssAssetResult?.(file, nextCss)
            debug('css finalizer skip vite-processed css: %s', file)
            return
          }
          const cssHandlerOptions = createCssHandlerOptions(
            opts,
            runtimeState.tailwindRuntime.majorVersion,
            file,
            outDir,
            cssPipelineStrategy?.getCssHandlerExtraOptions?.({
              ...createCssPipelineContext(file),
              file,
            }) ?? {},
          )
          const cssUserHandlerOptions = {
            ...cssHandlerOptions,
            isMainChunk: false,
          }
          const cleanRawSource = stripBundlerGeneratedCssMarkers(rawSource)
          if (cleanRawSource !== rawSource && cleanRawSource.trim().length === 0) {
            writeCssAsset(file, output, cleanRawSource)
            markCssAssetProcessed(output, file)
            recordCssAssetResult?.(file, cleanRawSource)
            opts.onUpdate(file, rawSource, cleanRawSource)
            debug('css finalizer strip empty marker asset: %s', file)
            return
          }
          const processed = isCssAssetProcessed(output, file)
          const rememberedMainCssSource = processed && cssHandlerOptions.isMainChunk
            ? getRememberedMainCssSource?.(file)
            : undefined
          const resolvedGeneratorRawSource = rememberedMainCssSource?.rawSource ?? cleanRawSource
          const generatorRawSource = generatorBranch.isWeb
            ? resolvedGeneratorRawSource
            : normalizeMiniProgramGeneratorCssSource(resolvedGeneratorRawSource, file)
          const generatorSourceFile = rememberedMainCssSource?.sourceFile ?? file
          const generatorCssHandlerOptions = rememberedMainCssSource
            ? createCssHandlerOptions(
                opts,
                runtimeState.tailwindRuntime.majorVersion,
                generatorSourceFile,
                outDir,
                cssPipelineStrategy?.getCssHandlerExtraOptions?.({
                  ...createCssPipelineContext(generatorSourceFile),
                  file: generatorSourceFile,
                }) ?? {},
              )
            : cssHandlerOptions
          const generatorCssUserHandlerOptions = rememberedMainCssSource
            ? {
                ...generatorCssHandlerOptions,
                isMainChunk: false,
              }
            : cssUserHandlerOptions
          const generatorTransformRawSource = generatorRawSource
          const generated = shouldGenerateCssByGenerator(opts, runtimeState.tailwindRuntime.majorVersion, file, generatorTransformRawSource, processed)
            ? await generateTailwindV4Css({
                opts,
                runtimeState,
                runtime: generatorRuntime,
                rawSource: generatorTransformRawSource,
                file: generatorSourceFile,
                outputFile: file,
                cssHandlerOptions: generatorCssHandlerOptions,
                cssUserHandlerOptions: generatorCssUserHandlerOptions,
                cssStage: 'framework-processed',
                getSourceCandidatesForEntries,
                generatorPlatform,
                styleHandler: opts.styleHandler,
                debug,
              })
            : undefined
          if (!generated && !generatorBranch.isWeb && isPureLocalCssImportWrapper(generatorTransformRawSource)) {
            const nextCss = generatorTransformRawSource
            if (nextCss !== rawSource) {
              writeCssAsset(file, output, nextCss)
              opts.onUpdate(file, rawSource, nextCss)
            }
            markCssAssetProcessed(output, file)
            recordCssAssetResult?.(file, nextCss)
            debug('css finalizer preserve mini-program import shell: %s', file)
            return
          }
          const nextCss = annotateCss(generated?.css ?? (
            generatorBranch.isWeb
              ? finalizeWebCssAsset(cleanRawSource, file)
              : (await opts.styleHandler(generatorTransformRawSource, cssHandlerOptions)).css
          ))
          if (generated) {
            registerGeneratorDependencies(this, generated.dependencies)
            debug('css finalizer generated result: %s bytes=%d', file, nextCss.length)
            recordCssAssetResult?.(file, nextCss)
            if (cssHandlerOptions.isMainChunk) {
              rememberMainCssSource?.(file, generatorRawSource)
            }
          }
          writeCssAsset(file, output, nextCss)
          markCssAssetProcessed(output, file)
          opts.onUpdate(file, rawSource, nextCss)
          debug('css finalizer handle: %s', file)
        }))
        const writeStartedAt = performance.now()
        applyViteAssetEmissionPlan(emissionPlan, {
          bundle,
          writeTargets,
        })
        await injectHarmonyBundleStyles()
        collectViteProcessedCssAssets()
        injectViteProcessedCssIntoMainCss()
        linkEntryStyles()
        normalizeRootMiniProgramImportShellAssets(bundle, {
          cssMatcher: opts.cssMatcher,
          debug,
          enabled: cssPipelineStrategy?.shouldNormalizeRootMiniProgramImportShell?.(createCssPipelineContext('')) === true,
          onUpdate: trackFinalCssAssetUpdate,
          recordCssAssetResult,
        })
        await finalizeCssAssets(bundle, context, isWebGeneratorTarget, finalCssAssetFiles)
        finalizeCompilerShadowRun(runtimeState)
        recordTiming('assets.write', writeStartedAt)
        finishTiming()
      },
    },
  }
}
