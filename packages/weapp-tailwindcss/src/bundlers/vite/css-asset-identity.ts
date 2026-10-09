import type { OutputAsset } from 'rollup'
import path from 'node:path'
import { sourcePathApi } from '@weapp-tailwindcss/source-scan'
import { normalizeOutputPathKey } from '../shared/module-graph'

export type ViteCssAssetIdentityKind = 'user' | 'generator-placeholder' | 'bundler-generated'

export interface ViteCssAssetIdentity {
  kind: ViteCssAssetIdentityKind
  sourceFile?: string | undefined
}

export interface CreateViteCssAssetIdentityResolverOptions {
  generatorPlaceholderFile: string
  getProjectRoot?: (() => string | undefined) | undefined
  isKnownProcessedSource: (file: string) => boolean
}

export function createViteCssAssetIdentityResolver(
  options: CreateViteCssAssetIdentityResolverOptions,
) {
  const identityByAsset = new WeakMap<OutputAsset, ViteCssAssetIdentity>()
  const placeholderFile = normalizeOutputPathKey(path.resolve(options.generatorPlaceholderFile))
  return (asset: OutputAsset, file?: string): ViteCssAssetIdentity => {
    const cached = identityByAsset.get(asset)
    if (cached) {
      return cached
    }
    const projectRoot = options.getProjectRoot?.()
    // 只有资产元数据是 Vite root 相对的来源；产物 file 不能据此推断成源码。
    const sourceFiles = [asset.originalFileName, ...(asset.originalFileNames ?? [])]
      .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0)
      .map(candidate => projectRoot ? sourcePathApi(projectRoot, candidate).resolve(projectRoot, candidate) : candidate)
    const candidates = [...(file ? [file] : []), ...sourceFiles]
    const placeholderSourceFile = candidates.find(candidate =>
      normalizeOutputPathKey(path.resolve(candidate.replace(/[?#].*$/, ''))) === placeholderFile,
    )
    let identity: ViteCssAssetIdentity
    if (placeholderSourceFile) {
      identity = {
        kind: 'generator-placeholder',
        sourceFile: placeholderSourceFile,
      }
    }
    else {
      const processedSourceFile = candidates.find(options.isKnownProcessedSource)
      identity = processedSourceFile
        ? { kind: 'bundler-generated', sourceFile: processedSourceFile }
        : { kind: 'user' }
    }
    identityByAsset.set(asset, identity)
    return identity
  }
}
