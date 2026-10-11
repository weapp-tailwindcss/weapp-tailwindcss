import type {
  ClassValue,
  TailwindMergeVersion,
} from '..'
import { expectAssignable, expectType } from 'tsd'
import {
  clsx,
  createRpxLengthTransform,
  createRuntimeFactory,
  identity,
  resolveTransformers,
  weappTwIgnore,
  wrapRuntimeAggregator,
} from '..'

expectType<string>(clsx('text-sm', false))
expectType<string>(weappTwIgnore`text-${1}`)
expectType<string>(identity('text-sm'))

const transformers = resolveTransformers({ escape: true })
expectType<string>(transformers.escape('text-sm'))
expectType<string>(transformers.unescape('text-sm'))

const rpx = createRpxLengthTransform()
const prepared = rpx.prepareValue('text-[12rpx]')
expectAssignable<string | { value: string, metadata: unknown }>(prepared)
expectType<string>(rpx.restoreValue('text-[12rpx]'))

const factory = createRuntimeFactory({
  version: 3,
  twMerge: (value: string) => value,
  twJoin: (value: string) => value,
  extendTailwindMerge: () => (value: string) => value,
  createTailwindMerge: () => (value: string) => value,
})

const runtime = factory({ escape: true, unescape: false })
expectAssignable<TailwindMergeVersion>(runtime.version)
expectType<string>(runtime.twMerge('text-sm', false as ClassValue))
expectType<string>(runtime.twJoin('text-sm', 'text-lg'))
expectType<string>(runtime.extendTailwindMerge()('text-sm'))
expectType<string>(runtime.createTailwindMerge()('text-sm'))

const wrapped = wrapRuntimeAggregator(
  (value: string) => value,
  resolveTransformers(),
)
expectType<string>(wrapped('text-sm', false as ClassValue))
