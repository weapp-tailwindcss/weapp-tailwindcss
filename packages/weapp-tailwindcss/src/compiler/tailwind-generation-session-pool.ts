import type { TailwindResolvedSource, WeappTailwindcssGenerateOptions, WeappTailwindcssGenerateResult, WeappTailwindcssGenerator } from '@/generator/runtime'
import { md5Hash } from '@/cache/md5'
import { createWeappTailwindcssGenerator } from '@/generator/runtime'
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

interface GeneratorEntry {
  generator: WeappTailwindcssGenerator
  dependencies: Set<string>
  complete: boolean
  pending: number
  tasks: Set<Promise<unknown>>
  uncertainty: number
}

export class TailwindGenerationSessionPool {
  private readonly generators = new Map<string, GeneratorEntry>()
  private readonly releases = new Set<Promise<void>>()
  private disposed = false
  private disposal: Promise<void> | undefined

  async generate(
    source: TailwindResolvedSource,
    options?: WeappTailwindcssGenerateOptions,
  ): Promise<WeappTailwindcssGenerateResult> {
    const entry = this.getGenerator(source)
    return this.run(entry, async () => {
      const uncertainty = entry.uncertainty
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
    })
  }

  async validateCandidates(source: TailwindResolvedSource, candidates: Iterable<string>) {
    const entry = this.getGenerator(source)
    // 校验接口不返回实际加载的依赖，不能借用生成接口的完整性结论。
    entry.complete = false
    entry.uncertainty++
    return this.run(entry, () => entry.generator.validateCandidates(candidates))
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
            this.retire(entry)
            this.generators.delete(key)
          }
        }
        return
      }
    }
    if (change.type === 'all' || change.type === 'dependencies') {
      for (const entry of this.generators.values()) {
        this.retire(entry)
      }
      this.generators.clear()
      return
    }
    const key = createSourceKey(change.source)
    this.retire(this.generators.get(key))
    this.generators.delete(key)
  }

  dispose() {
    if (this.disposal) {
      return this.disposal
    }
    this.disposed = true
    const entries = [...this.generators.values()]
    this.generators.clear()
    for (const entry of entries) {
      this.retire(entry)
    }
    this.disposal = Promise.allSettled([...this.releases]).then((results) => {
      this.releases.clear()
      const errors = results.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
      if (errors.length) {
        throw new AggregateError(errors, '生成器释放失败，已继续释放其余生成器。')
      }
    })
    return this.disposal
  }

  get size() {
    return this.generators.size
  }

  private run<T>(entry: GeneratorEntry, operation: () => Promise<T>) {
    entry.pending++
    const task = (async () => operation())()
    entry.tasks.add(task)
    const complete = () => {
      entry.pending--
      entry.tasks.delete(task)
    }
    void task.then(complete, complete)
    return task
  }

  private retire(entry: GeneratorEntry | undefined) {
    if (!entry) {
      return
    }
    const dispose = async () => entry.generator.dispose?.()
    // 空闲生成器保留同步关闭入口；在途生成器先排空已接受任务。
    const release = entry.tasks.size === 0 ? dispose() : Promise.allSettled([...entry.tasks]).then(dispose)
    this.releases.add(release)
    void release.then(
      () => this.releases.delete(release),
      // 失效与淘汰只结束当前归属；释放失败由最终关闭统一报告。
      () => undefined,
    )
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
      tasks: new Set(),
      uncertainty: 0,
    }
    this.generators.set(key, entry)
    while (this.generators.size > SESSION_ENGINE_CACHE_MAX) {
      const oldest = this.generators.keys().next().value
      if (oldest === undefined) {
        break
      }
      this.retire(this.generators.get(oldest))
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
  return pool.dispose()
}
