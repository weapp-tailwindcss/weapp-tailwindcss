import type { ChildNode, Rule } from 'postcss'
import postcss from 'postcss'

/** 保留注释可穿过 Sass，仅标识局部样式收集器拥有的下一条规则。 */
export const UNI_APP_X_LOCAL_UTILITY_MARKER = '! weapp-tailwindcss local-utility'

/** 提供原地规则排序计划；作者节点、未知排名及父级层叠边界保持原位。 */
export function createLocalUtilityOrderPlan(css: string) {
  if (!css.includes(UNI_APP_X_LOCAL_UTILITY_MARKER)) {
    return undefined
  }
  const root = postcss.parse(css)
  const utilities = new Map<Rule, string>()
  root.walkComments((comment) => {
    if (comment.text.trim() !== UNI_APP_X_LOCAL_UTILITY_MARKER) {
      return
    }
    const rule = comment.next()
    if (rule?.type === 'rule' && rule.nodes.length === 1) {
      const apply = rule.nodes[0]
      if (apply?.type === 'atrule' && apply.name === 'apply') {
        utilities.set(rule, apply.params.trim())
      }
    }
    comment.remove()
  })
  return {
    candidates: [...new Set(utilities.values())],
    apply(order: ReadonlyMap<string, bigint | null | undefined>) {
      const parents = new Set([...utilities.keys()].map(rule => rule.parent!))
      for (const parent of parents) {
        const nodes = [...parent.nodes]
        let start = 0
        while (start < nodes.length) {
          const group: Array<{ node: ChildNode, rank: bigint }> = []
          let end = start
          for (; end < nodes.length; end++) {
            const node = nodes[end]!
            const utility = node.type === 'rule' ? utilities.get(node) : undefined
            const rank = utility === undefined ? undefined : order.get(utility)
            // 未知 utility 和作者节点都是排序边界，不能跨过它们移动规则。
            if (rank == null) {
              break
            }
            group.push({ node, rank })
          }
          group.sort((a, b) => a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0)
          for (let index = 0; index < group.length; index++) {
            nodes[start + index] = group[index]!.node
          }
          start = end + 1
        }
        parent.removeAll()
        parent.append(nodes)
      }
      return root.toString()
    },
  }
}

/** 作者样式重放不得把已消费的内部排序标记带回输出。 */
export function removeLocalUtilityMarkers(css: string) {
  if (!css.includes(UNI_APP_X_LOCAL_UTILITY_MARKER)) {
    return css
  }
  const root = postcss.parse(css)
  root.walkComments((comment) => {
    if (comment.text.trim() === UNI_APP_X_LOCAL_UTILITY_MARKER) {
      comment.remove()
    }
  })
  return root.toString()
}
