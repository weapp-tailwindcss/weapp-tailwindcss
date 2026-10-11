import type { ClassValue } from '@weapp-tailwindcss/runtime'
import {
  createRpxLengthTransform,
  resolveTransformers,
  wrapRuntimeAggregator,
} from '@weapp-tailwindcss/runtime'
import { twMerge } from 'cn'

const transformers = resolveTransformers()
const rpxTransform = createRpxLengthTransform()

/**
 * 组合条件类名，并按 Tailwind 冲突规则保留最后一个类名。
 * 经 runtime 聚合包装：有界 LRU、rpx 长度归一化、按需 unescape/escape。
 */
export const cn = wrapRuntimeAggregator(
  twMerge,
  transformers,
  rpxTransform.prepareValue,
  rpxTransform.restoreValue,
)

export type { ClassValue }
