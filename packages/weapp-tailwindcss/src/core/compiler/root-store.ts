import type { CompilerGenerationCacheEntry } from './generation-cache'
import type { CompilerCompilationCacheEntry } from './generation-state'
import type { CompilerSnapshot, CompilerSourcePattern } from './types'
import type { TailwindV4ResolvedSource, WeappTailwindcssGenerator } from '@/generator'
import { DefaultCompilationSession } from '@/compiler/session'
import { isFileMatchedByTailwindSourceEntries } from '@/tailwindcss/source-scan'

export interface CompilerRootSession {
  accepting: boolean
  active: boolean
  appliedInvalidation: number
  compilation: DefaultCompilationSession
  compilationCache?: CompilerCompilationCacheEntry | undefined
  compilationRevision: number
  dependencies: Set<string>
  generator?: WeappTailwindcssGenerator | undefined
  generationCache?: CompilerGenerationCacheEntry | undefined
  id: string
  invalidation: number
  latestSnapshot?: CompilerSnapshot | undefined
  pending: Promise<void>
  pendingCount: number
  source?: TailwindV4ResolvedSource | undefined
  sourceFingerprint?: string | undefined
  sourceInputFingerprint?: string | undefined
  sources: CompilerSourcePattern[]
}

function disposeGenerator(generator: WeappTailwindcssGenerator | undefined) {
  generator?.dispose?.()
}

export class CompilerRootStore {
  private readonly dependencyRoots = new Map<string, Set<string>>()
  private readonly releasing = new Map<string, Promise<void>>()
  private readonly roots = new Map<string, CompilerRootSession>()

  constructor(
    private readonly maxRoots: number,
    private readonly onRootEvicted?: ((id: string) => void) | undefined,
  ) {}

  get(id: string) {
    if (!id) {
      throw new Error('Compiler root id 不能为空。')
    }
    if (this.releasing.has(id)) {
      throw new Error(`Compiler root 正在移除：${id}`)
    }
    const cached = this.roots.get(id)
    if (cached) {
      if (!cached.accepting) {
        throw new Error(`Compiler root 正在移除：${id}`)
      }
      this.roots.delete(id)
      this.roots.set(id, cached)
      return cached
    }
    if (this.roots.size >= this.maxRoots) {
      const oldest = [...this.roots.values()].find(entry => entry.pendingCount === 0)
      if (oldest) {
        void this.remove(oldest.id, true)
      }
    }
    const entry: CompilerRootSession = {
      accepting: true,
      active: true,
      appliedInvalidation: 0,
      compilation: new DefaultCompilationSession(),
      compilationRevision: 0,
      dependencies: new Set(),
      id,
      invalidation: 0,
      pending: Promise.resolve(),
      pendingCount: 0,
      sources: [],
    }
    this.roots.set(id, entry)
    return entry
  }

  attachDependencies(entry: CompilerRootSession, dependencies: Iterable<string>) {
    this.detachDependencies(entry)
    if (!entry.accepting) {
      return
    }
    for (const dependency of dependencies) {
      entry.dependencies.add(dependency)
      let owners = this.dependencyRoots.get(dependency)
      if (!owners) {
        owners = new Set()
        this.dependencyRoots.set(dependency, owners)
      }
      owners.add(entry.id)
    }
  }

  attachSources(entry: CompilerRootSession, sources: Iterable<CompilerSourcePattern>) {
    entry.sources = [...sources]
  }

  invalidate(ids: Iterable<string>) {
    const affected = new Set<string>()
    for (const id of ids) {
      const root = this.roots.get(id)
      if (root?.accepting) {
        affected.add(root.id)
      }
      for (const rootId of this.dependencyRoots.get(id) ?? []) {
        affected.add(rootId)
      }
      const sourcePath = stripSourceQuery(id)
      for (const sourceRoot of this.roots.values()) {
        if (sourceRoot.accepting && sourceRoot.sources.length > 0 && isFileMatchedByTailwindSourceEntries(sourcePath, sourceRoot.sources)) {
          affected.add(sourceRoot.id)
        }
      }
    }
    for (const rootId of affected) {
      const entry = this.roots.get(rootId)
      if (entry?.accepting) {
        entry.invalidation += 1
      }
    }
    return Object.freeze([...affected].sort())
  }

  trim() {
    while (this.roots.size > this.maxRoots) {
      const oldest = [...this.roots.values()].find(entry => entry.pendingCount === 0)
      if (!oldest) {
        return
      }
      void this.remove(oldest.id, true)
    }
  }

  remove(id: string, notifyEvicted = false) {
    const pendingRelease = this.releasing.get(id)
    if (pendingRelease) {
      return pendingRelease
    }
    const entry = this.roots.get(id)
    if (!entry) {
      return Promise.resolve()
    }
    entry.accepting = false
    this.roots.delete(id)
    this.detachDependencies(entry)
    const release = entry.pending.then(() => {
      entry.active = false
      entry.compilation.dispose()
      entry.compilationCache = undefined
      disposeGenerator(entry.generator)
      entry.generator = undefined
      entry.generationCache = undefined
      entry.latestSnapshot = undefined
      entry.source = undefined
      entry.sourceInputFingerprint = undefined
      entry.sourceFingerprint = undefined
      entry.sources = []
      if (notifyEvicted) {
        this.onRootEvicted?.(id)
      }
    }).finally(() => {
      this.releasing.delete(id)
    })
    this.releasing.set(id, release)
    return release
  }

  async dispose() {
    await Promise.all([
      ...[...this.roots.keys()].map(id => this.remove(id)),
      ...this.releasing.values(),
    ])
    this.dependencyRoots.clear()
  }

  private detachDependencies(entry: CompilerRootSession) {
    for (const dependency of entry.dependencies) {
      const owners = this.dependencyRoots.get(dependency)
      owners?.delete(entry.id)
      if (owners?.size === 0) {
        this.dependencyRoots.delete(dependency)
      }
    }
    entry.dependencies.clear()
  }
}

function stripSourceQuery(id: string) {
  return id.replace(/[?#].*$/, '')
}
