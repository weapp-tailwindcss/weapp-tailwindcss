import type { Node, Selector } from 'postcss-selector-parser'
import selectorParser from 'postcss-selector-parser'

function hasIndependentSubject(nodes: Node[], scopeNames: Set<string>): boolean {
  return nodes.some((node) => {
    if (node.type === 'pseudo' && (node.value === ':not' || node.value === ':has')) {
      return false
    }
    return node.type === 'id'
      || (node.type === 'class' && !scopeNames.has(node.value))
      || ('nodes' in node && Boolean(node.nodes && hasIndependentSubject(node.nodes, scopeNames)))
  })
}

function splitCompounds(entry: Selector) {
  const compounds: { nodes: Node[], combinator: string }[] = [{ nodes: [], combinator: '' }]
  for (const node of entry.nodes) {
    if (node.type === 'combinator') {
      compounds.push({ nodes: [], combinator: node.value.trim() || ' ' })
    }
    else {
      compounds.at(-1)!.nodes.push(node)
    }
  }
  return compounds
}

/** 保留作者选择器的变体和结构展开，独立类名或 ID 后代仍属于其他样式。 */
export function createAuthorSelectorMatcher(selectors: Iterable<string>) {
  const exact = new Set<string>()
  const patterns: { compounds: { tokens: string[], combinator: string }[], scopeNames: Set<string> }[] = []
  const noScopeNames = new Set<string>()
  for (const selector of selectors) {
    exact.add(selector.trim())
    selectorParser().astSync(selector).each((entry) => {
      patterns.push({
        compounds: splitCompounds(entry).map(({ nodes, combinator }) => ({
          tokens: nodes.map(node => node.toString().trim()),
          combinator,
        })),
        // 小程序编译器会把同一 Vue scoped 属性转换为子元素上的作用域类。
        scopeNames: new Set(entry.nodes.flatMap((node) => {
          const name = node.type === 'attribute' ? node.attribute : node.type === 'class' ? node.value : ''
          return name.startsWith('data-v-') ? [name] : []
        })),
      })
    })
  }
  function matchesEntry(entry: Selector): boolean {
    const compounds = splitCompounds(entry)
    const subjects = compounds.map(({ nodes }) => new Set(nodes.map(node => node.toString().trim())))
    for (let start = 0; start < compounds.length; start++) {
      if (patterns.some((pattern) => {
        const end = start + pattern.compounds.length
        return end <= compounds.length
          && pattern.compounds.every(({ tokens, combinator }, offset) => tokens.length > 0
            && (offset === 0 || combinator === compounds[start + offset]!.combinator)
            && tokens.every(token => subjects[start + offset]!.has(token)))
          && compounds.slice(end).every(({ nodes }) => !hasIndependentSubject(nodes, pattern.scopeNames))
      })) {
        return true
      }
      // :is / :where 的每个分支都必须属于作者；:not / :has 只是上下文条件。
      if (compounds.slice(start + 1).every(({ nodes }) => !hasIndependentSubject(nodes, noScopeNames))
        && compounds[start]!.nodes.some(node => node.type === 'pseudo'
          && (node.value === ':is' || node.value === ':where')
          && node.nodes?.length && node.nodes.every(matchesEntry))) {
        return true
      }
    }
    return false
  }
  return (selector: string) => {
    if (exact.has(selector.trim())) {
      return true
    }
    const entries = selectorParser().astSync(selector).nodes
    return entries.length > 0 && entries.every(matchesEntry)
  }
}
