import { createRequire } from 'node:module'
import postcss from 'postcss'

const selectorParser = createRequire(new URL('../../packages/postcss/package.json', import.meta.url))('postcss-selector-parser')

export interface Declaration {
  property: string
  value?: string
  important?: boolean
}

export interface RuleContext {
  selector: string
  atRules: string[]
  declaration: Declaration
}

function resolveSelectors(selectors: string[]) {
  let parents: string[] = []
  for (const selector of selectors) {
    const children = selectorParser().astSync(selector).nodes
    if (!parents.length) {
      parents = children.map((child: any) => selectorParser().processSync(child.toString(), { lossless: false }))
      continue
    }
    const parent = selectorParser().astSync(parents.length > 1 ? `:is(${parents.join(',')})` : parents[0]).nodes[0]
    parents = children.map((child: any) => {
      const resolved = child.clone()
      let nested = false
      resolved.walkNesting((node: any) => {
        nested = true
        node.replaceWith(...parent.nodes.map((node: any) => node.clone()))
      })
      return selectorParser().processSync(nested ? resolved.toString() : `${parent} ${resolved}`, { lossless: false })
    })
  }
  return parents
}

export function cssDeclarations(css: string) {
  const byClass = new Map<string, Declaration[]>()
  const bySelector = new Map<string, Declaration[]>()
  const contextsByClass = new Map<string, RuleContext[]>()
  const root = postcss.parse(css)
  root.walkRules((rule) => {
    const declarations: Declaration[] = []
    rule.walkDecls((decl) => {
      declarations.push({ property: decl.prop, value: decl.value, important: Boolean(decl.important) })
    })
    bySelector.set(rule.selector, [...(bySelector.get(rule.selector) ?? []), ...declarations])
    selectorParser((selectors: any) => {
      selectors.walkClasses((node: { value: string }) => {
        byClass.set(node.value, [...(byClass.get(node.value) ?? []), ...declarations])
      })
    }).processSync(rule.selector)
  })
  root.walkDecls((decl) => {
    const selectors: string[] = []
    const atRules: string[] = []
    let ancestor = decl.parent
    while (ancestor && ancestor.type !== 'root') {
      if (ancestor.type === 'rule') {
        selectors.unshift(ancestor.selector)
      }
      // 默认入口包裹的 layer 不属于候选自身条件，注册表单项参考没有这一外层。
      if (ancestor.type === 'atrule' && ancestor.name !== 'layer') {
        atRules.unshift(`@${ancestor.name} ${ancestor.params.trim()}`.trim())
      }
      ancestor = ancestor.parent
    }
    for (const selector of resolveSelectors(selectors)) {
      selectorParser((nodes: any) => {
        const classes = new Set<string>()
        nodes.walkClasses((node: { value: string }) => classes.add(node.value))
        for (const candidate of classes) {
          const contexts = contextsByClass.get(candidate) ?? []
          contexts.push({ selector, atRules, declaration: { property: decl.prop, value: decl.value, important: Boolean(decl.important) } })
          contextsByClass.set(candidate, contexts)
        }
      }).processSync(selector)
    }
  })
  return { byClass, bySelector, contextsByClass }
}

/** 声明相同也必须保留选择器和媒体、supports、container 等条件，不能把条件变体变成无条件规则。 */
export function retainsRuleContexts(actual: readonly RuleContext[], expected: readonly RuleContext[]) {
  const sequences = (contexts: readonly RuleContext[]) => {
    const grouped = new Map<string, string[]>()
    for (const context of contexts) {
      const key = JSON.stringify([context.selector, context.atRules, context.declaration.property])
      const values = grouped.get(key) ?? []
      const value = JSON.stringify([(context.declaration.value ?? '').replace(/\s+/g, ' ').trim(), Boolean(context.declaration.important)])
      if (values.at(-1) !== value) {
        values.push(value)
      }
      grouped.set(key, values)
    }
    return grouped
  }
  const observed = sequences(actual)
  const reference = sequences(expected)
  return reference.size > 0 && observed.size === reference.size
    && [...reference].every(([key, values]) => JSON.stringify(observed.get(key)) === JSON.stringify(values))
}

/** 比较官方完整样式中的全局变量、降级初始化、keyframes 和 property 注册。 */
export function stylesheetDependenciesRetained(actual: string, expected: string) {
  const collect = (css: string) => {
    const dependencies = new Map<string, string[]>()
    const conditions = (rule: postcss.Rule | postcss.AtRule) => {
      const result: string[] = []
      let parent = rule.parent
      while (parent && parent.type !== 'root') {
        if (parent.type === 'atrule' && parent.name !== 'layer') {
          result.unshift(`@${parent.name} ${parent.params.trim()}`)
        }
        parent = parent.parent
      }
      return JSON.stringify(result)
    }
    const append = (key: string, value: string) => {
      const values = dependencies.get(key) ?? []
      if (values.at(-1) !== value) {
        values.push(value)
      }
      dependencies.set(key, values)
    }
    const root = postcss.parse(css)
    root.walkRules((rule) => {
      const selectors: string[] = []
      let candidateScoped = false
      let parent: postcss.AnyNode | undefined = rule
      while (parent && parent.type !== 'root') {
        if (parent.type === 'rule') {
          selectors.unshift(parent.selector)
          selectorParser((nodes: any) => nodes.walkClasses(() => {
            candidateScoped = true
          })).processSync(parent.selector)
        }
        parent = parent.parent
      }
      if (candidateScoped) {
        return
      }
      for (const decl of rule.nodes) {
        if (decl.type === 'decl' && decl.prop.startsWith('--')) {
          for (const selector of resolveSelectors(selectors)) {
            append(`global/${conditions(rule)}/${selector}/${decl.prop}`, JSON.stringify([decl.value.replace(/\s+/g, ' ').trim(), Boolean(decl.important)]))
          }
        }
      }
    })
    root.walkAtRules((rule) => {
      if (!['keyframes', '-webkit-keyframes', 'property'].includes(rule.name)) {
        return
      }
      const declarations: unknown[] = []
      rule.walkDecls((decl) => {
        const parents: string[] = []
        let parent = decl.parent
        while (parent && parent !== rule && parent.type !== 'root') {
          parents.unshift(parent.type === 'rule' ? parent.selector : `@${parent.name} ${parent.params}`)
          parent = parent.parent
        }
        declarations.push([parents, decl.prop, decl.value.replace(/\s+/g, ' ').trim(), Boolean(decl.important)])
      })
      append(`@${rule.name}/${conditions(rule)}/${rule.params}`, JSON.stringify(declarations))
    })
    return dependencies
  }
  const actualDependencies = collect(actual)
  return [...collect(expected)].every(([key, values]) => JSON.stringify(actualDependencies.get(key)) === JSON.stringify(values))
}

export function retainsDeclarations(actual: readonly Declaration[], expected: readonly Declaration[]) {
  return expected.length > 0 && expected.every(item => actual.some(value => value.property === item.property
    && (item.value === undefined || (value.value ?? '').replace(/\s+/g, ' ').trim() === item.value.replace(/\s+/g, ' ').trim())
    && (item.important === undefined || Boolean(value.important) === item.important)))
}
