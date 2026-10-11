import { clsx as clsxFn } from 'clsx'

const weappTwIgnoreImpl = String.raw as typeof String.raw

export { clsxFn as clsx }
export const weappTwIgnore = weappTwIgnoreImpl
export { createRuntimeFactory, wrapRuntimeAggregator } from './create-runtime'
export { createRpxLengthTransform } from './rpx-length'
export { identity, resolveTransformers } from './transformers'

export type {
  CreateOptions,
  EscapeConfig,
  TailwindMergeFactory,
  TailwindMergeLibraryFn,
  TailwindMergeRuntime,
  TailwindMergeVersion,
  Transformers,
  UnescapeConfig,
} from './types'
export type { ClassValue } from 'clsx'
export type ClsxFn = typeof clsxFn
