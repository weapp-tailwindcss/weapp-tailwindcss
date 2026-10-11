import type {
  CompilerSnapshot,
  CompilerSnapshotRoot,
  CompilerSourcePattern,
  CompilerTarget,
  CreateCompilerSnapshotRequest,
} from './types'
import { md5Hash } from '@/cache/md5'

interface InternalSnapshotRoot extends CompilerSnapshotRoot {
  fingerprint: string
}

export interface InternalCompilerSnapshot {
  classSet: Set<string>
  dependencies: readonly string[]
  fingerprint: string
  roots: ReadonlyMap<string, InternalSnapshotRoot>
  sources: readonly CompilerSourcePattern[]
  target: CompilerTarget
}

const readonlySetValues = new WeakMap<object, ReadonlySet<unknown>>()
const snapshotRegistry = new WeakMap<CompilerSnapshot, InternalCompilerSnapshot>()

class ImmutableSetView<T> implements ReadonlySet<T> {
  constructor(values: Iterable<T>) {
    readonlySetValues.set(this, values instanceof Set ? values : new Set(values))
    Object.freeze(this)
  }

  get size() {
    return this.valuesSet.size
  }

  get [Symbol.toStringTag]() {
    return 'Set'
  }

  has(value: T) {
    return this.valuesSet.has(value)
  }

  entries() {
    return this.valuesSet.entries()
  }

  keys() {
    return this.valuesSet.keys()
  }

  values() {
    return this.valuesSet.values()
  }

  forEach(callbackfn: (value: T, value2: T, set: ReadonlySet<T>) => void, thisArg?: unknown) {
    for (const value of this.valuesSet) {
      callbackfn.call(thisArg, value, value, this)
    }
  }

  [Symbol.iterator]() {
    return this.values()
  }

  private get valuesSet() {
    return readonlySetValues.get(this) as ReadonlySet<T>
  }
}

function uniqueSorted(values: Iterable<string>) {
  return Object.freeze([...new Set(values)].sort())
}

function sourceKey(source: CompilerSourcePattern) {
  return `${source.base}\0${source.pattern}\0${source.negated ? '1' : '0'}`
}

function uniqueSortedSources(sources: Iterable<CompilerSourcePattern>) {
  const values = new Map<string, CompilerSourcePattern>()
  for (const source of sources) {
    const cloned = Object.freeze({ ...source })
    values.set(sourceKey(cloned), cloned)
  }
  return Object.freeze([...values.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, value]) => value))
}

function createFingerprint(parts: Iterable<string>) {
  return md5Hash([...parts].join('\0'))
}

function createRootFingerprint(
  root: CompilerSnapshotRoot,
  target: CompilerTarget,
  classSet: Iterable<string>,
  dependencies: Iterable<string>,
  sources: Iterable<CompilerSourcePattern>,
) {
  return createFingerprint([
    root.id,
    String(root.revision),
    target,
    ...[...classSet].sort(),
    ...dependencies,
    ...[...sources].map(sourceKey),
  ])
}

function createSnapshotFromState(
  state: Omit<InternalCompilerSnapshot, 'fingerprint'>,
  reusableClassSet?: Set<string>,
  reusableClassSetView?: ReadonlySet<string>,
) {
  const roots = Object.freeze(
    [...state.roots.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(({ id, revision }) => Object.freeze({ id, revision })),
  )
  const classSet = reusableClassSet ?? (state.classSet instanceof Set ? state.classSet : new Set(state.classSet))
  const fingerprint = createFingerprint([
    state.target,
    ...[...state.roots.values()].map(root => `${root.id}\0${root.revision}\0${root.fingerprint}`).sort(),
    ...[...classSet].sort(),
    ...state.dependencies,
    ...state.sources.map(sourceKey),
  ])
  const snapshot = Object.freeze({
    classSet: reusableClassSetView ?? new ImmutableSetView(classSet),
    dependencies: state.dependencies,
    roots,
    sources: state.sources,
    target: state.target,
  }) satisfies CompilerSnapshot
  snapshotRegistry.set(snapshot, {
    ...state,
    classSet,
    fingerprint,
  })
  return snapshot
}

export function createRegisteredCompilerSnapshot(
  request: CreateCompilerSnapshotRequest,
  reusableClassSet?: Set<string>,
  reusableClassSetView?: ReadonlySet<string>,
) {
  if (!request.id) {
    throw new Error('Compiler snapshot 的 root id 不能为空。')
  }
  const revision = request.revision ?? 0
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error(`Compiler snapshot revision 必须是非负安全整数：${revision}`)
  }
  const target = request.target ?? 'weapp'
  const classSet = new Set(request.classSet)
  const dependencies = uniqueSorted(request.dependencies ?? [])
  const sources = uniqueSortedSources(request.sources ?? [])
  const root = { id: request.id, revision }
  const internalRoot = {
    ...root,
    fingerprint: createRootFingerprint(root, target, classSet, dependencies, sources),
  }
  return createSnapshotFromState({
    classSet,
    dependencies,
    roots: new Map([[root.id, internalRoot]]),
    sources,
    target,
  }, reusableClassSet, reusableClassSetView)
}

export function getInternalCompilerSnapshot(snapshot: CompilerSnapshot) {
  const state = snapshotRegistry.get(snapshot)
  if (!state) {
    throw new Error('Compiler snapshot 必须由 createSnapshot()、generate() 或 mergeSnapshots() 创建。')
  }
  return state
}

export function mergeRegisteredCompilerSnapshots(snapshots: Iterable<CompilerSnapshot>) {
  const states = [...snapshots].map(getInternalCompilerSnapshot)
  if (states.length === 0) {
    throw new Error('mergeSnapshots() 至少需要一个 snapshot。')
  }
  const target = states[0]!.target
  const roots = new Map<string, InternalSnapshotRoot>()
  const classSet = new Set<string>()
  const dependencies: string[] = []
  const sources: CompilerSourcePattern[] = []

  for (const state of states) {
    if (state.target !== target) {
      throw new Error(`不能合并不同 target 的 snapshot：${target} 与 ${state.target}`)
    }
    for (const root of state.roots.values()) {
      const current = roots.get(root.id)
      if (current && current.revision !== root.revision) {
        throw new Error(`同一 root 不能合并不同 revision：${root.id} (${current.revision} / ${root.revision})`)
      }
      if (current && current.fingerprint !== root.fingerprint) {
        throw new Error(`同一 root revision 的 snapshot 内容冲突：${root.id}@${root.revision}`)
      }
      roots.set(root.id, root)
    }
    for (const candidate of state.classSet) {
      classSet.add(candidate)
    }
    dependencies.push(...state.dependencies)
    sources.push(...state.sources)
  }

  return createSnapshotFromState({
    classSet: new Set([...classSet].sort()),
    dependencies: uniqueSorted(dependencies),
    roots,
    sources: uniqueSortedSources(sources),
    target,
  })
}

export function createImmutableSet<T>(values: Iterable<T>): ReadonlySet<T> {
  return new ImmutableSetView(values)
}
