import type { Root } from 'postcss'
import { createRequire } from 'node:module'
import path from 'node:path'
import { expect } from 'vitest'

interface SelectorNode {
  type: string
  value?: string
  attribute?: string
}

interface Selector {
  nodes: SelectorNode[]
}

type SelectorParser = (visit: (root: { each: (visitSelector: (selector: Selector) => void) => void }) => void) => {
  processSync: (selector: string) => string
}

const selectorParser = createRequire(path.resolve(__dirname, '../packages/postcss/package.json'))('postcss-selector-parser') as SelectorParser

export const issue1319ProbeNames = ['original', 'native', 'top', 'right', 'bottom', 'left', 'pair', 'all', 'override'] as const

/** 仅收集当前节点真正匹配的边框声明，保留产物中的级联顺序。 */
export function collectIssue1319BorderDeclarations(root: Root, classes: Set<string>) {
  const declarations: string[] = []
  root.walkRules((rule) => {
    let matched = false
    selectorParser((selectors) => {
      selectors.each((selector) => {
        const hasClass = selector.nodes.some(node => node.type === 'class')
        if (hasClass && selector.nodes.every(node => node.type === 'class'
          ? classes.has(node.value ?? '')
          : node.type === 'attribute' && node.attribute?.startsWith('data-v-'))) {
          matched = true
        }
      })
    }).processSync(rule.selector)
    if (matched) {
      rule.walkDecls((decl) => {
        if (decl.prop.startsWith('border') || decl.prop === '--tw-border-style') {
          declarations.push(`${decl.prop}:${decl.value}${decl.important ? '!important' : ''}`)
        }
      })
    }
  })
  return declarations
}

export function assertIssue1319BorderEvidence(evidence: Record<string, string[]>, mini: boolean) {
  expect(Object.keys(evidence).sort()).toEqual(issue1319ProbeNames.map(name => `issue-1319-${name}`).sort())
  for (const name of ['original', 'native', 'top', 'pair']) {
    expect(evidence[`issue-1319-${name}`]).toContain('border-top-width:1px')
  }
  for (const direction of ['right', 'bottom', 'left']) {
    expect(evidence[`issue-1319-${direction}`]).toContain(`border-${direction}-width:1px`)
  }
  for (const name of issue1319ProbeNames.filter(name => name !== 'native')) {
    expect(evidence[`issue-1319-${name}`]).toContain('border-style:solid')
    expect(evidence[`issue-1319-${name}`].some(declaration => declaration.startsWith('border-color:'))).toBe(true)
  }
  expect(evidence['issue-1319-native']).toContain('border-top-style:solid')
  expect(evidence['issue-1319-pair']).toContain('border-left-width:2px')
  expect(evidence['issue-1319-all']).toContain('border-width:2px')
  const override = evidence['issue-1319-override']
  expect(override).toContain('border-width:2px')
  expect(override).toContain('border-top-width:0px')
  expect(override.indexOf('border-top-width:0px')).toBeGreaterThan(override.indexOf('border-width:2px'))
  if (mini) {
    for (const declarations of Object.values(evidence)) {
      expect(declarations[0]).toBe('border-width:0')
    }
  }
}
