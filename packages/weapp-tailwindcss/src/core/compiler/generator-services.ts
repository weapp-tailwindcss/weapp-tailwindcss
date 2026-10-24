import type { CompilerRootSession, CompilerRootStore } from './root-store'
import type { TailwindResolvedSource, WeappTailwindcssGenerateOptions } from '@/generator/runtime'
import { CompilerGeneratorServicePool } from './generator-service-pool'

/** 将 root 的版本与服务租约连接，生成器状态只由本 compiler 的池持有。 */
export function createCompilerGeneratorServices(rootStore: CompilerRootStore) {
  const pool = new CompilerGeneratorServicePool()
  return {
    select(entry: CompilerRootSession, source: TailwindResolvedSource, engineInvalidation: number, options: WeappTailwindcssGenerateOptions) {
      if (entry.appliedEngineInvalidation !== engineInvalidation) {
        pool.invalidate(entry.generator)
      }
      const reused = pool.matches(entry.generator, source, options)
      return { generator: reused ? entry.generator! : pool.acquire(source, options), reused }
    },
    async dispose() {
      const errors: unknown[] = []
      // 先释放 root 引用，再释放剩余服务；任一步失败都不跳过其他资源。
      for (const release of [() => rootStore.dispose(), () => pool.dispose()]) {
        try {
          await release()
        }
        catch (error) {
          errors.push(error)
        }
      }
      if (errors.length === 1) {
        throw errors[0]
      }
      if (errors.length) {
        throw new AggregateError(errors, '编译来源和生成服务释放失败。')
      }
    },
  }
}
