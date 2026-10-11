import type { FrameworkRootImportShellPlan, ResolveFrameworkRootImportShellPlanOptions } from './root-style-output'
import type { GenerateBundleContext } from './types'
import path from 'node:path'
import { normalizeMiniProgramImportShell } from '../../../generation/output-import-shell'
import { normalizeOutputPathKey } from '../../shared/module-graph'
import { isCssImportOnlyBundleAsset } from '../processed-css-assets'
import { applyCssResultToBundle } from './css-output-helpers'
import { isRootMiniProgramStyleOutputFile, resolveFrameworkRootImportShellPlan } from './root-style-output'

export function createFrameworkRootStyleOwnership(file: string, targetByFile: ReadonlyMap<string, string>) {
  const normalize = (value: string) => path.posix.normalize(normalizeOutputPathKey(value))
  const fileKey = normalize(file)
  return (target: string | undefined) => {
    if (!isRootMiniProgramStyleOutputFile(fileKey) || !target) {
      return true
    }
    const targetKey = normalize(target)
    const owners = [...targetByFile].filter(([, output]) => normalize(output) === targetKey)
    // 已登记的框架贡献拥有生成目标，不能因增量资产的枚举顺序把入口分配给另一个根资产。
    return targetKey === fileKey || owners.length === 0 || owners.some(([owner]) => normalize(owner) === fileKey)
  }
}

type ImportShellOptions = Parameters<typeof applyCssResultToBundle>[0] & {
  activeViteCssCacheFiles: Set<string>
  bundleFiles: string[]
  debug: GenerateBundleContext['debug']
  frameworkRootImportShellTargetByFile: Map<string, string>
  lastCssResultByFile: Map<string, string>
  markCssAssetProcessed: GenerateBundleContext['markCssAssetProcessed']
  normalizeViteCssCacheKey: (file: string) => string
  onUpdate: GenerateBundleContext['opts']['onUpdate']
  originalEntrySource: string
  recordCssAssetResult: GenerateBundleContext['recordCssAssetResult']
  rootImportShellPlan: FrameworkRootImportShellPlan
  runtimeState: GenerateBundleContext['runtimeState']
}

export function preserveFrameworkRootImportShell(options: ImportShellOptions) {
  const { outputFile, rootImportShellPlan } = options
  // 导入壳属于原资产，不能作为样式贡献写入目标，否则 watch 回放会产生自引用。
  if (!rootImportShellPlan.targetToRemember) {
    options.frameworkRootImportShellTargetByFile.delete(outputFile)
  }
  const source = normalizeMiniProgramImportShell(options.source, {
    outputFile,
    outputFiles: [...options.bundleFiles, ...options.lastCssResultByFile.keys()],
  })
  applyCssResultToBundle({ ...options, source, viteProcessedCssAsset: false })
  options.activeViteCssCacheFiles.add(options.normalizeViteCssCacheKey(outputFile))
  options.markCssAssetProcessed?.(options.originalSource, outputFile)
  options.recordCssAssetResult?.(outputFile, source)
  options.onUpdate(outputFile, options.originalEntrySource, source)
  options.debug('css preserve framework import shell asset: %s', outputFile)
  // 目标缺席时仍可从已登记的 Tailwind 入口生成样式，不能把导入壳当作生成内容。
  return !rootImportShellPlan.targetToRemember
    || options.runtimeState.tailwindRuntime.majorVersion !== 4
    || isCssImportOnlyBundleAsset(options.bundle, options.file, source)
}

type RootStylePlanOptions = Omit<ResolveFrameworkRootImportShellPlanOptions, 'isMainChunk' | 'matchesCss' | 'rememberedTarget' | 'shouldKeep' | 'shouldMoveToOrigin'> & {
  opts: GenerateBundleContext['opts']
  cssPipelineStrategy: GenerateBundleContext['cssPipelineStrategy']
  pipelineContext: Parameters<typeof applyCssResultToBundle>[0]['pipelineContext']
  targetByFile: Map<string, string>
  debug: GenerateBundleContext['debug']
}

export function planFrameworkRootStyle(options: RootStylePlanOptions) {
  const { opts, rootImportShellOutputFile: file, cssPipelineStrategy, pipelineContext, targetByFile } = options
  const plan = resolveFrameworkRootImportShellPlan({
    ...options,
    isMainChunk: opts.mainCssChunkMatcher(file, opts.appType),
    matchesCss: opts.cssMatcher(file) || opts.cssMatcher(options.file),
    rememberedTarget: targetByFile.get(file),
    shouldKeep: () => cssPipelineStrategy?.shouldKeepRootMiniProgramStyleAsImportShell?.({ ...pipelineContext, css: options.rawSource, file }),
    shouldMoveToOrigin: () => cssPipelineStrategy?.shouldMoveRootMiniProgramStyleToImportShellOrigin?.({ ...pipelineContext, file }),
  })
  if (plan.targetToRemember) {
    targetByFile.set(file, plan.targetToRemember)
    if (!plan.isCurrentImportShell) {
      options.debug('css remember framework root generated target: %s -> %s', file, plan.targetToRemember)
    }
  }
  return plan
}

type PrepareRootStyleOptions = Omit<RootStylePlanOptions, 'configuredTargetFiles' | 'processedTargetFiles' | 'targetByFile'> & {
  frameworkRootImportShellTargetByFile: Map<string, string>
  getConfiguredTailwindV4CssSourceEntries: () => Array<{ file: string }>
  getViteProcessedCssAssetResults: GenerateBundleContext['getViteProcessedCssAssetResults']
  resolveMatchedCssSourceOutputFile: (file: string) => string | undefined
  resolveProcessedOutputFile: (file: string) => string
}

export function prepareFrameworkRootStyle(options: PrepareRootStyleOptions) {
  const targetByFile = options.frameworkRootImportShellTargetByFile
  const canClaimConfiguredOutput = createFrameworkRootStyleOwnership(options.rootImportShellOutputFile, targetByFile)
  const rootImportShellPlan = planFrameworkRootStyle({
    ...options,
    targetByFile,
    configuredTargetFiles: options.getConfiguredTailwindV4CssSourceEntries().map(entry => options.resolveMatchedCssSourceOutputFile(entry.file)).filter(canClaimConfiguredOutput),
    processedTargetFiles: [...options.getViteProcessedCssAssetResults?.() ?? []].flatMap(([, record]) => {
      return typeof record === 'string' || record.injectIntoMain !== true || !record.outputFile
        ? []
        : [options.resolveProcessedOutputFile(record.outputFile)]
    }).filter(canClaimConfiguredOutput),
  })
  return { rootImportShellPlan, canClaimConfiguredOutput }
}
