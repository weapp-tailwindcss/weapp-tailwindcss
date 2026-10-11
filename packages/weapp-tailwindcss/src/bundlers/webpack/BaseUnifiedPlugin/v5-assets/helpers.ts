import type { Compiler, sources as WebpackSources } from 'webpack'
import type { RuntimeClassSetManager } from '../../../shared/runtime-class-set'
import type { WebpackGeneratedCssRegistration } from '../../loaders/runtime-registry'
import type { WebpackAssetCompilationLike, WebpackSourceLike } from './asset-emission-plan'
import type { createCompilationDependencyChanges, RuntimeCompilationBuildState, RuntimeCompilationSnapshot, RuntimeSnapshotEntry } from '@/compiler'
import type { AppType, InternalUserDefinedOptions } from '@/types'
import { AssetEmissionPlan, buildRuntimeCompilationSnapshot, createRuntimeAffectingSourceSignature } from '@/compiler'
import { classifyRuntimeEntry } from '../../../shared/runtime-entry-type'
import { applyWebpackAssetEmissionPlan } from './asset-emission-plan'

export type { WebpackAssetCompilationLike, WebpackSourceLike } from './asset-emission-plan'

export interface SetupWebpackV5ProcessAssetsHookOptions {
  getCompilationChangeRecord?: () => { changes: ReturnType<typeof createCompilationDependencyChanges>, affectedScopes: Set<string> } | undefined

  compiler: Compiler
  options: InternalUserDefinedOptions
  appType?: AppType | undefined
  runtimeState: {
    tailwindRuntime: InternalUserDefinedOptions['tailwindRuntime']
    readyPromise: Promise<void>
  }
  getRuntimeRefreshRequirement: () => boolean
  refreshRuntimeMetadata: (force: boolean) => Promise<void>
  isKnownWebpackProcessedCssAsset?: ((file: string, metadata?: { isMainCssChunk?: boolean | undefined }) => boolean) | undefined
  isWebpackProcessedCssAsset?: ((file: string, rawSource: string, metadata?: { isMainCssChunk?: boolean | undefined }) => boolean) | undefined
  consumeRuntimeRefreshRequirement: () => void
  isWatchMode?: (() => boolean) | undefined
  getWatchChangedFiles?: (() => Iterable<string>) | undefined
  runtimeClassSetManager?: RuntimeClassSetManager | undefined
  getWebpackCssSources?: (() => Iterable<[string, { css: string | undefined, processed?: boolean | undefined }]>) | undefined
  getWebpackGeneratedCssSources?: (() => Iterable<[string, WebpackGeneratedCssRegistration]>) | undefined
  pruneWebpackCssSources?: ((activeSourceFiles: ReadonlySet<string>, options?: { watchMode?: boolean | undefined }) => void) | undefined
  prepareWebpackCssSources?: ((activeAssetResources?: ReadonlySet<string>) => ReadonlySet<string>) | undefined
  debug: (format: string, ...args: unknown[]) => void
}

export interface BuildWebpackBundleSnapshotOptions {
  removedFiles?: Iterable<string> | undefined
}

export function buildWebpackBundleSnapshot(
  assets: Record<string, { source: () => unknown }>,
  opts: InternalUserDefinedOptions,
  state: RuntimeCompilationBuildState,
  compilation?: WebpackAssetCompilationLike | undefined,
  options: BuildWebpackBundleSnapshotOptions = {},
) {
  const entries: RuntimeSnapshotEntry[] = []

  for (const [file, asset] of Object.entries(assets)) {
    const type = classifyRuntimeEntry(file, opts)
    if (type !== 'html' && type !== 'js') {
      continue
    }
    const rawSource = compilation?.getAsset(file)?.source.source() ?? asset.source()
    const source = stringifyWebpackSource(rawSource)
    entries.push({
      file,
      runtimeCandidate: true,
      source,
      type,
    })
  }
  const currentFiles = new Set(entries.map(entry => entry.file))
  const removedFiles = new Set(options.removedFiles)
  for (const file of state.sourceHashByFile.keys()) {
    if (!currentFiles.has(file)) {
      removedFiles.add(file)
    }
  }

  return buildRuntimeCompilationSnapshot(entries, state, {
    computeHash: source => opts.cache.computeHash(source),
    createRuntimeAffectingSignature: createRuntimeAffectingSourceSignature,
    removedFiles,
  })
}

export function releaseWebpackBundleSnapshotSources(snapshot: RuntimeCompilationSnapshot) {
  for (const entry of snapshot.entries) {
    entry.source = ''
  }
}

export function stringifyWebpackSource(source: unknown) {
  if (typeof source === 'string') {
    return source
  }
  return source?.toString() ?? ''
}

export function createWebpackAssetUpdater(options: {
  compilation: WebpackAssetCompilationLike
  ConcatSource: new (source: string) => WebpackSources.Source
  onUpdate: (file: string, previousSource: string, nextSource: string) => void
  debug: (format: string, ...args: unknown[]) => void
}) {
  const getCurrentAssetSource = (file: string) => {
    const asset = options.compilation.getAsset(file)
    if (!asset) {
      return undefined
    }
    return stringifyWebpackSource(asset.source.source())
  }
  const updateAssetIfChanged = (
    file: string,
    source: WebpackSourceLike,
    {
      compare = true,
      notifyUpdate = true,
    }: {
      compare?: boolean | undefined
      notifyUpdate?: boolean | undefined
    } = {},
  ) => {
    const plan = new AssetEmissionPlan<WebpackSourceLike>()
    plan.write(file, source)
    if (!compare) {
      applyWebpackAssetEmissionPlan(plan, {
        compilation: options.compilation,
        ConcatSource: options.ConcatSource,
        writeMode: 'update',
      })
      return true
    }
    const nextSource = typeof source === 'string'
      ? source
      : stringifyWebpackSource(source.source())
    const previousSource = getCurrentAssetSource(file)
    if (previousSource === nextSource) {
      options.debug('asset unchanged, skip update: %s', file)
      return false
    }
    applyWebpackAssetEmissionPlan(plan, {
      compilation: options.compilation,
      ConcatSource: options.ConcatSource,
      writeMode: 'update',
    })
    if (notifyUpdate) {
      options.onUpdate(file, previousSource ?? '', nextSource)
    }
    return true
  }

  return {
    getCurrentAssetSource,
    updateAssetIfChanged,
  }
}
