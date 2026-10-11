import { postcss } from '../../../postcss-runtime'
import { normalizeGeneratedSelector } from '../../../utils/apply-source'

const VUE_SCOPED_SELECTOR_RE = /\.data-v-[\w-]+|\[data-v-[^\]]+\]/g

function normalizeVueScopedSelector(selector: string) {
  let scoped = false
  const normalized = normalizeGeneratedSelector(selector).replace(VUE_SCOPED_SELECTOR_RE, () => {
    scoped = true
    return ''
  }).trim()
  return {
    normalized,
    scoped,
  }
}

function normalizeCssComparableValue(value: string) {
  const normalizeUnquotedSegment = (segment: string) => segment.replace(/(^|[^\w.-])(-?)0+\.(\d+)/g, '$1$2.$3')
  let result = ''
  let segmentStart = 0
  let index = 0
  while (index < value.length) {
    const quote = value[index]
    if (quote !== '"' && quote !== '\'') {
      index++
      continue
    }
    result += normalizeUnquotedSegment(value.slice(segmentStart, index))
    const stringStart = index
    index++
    while (index < value.length) {
      if (value[index] === '\\') {
        index += 2
        continue
      }
      if (value[index] === quote) {
        index++
        break
      }
      index++
    }
    result += value.slice(stringStart, index)
    segmentStart = index
  }
  return result + normalizeUnquotedSegment(value.slice(segmentStart))
}

function createCssNodeSignature(node: postcss.ChildNode): string {
  if (node.type === 'decl') {
    return JSON.stringify(['decl', node.prop, normalizeCssComparableValue(node.value), node.important])
  }
  if (node.type === 'atrule') {
    return JSON.stringify([
      'atrule',
      node.name,
      normalizeCssComparableValue(node.params),
      node.nodes?.map(createCssNodeSignature) ?? null,
    ])
  }
  if (node.type === 'rule') {
    return JSON.stringify([
      'rule',
      node.selector,
      node.nodes?.map(createCssNodeSignature) ?? null,
    ])
  }
  return JSON.stringify(['comment', node.text])
}

function createRuleBodySignature(rule: postcss.Rule) {
  return JSON.stringify(rule.nodes?.map(createCssNodeSignature) ?? [])
}

function createRuleAtRuleContextSignature(rule: postcss.Rule) {
  const context: string[] = []
  let parent = rule.parent
  while (parent && parent.type !== 'root') {
    if (parent.type === 'atrule') {
      context.unshift(JSON.stringify([parent.name, parent.params]))
    }
    parent = parent.parent
  }
  return JSON.stringify(context)
}

function createScopedRuleCoveragePrefix(rule: postcss.Rule) {
  return JSON.stringify([
    createRuleAtRuleContextSignature(rule),
    createRuleBodySignature(rule),
  ])
}

function removeUnscopedRulesCoveredByScopedRules(root: postcss.Root) {
  const scopedCoverage = new Set<string>()
  const rulePrefixes = new WeakMap<postcss.Rule, string>()
  const coverageKey = (rule: postcss.Rule, selector: string) => {
    let prefix = rulePrefixes.get(rule)
    if (prefix === undefined) {
      prefix = createScopedRuleCoveragePrefix(rule)
      rulePrefixes.set(rule, prefix)
    }
    return JSON.stringify([prefix, selector])
  }
  root.walkRules((rule) => {
    for (const selector of rule.selectors ?? [rule.selector]) {
      const normalized = normalizeVueScopedSelector(selector)
      if (normalized.scoped && normalized.normalized) {
        scopedCoverage.add(coverageKey(rule, normalized.normalized))
      }
    }
  })
  if (scopedCoverage.size === 0) {
    return
  }
  root.walkRules((rule) => {
    const selectors = rule.selectors ?? [rule.selector]
    const normalizedSelectors = selectors.map(normalizeVueScopedSelector)
    if (
      normalizedSelectors.some(selector => selector.scoped || !selector.normalized)
      || !normalizedSelectors.every(selector => scopedCoverage.has(coverageKey(rule, selector.normalized)))
    ) {
      return
    }
    rule.remove()
  })
}

/** 复用调用方 AST；索引仅在本次调用内存活，不跨样式变更缓存。 */
export function preferScopedGeneratedCssRulesRoot(root: postcss.Root) {
  removeUnscopedRulesCoveredByScopedRules(root)
  root.walkAtRules((rule) => {
    if (rule.nodes !== undefined && rule.nodes.length === 0) {
      rule.remove()
    }
  })
}

export function preferScopedGeneratedCssRules(css: string) {
  if (!css.includes('data-v-')) {
    return css
  }
  try {
    const root = postcss.parse(css)
    preferScopedGeneratedCssRulesRoot(root)
    return root.toString()
  }
  catch {
    return css
  }
}
