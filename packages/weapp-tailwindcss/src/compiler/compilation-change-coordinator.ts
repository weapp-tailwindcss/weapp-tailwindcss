import type { CompilationDependencyChange } from './compilation-scope-graph'
import type { CompilationSessionPool } from './compilation-session-pool'
import type { TailwindGenerationSessionPool } from './tailwind-generation-session-pool'
import { mergeCompilationDependencyChanges } from './compilation-scope-graph'
import { getCompilationSessionPool } from './compilation-session-pool'
import { ensureCompilerOwnerActive } from './compiler-owner-state'
import { getTailwindGenerationSessionPool } from './tailwind-generation-session-pool'

export class CompilationChangeCoordinator {
  private readonly pendingChangesByScope = new Map<string, Map<string, CompilationDependencyChange>>()
  private disposed = false

  constructor(
    private readonly compilationPool: CompilationSessionPool,
    private readonly generationPool: TailwindGenerationSessionPool,
  ) {}

  record(changes: Iterable<CompilationDependencyChange>) {
    this.ensureActive()
    const normalizedChanges = mergeCompilationDependencyChanges(changes)
    if (normalizedChanges.length === 0) {
      return new Set<string>()
    }
    const affectedScopeChanges = this.compilationPool.getAffectedScopeChanges(normalizedChanges)
    const affectedScopes = new Set(affectedScopeChanges.keys())
    const newlyPendingScopes = new Set<string>()
    const invalidatedPaths = new Set<string>()
    for (const [scopeId, scopeChanges] of affectedScopeChanges) {
      let pendingChanges = this.pendingChangesByScope.get(scopeId)
      if (!pendingChanges) {
        pendingChanges = new Map()
        this.pendingChangesByScope.set(scopeId, pendingChanges)
        newlyPendingScopes.add(scopeId)
      }
      for (const change of scopeChanges) {
        const previous = pendingChanges.get(change.id)
        const mergedChange = mergeCompilationDependencyChanges(
          previous ? [previous] : undefined,
          [change],
        )[0]!
        if (!previous || previous.type !== mergedChange.type) {
          pendingChanges.set(change.id, mergedChange)
          invalidatedPaths.add(change.id)
        }
      }
    }
    if (newlyPendingScopes.size > 0) {
      this.compilationPool.recordAffectedScopes(newlyPendingScopes)
    }
    if (invalidatedPaths.size > 0) {
      this.generationPool.invalidate({
        type: 'dependencies',
        paths: invalidatedPaths,
      })
    }
    return affectedScopes
  }

  consume(scopeId: string) {
    this.ensureActive()
    const pendingChanges = this.pendingChangesByScope.get(scopeId)
    if (!pendingChanges) {
      return undefined
    }
    this.pendingChangesByScope.delete(scopeId)
    return [...pendingChanges.values()].map(change => ({ ...change }))
  }

  invalidateScope(scopeId: string) {
    this.ensureActive()
    this.pendingChangesByScope.delete(scopeId)
    this.compilationPool.invalidateScope(scopeId)
  }

  getScopeDependencyRevision(scopeId: string) {
    this.ensureActive()
    return this.compilationPool.getScopeDependencyRevision(scopeId)
  }

  dispose() {
    this.pendingChangesByScope.clear()
    this.disposed = true
  }

  private ensureActive() {
    if (this.disposed) {
      throw new Error('CompilationChangeCoordinator 已释放。')
    }
  }
}

const compilationChangeCoordinators = new WeakMap<object, CompilationChangeCoordinator>()

export function getCompilationChangeCoordinator(owner: object) {
  ensureCompilerOwnerActive(owner)
  let coordinator = compilationChangeCoordinators.get(owner)
  if (!coordinator) {
    coordinator = new CompilationChangeCoordinator(
      getCompilationSessionPool(owner),
      getTailwindGenerationSessionPool(owner),
    )
    compilationChangeCoordinators.set(owner, coordinator)
  }
  return coordinator
}

export function recordCompilationDependencyChanges(
  owner: object,
  changes: Iterable<CompilationDependencyChange>,
) {
  return getCompilationChangeCoordinator(owner).record(changes)
}

export function consumeCompilationScopeChanges(owner: object, scopeId: string) {
  return getCompilationChangeCoordinator(owner).consume(scopeId)
}

export function getCompilationScopeDependencyRevision(owner: object, scopeId: string) {
  return getCompilationChangeCoordinator(owner).getScopeDependencyRevision(scopeId)
}

/** 仅活动编译 scope 可以为模块生成结果提供依赖版本。 */
export function getRegisteredCompilationScopeDependencyRevision(owner: object, scopeId: string) {
  ensureCompilerOwnerActive(owner)
  return getCompilationSessionPool(owner).getRegisteredScopeDependencyRevision(scopeId)
}

/** 资产只能复用同一注册代次的编译依赖快照。 */
export function getRegisteredCompilationScopeVersion(owner: object, scopeId: string) {
  ensureCompilerOwnerActive(owner)
  return getCompilationSessionPool(owner).getRegisteredScopeVersion(scopeId)
}

export function invalidateCompilationScope(owner: object, scopeId: string) {
  getCompilationChangeCoordinator(owner).invalidateScope(scopeId)
}

export function disposeCompilationChangeCoordinator(owner: object) {
  const coordinator = compilationChangeCoordinators.get(owner)
  if (!coordinator) {
    return
  }
  compilationChangeCoordinators.delete(owner)
  coordinator.dispose()
}
