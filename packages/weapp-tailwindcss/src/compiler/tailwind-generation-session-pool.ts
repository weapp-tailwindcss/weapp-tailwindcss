import type { TailwindResolvedSource, WeappTailwindcssGenerateOptions, WeappTailwindcssGenerateResult, WeappTailwindcssGenerator } from '@/generator'
import { md5Hash } from '@/cache/md5'
import { createWeappTailwindcssGenerator } from '@/generator'
import { ensureCompilerOwnerActive } from './compiler-owner-state'

const SESSION_ENGINE_CACHE_MAX = 32

export type TailwindGenerationPoolChange
  = | { type: 'all' }
    | { type: 'dependencies', paths?: Iterable<string> | undefined }
    | { type: 'source', source: TailwindResolvedSource }

function createSourceKey(source: TailwindResolvedSource) {
  return md5Hash([
    source.projectRoot,
    source.base,
    source.baseFallbacks.join('\0'),
    source.css,
    source.dependencies.join('\0'),
  ].join('\0'))
}

function disposeGenerator(generator: WeappTailwindcssGenerator | undefined) {
  generator?.dispose?.()
}

interface GeneratorEntry {
  generator: WeappTailwindcssGenerator
  dependencies: Set<string>
  complete: boolean
  pending: number
  uncertainty: number
}

export class TailwindGenerationSessionPool {
  private readonly generators = new Map<string, GeneratorEntry>()
  private disposed = false

  async generate(
    source: TailwindResolvedSource,
    options?: WeappTailwindcssGenerateOptions,
  ): Promise<WeappTailwindcssGenerateResult> {
    const entry = this.getGenerator(source)
    const uncertainty = entry.uncertainty
    entry.pending++
    try {
      const result = await entry.generator.generate(options)
      // 归属跟随实例；被失效或淘汰的异步结果不能污染替代实例。
      if (result?.dependencies && entry.uncertainty === uncertainty) {
        for (const dependency of result.dependencies) {
          entry.dependencies.add(dependency)
        }
        entry.complete = true
      }
      return result
    }
    catch (error) {
      entry.complete = false
      entry.uncertainty++
      throw error
    }
    finally {
      entry.pending--
    }
  }

  async validateCandidates(source: TailwindResolvedSource, candidates: Iterable<string>) {
    const entry = this.getGenerator(source)
    // 校验接口不返回实际加载的依赖，不能借用生成接口的完整性结论。
    entry.complete = false
    entry.uncertainty++
    entry.pending++
    try {
      return await entry.generator.validateCandidates(candidates)
    }
    finally {
      entry.pending--
    }
  }

  invalidate(change: TailwindGenerationPoolChange) {
    if (change.type === 'dependencies' && change.paths !== undefined) {
      const paths = new Set(change.paths)
      if (paths.size === 0) {
        return
      }
      // 与 compilation graph 一样保留依赖 ID 身份，不能把逻辑 ID 当作文件路径改写。
      const known = [...paths].every(id => [...this.generators.values()].some(entry => entry.dependencies.has(id)))
      if (known) {
        for (const [key, entry] of this.generators) {
          if (!entry.complete || entry.pending > 0 || [...paths].some(id => entry.dependencies.has(id))) {
            disposeGenerator(entry.generator)
            this.generators.delete(key)
          }
        }
        return
      }
    }
    if (change.type === 'all' || change.type === 'dependencies') {
      for (const entry of this.generators.values()) {
        disposeGenerator(entry.generator)
      }
      this.generators.clear()
      return
    }
    const key = createSourceKey(change.source)
    disposeGenerator(this.generators.get(key)?.generator)
    this.generators.delete(key)
  }

  dispose() {
    for (const entry of this.generators.values()) {
      disposeGenerator(entry.generator)
    }
    this.generators.clear()
    this.disposed = true
  }

  get size() {
    return this.generators.size
  }

  private getGenerator(source: TailwindResolvedSource) {
    if (this.disposed) {
      throw new Error('TailwindGenerationSessionPool 已释放。')
    }
    const key = createSourceKey(source)
    const cached = this.generators.get(key)
    if (cached) {
      this.generators.delete(key)
      this.generators.set(key, cached)
      return cached
    }
    const entry: GeneratorEntry = {
      generator: createWeappTailwindcssGenerator(source),
      dependencies: new Set(source.dependencies),
      complete: false,
      pending: 0,
      uncertainty: 0,
    }
    this.generators.set(key, entry)
    while (this.generators.size > SESSION_ENGINE_CACHE_MAX) {
      const oldest = this.generators.keys().next().value
      if (oldest === undefined) {
        break
      }
      disposeGenerator(this.generators.get(oldest)?.generator)
      this.generators.delete(oldest)
    }
    return entry
  }
}

const sessionPools = new WeakMap<object, TailwindGenerationSessionPool>()

export function getTailwindGenerationSessionPool(owner: object) {
  ensureCompilerOwnerActive(owner)
  let pool = sessionPools.get(owner)
  if (!pool) {
    pool = new TailwindGenerationSessionPool()
    sessionPools.set(owner, pool)
  }
  return pool
}

export function disposeTailwindGenerationSessionPool(owner: object) {
  const pool = sessionPools.get(owner)
  if (!pool) {
    return
  }
  sessionPools.delete(owner)
  pool.dispose()
}
