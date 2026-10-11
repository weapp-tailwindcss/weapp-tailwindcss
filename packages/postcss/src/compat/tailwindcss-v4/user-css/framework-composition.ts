import { postcss } from '../../../postcss-runtime'

function nodeContent(node: postcss.ChildNode): string {
  switch (node.type) {
    case 'decl':
      return `decl\u0000${node.prop}\u0000${node.value}\u0000${node.important ? '1' : '0'}`
    case 'rule':
      return `rule\u0000${node.selectors.map(selector => selector.trim()).join('\u0001')}\u0000${node.nodes.reduce<string[]>((parts, child) => {
        if (child.type !== 'comment') {
          parts.push(nodeContent(child))
        }
        return parts
      }, []).join('\u0002')}`
    case 'atrule':
      return `atrule\u0000${node.name}\u0000${node.params}\u0000${node.nodes?.reduce<string[]>((parts, child) => {
        if (child.type !== 'comment') {
          parts.push(nodeContent(child))
        }
        return parts
      }, []).join('\u0002') ?? ''}`
    default:
      return `comment\u0000${node.text}`
  }
}

function visitRules(
  container: postcss.Container,
  context: string,
  visit: (node: postcss.Rule | postcss.AtRule, key: string, context: string) => void,
) {
  container.each((node) => {
    if (node.type === 'rule' || (node.type === 'atrule' && /^(?:font-face|(?:-\w+-)?keyframes)$/.test(node.name))) {
      visit(node, `${context}\u0000${nodeContent(node)}`, context)
    }
    else if (node.type === 'atrule' && node.nodes && !(node.name === 'layer' && !node.params.trim())) {
      // 匿名层每次出现都建立独立层身份，不能跨输入匹配其中的规则。
      visitRules(node, `${context}\u0000${node.name}\u0000${node.params}`, visit)
    }
  })
}

interface RuleRecord {
  node: postcss.Rule | postcss.AtRule
  key: string
  context: string
}

function collectRules(root: postcss.Root) {
  const rules: RuleRecord[] = []
  visitRules(root, '', (node, key, context) => rules.push({ node, key, context }))
  return rules
}

function removeRules(container: postcss.Container, removed: Set<postcss.ChildNode>, ruleKeys: Map<postcss.ChildNode, string>) {
  const nodes = container.nodes ?? []
  const retained: postcss.ChildNode[] = []
  for (const node of nodes) {
    if (removed.has(node)) {
      continue
    }
    const key = ruleKeys.get(node)
    const previous = retained.at(-1)
    // 相邻且完全相同的规则没有中间覆盖；复用已有索引，避免新增解析或逐条删除。
    if (key && previous && key === ruleKeys.get(previous)) {
      continue
    }
    if (node.type === 'atrule' && node.nodes?.length) {
      removeRules(node, removed, ruleKeys)
      // 空的命名层仍声明级联顺序，清理规则时必须保留这个位置。
      if (node.nodes.length === 0 && node.name !== 'layer') {
        continue
      }
    }
    retained.push(node)
  }
  if (retained.length !== nodes.length) {
    // 一次重建子节点数组，避免逐条 remove 导致大产物反复移动数组内容。
    container.removeAll()
    container.append(retained)
  }
}

function matchOrderedPrefix(rules: RuleRecord[], positions: Map<string, number[]>) {
  const prefix: number[] = []
  let previous = -1
  for (const rule of rules) {
    const matches = positions.get(rule.key) ?? []
    let left = 0
    let right = matches.length
    while (left < right) {
      const middle = (left + right) >>> 1
      if (matches[middle]! <= previous) {
        left = middle + 1
      }
      else {
        right = middle
      }
    }
    if (left === matches.length) {
      break
    }
    previous = matches[left]!
    prefix.push(previous)
  }
  return prefix
}

/** 保留生成侧已确定的层位置；框架侧重复选择器及其间的覆盖区间按原顺序恢复。 */
export function composeFrameworkProcessedCss(before: string, generated: string, after: string) {
  // 常见的纯生成路径无需解析 AST；框架样式为空时直接返回，避免构建插件额外分配大量节点。
  if (!before.trim() && !after.trim()) {
    return generated
  }
  const inputs = [before, generated, after]
  try {
    const roots = inputs.map(css => postcss.parse(css))
    const generatedRules = collectRules(roots[1]!)
    const generatedKeys = new Set(generatedRules.map(rule => rule.key))
    const positions = new Map<string, number[]>()
    generatedRules.forEach((rule, index) => {
      const matches = positions.get(rule.key) ?? []
      matches.push(index)
      positions.set(rule.key, matches)
    })
    const frameworkRules = [...collectRules(roots[0]!), ...collectRules(roots[2]!)]
    const ruleKeys = new Map<postcss.ChildNode, string>([...generatedRules, ...frameworkRules].map(record => [record.node, record.key]))
    const scopes = new Map<string, RuleRecord[]>()
    for (const record of frameworkRules) {
      const rules = scopes.get(record.context) ?? []
      rules.push(record)
      scopes.set(record.context, rules)
    }
    const preserve = new Set<RuleRecord>()
    const generatedPrefix = new Set<postcss.ChildNode>()
    for (const rules of scopes.values()) {
      const ranges = new Map<string, [number, number]>()
      rules.forEach(({ node }, index) => {
        const selectors = node.type === 'rule' ? node.selectors : [JSON.stringify([node.name, node.params])]
        // 组合选择器中的每一项都参与覆盖区间，防止漏掉后续单选择器覆盖。
        for (const selector of selectors) {
          const range = ranges.get(selector)
          if (range) {
            range[1] = index
          }
          else {
            ranges.set(selector, [index, index])
          }
        }
      })
      const boundaries = new Int32Array(rules.length + 1)
      for (const [first, last] of ranges.values()) {
        if (first !== last) {
          boundaries[first]! += 1
          boundaries[last + 1]! -= 1
        }
      }
      let depth = 0
      let start = 0
      for (let index = 0; index < rules.length; index++) {
        const previousDepth = depth
        depth += boundaries[index]!
        if (previousDepth === 0 && depth > 0) {
          start = index
        }
        if (depth > 0 && depth + boundaries[index + 1]! === 0) {
          const group = rules.slice(start, index + 1)
          // 已有前缀保留层位置；从首次缺失处恢复后缀，避免将 base 规则移到 utilities 后面。
          const prefix = matchOrderedPrefix(group, positions)
          if (prefix.length !== group.length) {
            prefix.forEach(position => generatedPrefix.add(generatedRules[position]!.node))
            group.slice(prefix.length).forEach(record => preserve.add(record))
          }
        }
      }
    }
    const restoredKeys = new Set([...preserve].map(record => record.key))
    const removed = new Set<postcss.ChildNode>()
    for (const record of frameworkRules) {
      if (!preserve.has(record) && generatedKeys.has(record.key)) {
        removed.add(record.node)
      }
    }
    for (const record of generatedRules) {
      if (restoredKeys.has(record.key) && !generatedPrefix.has(record.node)) {
        removed.add(record.node)
      }
    }
    let charset: postcss.AtRule | undefined
    for (const root of roots) {
      removeRules(root, removed, ruleKeys)
      root.walkAtRules('charset', (rule) => {
        charset ??= rule.clone({ raws: { before: '', afterName: ' ' } })
        rule.remove()
      })
    }
    const css = roots.map(root => root.toString()).filter(value => value.trim()).join('\n')
    return charset ? `${charset.toString()};\n${css}` : css
  }
  catch {
    // 不完整输入不做集合清理，避免解析失败时损失用户内容。
    return inputs.filter(value => value.trim()).join('\n')
  }
}
