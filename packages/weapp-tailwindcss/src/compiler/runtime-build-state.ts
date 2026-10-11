import type {
  RuntimeCompilationBuildState,
  RuntimeCompilationSnapshot,
  UpdateRuntimeCompilationBuildStateOptions,
} from './runtime-snapshot'

function invertLinkedByEntry(linkedByEntry: Map<string, Set<string>>) {
  const dependentsByLinkedFile = new Map<string, Set<string>>()
  for (const [entryFile, linkedFiles] of linkedByEntry.entries()) {
    for (const linkedFile of linkedFiles) {
      let dependents = dependentsByLinkedFile.get(linkedFile)
      if (!dependents) {
        dependents = new Set<string>()
        dependentsByLinkedFile.set(linkedFile, dependents)
      }
      dependents.add(entryFile)
    }
  }
  return dependentsByLinkedFile
}

function replaceMapEntries<Key, Value>(
  target: Map<Key, Value>,
  source: Map<Key, Value>,
) {
  target.clear()
  for (const [key, value] of source) {
    target.set(key, value)
  }
  return target
}

function mergeMapEntries<Key, Value>(
  target: Map<Key, Value>,
  source: Map<Key, Value>,
) {
  for (const [key, value] of source) {
    target.set(key, value)
  }
  return target
}

export function createRuntimeCompilationBuildState(): RuntimeCompilationBuildState {
  return {
    iteration: 0,
    sourceHashByFile: new Map<string, string>(),
    runtimeAffectingSignatureByFile: new Map<string, string>(),
    runtimeAffectingHashByFile: new Map<string, string>(),
    linkedByEntry: new Map<string, Set<string>>(),
    dependentsByLinkedFile: new Map<string, Set<string>>(),
    bundleMarkupCandidatesByFile: new Map(),
    generatorCandidateSignature: undefined,
  }
}

export function updateRuntimeCompilationBuildState(
  state: RuntimeCompilationBuildState,
  snapshot: RuntimeCompilationSnapshot,
  linkedByEntry: Map<string, Set<string>>,
  options: UpdateRuntimeCompilationBuildStateOptions = {},
) {
  const incremental = options.incremental === true
  removeRuntimeCompilationBuildStateFiles(state, snapshot.removedFiles)
  state.iteration += 1
  state.sourceHashByFile = incremental
    ? mergeMapEntries(state.sourceHashByFile, snapshot.sourceHashByFile)
    : replaceMapEntries(state.sourceHashByFile, snapshot.sourceHashByFile)
  state.runtimeAffectingSignatureByFile.clear()
  state.runtimeAffectingHashByFile = incremental
    ? mergeMapEntries(state.runtimeAffectingHashByFile, snapshot.runtimeAffectingHashByFile)
    : replaceMapEntries(state.runtimeAffectingHashByFile, snapshot.runtimeAffectingHashByFile)
  state.linkedByEntry = incremental
    ? mergeMapEntries(state.linkedByEntry, linkedByEntry)
    : replaceMapEntries(state.linkedByEntry, linkedByEntry)
  state.dependentsByLinkedFile = invertLinkedByEntry(state.linkedByEntry)
}

export function removeRuntimeCompilationBuildStateFiles(
  state: RuntimeCompilationBuildState,
  files: Iterable<string>,
) {
  const removedFiles = new Set(files)
  if (removedFiles.size === 0) {
    return
  }
  for (const file of removedFiles) {
    state.sourceHashByFile.delete(file)
    state.runtimeAffectingSignatureByFile.delete(file)
    state.runtimeAffectingHashByFile.delete(file)
    state.bundleMarkupCandidatesByFile.delete(file)
    state.linkedByEntry.delete(file)
  }
  for (const linkedFiles of state.linkedByEntry.values()) {
    for (const file of removedFiles) {
      linkedFiles.delete(file)
    }
  }
  state.dependentsByLinkedFile = invertLinkedByEntry(state.linkedByEntry)
}

export function resetRuntimeCompilationBuildState(state: RuntimeCompilationBuildState) {
  state.iteration = 0
  state.sourceHashByFile.clear()
  state.runtimeAffectingSignatureByFile.clear()
  state.runtimeAffectingHashByFile.clear()
  state.linkedByEntry.clear()
  state.dependentsByLinkedFile.clear()
  state.bundleMarkupCandidatesByFile.clear()
  state.generatorCandidateSignature = undefined
}

export function createRuntimeCompilationAffectingSignature(
  snapshot: RuntimeCompilationSnapshot,
  computeHash: (source: string) => string,
) {
  const entries = [...snapshot.runtimeAffectingHashByFile]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([file, hash]) => `${file}:${hash}`)
  return entries.length === 0
    ? 'runtime-affecting:0'
    : `runtime-affecting:1:${computeHash(entries.join('\n'))}`
}
