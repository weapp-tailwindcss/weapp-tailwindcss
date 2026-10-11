import type { FinalizeGenerateBundleOptions } from './root-import-shell'
import { normalizeOutputPathKey } from '../../../shared/module-graph'
import { resolveViteCssPipelineOutputFile } from '../../css-output'
import { collectViteProcessedCssAssetResults, injectViteProcessedCssIntoMainCssAssets } from '../../processed-css-assets'
import { collectMiniProgramSubpackageRoots } from '../subpackages'

type SyncProcessedCssOptions = Pick<
  FinalizeGenerateBundleOptions,
  | 'bundle'
  | 'opts'
  | 'cssPipelineStrategy'
  | 'createCssPipelineContext'
  | 'isViteProcessedCssAsset'
  | 'markCssAssetProcessed'
  | 'recordCssAssetResult'
  | 'recordViteProcessedCssAssetResult'
  | 'rootDir'
  | 'isWebGeneratorTarget'
  | 'shouldPreserveAppCssExtension'
  | 'sourceRoot'
  | 'defaultStyleOutputExtension'
  | 'bundleFiles'
  | 'transformWebTargetCss'
  | 'debug'
  | 'recordTimingDetail'
  | 'getViteProcessedCssAssetResults'
  | 'onUpdate'
  | 'pendingRememberedCssReplayUpdates'
>

export function syncProcessedCss(options: SyncProcessedCssOptions) {
  const { bundle, opts, cssPipelineStrategy, createCssPipelineContext, isViteProcessedCssAsset, markCssAssetProcessed, recordCssAssetResult, recordViteProcessedCssAssetResult, rootDir, isWebGeneratorTarget, shouldPreserveAppCssExtension, sourceRoot, defaultStyleOutputExtension, bundleFiles, transformWebTargetCss, debug, recordTimingDetail, getViteProcessedCssAssetResults, onUpdate, pendingRememberedCssReplayUpdates } = options
  const collectStartedAt = performance.now()
  collectViteProcessedCssAssetResults(bundle, {
    opts,
    cssPipelineStrategy,
    createCssPipelineContext,
    isViteProcessedCssAsset,
    markCssAssetProcessed,
    recordCssAssetResult,
    recordViteProcessedCssAssetResult,
    resolveViteProcessedCssOutputFile: file => resolveViteCssPipelineOutputFile(file, opts, rootDir, isWebGeneratorTarget, shouldPreserveAppCssExtension, sourceRoot, defaultStyleOutputExtension, bundleFiles),
    subpackageRoots: collectMiniProgramSubpackageRoots(bundle),
    transformCss: transformWebTargetCss,
    debug,
  })
  recordTimingDetail('finalize.processedCss.collect', collectStartedAt)
  const injectStartedAt = performance.now()
  // 先替换本轮重放的来源记录，再统一注入；追加新结果无法移除已注入的旧规则。
  const currentResults = new Map([...(getViteProcessedCssAssetResults?.() ?? [])]
    .map(([file, record]) => [normalizeOutputPathKey(file), [file, record] as [string, typeof record]]))
  for (const update of pendingRememberedCssReplayUpdates) {
    recordViteProcessedCssAssetResult?.(update.file, update.css, update)
    currentResults.set(normalizeOutputPathKey(update.file), [update.file, {
      css: update.css,
      injectIntoMain: update.injectIntoMain,
      outputFile: update.outputFile,
    }])
  }
  const injected = injectViteProcessedCssIntoMainCssAssets(bundle, {
    opts,
    cssPipelineStrategy,
    createCssPipelineContext,
    getViteProcessedCssAssetResults: () => currentResults.values(),
    markCssAssetProcessed,
    recordCssAssetResult,
    transformCss: transformWebTargetCss,
    shouldRemoveInjectedSourceAsset: (targetFile, record) => {
      if (record.injectIntoMain === false) {
        return false
      }
      const targetFileKey = normalizeOutputPathKey(targetFile)
      const recordFileKey = normalizeOutputPathKey(record.file)
      return recordFileKey !== targetFileKey
    },
    debug,
    onUpdate,
    recordTimingDetail,
  })
  recordTimingDetail('finalize.processedCss.inject', injectStartedAt)
  return injected
}
