import type { RuleContext } from '../../css'
import { createRequire } from 'node:module'

const selectorParser = createRequire(new URL('../../../../packages/postcss/package.json', import.meta.url))('postcss-selector-parser')

/** 只在方括号之外拆分变体，不复用产品 candidate parser。 */
export function reviewedNativeCandidate(candidate: string) {
  const parts: string[] = []
  let start = 0
  let brackets = 0
  let escaped = false
  for (let index = 0; index < candidate.length; index++) {
    const character = candidate[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\') {
      escaped = true
    }
    else if (character === '[') {
      brackets++
    }
    else if (character === ']') {
      brackets--
    }
    else if (character === ':' && brackets === 0) {
      parts.push(candidate.slice(start, index))
      start = index + 1
    }
  }
  return { base: candidate.slice(start), variants: parts }
}

export function reviewedNativeSelector(selector: string, candidate: string) {
  const ast = selectorParser().astSync(selector)
  const nodes = ast.nodes.length === 1 ? ast.nodes[0].nodes : []
  return nodes.length === 1 && nodes[0].type === 'class' && nodes[0].value === candidate
}

/** 负向变体参考允许状态或结构选择器，但每个分支都必须包含准确候选。 */
export function reviewedNativeSelectorOwnership(selector: string, candidate: string) {
  const ast = selectorParser().astSync(selector)
  return ast.nodes.length > 0 && ast.nodes.every((branch: any) => {
    let owned = false
    branch.walkClasses((node: any) => {
      if (node.value === candidate) {
        owned = true
      }
    })
    return owned
  })
}

/** 无条件与完整 dark 媒体查询可表示为原生条件；其它媒体和结构条件不能删除。 */
export function reviewedNativeConditions(context: RuleContext, variants: readonly string[]) {
  const platforms = [...new Set(variants.filter(variant => ['ios', 'android', 'native'].includes(variant)))]
  if (platforms.length > 1 || context.atRules.some(rule => !/^@media\s*\(prefers-color-scheme:\s*dark\)$/.test(rule))) {
    return undefined
  }
  return [
    ...(variants.includes('dark') || context.atRules.length ? ['color-scheme:dark'] : []),
    ...(platforms.length ? [`platform:${platforms[0]}`] : []),
  ]
}
