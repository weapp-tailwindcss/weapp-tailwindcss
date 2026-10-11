import type { Root } from 'postcss'
import { isEmptyTwContentDeclaration, isMiniProgramPreflightRule, isPseudoContentInitRule, usesTwContentVariable } from './predicates'

/** 移除候选裁剪后失去消费者的全局 content 初始化，保留用户类规则。 */
export function removeUnusedMiniProgramContentInit(root: Root) {
  if (usesTwContentVariable(root)) {
    return false
  }
  let changed = false
  root.walkRules((rule) => {
    if (!isMiniProgramPreflightRule(rule) && !isPseudoContentInitRule(rule)) {
      return
    }
    rule.walkDecls((decl) => {
      if (isEmptyTwContentDeclaration(decl)) {
        decl.remove()
        changed = true
      }
    })
    if (rule.nodes.length === 0) {
      rule.remove()
    }
  })
  return changed
}
