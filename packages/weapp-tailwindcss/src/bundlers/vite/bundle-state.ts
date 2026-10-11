import type { OutputAsset, OutputChunk } from 'rollup'
import type { OutputEntry } from './bundle-entries'
import type {
  RuntimeCompilationBuildState,
  RuntimeCompilationSnapshot,
  RuntimeEntryType,
  RuntimeSnapshotEntry,
  UpdateRuntimeCompilationBuildStateOptions,
} from '@/compiler'
import type { InternalUserDefinedOptions } from '@/types'
import { AsyncLocalStorage } from 'node:async_hooks'
import { Buffer } from 'node:buffer'
import {
  buildRuntimeCompilationSnapshot,
  createRuntimeAffectingSourceSignature,
  createRuntimeCompilationBuildState,
  createRuntimeCompilationSnapshot,
  updateRuntimeCompilationBuildState,
} from '@/compiler'
import { toAbsoluteOutputPath } from '../shared/module-graph'
import { classifyRuntimeEntry } from '../shared/runtime-entry-type'
import { isJavaScriptEntry } from './bundle-entries'
import { isRuntimeCandidateBundleEntry } from './runtime-candidate-entry'

export type EntryType = RuntimeEntryType

export interface BundleStateEntry extends RuntimeSnapshotEntry {
  output: OutputAsset | OutputChunk
}

export interface BundleSnapshot extends RuntimeCompilationSnapshot<BundleStateEntry> {
  jsEntries: Map<string, OutputEntry>
}

interface BundleEntryMetadata {
  outputType: OutputAsset['type'] | OutputChunk['type']
  runtimeCandidate: boolean
  type: EntryType
}

export interface BundleBuildState extends RuntimeCompilationBuildState {
  entryMetadataByFile: Map<string, BundleEntryMetadata>
}

export interface BuildBundleSnapshotOptions {
  hasOmittedKnownFiles?: boolean | undefined
  removedFiles?: Iterable<string> | undefined
}

const removedBundleFilesStorage = new AsyncLocalStorage<Iterable<string>>()

export function runWithRemovedBundleFiles<T>(
  removedFiles: Iterable<string>,
  run: () => Promise<T>,
) {
  return removedBundleFilesStorage.run(removedFiles, run)
}

export function createBundleBuildState(): BundleBuildState {
  return {
    ...createRuntimeCompilationBuildState(),
    entryMetadataByFile: new Map(),
  }
}

function readEntrySource(output: OutputAsset | OutputChunk) {
  if (output.type === 'chunk') {
    return output.code
  }
  return typeof output.source === 'string'
    ? output.source
    : Buffer.from(output.source).toString()
}

export function classifyBundleEntry(file: string, opts: InternalUserDefinedOptions): EntryType {
  return classifyRuntimeEntry(file, opts)
}

function collectJsEntry(
  fileName: string,
  output: OutputAsset | OutputChunk,
  outDir: string,
  store: Map<string, OutputEntry>,
) {
  const entry: OutputEntry = { fileName, output }
  if (!isJavaScriptEntry(entry)) {
    return
  }
  const absolute = toAbsoluteOutputPath(fileName, outDir)
  store.set(absolute, entry)
}

function collectBundleEntries(
  bundle: Record<string, OutputAsset | OutputChunk>,
  opts: InternalUserDefinedOptions,
  outDir: string,
  metadataByFile?: Map<string, BundleEntryMetadata>,
) {
  const jsEntries = new Map<string, OutputEntry>()
  const entries: BundleStateEntry[] = []

  for (const [file, output] of Object.entries(bundle)) {
    const cachedMetadata = metadataByFile?.get(file)
    const type = cachedMetadata?.outputType === output.type
      ? cachedMetadata.type
      : classifyBundleEntry(file, opts)
    const entry: BundleStateEntry = {
      file,
      output,
      source: readEntrySource(output),
      type,
    }
    entry.runtimeCandidate = cachedMetadata?.outputType === output.type
      ? cachedMetadata.runtimeCandidate
      : isRuntimeCandidateBundleEntry(entry)
    metadataByFile?.set(file, {
      outputType: output.type,
      runtimeCandidate: entry.runtimeCandidate === true,
      type,
    })
    collectJsEntry(file, output, outDir, jsEntries)
    entries.push(entry)
  }

  return {
    entries,
    jsEntries,
  }
}

export function buildBundleSnapshot(
  bundle: Record<string, OutputAsset | OutputChunk>,
  opts: InternalUserDefinedOptions,
  outDir: string,
  state: BundleBuildState,
  forceAll = false,
  options: BuildBundleSnapshotOptions = {},
): BundleSnapshot {
  const { entries, jsEntries } = collectBundleEntries(bundle, opts, outDir, state.entryMetadataByFile)
  const snapshot = buildRuntimeCompilationSnapshot(entries, state, {
    computeHash: source => opts.cache.computeHash(source),
    createRuntimeAffectingSignature: createRuntimeAffectingSourceSignature,
    forceAll,
    hasOmittedKnownFiles: options.hasOmittedKnownFiles,
    removedFiles: options.removedFiles ?? removedBundleFilesStorage.getStore(),
  })

  return {
    ...snapshot,
    jsEntries,
  }
}

export function buildBundleSnapshotForBuild(
  bundle: Record<string, OutputAsset | OutputChunk>,
  opts: InternalUserDefinedOptions,
  outDir: string,
): BundleSnapshot {
  const { entries, jsEntries } = collectBundleEntries(bundle, opts, outDir)
  const snapshot = createRuntimeCompilationSnapshot(entries, {
    processFiles: entries.map(entry => entry.file),
  })

  return {
    ...snapshot,
    jsEntries,
  }
}

export function updateBundleBuildState(
  state: BundleBuildState,
  snapshot: BundleSnapshot,
  linkedByEntry: Map<string, Set<string>>,
  options: UpdateRuntimeCompilationBuildStateOptions = {},
) {
  updateRuntimeCompilationBuildState(state, snapshot, linkedByEntry, options)
  for (const file of snapshot.removedFiles) {
    state.entryMetadataByFile.delete(file)
  }
  if (!snapshot.hasOmittedKnownFiles) {
    const activeFiles = new Set(snapshot.entries.map(entry => entry.file))
    for (const file of state.entryMetadataByFile.keys()) {
      if (!activeFiles.has(file)) {
        state.entryMetadataByFile.delete(file)
      }
    }
  }
}
