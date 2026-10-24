import type { ViteProcessedCssAssetOutputsReplacer } from '../processed-css-assets/output-ownership'
import path from 'node:path'
import { touchMapEntry } from '../map-cache'
import { normalizeVitePersistentCacheKey, summarizeViteProcessedCssResults } from '../plugin-cache'
import { cleanUrl } from '../utils'

export interface ViteProcessedCssRecord {
  css: string
  injectIntoMain?: boolean | undefined
  outputFile?: string | undefined
}

export function createFrameworkProcessedCssRegistry() {
  const results = new Map<string, ViteProcessedCssRecord>()
  const sourceFiles = new Set<string>()
  const recordSourceAssets = new Map<string, Set<string>>()
  const recordsBySourceAsset = new Map<string, Set<string>>()
  const independentRecords = new Map<string, ViteProcessedCssRecord>()
  const outputsByProjection = new Map<string, { source: string, files: Set<string> }>()
  const projectionsBySource = new Map<string, Set<string>>()
  const projectionsByOutput = new Map<string, Set<string>>()

  const detachRecord = (key: string) => {
    for (const output of recordSourceAssets.get(key) ?? []) {
      const records = recordsBySourceAsset.get(output)
      records?.delete(key)
      if (records?.size === 0) {
        recordsBySourceAsset.delete(output)
      }
    }
    recordSourceAssets.delete(key)
  }

  const removeRecord = (key: string, restoreIndependent = false) => {
    detachRecord(key)
    const independent = independentRecords.get(key)
    if (restoreIndependent && independent) {
      results.set(key, independent)
    }
    else {
      results.delete(key)
    }
    independentRecords.delete(key)
  }

  const invalidateOutput = (output: string, currentFiles?: Set<string>) => {
    for (const key of [...(recordsBySourceAsset.get(output) ?? []), output]) {
      if (!currentFiles?.has(key)) {
        removeRecord(key, key !== output)
      }
    }
  }

  const detachOutput = (output: string) => {
    for (const identity of projectionsByOutput.get(output) ?? []) {
      const projection = outputsByProjection.get(identity)
      if (!projection) {
        continue
      }
      projection.files.delete(output)
      if (projection.files.size === 0) {
        outputsByProjection.delete(identity)
        const sourceProjections = projectionsBySource.get(projection.source)
        sourceProjections?.delete(identity)
        if (sourceProjections?.size === 0) {
          projectionsBySource.delete(projection.source)
        }
      }
    }
    projectionsByOutput.delete(output)
  }

  const replaceOutputs: ViteProcessedCssAssetOutputsReplacer = (outputs) => {
    const current = new Map<string, { source: string, files: Set<string> }>()
    const currentFiles = new Set<string>()
    for (const output of outputs) {
      const source = normalizeVitePersistentCacheKey(cleanUrl(output.sourceFile))
      const file = normalizeVitePersistentCacheKey(output.outputFile)
      const identity = JSON.stringify([source, output.outputName === undefined ? ['file', file] : ['name', normalizeVitePersistentCacheKey(output.outputName)]])
      const entry = current.get(identity) ?? { source, files: new Set<string>() }
      entry.files.add(file)
      current.set(identity, entry)
      currentFiles.add(file)
    }
    const replaced = new Set(currentFiles)
    for (const identity of current.keys()) {
      for (const output of outputsByProjection.get(identity)?.files ?? []) {
        replaced.add(output)
      }
    }
    // 明确替换物理产物时同步撤销其全部别名及复合来源，其他独立投影保持有效。
    for (const output of replaced) {
      detachOutput(output)
      if (!currentFiles.has(output)) {
        invalidateOutput(output, currentFiles)
      }
    }
    // 先撤销全部旧边再登记本批产物；当前仍显式存在的复合资产不受枚举顺序影响。
    for (const [identity, entry] of current) {
      outputsByProjection.set(identity, entry)
      const projections = projectionsBySource.get(entry.source) ?? new Set<string>()
      projections.add(identity)
      projectionsBySource.set(entry.source, projections)
      for (const output of entry.files) {
        const owners = projectionsByOutput.get(output) ?? new Set<string>()
        owners.add(identity)
        projectionsByOutput.set(output, owners)
      }
    }
  }

  const removeSource = (file: string) => {
    const source = normalizeVitePersistentCacheKey(cleanUrl(file))
    const retired = new Set<string>()
    for (const identity of projectionsBySource.get(source) ?? []) {
      for (const output of outputsByProjection.get(identity)?.files ?? []) {
        retired.add(output)
      }
    }
    // 复合产物依赖每个贡献来源，删除任一来源都会使整个旧快照失效。
    for (const output of retired) {
      detachOutput(output)
      invalidateOutput(output)
    }
    removeRecord(source)
    sourceFiles.delete(path.resolve(cleanUrl(file)))
  }

  const markSource = (file: string) => {
    sourceFiles.add(path.resolve(cleanUrl(file)))
  }

  const record = (
    file: string,
    css: string,
    options: Omit<ViteProcessedCssRecord, 'css'> & { sourceAsset?: string | undefined, mergeSourceAssets?: boolean | undefined } = {},
  ) => {
    const key = normalizeVitePersistentCacheKey(file)
    const previous = results.get(key)
    const previousAssets = recordSourceAssets.get(key)
    const sourceAssets = new Set(options.mergeSourceAssets ? previousAssets : [])
    if (options.sourceAsset !== undefined) {
      const sourceAsset = normalizeVitePersistentCacheKey(options.sourceAsset)
      sourceAssets.add(sourceAsset)
      if (key !== sourceAsset && previous && !previousAssets) {
        independentRecords.set(key, previous)
      }
    }
    else {
      independentRecords.delete(key)
    }
    detachRecord(key)
    if (sourceAssets.size > 0) {
      recordSourceAssets.set(key, sourceAssets)
      for (const output of sourceAssets) {
        const records = recordsBySourceAsset.get(output) ?? new Set<string>()
        records.add(key)
        recordsBySourceAsset.set(output, records)
      }
    }
    const injectIntoMain = previous?.injectIntoMain === true
      ? true
      : options.injectIntoMain ?? previous?.injectIntoMain
    touchMapEntry(results, key, {
      css,
      injectIntoMain,
      outputFile: options.outputFile ?? previous?.outputFile,
    })
  }

  const get = (file: string) => results.get(normalizeVitePersistentCacheKey(file))

  const matchesIdentity = (candidate: string) => {
    return sourceFiles.has(path.resolve(cleanUrl(candidate)))
  }

  const prune = (activeFiles: Set<string>) => {
    const isActiveRecord = (key: string) => {
      const outputFile = results.get(key)?.outputFile
      return activeFiles.has(key)
        || (outputFile !== undefined && activeFiles.has(normalizeVitePersistentCacheKey(outputFile)))
    }
    for (const [output, projections] of projectionsByOutput) {
      const hasActiveSource = [...projections].some((identity) => {
        const source = outputsByProjection.get(identity)?.source
        return source !== undefined && activeFiles.has(source)
      })
      if (!hasActiveSource && !isActiveRecord(output) && ![...(recordsBySourceAsset.get(output) ?? [])].some(isActiveRecord)) {
        detachOutput(output)
        invalidateOutput(output)
      }
    }
    for (const key of results.keys()) {
      if (!isActiveRecord(key)) {
        removeRecord(key)
      }
    }
  }

  return {
    dispose() {
      results.clear()
      sourceFiles.clear()
      recordSourceAssets.clear()
      recordsBySourceAsset.clear()
      independentRecords.clear()
      outputsByProjection.clear()
      projectionsBySource.clear()
      projectionsByOutput.clear()
    },
    entries: () => results.entries(),
    get,
    getStats: () => ({
      viteProcessedCssAssetResults: results.size,
      viteProcessedCssAssetProjections: outputsByProjection.size,
      viteProcessedCssAssetOutputs: projectionsByOutput.size,
      viteProcessedCssAssetDerivedRecords: recordSourceAssets.size,
      viteProcessedCssAssetIndependentRecords: independentRecords.size,
      viteProcessedCssAssetResultsRaw: summarizeViteProcessedCssResults(results),
    }),
    markSource,
    matchesIdentity,
    prune,
    record,
    removeSource,
    replaceOutputs,
    sourceFiles,
  }
}
