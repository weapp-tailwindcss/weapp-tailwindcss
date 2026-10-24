import type { OutputBundle } from 'rollup'
import { parseBundlerGeneratedCssMarkerBlocks } from '../../shared/generated-css-marker'
import { getAssetFile, isCssOutputFile, readAssetSource } from './markers-imports'

export interface ViteProcessedCssAssetOutput {
  sourceFile: string
  outputFile: string
  outputName?: string | undefined
}

export type ViteProcessedCssAssetOutputsReplacer = (outputs: readonly ViteProcessedCssAssetOutput[]) => void

/** 使用源码标记和 bundler 发射名称确定投影身份，不从内容 hash 文件名猜测来源。 */
export function collectViteProcessedCssAssetOutputs(bundle: OutputBundle): ViteProcessedCssAssetOutput[] {
  const outputs: ViteProcessedCssAssetOutput[] = []
  for (const [bundleFile, output] of Object.entries(bundle)) {
    if (output.type !== 'asset' || !isCssOutputFile(getAssetFile(bundleFile, output))) {
      continue
    }
    const names = [...new Set([...(output.names ?? []), output.name].filter((name): name is string => typeof name === 'string' && name.length > 0))]
    const identities = names.length > 0 ? names : [undefined]
    for (const marker of parseBundlerGeneratedCssMarkerBlocks(readAssetSource(output))) {
      if (marker.bundler !== 'vite' || typeof marker.file !== 'string' || marker.file.length === 0) {
        continue
      }
      for (const outputName of identities) {
        outputs.push({ sourceFile: marker.file, outputFile: getAssetFile(bundleFile, output), outputName })
      }
    }
  }
  return outputs
}
