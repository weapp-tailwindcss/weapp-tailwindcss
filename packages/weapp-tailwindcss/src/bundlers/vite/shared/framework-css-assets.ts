import type { OutputAsset } from 'rollup'
import type { GenerateBundleContext } from '../generate-bundle/types'
import type { SourceCandidateCollector } from '../source-candidates'
import type { createDebug } from '@/debug'
import { Buffer } from 'node:buffer'
import { LRUCache } from 'lru-cache'
import { hasUserCssLayerBlocks, splitUserCssLayerBlocks } from '@/generation/user-css'
import { normalizeOutputPathKey } from '../../shared/module-graph'
import { createViteCssMemory } from '../css-memory'
import { touchMapEntry } from '../map-cache'
import { normalizeVitePersistentCacheKey, summarizeStringCache } from '../plugin-cache'
import { cleanUrl, isCSSRequest } from '../utils'
import { createFrameworkProcessedCssRegistry } from './framework-processed-css-registry'

interface FrameworkCssAssetsOptions {
  debug: ReturnType<typeof createDebug>
  getSourceCandidateSource: SourceCandidateCollector['source']
}
/** CSS 资产状态属于当前插件实例，统一维护记录、裁剪及释放。 */
export function createFrameworkCssAssets({ debug, getSourceCandidateSource }: FrameworkCssAssetsOptions) {
  const originalCssLayerSourceByFile = new LRUCache<string, string>({ max: 128 })
  const rememberOriginalCssLayerSource = (id: string, code: string) => {
    const file = cleanUrl(id)
    if (!isCSSRequest(file)) {
      return
    }
    if (!hasUserCssLayerBlocks(code)) {
      originalCssLayerSourceByFile.delete(file)
      return
    }
    originalCssLayerSourceByFile.set(file, splitUserCssLayerBlocks(code).layer)
  }
  let processedCssAssets = new WeakSet<OutputAsset>()
  const processedCssAssetSourceByFile = new Map<string, string>()
  const cleanGeneratedCssByFile = new Map<string, string>()
  const tracedGeneratedCssByFile = new Map<string, string>()
  const generatedClassSetByFile = new Map<string, Set<string>>()
  const processedCssRegistry = createFrameworkProcessedCssRegistry()
  const cssMemory = createViteCssMemory({ debug, getSourceCandidateSource })
  const readCssAssetSource = (asset: OutputAsset) => {
    return typeof asset.source === 'string' ? asset.source : asset.source instanceof Uint8Array ? Buffer.from(asset.source).toString() : String(asset.source ?? '')
  }
  const markCssAssetProcessed = (asset: OutputAsset, file?: string) => {
    processedCssAssets.add(asset)
    if (file) {
      processedCssAssetSourceByFile.set(normalizeOutputPathKey(file), readCssAssetSource(asset))
    }
  }
  const isCssAssetProcessed = (asset: OutputAsset, file?: string) => {
    if (processedCssAssets.has(asset)) {
      return true
    }
    if (!file) {
      return false
    }
    const source = readCssAssetSource(asset)
    if (processedCssAssetSourceByFile.get(normalizeOutputPathKey(file)) === source) {
      return true
    }
    const record = processedCssRegistry.get(file)
    if (!record) {
      return false
    }
    return source === record.css
  }
  const recordCssAssetResult = (file: string, css: string) => {
    touchMapEntry(cleanGeneratedCssByFile, normalizeVitePersistentCacheKey(file), css)
  }
  const recordViteProcessedCssAssetResult = processedCssRegistry.record
  const getViteProcessedCssAssetResults = processedCssRegistry.entries
  const getViteProcessedCssAssetResult = processedCssRegistry.get
  const getViteCssCacheStats = () => ({ cleanGeneratedCssByFile: cleanGeneratedCssByFile.size, cleanGeneratedCssByFileRaw: summarizeStringCache(cleanGeneratedCssByFile), tracedGeneratedCssByFile: tracedGeneratedCssByFile.size, tracedGeneratedCssByFileRaw: summarizeStringCache(tracedGeneratedCssByFile), generatedClassSetByFile: generatedClassSetByFile.size, ...processedCssRegistry.getStats(), ...cssMemory.getStats() })
  const pruneViteCssCaches: NonNullable<GenerateBundleContext['pruneViteCssCaches']> = (options2) => {
    const activeFiles = new Set([...options2.activeFiles].map(normalizeVitePersistentCacheKey))
    const activeOutputFiles = new Set([...options2.activeFiles].map(normalizeOutputPathKey))
    for (const key of processedCssAssetSourceByFile.keys()) {
      if (!activeOutputFiles.has(key)) {
        processedCssAssetSourceByFile.delete(key)
      }
    }
    for (const key of cleanGeneratedCssByFile.keys()) {
      if (!activeFiles.has(key)) {
        cleanGeneratedCssByFile.delete(key)
      }
    }
    for (const key of tracedGeneratedCssByFile.keys()) {
      if (!activeFiles.has(key)) {
        tracedGeneratedCssByFile.delete(key)
      }
    }
    for (const key of generatedClassSetByFile.keys()) {
      if (!activeFiles.has(key)) {
        generatedClassSetByFile.delete(key)
      }
    }
    processedCssRegistry.prune(activeFiles)
    cssMemory.prune(options2)
  }
  const frameworkRootImportShellTargetByFile = new Map<string, string>()
  return {
    originalCssLayerSourceByFile,
    rememberOriginalCssLayerSource,
    cleanGeneratedCssByFile,
    tracedGeneratedCssByFile,
    generatedClassSetByFile,
    processedCssRegistry,
    cssMemory,
    markCssAssetProcessed,
    isCssAssetProcessed,
    recordCssAssetResult,
    recordViteProcessedCssAssetResult,
    getViteProcessedCssAssetResults,
    getViteProcessedCssAssetResult,
    pruneViteCssCaches,
    frameworkRootImportShellTargetByFile,
    getStats: getViteCssCacheStats,
    dispose() {
      processedCssAssets = new WeakSet()
      originalCssLayerSourceByFile.clear()
      processedCssAssetSourceByFile.clear()
      cleanGeneratedCssByFile.clear()
      tracedGeneratedCssByFile.clear()
      generatedClassSetByFile.clear()
      frameworkRootImportShellTargetByFile.clear()
      processedCssRegistry.dispose()
      cssMemory.dispose()
    },
  }
}
