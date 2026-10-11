import type { OutputAsset, OutputChunk } from 'rollup'
import { AsyncLocalStorage } from 'node:async_hooks'
import { sourcePathApi } from '@weapp-tailwindcss/source-scan'
import { normalizeOutputPathKey } from '../shared/module-graph'

export interface ViteSourceOutputRemovalConsumer {
  consume: (currentBundleFiles: Iterable<string>) => string[]
}

export interface ViteSourceOutputRelationOwner {
  createRemovalConsumer: () => ViteSourceOutputRemovalConsumer
  dispose: () => void
  getStats: () => {
    consumers: number
    dirtySources: number
    outputs: number
    pendingOutputs: number
    sources: number
  }
  getOutputSources: (outputFile: string) => Set<string>
  getOwnedOutputs: (sourceFile: string) => Set<string>
  observeSource: (sourceFile: string) => void
  recordBundle: (bundle: Record<string, OutputAsset | OutputChunk>, projectRoot?: string) => void
  recordOwnedOutput: (sourceFile: string, outputFile: string) => void
  removeSource: (sourceFile: string) => Set<string>
}

const activeRelationOwnerStorage = new AsyncLocalStorage<ViteSourceOutputRelationOwner>()

function normalizeSourceFile(sourceFile: string) {
  return normalizeOutputPathKey(sourceFile.replace(/[?#].*$/, ''))
}

function normalizeOutputFile(outputFile: string) {
  return normalizeOutputPathKey(outputFile)
}

function collectOwnedSources(output: OutputAsset | OutputChunk, projectRoot?: string) {
  if (output.type === 'chunk') {
    if (output.facadeModuleId) {
      return [output.facadeModuleId]
    }
    const moduleIds = Array.isArray(output.moduleIds) ? output.moduleIds : []
    return moduleIds.length === 1 ? moduleIds : []
  }
  // Rollup 资产来源相对于 Vite root，生命周期与 remembered CSS 使用绝对源码身份。
  return [
    output.originalFileName,
    ...(Array.isArray(output.originalFileNames) ? output.originalFileNames : []),
  ].filter((sourceFile): sourceFile is string => typeof sourceFile === 'string' && sourceFile.length > 0).map(sourceFile => projectRoot ? sourcePathApi(projectRoot, sourceFile).resolve(projectRoot, sourceFile) : sourceFile)
}

export function createViteSourceOutputRelationOwner(): ViteSourceOutputRelationOwner {
  const outputsBySource = new Map<string, Set<string>>()
  const sourcesByOutput = new Map<string, Set<string>>()
  const deletedSources = new Set<string>()
  const dirtySources = new Set<string>()
  const consumers = new Set<{ pending: Set<string> }>()
  let disposed = false

  const unlinkSourceFromOutput = (sourceFile: string, outputFile: string) => {
    const outputs = outputsBySource.get(sourceFile)
    outputs?.delete(outputFile)
    if (outputs?.size === 0) {
      outputsBySource.delete(sourceFile)
    }
    const sources = sourcesByOutput.get(outputFile)
    sources?.delete(sourceFile)
    if (sources?.size === 0) {
      sourcesByOutput.delete(outputFile)
    }
  }

  const unlinkSource = (sourceFile: string) => {
    const outputs = [...(outputsBySource.get(sourceFile) ?? [])]
    for (const outputFile of outputs) {
      unlinkSourceFromOutput(sourceFile, outputFile)
    }
    return outputs
  }

  const queueRemovedOutputs = (outputFiles: Iterable<string>) => {
    for (const outputFile of outputFiles) {
      if (sourcesByOutput.has(outputFile)) {
        continue
      }
      for (const consumer of consumers) {
        consumer.pending.add(outputFile)
      }
    }
  }

  const recordOwnedOutput = (sourceFile: string, outputFile: string) => {
    if (disposed) {
      return
    }
    const sourceKey = normalizeSourceFile(sourceFile)
    const outputKey = normalizeOutputFile(outputFile)
    if (!sourceKey || !outputKey || deletedSources.has(sourceKey)) {
      return
    }
    if (dirtySources.delete(sourceKey)) {
      queueRemovedOutputs(unlinkSource(sourceKey))
    }
    const outputs = outputsBySource.get(sourceKey) ?? new Set<string>()
    outputs.add(outputKey)
    outputsBySource.set(sourceKey, outputs)
    const sources = sourcesByOutput.get(outputKey) ?? new Set<string>()
    sources.add(sourceKey)
    sourcesByOutput.set(outputKey, sources)
  }

  const replaceOutputOwners = (outputFile: string, sourceFiles: string[]) => {
    const outputKey = normalizeOutputFile(outputFile)
    for (const sourceFile of [...(sourcesByOutput.get(outputKey) ?? [])]) {
      unlinkSourceFromOutput(sourceFile, outputKey)
    }
    for (const sourceFile of sourceFiles) {
      deletedSources.delete(normalizeSourceFile(sourceFile))
      recordOwnedOutput(sourceFile, outputKey)
    }
  }

  return {
    createRemovalConsumer() {
      const state = { pending: new Set<string>() }
      consumers.add(state)
      return {
        consume(currentBundleFiles) {
          if (disposed || state.pending.size === 0) {
            return []
          }
          const currentFiles = new Set([...currentBundleFiles].map(normalizeOutputFile))
          // 同名输出可能已在前一生命周期重新取得归属，旧删除通知不能清除当前输出图。
          const removedFiles = [...state.pending].filter(file => !currentFiles.has(file) && !sourcesByOutput.has(file))
          state.pending.clear()
          return removedFiles
        },
      }
    },
    dispose() {
      disposed = true
      outputsBySource.clear()
      sourcesByOutput.clear()
      deletedSources.clear()
      dirtySources.clear()
      consumers.clear()
    },
    getStats() {
      return {
        consumers: consumers.size,
        dirtySources: dirtySources.size,
        outputs: sourcesByOutput.size,
        pendingOutputs: new Set([...consumers].flatMap(consumer => [...consumer.pending])).size,
        sources: outputsBySource.size,
      }
    },
    getOutputSources(outputFile) {
      return new Set(sourcesByOutput.get(normalizeOutputFile(outputFile)) ?? [])
    },
    getOwnedOutputs(sourceFile) {
      return new Set(outputsBySource.get(normalizeSourceFile(sourceFile)) ?? [])
    },
    observeSource(sourceFile) {
      if (!disposed) {
        const sourceKey = normalizeSourceFile(sourceFile)
        deletedSources.delete(sourceKey)
        if (outputsBySource.has(sourceKey)) {
          dirtySources.add(sourceKey)
        }
      }
    },
    recordBundle(bundle, projectRoot) {
      if (disposed) {
        return
      }
      for (const [bundleFile, output] of Object.entries(bundle)) {
        const ownedSources = collectOwnedSources(output, projectRoot)
        if (ownedSources.length > 0) {
          replaceOutputOwners(output.fileName || bundleFile, ownedSources)
        }
      }
    },
    recordOwnedOutput,
    removeSource(sourceFile) {
      if (disposed) {
        return new Set()
      }
      const sourceKey = normalizeSourceFile(sourceFile)
      deletedSources.add(sourceKey)
      dirtySources.delete(sourceKey)
      const removedOutputs = new Set<string>()
      for (const outputFile of unlinkSource(sourceKey)) {
        if (!sourcesByOutput.has(outputFile)) {
          removedOutputs.add(outputFile)
        }
      }
      queueRemovedOutputs(removedOutputs)
      return removedOutputs
    },
  }
}

export function getActiveViteSourceOutputRelationOwner() {
  return activeRelationOwnerStorage.getStore()
}

export function withViteSourceOutputRelationOwner<T>(
  owner: ViteSourceOutputRelationOwner,
  run: () => T,
): T {
  return activeRelationOwnerStorage.run(owner, run)
}
