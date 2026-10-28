import type { AnyNode, Root, Rule } from 'postcss'
import { createRequire } from 'node:module'
import path from 'node:path'
import { parseSync, traverse } from '@babel/core'
import { JSDOM } from 'jsdom'

interface Selector {
  walk: (visit: (node: { type: string, value: string }) => void) => void
  toString: () => string
}

type SelectorParser = (visit: (root: { each: (visitSelector: (selector: Selector) => void) => void }) => void) => {
  processSync: (selector: string) => string
}

export interface Issue1319WebProbe {
  id: string
  tag: string
  classes: Set<string>
}

const selectorParser = createRequire(path.resolve(__dirname, '../packages/postcss/package.json'))('postcss-selector-parser') as SelectorParser

/** 从真实 render 调用读取宿主标签，避免把 HTML div 假定成框架 uni-view。 */
export function collectIssue1319WebProbes(source: string) {
  const probes = new Map<string, Issue1319WebProbe>()
  const ast = parseSync(source, { configFile: false, babelrc: false, sourceType: 'module' })
  traverse(ast!, {
    CallExpression({ node }) {
      const [tag, properties] = node.arguments
      if (tag?.type !== 'StringLiteral' || properties?.type !== 'ObjectExpression') {
        return
      }
      let id: string | undefined
      let className: string | undefined
      for (const property of properties.properties) {
        if (property.type !== 'ObjectProperty' || property.value.type !== 'StringLiteral') {
          continue
        }
        const key = property.key.type === 'Identifier' ? property.key.name : property.key.type === 'StringLiteral' ? property.key.value : undefined
        if (key === 'id') {
          id = property.value.value
        }
        if (key === 'class') {
          className = property.value.value
        }
      }
      if (id?.startsWith('issue-1319-') && className) {
        probes.set(id, { id, tag: tag.value, classes: new Set(className.split(/\s+/)) })
      }
    },
  })
  return probes
}

function isUnconditionalRule(rule: Rule) {
  let parent: AnyNode | undefined = rule.parent
  while (parent) {
    if (parent.type === 'atrule' && parent.name !== 'layer') {
      return false
    }
    parent = parent.parent
  }
  return true
}

function isDefaultSelector(selector: Selector) {
  let isDefault = true
  selector.walk((node) => {
    if (['class', 'id', 'attribute'].includes(node.type)
      || (node.type === 'pseudo' && ![':where', ':is'].includes(node.value))) {
      isDefault = false
    }
  })
  return isDefault
}

/** 验证基础零宽规则真正匹配产物宿主；作者 class 与条件规则不能充当默认值。 */
export function collectIssue1319MatchingWebResets(root: Root, probe: Issue1319WebProbe) {
  const dom = new JSDOM('<uni-app></uni-app>')
  try {
    const document = dom.window.document
    const element = document.createElement(probe.tag)
    element.id = probe.id
    element.className = [...probe.classes].join(' ')
    document.querySelector('uni-app')!.appendChild(element)
    const selectors: string[] = []
    root.walkRules((rule) => {
      if (!isUnconditionalRule(rule)) {
        return
      }
      const widthDeclarations = rule.nodes.filter(node => node.type === 'decl')
        .filter(declaration => /^(?:border|border-width|border-(?:top|right|bottom|left)(?:-width)?)$/.test(declaration.prop))
      if (widthDeclarations.length !== 1 || widthDeclarations[0]?.prop !== 'border-width'
        || !/^0(?:px)?$/.test(widthDeclarations[0].value) || widthDeclarations[0].important) {
        return
      }
      selectorParser((selectorRoot) => {
        selectorRoot.each((selector) => {
          if (isDefaultSelector(selector) && element.matches(selector.toString())) {
            selectors.push(selector.toString())
          }
        })
      }).processSync(rule.selector)
    })
    return selectors
  }
  finally {
    dom.window.close()
  }
}
