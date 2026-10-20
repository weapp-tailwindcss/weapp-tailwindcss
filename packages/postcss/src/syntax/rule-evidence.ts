import selectorParser from 'postcss-selector-parser'
import { parseCssSource } from './parse'

function selectorNodeIdentity(node: selectorParser.Node): unknown {
  return [node.type, node.type === 'combinator' ? node.value.trim() || ' ' : node.value, 'namespace' in node ? node.namespace : undefined, 'attribute' in node ? [node.attribute, node.operator, node.insensitive] : undefined, 'nodes' in node ? node.nodes?.map(selectorNodeIdentity) : undefined]
}

/** 使用 AST 身份比较 encoder 日志中的选择器，不能用子串猜测业务来源。 */
export function cssSelectorDiagnosticMatches(selector: string, diagnostic: string) {
  const expected = selectorParser().astSync(diagnostic)
  const actual = selectorParser().astSync(selector)
  const identities = expected.nodes.map(node => JSON.stringify(selectorNodeIdentity(node)))
  const actualIdentities = new Set(actual.nodes.map(node => JSON.stringify(selectorNodeIdentity(node))))
  return identities.length > 0 && identities.every(identity => actualIdentities.has(identity))
}

/** 按选择器分支和条件保存规则，不从可见节点或输入声明推断编码成功。 */
export function collectCssRuleEvidence(css: string) {
  const records: Array<{
    selector: string
    identity: string
    classes: string[]
    conditions: string[]
    declarations: Array<{ property: string, value: string, important: boolean }>
  }> = []
  const root = parseCssSource(css)
  root.walkRules((rule) => {
    const conditions: string[] = []
    for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent) {
      if (parent.type !== 'atrule') {
        throw new Error('嵌套选择器缺少扁平化身份，不能用于编码删除证明')
      }
      conditions.unshift(`@${parent.name} ${parent.params}`)
    }
    const declarations = rule.nodes.flatMap(node => node.type === 'decl'
      ? [{ property: node.prop, value: node.value, important: !!node.important }]
      : [])
    for (const selector of selectorParser().astSync(rule.selector).nodes) {
      const classes: string[] = []
      selector.walkClasses((node) => {
        classes.push(node.value)
      })
      records.push({
        selector: selectorParser().processSync(selector.toString(), { lossless: false }),
        identity: JSON.stringify(selectorNodeIdentity(selector)),
        classes,
        conditions,
        declarations,
      })
    }
  })
  return records
}
