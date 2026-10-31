import { allocationSamplingUnavailable } from './constants.mjs'

/** 禁用会隐式强制 GC 的 inspector 采样，历史工件仍可由 codec 读取。 */
export async function createAllocationSampler() {
  throw new Error(allocationSamplingUnavailable)
}
