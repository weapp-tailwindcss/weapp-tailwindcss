import type { Root } from 'postcss'
import { postcss } from '../postcss-runtime'

export interface TailwindDirectiveInjectionOptions {
  directiveParams: readonly string[]
  insertAfterAtRulesNames: readonly string[]
  matchesComment: (text: string) => boolean
}

/** 只插入缺失指令；配置、输入过滤和模板依赖由调用方管理。 */
export function injectTailwindDirectives(root: Root, options: TailwindDirectiveInjectionOptions) {
  const nodes = root.nodes ?? []
  const directivePresence = new Set<string>()
  let anchorIndex = -1
  nodes.forEach((node, index) => {
    if (node.type === 'atrule') {
      if (options.insertAfterAtRulesNames.includes(node.name)) {
        anchorIndex = index
      }
      if (typeof node.params === 'string') {
        directivePresence.add(node.params)
      }
    }
    else if (node.type === 'comment' && options.matchesComment(node.text)) {
      anchorIndex = index
    }
  })

  let lastInserted = anchorIndex >= 0 ? nodes[anchorIndex] : undefined
  for (const params of options.directiveParams) {
    if (directivePresence.has(params)) {
      continue
    }
    const atRule = postcss.atRule({ name: 'tailwind', params })
    if (lastInserted) {
      root.insertAfter(lastInserted, atRule)
    }
    else {
      root.prepend(atRule)
    }
    lastInserted = atRule
    directivePresence.add(params)
  }
}
