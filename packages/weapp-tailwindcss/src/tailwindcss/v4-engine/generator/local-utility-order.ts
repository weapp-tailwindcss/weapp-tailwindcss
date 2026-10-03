import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { TailwindV4GenerateOptions, TailwindV4ResolvedSource } from '../types'
import type { NativeSessionSourcePreparation } from './native-session'
import { canonicalizeBareArbitraryValueCandidates } from '@weapp-tailwindcss/engine'
import { createLocalUtilityOrderPlan, UNI_APP_X_LOCAL_UTILITY_MARKER } from '@weapp-tailwindcss/postcss/transform'
import { normalizeTargetRpxLengthCandidates } from './incremental-cache'

/** 将局部规则排序接入生成会话，复用实际编译来源的 design system。 */
export function createLocalUtilitySourcePreparation(
  source: TailwindV4ResolvedSource,
  target: 'weapp' | 'web',
  styleOptions: Partial<IStyleHandlerOptions> | undefined,
  bareArbitraryValues: TailwindV4GenerateOptions['bareArbitraryValues'],
): NativeSessionSourcePreparation | undefined {
  if (!source.css.includes(UNI_APP_X_LOCAL_UTILITY_MARKER)) {
    return undefined
  }
  const normalizationOptions = { appType: styleOptions?.appType }
  const bareOptions = typeof bareArbitraryValues === 'object'
    ? { ...bareArbitraryValues, ...(bareArbitraryValues.units ? { units: [...bareArbitraryValues.units] } : {}) }
    : bareArbitraryValues
  return {
    // 排序闭包的规范化配置属于会话身份，不能在相同来源下沿用旧配置。
    key: JSON.stringify([target, normalizationOptions.appType, bareOptions]),
    prepareSource(actualSource, designSystem) {
      const plan = createLocalUtilityOrderPlan(actualSource.css)
      if (!plan) {
        return actualSource.css
      }
      if (plan.candidates.length === 0) {
        return plan.apply(new Map())
      }
      // 多种原始写法可映射到同一候选，分别保留正向关系，避免反向 Map 丢失别名。
      const canonicalCandidates = plan.candidates.map((candidate) => {
        const normalized = normalizeTargetRpxLengthCandidates([candidate], target, normalizationOptions)
        return canonicalizeBareArbitraryValueCandidates(normalized.candidates, bareOptions)[0]!
      })
      // rank 仅在一次完整查询内可比较；0n 是合法首位，缺失值不能补成 0。
      const ranks = new Map(designSystem.getClassOrder?.([...new Set(canonicalCandidates)]))
      const order = new Map<string, bigint | null | undefined>()
      for (let index = 0; index < plan.candidates.length; index++) {
        order.set(plan.candidates[index]!, ranks.get(canonicalCandidates[index]!))
      }
      return plan.apply(order)
    },
  }
}
