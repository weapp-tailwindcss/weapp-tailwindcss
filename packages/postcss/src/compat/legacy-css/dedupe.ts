import type { Node, Rule } from 'postcss'
import postcss from 'postcss'
import {
  collectGeneratedSelectors,
  getRuleCompatSelectorKeys,
  hasUtilityClassSelector,
  isCustomPropertyOnlyRule,
  isPseudoContentInitRule,
} from './selectors'

function collectGeneratedDeclarationPropsBySelector(generatedCss: string, selectors: Set<string>) {
  const propsBySelector = new Map<string, Set<string>>()
  try {
    const generatedRoot = postcss.parse(generatedCss)
    generatedRoot.walkRules((rule) => {
      const matchedSelectors = getRuleCompatSelectorKeys(rule).filter(selector => selectors.has(selector))
      if (matchedSelectors.length === 0) {
        return
      }
      const props = new Set<string>()
      rule.walkDecls((decl) => {
        props.add(decl.prop)
      })
      for (const selector of matchedSelectors) {
        const existing = propsBySelector.get(selector)
        if (existing) {
          for (const prop of props) {
            existing.add(prop)
          }
        }
        else {
          propsBySelector.set(selector, new Set(props))
        }
      }
    })
  }
  catch {
    return propsBySelector
  }
  return propsBySelector
}

function isRuleCoveredByGeneratedProps(
  rule: Rule,
  generatedDeclarationPropsBySelector: Map<string, Set<string>>,
) {
  const nodeSelectors = getRuleCompatSelectorKeys(rule)
  if (nodeSelectors.length === 0) {
    return false
  }
  const props = new Set<string>()
  rule.walkDecls((decl) => {
    props.add(decl.prop)
  })
  if (props.size === 0) {
    return false
  }
  for (const selector of nodeSelectors) {
    const generatedProps = generatedDeclarationPropsBySelector.get(selector)
    if (!generatedProps) {
      continue
    }
    if ([...props].every(prop => generatedProps.has(prop))) {
      return true
    }
  }
  return false
}

export function removeGeneratedSelectorCompatCss(css: string, generatedCss: string) {
  const generatedSelectors = collectGeneratedSelectors(generatedCss)
  if (generatedSelectors.size === 0) {
    return css
  }

  try {
    const root = postcss.parse(css)
    let removed = false
    root.walkRules((rule) => {
      if (isPseudoContentInitRule(rule)) {
        rule.remove()
        removed = true
        return
      }
      if (isCustomPropertyOnlyRule(rule) && !isPseudoContentInitRule(rule) && !hasUtilityClassSelector(rule.selector)) {
        return
      }
      if (getRuleCompatSelectorKeys(rule).some(selector => generatedSelectors.has(selector))) {
        rule.remove()
        removed = true
      }
    })
    root.walkAtRules((atRule) => {
      if (atRule.nodes && atRule.nodes.length === 0) {
        atRule.remove()
      }
    })
    return removed ? root.toString() : css
  }
  catch {
    return css
  }
}

export function collectDedupedPostTransformCompatCss(css: string, generatedCss: string) {
  const generatedSelectors = collectGeneratedSelectors(generatedCss)
  if (generatedSelectors.size === 0) {
    return css
  }
  const generatedDeclarationPropsBySelector = collectGeneratedDeclarationPropsBySelector(generatedCss, generatedSelectors)

  const preservedNodes: Node[] = []
  try {
    const root = postcss.parse(css)
    root.each((node) => {
      if (node.type === 'rule') {
        const nodeSelectors = getRuleCompatSelectorKeys(node)
        const duplicated = nodeSelectors.some(selector => generatedSelectors.has(selector))
        if (!duplicated) {
          preservedNodes.push(node.clone())
          return
        }
        if (isRuleCoveredByGeneratedProps(node, generatedDeclarationPropsBySelector)) {
          return
        }
        if (isCustomPropertyOnlyRule(node) && !isPseudoContentInitRule(node) && !hasUtilityClassSelector(node.selector)) {
          const declarationProps = new Set<string>()
          node.walkDecls((decl) => {
            declarationProps.add(decl.prop)
          })
          for (const selector of nodeSelectors) {
            const generatedProps = generatedDeclarationPropsBySelector.get(selector)
            if (!generatedProps) {
              continue
            }
            for (const prop of generatedProps) {
              declarationProps.delete(prop)
            }
          }
          const nextRule = node.clone()
          nextRule.walkDecls((decl) => {
            if (!declarationProps.has(decl.prop)) {
              decl.remove()
            }
          })
          if (nextRule.nodes.length > 0) {
            preservedNodes.push(nextRule)
          }
        }
        return
      }
      preservedNodes.push(node.clone())
    })
    if (preservedNodes.length === root.nodes.length) {
      return css
    }
    const nextRoot = postcss.root()
    nextRoot.append(preservedNodes)
    return nextRoot.toString()
  }
  catch {
    return css
  }
}
