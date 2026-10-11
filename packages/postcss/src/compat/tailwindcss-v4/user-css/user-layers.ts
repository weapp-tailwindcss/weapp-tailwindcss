import { postcss } from '../../../postcss-runtime'
import { analyzeApplyOnlySource } from '../../../utils/apply-source'

export function splitUserCssLayerBlocks(source: string) {
  if (!source.includes('@layer')) {
    return {
      layer: '',
      rest: source,
    }
  }

  try {
    const root = postcss.parse(source)
    const layerRoot = postcss.root()
    const restRoot = postcss.root()
    for (const node of root.nodes) {
      const target = node.type === 'atrule' && node.name === 'layer' && node.nodes?.length
        ? layerRoot
        : restRoot
      target.append(node.clone())
    }
    return {
      layer: layerRoot.toString(),
      rest: restRoot.toString(),
    }
  }
  catch {
    return {
      layer: source,
      rest: '',
    }
  }
}

export function hasUserCssLayerBlocks(source: string) {
  if (!source.includes('@layer')) {
    return false
  }

  try {
    let hasLayerBlock = false
    postcss.parse(source).walkAtRules('layer', (node) => {
      if (node.nodes?.length) {
        hasLayerBlock = true
      }
    })
    return hasLayerBlock
  }
  catch {
    return true
  }
}

function collectUserLayerSelectors(source: string) {
  const selectors = new Set<string>()
  try {
    postcss.parse(source).walkRules((rule) => {
      for (const selector of rule.selectors ?? [rule.selector]) {
        const normalized = selector.trim()
        if (normalized) {
          selectors.add(normalized)
        }
      }
    })
  }
  catch {
  }
  return selectors
}

function matchesUserLayerSelector(selector: string, userLayerSelector: string) {
  if (selector === userLayerSelector) {
    return true
  }
  if (!selector.startsWith(userLayerSelector)) {
    return false
  }
  const next = selector[userLayerSelector.length]
  return next === ':' || next === '['
}

export function extractGeneratedCssForUserLayerSelectors(css: string, userLayerSource: string) {
  const selectors = collectUserLayerSelectors(userLayerSource)
  if (selectors.size === 0) {
    return {
      layer: '',
      rest: css,
    }
  }

  try {
    const root = postcss.parse(css)
    const layerRoot = postcss.root()
    const selectorList = [...selectors]
    root.walkRules((rule) => {
      const ruleSelectors = rule.selectors ?? [rule.selector]
      if (ruleSelectors.some(selector => selectorList.some(userSelector => matchesUserLayerSelector(selector.trim(), userSelector)))) {
        layerRoot.append(rule.clone())
        rule.remove()
      }
    })
    return {
      layer: layerRoot.toString(),
      rest: root.toString(),
    }
  }
  catch {
    return {
      layer: '',
      rest: css,
    }
  }
}

export { analyzeApplyOnlySource, normalizeGeneratedSelector } from '../../../utils/apply-source'

export function collectApplyOnlySourceSelectors(source: string) {
  return analyzeApplyOnlySource(source).selectors
}

export function hasOnlyApplyBackedSourceRules(source: string) {
  return analyzeApplyOnlySource(source).onlyApply
}

export function removeCssComments(css: string) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

export function isEmptyCustomVariantBlock(rule: postcss.AtRule) {
  if (rule.name !== 'custom-variant') {
    return false
  }
  if (!/^[\w-]+$/.test(rule.params.trim())) {
    return false
  }
  if (rule.nodes === undefined) {
    return true
  }
  return rule.nodes.every(node => node.type === 'comment')
}
