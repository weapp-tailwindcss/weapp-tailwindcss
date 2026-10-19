/* eslint-disable style/max-statements-per-line */

import type { Declaration, Root, Rule } from 'postcss'

function isUnconditional(node: Rule) {
  let parent = node.parent
  while (parent && parent.type !== 'root') {
    if (parent.type !== 'atrule' || parent.name !== 'layer') { return false }
    parent = parent.parent
  }
  return true
}

function applyDeclarations(declarations: Declaration[], variables: Record<string, string>) {
  const important = new Set<string>()
  for (const declaration of declarations) {
    if (important.has(declaration.prop) && !declaration.important) { continue }
    variables[declaration.prop] = declaration.value.trim()
    if (declaration.important) { important.add(declaration.prop) }
  }
}

function customDeclarations(rule: Rule) {
  return rule.nodes.filter((node): node is Declaration => node.type === 'decl' && node.prop.startsWith('--'))
}

/** 只有属性注册默认值和无条件根/全局声明能进入公共变量表。 */
export function collectNativeVariables(root: Root) {
  const variables: Record<string, string> = {}
  root.walkAtRules('property', (rule) => {
    for (const node of rule.nodes ?? []) {
      if (node.type === 'decl' && node.prop === 'initial-value') { variables[rule.params.trim()] = node.value.trim() }
    }
  })
  const declarations: Declaration[] = []
  root.walkRules((rule) => {
    if (isUnconditional(rule) && rule.selectors.some(selector => [':root', ':host', '*'].includes(selector.trim()))) {
      declarations.push(...customDeclarations(rule))
    }
  })
  applyDeclarations(declarations, variables)
  return variables
}

/** 当前规则的声明覆盖继承变量，不读取兄弟 utility 或后代规则。 */
export function nativeRuleVariables(rule: Rule, inherited: Record<string, string>) {
  const variables = { ...inherited }
  const scopes: Rule[] = []
  let current: Rule | undefined = rule
  while (current) {
    scopes.unshift(current)
    current = current.parent?.type === 'rule' ? current.parent : undefined
  }
  for (const scope of scopes) { applyDeclarations(customDeclarations(scope), variables) }
  return variables
}
