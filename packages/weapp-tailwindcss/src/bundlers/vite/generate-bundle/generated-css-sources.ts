import type { OutputAsset, OutputBundle } from 'rollup'
import type { BundlerGeneratedCssMarkerBlock } from '../../shared/generated-css-marker'
import { hasBundlerGeneratedCssMarker, parseBundlerGeneratedCssMarkerBlocks } from '../../shared/generated-css-marker'

/** 在标记清理前固定本轮资产证据，不能借用上一轮 processed 身份恢复作者源。 */
export function snapshotGeneratedCssAssetSources(bundle: Readonly<OutputBundle>) {
  const files = new Set<string>()
  const sourceFilesByAsset = new WeakMap<OutputAsset, readonly string[]>()
  const sourceMarkersByAsset = new WeakMap<OutputAsset, readonly BundlerGeneratedCssMarkerBlock[]>()
  for (const [file, output] of Object.entries(bundle)) {
    if (output.type !== 'asset' || typeof output.source !== 'string' || !hasBundlerGeneratedCssMarker(output.source)) {
      continue
    }
    files.add(file)
    const markers = parseBundlerGeneratedCssMarkerBlocks(output.source)
      .filter(marker => marker.bundler === 'vite' && marker.file != null)
    sourceFilesByAsset.set(output, markers.map(marker => marker.file!))
    sourceMarkersByAsset.set(output, markers.map(marker => ({ ...marker, css: '' })))
  }
  return { files, sourceFilesByAsset, sourceMarkersByAsset }
}
