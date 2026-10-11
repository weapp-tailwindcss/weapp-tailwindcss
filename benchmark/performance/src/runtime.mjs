import { cn } from '@weapp-tailwindcss/cn'
import { create as createMergeRuntime, getDefaultConfig, twMerge } from '@weapp-tailwindcss/merge'
import { createRpxLengthTransform, resolveTransformers, wrapRuntimeAggregator } from '@weapp-tailwindcss/runtime'
import { createEngine } from 'cn/engine'
import tables from 'cn/tables'

/** 两种基准各自创建真实上游引擎及 runtime 包装，冷启动不共享上游缓存。 */
export function createRuntimeBenchmarkSubject(kind, options) {
  if (kind === 'merge') {
    return createMergeRuntime(options).createTailwindMerge(getDefaultConfig)
  }
  const rpx = createRpxLengthTransform()
  return wrapRuntimeAggregator(createEngine(tables).merge, resolveTransformers(options), rpx.prepareValue, rpx.restoreValue)
}

export function makeRuntimeCase(kind, size, mode = 'steady') {
  const values = [...Array.from({ length: size }, (_, index) => `u-${index}`), 'p-2', 'p-4', 'text-red-500', 'text-[12rpx]']
  return {
    id: `runtime-${kind}-${mode === 'steady' ? '' : `${mode}-`}${size}`,
    group: 'runtime',
    complexityGroup: `runtime-${kind}-${mode}`,
    size,
    fresh: mode === 'cold',
    async create() {
      const subject = mode === 'steady' || mode === 'cache-hit'
        ? kind === 'cn' ? cn : twMerge
        : createRuntimeBenchmarkSubject(kind, mode === 'custom-map' ? { escape: false, unescape: { map: { '@': 'AT' } } } : undefined)
      let iteration = 0
      return () => {
        if (mode === 'hot-churn') {
          for (let index = 0; index < size; index++) {
            subject(`cold-${iteration++}`)
            subject('p-2 p-4 text-red-500 text-[12rpx]')
          }
        }
        // 被后续 p-4 覆盖的输入每次变化，缓存 miss 仍保持最终输出哈希稳定。
        const prefix = mode === 'cache-miss' ? `p-[${iteration++}px]` : mode === 'custom-map' ? `AT p-[${iteration++}px]` : ''
        return subject(prefix, values)
      }
    },
  }
}
