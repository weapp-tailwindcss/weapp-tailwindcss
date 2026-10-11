import type { CompilationDependencyChange, CompilationScopeDependency, CompilationScopeGraphSource, CompilationScopeSnapshotSource } from './compilation-scope-graph'
import type { CompilationChange, CompilationResult, SourceKind, SourceScope } from './types'
import { CompilationDependencyState } from './compilation-dependency-state'
import { createCompilationScopeGraph, createCompilationScopeSnapshot, dependencyNodeId, dependencySignature, mergeCompilationScopeDependencies, sourceNodeId } from './compilation-scope-graph'
import { ensureCompilerOwnerActive } from './compiler-owner-state'
import { DefaultCompilationSession } from './session'

const COMPILATION_SCOPE_CACHE_MAX = 128

export interface CompilationScopeSource extends CompilationScopeGraphSource {
  id: string
  kind: SourceKind
  candidates: Iterable<string>
}

export interface CompilationScopeGenerationResult {
  classSet: Iterable<string>
  dependenciesBySource?: Iterable<readonly [string, Iterable<CompilationScopeDependency>]> | undefined
  snapshot?: unknown
}

export interface CompilationScopeRequest {
  scope: SourceScope
  outputId: string
  sources: CompilationScopeSource[]
  changes?: CompilationDependencyChange[] | undefined
  preserveDeletedCss?: boolean | undefined
}

export interface CompilationScopeState extends Omit<CompilationResult, 'candidatesBySource'> {
  candidatesBySource: Map<string, Set<string>>
}

export type CompilationScopeExecution<T>
  = | {
    committed: true
    compilation: CompilationScopeState
    value: T
  }
  | {
    committed: false
    compilation: CompilationScopeState
    value?: never
  }

interface CompilationScopeEntry {
  active: boolean
  executions: Set<Promise<unknown>>
  latest?: CompilationResult | undefined
  pending: Promise<void>
  scope: SourceScope
  session: DefaultCompilationSession
  generatedDependencies: Map<string, CompilationScopeDependency[]>
  sources: Map<string, CompilationScopeSource>
}

function cloneScopeSource(source: CompilationScopeSource): CompilationScopeSource {
  return {
    ...source,
    candidates: new Set(source.candidates),
    dependencies: source.dependencies?.map(dependency => ({ ...dependency })),
  }
}

export class CompilationSessionPool {
  private readonly dependencyState = new CompilationDependencyState()
  private readonly entries = new Map<string, CompilationScopeEntry>()
  private disposed = false

  run<T extends CompilationScopeGenerationResult | undefined>(
    request: CompilationScopeRequest,
    compile: (compilation: CompilationScopeState) => Promise<T>,
  ): Promise<CompilationScopeExecution<T>> {
    const entry = this.getEntry(request.scope)
    const execution = this.runEntry(entry, request, compile)
    entry.executions.add(execution)
    void execution.then(
      () => entry.executions.delete(execution),
      () => entry.executions.delete(execution),
    )
    return execution
  }

  invalidateScope(scopeId: string) {
    const entry = this.entries.get(scopeId)
    if (!entry) {
      return
    }
    entry.active = false
    void this.disposeEntry(entry)
    this.entries.delete(scopeId)
    this.dependencyState.delete(scopeId)
  }

  dispose() {
    if (this.disposed) {
      return Promise.resolve()
    }
    this.disposed = true
    const entries = [...this.entries.values()]
    for (const entry of entries) {
      entry.active = false
    }
    this.entries.clear()
    this.dependencyState.clear()
    return Promise.all(entries.map(entry => this.disposeEntry(entry))).then(() => undefined)
  }

  get size() {
    return this.entries.size
  }

  getAffectedScopes(changes: Iterable<CompilationDependencyChange>) {
    return this.dependencyState.getAffectedScopes(this.entries.values(), changes)
  }

  getAffectedScopeChanges(changes: Iterable<CompilationDependencyChange>) {
    return this.dependencyState.getAffectedScopeChanges(this.entries.values(), changes)
  }

  recordDependencyChanges(changes: Iterable<CompilationDependencyChange>) {
    return this.dependencyState.record(this.entries.values(), changes)
  }

  recordAffectedScopes(scopeIds: Iterable<string>) {
    this.dependencyState.recordScopes(scopeIds)
  }

  getScopeDependencyRevision(scopeId: string) {
    return this.dependencyState.getRevision(scopeId)
  }

  private getEntry(scope: SourceScope) {
    if (this.disposed) {
      throw new Error('CompilationSessionPool 已释放。')
    }
    const cached = this.entries.get(scope.id)
    if (cached) {
      if (cached.scope.kind !== scope.kind) {
        throw new Error(`同一个 scope id 不能对应不同类型：${scope.id}`)
      }
      this.entries.delete(scope.id)
      this.entries.set(scope.id, cached)
      return cached
    }
    const entry: CompilationScopeEntry = {
      active: true,
      executions: new Set(),
      pending: Promise.resolve(),
      scope: { ...scope },
      session: new DefaultCompilationSession(),
      generatedDependencies: new Map(),
      sources: new Map(),
    }
    this.entries.set(scope.id, entry)
    while (this.entries.size > COMPILATION_SCOPE_CACHE_MAX) {
      const oldestScopeId = this.entries.keys().next().value
      if (oldestScopeId === undefined || oldestScopeId === scope.id) {
        break
      }
      this.invalidateScope(oldestScopeId)
    }
    return entry
  }

  private async disposeEntry(entry: CompilationScopeEntry) {
    await Promise.allSettled([...entry.executions])
    await entry.pending
    entry.session.dispose()
  }

  private async runEntry<T extends CompilationScopeGenerationResult | undefined>(
    entry: CompilationScopeEntry,
    request: CompilationScopeRequest,
    compile: (compilation: CompilationScopeState) => Promise<T>,
  ): Promise<CompilationScopeExecution<T>> {
    const prepared = await this.enqueue(entry, () => this.prepareEntry(entry, request))
    const value = await compile(prepared.compilation)
    const validatedClassSet = request.preserveDeletedCss
      ? new Set([...prepared.compilation.validatedClassSet, ...(value?.classSet ?? [])])
      : new Set(value?.classSet ?? [])
    const generatedDependencies = value?.dependenciesBySource === undefined
      ? undefined
      : this.normalizeGeneratedDependencies(value.dependenciesBySource, prepared.sources)
    let committed = false
    let committedCompilation: CompilationScopeState | undefined
    await this.enqueue(entry, () => {
      if (!entry.active || entry.latest?.revision !== prepared.compilation.revision) {
        return
      }
      if (generatedDependencies) {
        entry.generatedDependencies = generatedDependencies
      }
      entry.latest = entry.session.commitValidation(
        prepared.compilation.revision,
        validatedClassSet,
        createCompilationScopeGraph(
          request.scope,
          request.outputId,
          this.createGraphSources(prepared.sources, entry.generatedDependencies),
        ),
      )
      committedCompilation = this.toScopeState(entry.latest, prepared.sources)
      committed = true
    })
    const compilation = committedCompilation ?? {
      ...prepared.compilation,
      validatedClassSet,
    }
    return committed
      ? { committed, compilation, value }
      : { committed, compilation }
  }

  private prepareEntry(
    entry: CompilationScopeEntry,
    request: CompilationScopeRequest,
  ) {
    const nextSources = new Map(request.sources.map(source => [source.id, cloneScopeSource(source)]))
    const changes: CompilationChange[] = [...request.changes ?? []].map(change => ({
      sourceId: dependencyNodeId(change.id),
      type: change.type,
    }))
    for (const sourceId of entry.sources.keys()) {
      if (!nextSources.has(sourceId)) {
        changes.push({ sourceId: sourceNodeId(sourceId), type: 'source-removed' as const })
      }
    }
    for (const [sourceId, source] of nextSources) {
      const previous = entry.sources.get(sourceId)
      if (
        previous
        && (
          previous.content !== source.content
          || dependencySignature(previous) !== dependencySignature(source)
        )
      ) {
        changes.push({ sourceId: sourceNodeId(sourceId), type: 'dependency-changed' as const })
      }
    }
    entry.sources = nextSources
    entry.generatedDependencies = new Map(
      [...entry.generatedDependencies].filter(([sourceId]) => nextSources.has(sourceId)),
    )
    entry.latest = entry.session.update(createCompilationScopeSnapshot(
      request.scope,
      request.outputId,
      this.createGraphSources(nextSources, entry.generatedDependencies),
      {
        changes,
        preserveDeletedCss: request.preserveDeletedCss,
      },
    ))
    return {
      compilation: this.toScopeState(entry.latest, nextSources),
      sources: nextSources,
    }
  }

  private createGraphSources(
    sources: Map<string, CompilationScopeSource>,
    generatedDependencies: Map<string, CompilationScopeDependency[]>,
  ): CompilationScopeSnapshotSource[] {
    return [...sources.values()].map(source => ({
      ...source,
      dependencies: mergeCompilationScopeDependencies(
        source.dependencies,
        generatedDependencies.get(source.id),
      ),
    }))
  }

  private normalizeGeneratedDependencies(
    dependenciesBySource: Iterable<readonly [string, Iterable<CompilationScopeDependency>]>,
    sources: Map<string, CompilationScopeSource>,
  ) {
    const normalized = new Map<string, CompilationScopeDependency[]>()
    for (const [sourceId, dependencies] of dependenciesBySource) {
      if (!sources.has(sourceId)) {
        throw new Error(`生成结果引用了未知 source：${sourceId}`)
      }
      normalized.set(sourceId, mergeCompilationScopeDependencies(
        normalized.get(sourceId),
        dependencies,
      ))
    }
    return normalized
  }

  private enqueue<T>(entry: CompilationScopeEntry, task: () => T | Promise<T>) {
    const execution = entry.pending.then(task)
    entry.pending = execution.then(() => undefined, () => undefined)
    return execution
  }

  private toScopeState(
    compilation: CompilationResult,
    sources: Map<string, CompilationScopeSource>,
  ): CompilationScopeState {
    return {
      ...compilation,
      candidatesBySource: new Map(
        [...sources.keys()].map(sourceId => [
          sourceId,
          compilation.candidatesBySource.get(sourceNodeId(sourceId)) ?? new Set<string>(),
        ]),
      ),
    }
  }
}

const compilationSessionPools = new WeakMap<object, CompilationSessionPool>()

export function getCompilationSessionPool(owner: object) {
  ensureCompilerOwnerActive(owner)
  let pool = compilationSessionPools.get(owner)
  if (!pool) {
    pool = new CompilationSessionPool()
    compilationSessionPools.set(owner, pool)
  }
  return pool
}

export function disposeCompilationSessionPool(owner: object) {
  const pool = compilationSessionPools.get(owner)
  if (!pool) {
    return Promise.resolve()
  }
  compilationSessionPools.delete(owner)
  return pool.dispose()
}
