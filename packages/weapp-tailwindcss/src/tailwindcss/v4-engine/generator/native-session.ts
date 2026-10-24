import type {
  GenerationRequest,
  SourceEntry,
  TailwindGenerationArtifact,
  TailwindGenerationSession,
  TailwindGenerationSessionOptions,
  TailwindV4CandidateSource,
  TailwindV4ResolvedSource,
} from '@weapp-tailwindcss/engine'
import type { TailwindV4GenerateTarget } from '../types'
import { createTailwindGenerationSession } from '@weapp-tailwindcss/engine'

type CreateTailwindGenerationSession = (
  source: TailwindV4ResolvedSource,
  options?: TailwindGenerationSessionOptions,
) => TailwindGenerationSession

export interface NativeSessionSourcePreparation extends TailwindGenerationSessionOptions {
  key: string
}

interface NativeSessionEntry {
  disposal?: Promise<void> | undefined
  pending: Promise<void>
  sourceKey: string
  preparationKey: string | undefined
  session: TailwindGenerationSession
}

export class TailwindV4NativeSessionPool {
  private readonly releases = new Set<Promise<void>>()
  private readonly sessions = new Map<TailwindV4GenerateTarget, NativeSessionEntry>()
  private disposed = false
  private disposal: Promise<void> | undefined

  constructor(
    private readonly createSession: CreateTailwindGenerationSession = createTailwindGenerationSession,
  ) {}

  generate(
    target: TailwindV4GenerateTarget,
    sourceKey: string,
    source: TailwindV4ResolvedSource,
    request: GenerationRequest,
    preparation?: NativeSessionSourcePreparation,
  ): Promise<TailwindGenerationArtifact> {
    const entry = this.getSession(target, sourceKey, source, preparation)
    const generated = entry.pending.then(() => entry.session.generate(request))
    entry.pending = generated.then(() => undefined, () => undefined)
    return generated
  }

  dispose() {
    if (this.disposal) {
      return this.disposal
    }
    this.disposed = true
    for (const entry of this.sessions.values()) {
      this.disposeEntry(entry)
    }
    this.sessions.clear()
    this.disposal = Promise.allSettled([...this.releases]).then((results) => {
      this.releases.clear()
      const failures = results.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
      if (failures.length) {
        throw new AggregateError(failures, '原生生成会话释放失败，已继续释放其余会话。')
      }
    })
    return this.disposal
  }

  get size() {
    return this.sessions.size
  }

  private getSession(
    target: TailwindV4GenerateTarget,
    sourceKey: string,
    source: TailwindV4ResolvedSource,
    preparation?: NativeSessionSourcePreparation,
  ) {
    if (this.disposed) {
      throw new Error('TailwindV4NativeSessionPool 已释放。')
    }
    const cached = this.sessions.get(target)
    if (cached?.sourceKey === sourceKey && cached.preparationKey === preparation?.key) {
      return cached
    }
    if (cached) {
      this.disposeEntry(cached)
    }
    const session = this.createSession(source, preparation)
    const entry = { pending: Promise.resolve(), session, sourceKey, preparationKey: preparation?.key }
    this.sessions.set(target, entry)
    return entry
  }

  private disposeEntry(entry: NativeSessionEntry) {
    if (!entry.disposal) {
      const release = entry.pending.then(() => entry.session.dispose())
      entry.disposal = release
      this.releases.add(release)
      void release.then(
        () => this.releases.delete(release),
        // 替换会话的清理失败保留到最终关闭；后台任务不能产生游离拒绝。
        () => undefined,
      )
    }
    return entry.disposal
  }
}

export function createEngineSourceEntries(
  sources: TailwindV4CandidateSource[],
  sourceId: string,
): SourceEntry[] {
  return sources.map((source, index) => ({
    id: `${sourceId}:candidate-source:${index}`,
    ...source,
  }))
}

export function serializeTailwindGenerationArtifact(artifact: TailwindGenerationArtifact) {
  return [...artifact.fragments]
    .sort((left, right) => left.order - right.order)
    .map(fragment => fragment.root.toString())
    .join('\n')
}
