import type { ChildNode } from 'postcss'
import selectorParser from 'postcss-selector-parser'
import { postcss } from '../postcss-runtime'
import { createCssValueSignature, valueSignature } from './class-signatures/values'

function contentSignature(nodes: ChildNode[], declarationValueSignature: (value: string, property: string) => unknown[]): unknown[] {
  return nodes.filter(node => node.type !== 'comment').map((node): unknown => {
    if (node.type === 'decl') {
      return ['decl', node.prop, declarationValueSignature(node.value, node.prop), Boolean(node.important)]
    }
    if (node.type === 'atrule') {
      return ['atrule', node.name, valueSignature(node.params), contentSignature(node.nodes ?? [], declarationValueSignature)]
    }
    return ['rule', selectorParser().processSync(node.selector, { lossless: false }), contentSignature(node.nodes, declarationValueSignature)]
  })
}

function hasClassInSameCompound(node: selectorParser.Node, className: string) {
  let sibling = node.prev()
  while (sibling && sibling.type !== 'combinator') {
    if (sibling.type === 'class' && sibling.value === className) {
      return true
    }
    sibling = sibling.prev()
  }
  sibling = node.next()
  while (sibling && sibling.type !== 'combinator') {
    if (sibling.type === 'class' && sibling.value === className) {
      return true
    }
    sibling = sibling.next()
  }
  return false
}

/** 对同一份 CSS 建立严格的类规则索引；调用方显式提供实际消费的 scope 类。 */
export function createCssClassSignatureReader(css: string) {
  const root = postcss.parse(css)
  const declarationValueSignature = createCssValueSignature(root)
  const records = new Map<string, Array<{ selector: selectorParser.Selector, ancestors: unknown[], content: unknown[], order: number }>>()
  const cache = new Map<string, string[]>()
  let order = 0
  root.walkRules((rule) => {
    let hasDeclaration = false
    rule.walkDecls(() => {
      hasDeclaration = true
    })
    if (!hasDeclaration) {
      return
    }
    const ancestors: unknown[] = []
    let parent = rule.parent
    while (parent && parent.type !== 'root') {
      ancestors.unshift(parent.type === 'atrule'
        ? ['atrule', parent.name, valueSignature(parent.params)]
        : ['rule', selectorParser().processSync(parent.selector, { lossless: false })])
      parent = parent.parent
    }
    const content = contentSignature(rule.nodes, declarationValueSignature)
    order += 1
    for (const selector of selectorParser().astSync(rule.selector).nodes) {
      const classes = new Set<string>()
      selector.walkClasses((node) => {
        classes.add(node.value)
      })
      for (const className of classes) {
        const entries = records.get(className) ?? []
        entries.push({ selector, ancestors, content, order })
        records.set(className, entries)
      }
    }
  })
  return (className: string, scopeClasses: ReadonlySet<string> = new Set()) => {
    const key = JSON.stringify([className, [...scopeClasses].sort()])
    const cached = cache.get(key)
    if (cached) {
      return cached
    }
    const byRule = new Map<number, string[]>()
    for (const record of records.get(className) ?? []) {
      const selector = record.selector.clone()
      selector.walkClasses((node) => {
        // 消费节点的 scope 不能证明祖先、兄弟或后代也具有该 scope。
        if (scopeClasses.has(node.value) && hasClassInSameCompound(node, className)) {
          node.remove()
        }
      })
      selector.walkClasses((node) => {
        if (node.value !== className) {
          return
        }
        // 编译器通过重复同一类提高 specificity；仅折叠同一 compound 内的重复。
        if (node.prev()?.type === 'class' && node.prev()?.value === '__utility__') {
          node.remove()
        }
        else {
          node.value = '__utility__'
        }
      })
      const ruleSignatures = byRule.get(record.order) ?? []
      ruleSignatures.push(JSON.stringify([
        record.ancestors,
        selectorParser().processSync(selector.toString(), { lossless: false }),
        record.content,
      ]))
      byRule.set(record.order, ruleSignatures)
    }
    const signatures = [...byRule.values()].flatMap(entries => entries.sort())
    // 完整重复块不改变结果，保留最后一次；不同声明块的层叠顺序不能排序丢失。
    const result = signatures.filter((signature, index) => signatures.lastIndexOf(signature) === index)
    cache.set(key, result)
    return result
  }
}
