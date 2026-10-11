import type { OutputAsset, OutputBundle } from 'rollup'
import { Buffer } from 'node:buffer'
import { hasBundlerGeneratedCssMarker } from '../../shared/generated-css-marker'
import { normalizeOutputPathKey } from '../../shared/module-graph'
import { isRootMiniProgramStyleOutputFile } from './root-style-output'

// 框架增量 bundle 可以省略未修改的基础样式；重定向后仍需保留其原始贡献。
export function createFrameworkStyleMemory(targetByFile: Map<string, string>) {
  const sources = new Map<string, OutputAsset>()
  return {
    prepare(bundle: OutputBundle, removedFiles: Iterable<string>) {
      for (const file of removedFiles) {
        const key = normalizeOutputPathKey(file)
        sources.delete(key)
        for (const [source, target] of targetByFile) {
          if (normalizeOutputPathKey(source) === key || normalizeOutputPathKey(target) === key) {
            sources.delete(normalizeOutputPathKey(source))
            targetByFile.delete(source)
          }
        }
      }
      const currentFiles = new Set(Object.entries(bundle).map(([file, asset]) => normalizeOutputPathKey(asset.fileName || file)))
      for (const [file, asset] of sources) {
        if (!currentFiles.has(file)) {
          bundle[file] = { ...asset }
        }
      }
      const inputs = new Map<string, OutputAsset>()
      for (const [file, asset] of Object.entries(bundle)) {
        if (asset.type !== 'asset' || !isRootMiniProgramStyleOutputFile(asset.fileName || file)) {
          continue
        }
        const source = typeof asset.source === 'string' ? asset.source : Buffer.from(asset.source).toString()
        if (hasBundlerGeneratedCssMarker(source)) {
          sources.delete(normalizeOutputPathKey(asset.fileName || file))
        }
        else {
          inputs.set(normalizeOutputPathKey(asset.fileName || file), { ...asset, source })
        }
      }
      return () => {
        const mappedFiles = new Set([...targetByFile.keys()].map(normalizeOutputPathKey))
        for (const file of sources.keys()) {
          if (!mappedFiles.has(file)) {
            sources.delete(file)
          }
        }
        for (const [file, asset] of inputs) {
          if (mappedFiles.has(file)) {
            sources.set(file, asset)
          }
        }
      }
    },
  }
}
