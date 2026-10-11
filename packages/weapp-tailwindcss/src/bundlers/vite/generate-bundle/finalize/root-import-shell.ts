import type { OutputAsset, OutputChunk } from 'rollup'
import type { BundleBuildState, BundleSnapshot } from '../../bundle-state'
import type { ViteFrameworkCssPipelineContext, ViteFrameworkCssPipelineStrategy } from '../../shared/framework-strategy'
import type { BundleMetrics } from '../metrics'
import type { GenerateBundleContext, PendingRememberedCssReplayUpdate } from '../types'
import path from 'node:path'
import { transformWebCssCompat, transformWebCssSafeSelectors } from '@weapp-tailwindcss/postcss/transform'
import { AssetEmissionPlan } from '@/compiler'
import { normalizeWeappTailwindcssGeneratorOptions } from '@/generator'
import { isPureLocalCssImportWrapper } from '../../../../generation/local-imports'
import { normalizeOutputPathKey } from '../../../shared/module-graph'
import { applyViteAssetEmissionPlan } from '../asset-emission-plan'
import { resolveSingleCssImportOutputFile } from '../root-style-output'

export interface FinalizeGenerateBundleOptions {
  activeProcessCacheKeys: Set<string>
  activeProcessHashKeys: Set<string | number>
  activeViteCssCacheFiles: Set<string>
  bundle: Record<string, OutputAsset | OutputChunk>
  bundleFiles: string[]
  cache: GenerateBundleContext['opts']['cache']
  cssTaskFactories: Array<() => Promise<void>>
  cssPipelineStrategy?: ViteFrameworkCssPipelineStrategy | undefined
  createCssPipelineContext?: ((file: string) => ViteFrameworkCssPipelineContext) | undefined
  debug: GenerateBundleContext['debug']
  defaultStyleOutputExtension: string
  formatIteration: number
  generatorCandidateSignature: string
  generatorRuntime: Set<string>
  getCssHandlerOptions: (file: string) => ReturnType<ReturnType<typeof import('../../css-handler-options').createCssHandlerOptionsCache>['getCssHandlerOptions']>
  getSourceCandidateSourcesForEntries: GenerateBundleContext['getSourceCandidateSourcesForEntries']
  getSourceCandidatesForEntries: GenerateBundleContext['getSourceCandidatesForEntries']
  getViteCssCacheStats: GenerateBundleContext['getViteCssCacheStats']
  getViteProcessedCssAssetResults: GenerateBundleContext['getViteProcessedCssAssetResults']
  hmrTimingRecorder: GenerateBundleContext['hmrTimingRecorder']
  hmrTimingStartedAt: number
  isHarmonyAppStyleTarget: boolean
  isNativeAppStyleTarget: boolean
  isViteProcessedCssAsset: GenerateBundleContext['isViteProcessedCssAsset']
  isWebGeneratorTarget: boolean
  jsAfterCss: boolean
  jsTaskFactories: Array<() => Promise<void>>
  lastCssResultByFile: Map<string, string>
  lastCssSourceHashByFile: Map<string, string>
  linkedByEntry: Map<string, Set<string>> | undefined
  markCssAssetProcessed: GenerateBundleContext['markCssAssetProcessed']
  metrics: BundleMetrics
  onEnd: GenerateBundleContext['opts']['onEnd']
  onUpdate: GenerateBundleContext['opts']['onUpdate']
  opts: GenerateBundleContext['opts']
  outDir: string
  pendingLinkedUpdates: Array<() => void>
  pendingRememberedCssReplayUpdates: PendingRememberedCssReplayUpdate[]
  prepareJsTransformRuntime?: (() => void) | undefined
  pruneViteCssCaches: GenerateBundleContext['pruneViteCssCaches']
  recordCssAssetResult: GenerateBundleContext['recordCssAssetResult']
  recordTimingDetail: (name: string, startedAt: number) => void
  recordViteProcessedCssAssetResult: GenerateBundleContext['recordViteProcessedCssAssetResult']
  rootDir: string
  runtime: Set<string>
  runtimeState: GenerateBundleContext['runtimeState']
  shouldPreserveAppCssExtension: boolean
  snapshot: BundleSnapshot
  sourceCandidates: Set<string>
  sourceRoot: string | undefined
  state: BundleBuildState
  styleHandler: GenerateBundleContext['opts']['styleHandler']
  tasks: Promise<void>[]
  timingDetails: Record<string, number>
  transformRuntime: Set<string>
  transformWebTargetCss?: ((css: string, file: string) => string) | undefined
  useIncrementalMode: boolean
}

function readAssetSource(asset: OutputAsset) {
  return typeof asset.source === 'string' ? asset.source : asset.source.toString()
}

function getAssetFile(bundleFile: string, asset: OutputAsset) {
  return asset.fileName || bundleFile
}

export function finalizeWebviewCssCompat(
  bundle: Record<string, OutputAsset | OutputChunk>,
  options: Pick<FinalizeGenerateBundleOptions, 'debug' | 'onUpdate' | 'opts' | 'recordCssAssetResult'>,
) {
  const generatorOptions = normalizeWeappTailwindcssGeneratorOptions(options.opts.generator)
  if (generatorOptions.webCompat === false) {
    return 0
  }
  const plan = new AssetEmissionPlan()
  const writeTargets = new Map<string, OutputAsset>()
  let transformed = 0
  for (const [bundleFile, output] of Object.entries(bundle)) {
    if (output.type !== 'asset') {
      continue
    }
    const file = getAssetFile(bundleFile, output)
    if (!options.opts.cssMatcher(file) || !/\.css(?:$|[?#])/i.test(file)) {
      continue
    }
    const rawSource = readAssetSource(output)
    const nextCss = transformWebCssSafeSelectors(
      transformWebCssCompat(rawSource, generatorOptions.webCompat ?? true),
      { escapeMap: options.opts.escapeMap },
    )
    if (nextCss === rawSource) {
      continue
    }
    plan.write(file, nextCss)
    writeTargets.set(file, output)
    options.recordCssAssetResult?.(file, nextCss)
    options.onUpdate(file, rawSource, nextCss)
    options.debug('finalize webview css compat: %s bytes=%d', file, nextCss.length)
    transformed++
  }
  applyViteAssetEmissionPlan(plan, {
    bundle,
    writeTargets,
  })
  return transformed
}

function isRootMiniProgramStyleOutputFile(file: string) {
  const normalized = normalizeOutputPathKey(file.replace(/[?#].*$/, ''))
  return !normalized.includes('/')
    && /\.(?:wxss|acss|ttss|qss|jxss|tyss)$/i.test(normalized)
}

function createRelativeCssImportRequest(targetFile: string, importedFile: string) {
  const normalizedTargetFile = normalizeOutputPathKey(targetFile.replace(/[?#].*$/, ''))
  const normalizedImportedFile = normalizeOutputPathKey(importedFile.replace(/[?#].*$/, ''))
  const targetDir = path.posix.dirname(normalizedTargetFile)
  const baseDir = targetDir === '.' ? '' : targetDir
  const relative = path.posix.relative(baseDir, normalizedImportedFile)
  return relative.startsWith('.') ? relative : `./${relative}`
}

function createCssImportShell(targetFile: string, importedFile: string) {
  return `@import "${createRelativeCssImportRequest(targetFile, importedFile)}";\n`
}

function resolveRootMiniProgramOriginStyleFile(file: string) {
  const normalized = normalizeOutputPathKey(file.replace(/[?#].*$/, ''))
  if (!isRootMiniProgramStyleOutputFile(normalized)) {
    return
  }
  if (/(?:^|\/)[^/]+-origin\.[^.]+$/i.test(normalized)) {
    return
  }
  return normalized.replace(/(\.[^.]+)$/, '-origin$1')
}

export function normalizeRootMiniProgramImportShellAssets(
  bundle: Record<string, OutputAsset | OutputChunk>,
  options: Pick<GenerateBundleContext['opts'], 'cssMatcher'> & {
    debug: GenerateBundleContext['debug']
    enabled: boolean
    onUpdate: GenerateBundleContext['opts']['onUpdate']
    recordCssAssetResult: GenerateBundleContext['recordCssAssetResult']
  },
) {
  if (!options.enabled) {
    return 0
  }
  const plan = new AssetEmissionPlan()
  const writeTargets = new Map<string, OutputAsset>()
  let updated = 0
  for (const [rootBundleFile, rootOutput] of Object.entries(bundle)) {
    if (rootOutput.type !== 'asset') {
      continue
    }
    const rootFile = getAssetFile(rootBundleFile, rootOutput)
    if (!isRootMiniProgramStyleOutputFile(rootFile) || !options.cssMatcher(rootFile)) {
      continue
    }
    const originFile = resolveRootMiniProgramOriginStyleFile(rootFile)
    if (!originFile || !options.cssMatcher(originFile)) {
      continue
    }
    const originOutput = Object.entries(bundle).find(([bundleFile, output]) =>
      output.type === 'asset'
      && normalizeOutputPathKey(getAssetFile(bundleFile, output)) === normalizeOutputPathKey(originFile),
    )?.[1]
    if (originOutput?.type !== 'asset') {
      continue
    }
    const rootSource = readAssetSource(rootOutput)
    const importedRootFile = resolveSingleCssImportOutputFile(rootFile, rootSource)
    if (importedRootFile && normalizeOutputPathKey(importedRootFile) === normalizeOutputPathKey(originFile)) {
      const nextRootSource = createCssImportShell(rootFile, originFile)
      if (rootSource === nextRootSource) {
        continue
      }
      plan.write(rootFile, nextRootSource)
      writeTargets.set(rootFile, rootOutput)
      options.recordCssAssetResult?.(rootFile, nextRootSource)
      options.onUpdate?.(rootFile, rootSource, nextRootSource)
      options.debug('normalize root css import shell request: %s -> %s', rootFile, originFile)
      updated++
      continue
    }
    if (isPureLocalCssImportWrapper(rootSource)) {
      continue
    }
    const originSource = readAssetSource(originOutput)
    if (isPureLocalCssImportWrapper(originSource)) {
      const importedFile = resolveSingleCssImportOutputFile(originFile, originSource)
      if (importedFile && normalizeOutputPathKey(importedFile) !== normalizeOutputPathKey(rootFile)) {
        continue
      }
    }
    else if (originSource.trim().length > 0 && originSource.trim() !== rootSource.trim()) {
      continue
    }
    const nextRootSource = createCssImportShell(rootFile, originFile)
    if (rootSource === nextRootSource) {
      continue
    }
    plan.write(rootFile, nextRootSource)
    plan.write(originFile, rootSource)
    writeTargets.set(rootFile, rootOutput)
    writeTargets.set(originFile, originOutput)
    options.recordCssAssetResult?.(rootFile, nextRootSource)
    options.recordCssAssetResult?.(originFile, rootSource)
    options.onUpdate?.(rootFile, rootSource, nextRootSource)
    options.onUpdate?.(originFile, originSource, rootSource)
    options.debug('normalize root css import shell: %s -> %s', rootFile, originFile)
    updated++
  }
  applyViteAssetEmissionPlan(plan, {
    bundle,
    writeTargets,
  })
  return updated
}
