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

  const markSource = (file: string) => {
    sourceFiles.add(path.resolve(cleanUrl(file)))
  }

  const record = (
    file: string,
    css: string,
    options: Omit<ViteProcessedCssRecord, 'css'> = {},
  ) => {
    const key = normalizeVitePersistentCacheKey(file)
    const previous = results.get(key)
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
    for (const [key, result] of results) {
      const outputKey = result.outputFile
        ? normalizeVitePersistentCacheKey(result.outputFile)
        : undefined
      if (!activeFiles.has(key) && (outputKey == null || !activeFiles.has(outputKey))) {
        results.delete(key)
      }
    }
  }

  return {
    dispose() {
      results.clear()
      sourceFiles.clear()
    },
    entries: () => results.entries(),
    get,
    getStats: () => ({
      viteProcessedCssAssetResults: results.size,
      viteProcessedCssAssetResultsRaw: summarizeViteProcessedCssResults(results),
    }),
    markSource,
    matchesIdentity,
    prune,
    record,
    sourceFiles,
  }
}
