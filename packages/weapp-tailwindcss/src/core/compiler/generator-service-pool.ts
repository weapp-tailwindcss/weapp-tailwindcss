import type { TailwindResolvedSource, WeappTailwindcssGenerateOptions, WeappTailwindcssGenerator } from '@/generator/runtime'
import { snapshotConfiguration } from '@/compiler/configuration-snapshot'
import { createWeappTailwindcssGenerator } from '@/generator/runtime'
import { copyGeneratorServiceResult, createGeneratorServiceKey } from './generator-service-key'

interface ServiceEntry {
  key: string
  generator: WeappTailwindcssGenerator
  references: number
  accepting: boolean
  pending: Promise<void>
  disposal?: Promise<void> | undefined
  lastSuccessfulLease?: object | undefined
}

interface GeneratorLease {
  entry: ServiceEntry
  active: boolean
  tasks: Set<Promise<unknown>>
  disposal?: Promise<void> | undefined
}

/** 每个 compiler 独占服务池；同源 root 通过租约复用串行生成器。 */
export class CompilerGeneratorServicePool {
  private readonly available = new Map<string, ServiceEntry>()
  private readonly entries = new Set<ServiceEntry>()
  private readonly leases = new WeakMap<WeappTailwindcssGenerator, GeneratorLease>()
  private active = true
  private disposal: Promise<void> | undefined

  constructor(private readonly createGenerator = createWeappTailwindcssGenerator) {}

  matches(generator: WeappTailwindcssGenerator | undefined, source: TailwindResolvedSource, options: WeappTailwindcssGenerateOptions) {
    const lease = generator && this.leases.get(generator)
    return Boolean(this.active && lease?.active && lease.entry.accepting && lease.entry.key === createGeneratorServiceKey(source, options))
  }

  acquire(source: TailwindResolvedSource, options: WeappTailwindcssGenerateOptions): WeappTailwindcssGenerator {
    this.ensureActive()
    const stableSource = snapshotConfiguration(source)
    const key = createGeneratorServiceKey(stableSource, options)
    let entry = this.available.get(key)
    if (!entry) {
      entry = { key, generator: this.createGenerator(stableSource), references: 0, accepting: true, pending: Promise.resolve() }
      this.available.set(key, entry)
      this.entries.add(entry)
    }
    entry.references += 1
    const lease: GeneratorLease = { entry, active: true, tasks: new Set() }
    const generator: WeappTailwindcssGenerator = {
      source: stableSource,
      generate: (request = {}) => {
        const stableRequest = snapshotConfiguration(request.candidates ? { ...request, candidates: [...request.candidates] } : request)
        return this.run(lease, async () => {
          if (createGeneratorServiceKey(stableSource, stableRequest) !== key) {
            throw new Error('生成请求的配置与租约不匹配。')
          }
          const incremental = entry.lastSuccessfulLease === lease
          // 失败可能已经推进底层累积状态，不能沿用上一成功请求的增量游标。
          entry.lastSuccessfulLease = undefined
          const result = await entry.generator.generate(stableRequest)
          const copied = copyGeneratorServiceResult(result, incremental && entry.accepting, stableSource.sources)
          if (entry.accepting) {
            entry.lastSuccessfulLease = lease
          }
          return copied
        })
      },
      loadDesignSystem: () => this.run(lease, () => entry.generator.loadDesignSystem()),
      validateCandidates: (candidates) => {
        const snapshot = [...candidates]
        return this.run(lease, () => entry.generator.validateCandidates(snapshot))
      },
      dispose: () => this.release(lease),
    }
    this.leases.set(generator, lease)
    return generator
  }

  invalidate(generator: WeappTailwindcssGenerator | undefined) {
    const lease = generator && this.leases.get(generator)
    if (lease) {
      this.retire(lease.entry)
    }
  }

  dispose() {
    if (this.disposal) {
      return this.disposal
    }
    this.active = false
    const entries = [...this.entries]
    this.available.clear()
    this.disposal = Promise.allSettled(entries.map(entry => this.closeEntry(entry))).then((settled) => {
      this.entries.clear()
      const errors = settled.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
      if (errors.length) {
        throw new AggregateError(errors, '生成服务释放失败，已继续释放其余服务。')
      }
    })
    return this.disposal
  }

  private ensureActive() {
    if (!this.active) {
      throw new Error('编译生成服务池已关闭。')
    }
  }

  private run<T>(lease: GeneratorLease, task: () => Promise<T>) {
    this.ensureActive()
    if (!lease.active || !lease.entry.accepting) {
      throw new Error('编译生成租约已释放或失效。')
    }
    const execution = lease.entry.pending.then(task)
    lease.tasks.add(execution)
    lease.entry.pending = execution.then(() => undefined, () => undefined)
    void execution.then(() => lease.tasks.delete(execution), () => lease.tasks.delete(execution))
    return execution
  }

  private retire(entry: ServiceEntry) {
    entry.accepting = false
    entry.lastSuccessfulLease = undefined
    if (this.available.get(entry.key) === entry) {
      this.available.delete(entry.key)
    }
  }

  private release(lease: GeneratorLease) {
    if (lease.disposal) {
      return lease.disposal
    }
    lease.active = false
    lease.disposal = Promise.allSettled([...lease.tasks]).then(() => {
      lease.entry.references -= 1
      if (lease.entry.references === 0) {
        return this.closeEntry(lease.entry)
      }
    })
    return lease.disposal
  }

  private closeEntry(entry: ServiceEntry) {
    if (!entry.disposal) {
      this.retire(entry)
      entry.disposal = entry.pending.then(() => entry.generator.dispose?.())
      // 租约将清理结果交给 root 所有者；已完成的服务不重复保留或上报同一错误。
      void entry.disposal.then(() => this.entries.delete(entry), () => this.entries.delete(entry))
    }
    return entry.disposal
  }
}
