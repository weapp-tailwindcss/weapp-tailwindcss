import type { ViteCssAssetIdentityKind } from '../css-asset-identity'
import { hasTailwindApplyDirective } from '../../../generation/directives'
import { hasBundlerGeneratedCssMarker, stripBundlerGeneratedCssMarkers } from '../../shared/generated-css-marker'
import { createCssRuntimeSignature } from './css-share-scope'
import { createRememberedCssRuntimeSignature } from './remembered-css'
import { hasTailwindGenerationSource } from './sfc-style-source'

export interface ResolveViteCssTransformDecisionPlanOptions {
  alreadyProcessedCssAsset: boolean
  cssAssetIdentityKind: ViteCssAssetIdentityKind
  cssAssetSourceFile?: string | undefined
  cssIsMainChunk: boolean
  generatorCandidateSignatureInitialized: boolean
  generatorCandidatesChanged: boolean
  generatorRawSource: string
  hasCurrentTailwindGenerationDirective: boolean
  hasRememberedApplySource: boolean
  hasRuntimeAffectingChanges: boolean
  hasSameOutputRememberedTailwindGenerationSource: boolean
  hasStaleViteProcessedCssSource: boolean
  isCollectedBundlerGeneratedCssFile: boolean
  isProcessCssFile: boolean
  isRuntimeLinkedCss: boolean
  rawSource: string
  rememberedRawSource?: string | undefined
  shouldProcessTailwindGeneration: boolean
  shouldRegenerateMainPackageCssWithScopedCandidates: boolean
  useIncrementalMode: boolean
  vitePipelineCssAsset: boolean
  viteProcessedCssAsset: boolean
}

export interface ViteCssTransformDecisionPlan {
  shouldPreserveCollectedViteCssAsset: boolean
  shouldPreserveStaleGeneratedCssAsset: boolean
  shouldRefreshViteProcessedCssByCandidates: boolean
  shouldRegenerateCollectedViteCss: boolean
  shouldReplayLastCss: boolean
  shouldReuseProcessedCss: boolean
  shouldTrackGeneratorRuntime: boolean
  strippedViteProcessedCss: string
}

export function resolveViteCssTransformDecisionPlan(
  options: ResolveViteCssTransformDecisionPlanOptions,
): ViteCssTransformDecisionPlan {
  const hasRememberedTailwindGenerationSource = options.rememberedRawSource != null
    && hasTailwindGenerationSource(options.rememberedRawSource)
  const shouldRegenerateCollectedViteCss = options.viteProcessedCssAsset
    && options.useIncrementalMode
    && options.generatorCandidateSignatureInitialized
    && options.generatorCandidatesChanged
    && (
      hasTailwindGenerationSource(options.generatorRawSource)
      || hasBundlerGeneratedCssMarker(options.rawSource)
      || hasRememberedTailwindGenerationSource
    )
  const shouldRefreshViteProcessedCssByCandidates = options.viteProcessedCssAsset
    && options.useIncrementalMode
    && options.generatorCandidateSignatureInitialized
    && options.generatorCandidatesChanged
  const hasRuntimeAffectingTrackedAsset = options.hasRuntimeAffectingChanges
    && (options.alreadyProcessedCssAsset || options.vitePipelineCssAsset)
  const shouldTrackForTailwindGeneration = options.shouldProcessTailwindGeneration
    && (
      !options.useIncrementalMode
      || options.cssIsMainChunk
      || options.isProcessCssFile
      || options.isRuntimeLinkedCss
      || shouldRegenerateCollectedViteCss
      || hasRuntimeAffectingTrackedAsset
    )
  const shouldTrackGeneratorRuntime = options.hasStaleViteProcessedCssSource
    || options.shouldRegenerateMainPackageCssWithScopedCandidates
    || options.hasCurrentTailwindGenerationDirective
    || options.hasSameOutputRememberedTailwindGenerationSource
    || shouldTrackForTailwindGeneration
  const shouldPreserveCollectedViteCssAsset = !shouldRegenerateCollectedViteCss
    && (!options.generatorCandidateSignatureInitialized || !options.generatorCandidatesChanged)
    && (
      options.isCollectedBundlerGeneratedCssFile
      || hasBundlerGeneratedCssMarker(options.rawSource)
    )
  const strippedViteProcessedCss = stripBundlerGeneratedCssMarkers(options.rawSource)
  const shouldPreserveStaleGeneratedCssAsset = options.hasStaleViteProcessedCssSource
    && shouldPreserveCollectedViteCssAsset
    && strippedViteProcessedCss.trim().length > 0
    && options.cssAssetIdentityKind !== 'generator-placeholder'
    && !hasTailwindGenerationSource(strippedViteProcessedCss)
    && !hasTailwindApplyDirective(strippedViteProcessedCss)
  // 首次完整构建的结构化来源已证明框架完成生成；原始 apply 缓存只供后续增量重放。
  // 不能把已压缩、已合并的当前产物再当作者源码生成，否则会重复贡献局部规则。
  const shouldReuseCompletedBuildCss = !options.useIncrementalMode
    && options.cssAssetIdentityKind === 'bundler-generated'
    && options.cssAssetSourceFile != null
    && !hasTailwindGenerationSource(strippedViteProcessedCss)
    && !hasTailwindApplyDirective(strippedViteProcessedCss)
  const shouldReuseProcessedCss = options.alreadyProcessedCssAsset
    && !shouldRefreshViteProcessedCssByCandidates
    && (
      shouldReuseCompletedBuildCss
      || ((!options.hasStaleViteProcessedCssSource || shouldPreserveStaleGeneratedCssAsset)
        && !options.hasRememberedApplySource)
    )
    && !options.shouldRegenerateMainPackageCssWithScopedCandidates
    && (shouldReuseCompletedBuildCss || !shouldTrackGeneratorRuntime || shouldPreserveCollectedViteCssAsset)

  return {
    shouldPreserveCollectedViteCssAsset,
    shouldPreserveStaleGeneratedCssAsset,
    shouldRefreshViteProcessedCssByCandidates,
    shouldRegenerateCollectedViteCss,
    shouldReplayLastCss: !shouldTrackGeneratorRuntime && !options.isRuntimeLinkedCss,
    shouldReuseProcessedCss,
    shouldTrackGeneratorRuntime,
    strippedViteProcessedCss,
  }
}

export interface ResolveViteCssTransformCachePlanOptions {
  cssBundleSourceHash?: string | undefined
  cssIsMainChunk: boolean
  cssRuntimeAffectingHash: string
  cssShareScope: string
  linkedImpactSignature: string
  outputFile: string
  runtimeSignature: string
  scopedGeneratorCandidateSignature: string
  sourceTraceSignature: string
  tailwindcssMajorVersion?: number | undefined
}

export interface ViteCssTransformCachePlan {
  cssCacheKey: string
  cssHashKey: string
  cssRuntimeSignature: string
  cssSharedCacheKey: string
  cssTaskHash: string
  rememberedCssRuntimeSignature: string
}

export function resolveViteCssTransformCachePlan(
  options: ResolveViteCssTransformCachePlanOptions,
): ViteCssTransformCachePlan {
  const cssRuntimeSignature = createCssRuntimeSignature(
    options.runtimeSignature,
    options.scopedGeneratorCandidateSignature,
  )
  const rememberedCssRuntimeSignature = createRememberedCssRuntimeSignature(
    cssRuntimeSignature,
    options.cssRuntimeAffectingHash,
  )
  const tailwindcssMajorVersion = options.tailwindcssMajorVersion ?? 'unknown'
  const cssCacheKey = `${options.outputFile}:css:${cssRuntimeSignature}:${tailwindcssMajorVersion}`

  return {
    cssCacheKey,
    cssHashKey: cssCacheKey,
    cssRuntimeSignature,
    cssSharedCacheKey: [
      options.cssShareScope,
      cssRuntimeSignature,
      tailwindcssMajorVersion,
      options.cssIsMainChunk ? '1' : '0',
      options.cssRuntimeAffectingHash,
      options.scopedGeneratorCandidateSignature,
      options.sourceTraceSignature,
      ...(options.cssBundleSourceHash ? [options.cssBundleSourceHash] : []),
    ].join(':'),
    cssTaskHash: [
      options.cssRuntimeAffectingHash,
      options.scopedGeneratorCandidateSignature,
      options.sourceTraceSignature,
      options.linkedImpactSignature,
      ...(options.cssBundleSourceHash ? [options.cssBundleSourceHash] : []),
    ].join(':'),
    rememberedCssRuntimeSignature,
  }
}

export interface ResolveViteCssLinkedImpactSignatureOptions {
  changedHtmlFiles: ReadonlySet<string>
  changedJsFiles: ReadonlySet<string>
  runtimeAffectingSignatureByFile: ReadonlyMap<string, string>
}

export function resolveViteCssLinkedImpactSignature(
  options: ResolveViteCssLinkedImpactSignatureOptions,
) {
  return [
    ...[...options.changedHtmlFiles]
      .sort()
      .map(file => options.runtimeAffectingSignatureByFile.get(file) ?? ''),
    ...[...options.changedJsFiles]
      .sort()
      .map(file => options.runtimeAffectingSignatureByFile.get(file) ?? ''),
  ].join(':')
}
