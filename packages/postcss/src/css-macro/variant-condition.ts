import type { Container } from 'postcss'
import { ifdefAtRule, ifndefAtRule } from './constants'

/** 只沿覆盖全部 variant 内容的条件链判断，不能将局部分支当成外层条件。 */
export function hasWrappingVariantCondition(variant: Container, name: string, params: string) {
  let container = variant
  while (container.nodes?.length === 1) {
    const node = container.nodes[0]
    if (node?.type !== 'atrule' || (node.name !== ifdefAtRule && node.name !== ifndefAtRule)) {
      return false
    }
    if (node.name === name && node.params === params) {
      return true
    }
    container = node
  }
  return false
}
