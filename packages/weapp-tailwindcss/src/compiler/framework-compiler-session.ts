import type {
  Compiler,
  CompilerGenerateRequest,
  CompilerGenerateResult,
  CompilerSnapshot,
} from '../core/compiler/types'
import type { TailwindV4ResolvedSource } from '../generator'
import type { InternalUserDefinedOptions } from '../types'
import { Buffer } from 'node:buffer'
import { createCompiler } from '../core/compiler/compiler'

/**
 * 官方 bundler 共享的 compiler 生命周期边界。
 *
 * bundler 继续拥有模块图和 scope 投影；本层只负责把逻辑 source root
 * 映射到一个长期复用的 compiler，并保证 root 删除与 owner 释放可等待。
 */
export class FrameworkCompilerSession {
  readonly compiler: Compiler
  private readonly scopeRoots = new Map<string, Set<string>>()
  private readonly activeRoots = new Set<string>()
  private transactionId = 0
  private disposed = false

  constructor(options: InternalUserDefinedOptions) {
    this.compiler = createCompiler(options)
  }

  rootId(scopeId: string, sourceId: string) {
    return `framework:${this.encode(scopeId)}:${this.encode(sourceId)}`
  }

  async generate(
    scopeId: string,
    sourceId: string,
    source: TailwindV4ResolvedSource,
    request: Omit<CompilerGenerateRequest, 'id' | 'source' | 'sourceOptions'>,
  ): Promise<CompilerGenerateResult> {
    if (this.disposed) {
      throw new Error('FrameworkCompilerSession 已释放。')
    }
    const stableId = this.rootId(scopeId, sourceId)
    const id = this.activeRoots.has(stableId)
      ? `${stableId}:transaction-${++this.transactionId}`
      : stableId
    let roots = this.scopeRoots.get(scopeId)
    if (!roots) {
      roots = new Set()
      this.scopeRoots.set(scopeId, roots)
    }
    roots.add(stableId)
    this.activeRoots.add(stableId)
    try {
      return await this.compiler.generate({
        ...request,
        id,
        source: {
          ...source,
          dependencies: source.dependencies ?? [],
        },
      })
    }
    finally {
      this.activeRoots.delete(stableId)
      if (id !== stableId) {
        await this.compiler.remove(id)
      }
    }
  }

  async syncScope(scopeId: string, sourceIds: Iterable<string>) {
    if (this.disposed) {
      return
    }
    const roots = this.scopeRoots.get(scopeId)
    if (!roots) {
      return
    }
    const active = new Set([...sourceIds].map(sourceId => this.rootId(scopeId, sourceId)))
    const removed = [...roots].filter(rootId => !active.has(rootId))
    await Promise.all(removed.map(rootId => this.compiler.remove(rootId)))
    for (const rootId of removed) {
      roots.delete(rootId)
    }
    if (roots.size === 0) {
      this.scopeRoots.delete(scopeId)
    }
  }

  async removeScope(scopeId: string) {
    const roots = this.scopeRoots.get(scopeId)
    if (!roots) {
      return
    }
    this.scopeRoots.delete(scopeId)
    await Promise.all([...roots].map(rootId => this.compiler.remove(rootId)))
  }

  invalidate(ids: Iterable<string>) {
    return this.compiler.invalidate(ids)
  }

  mergeSnapshots(snapshots: Iterable<CompilerSnapshot>) {
    return this.compiler.mergeSnapshots(snapshots)
  }

  dispose() {
    if (this.disposed) {
      return Promise.resolve()
    }
    this.disposed = true
    this.scopeRoots.clear()
    return this.compiler.dispose()
  }

  private encode(value: string) {
    return Buffer.from(value, 'utf8').toString('base64url')
  }
}

const frameworkCompilerSessions = new WeakMap<object, FrameworkCompilerSession>()

export function getFrameworkCompilerSession(
  owner: object,
  options: InternalUserDefinedOptions,
) {
  let session = frameworkCompilerSessions.get(owner)
  if (!session) {
    session = new FrameworkCompilerSession(options)
    frameworkCompilerSessions.set(owner, session)
  }
  return session
}

export function disposeFrameworkCompilerSession(owner: object) {
  const session = frameworkCompilerSessions.get(owner)
  if (!session) {
    return Promise.resolve()
  }
  frameworkCompilerSessions.delete(owner)
  return session.dispose()
}
