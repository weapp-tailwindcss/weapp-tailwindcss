import postcss from 'postcss'

const LEGACY_PSEUDO_ELEMENTS = ['before', 'after', 'first-letter', 'first-line'] as const
const CSS_STRING_LITERAL_RE = /(["'])((?:\\[\s\S]|(?!\1)[\s\S])*)\1/g

function isLegacyPseudoElementAt(selector: string, index: number) {
  for (const name of LEGACY_PSEUDO_ELEMENTS) {
    if (!selector.startsWith(name, index)) {
      continue
    }
    const next = selector[index + name.length]
    if (next === undefined || !/[\w-]/.test(next)) {
      return name
    }
  }
  return undefined
}

function normalizeLegacyPseudoElements(selector: string) {
  let result = ''
  let quote: string | undefined
  let bracketDepth = 0
  let index = 0
  while (index < selector.length) {
    const char = selector[index]
    if (char === '\\') {
      result += selector.slice(index, index + 2)
      index += 2
      continue
    }
    if (quote !== undefined) {
      result += char
      if (char === quote) {
        quote = undefined
      }
      index += 1
      continue
    }
    if (char === '"' || char === '\'') {
      quote = char
      result += char
      index += 1
      continue
    }
    if (char === '[') {
      bracketDepth++
      result += char
      index += 1
      continue
    }
    if (char === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1)
      result += char
      index += 1
      continue
    }
    if (bracketDepth === 0 && char === ':' && selector[index + 1] === ':') {
      result += '::'
      index += 2
      continue
    }
    if (bracketDepth === 0 && char === ':') {
      const name = isLegacyPseudoElementAt(selector, index + 1)
      if (name) {
        result += `::${name}`
        index += name.length + 1
        continue
      }
    }
    result += char
    index += 1
  }
  return result
}

function normalizeCssRuleDeduplicationSelector(selector: string) {
  return normalizeLegacyPseudoElements(selector)
    .replace(/\s+/g, ' ')
    .replace(/\s*([>+~])\s*/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .trim()
}

function normalizeCssRuleDeduplicationValue(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(CSS_STRING_LITERAL_RE, (_match, _quote: string, content: string) => {
      const normalized = content
        .replace(/\\(["'])/g, '$1')
        .replace(/'/g, '\\\'')
      return `'${normalized}'`
    })
    .trim()
}

function createRuleDeduplicationKey(rule: postcss.Rule) {
  const parents: string[] = []
  let parent = rule.parent
  while (parent && parent.type !== 'root') {
    if (parent.type === 'atrule') {
      parents.push(`${parent.name}:${parent.params}`)
    }
    parent = parent.parent
  }
  const declarations = (rule.nodes ?? []).map((node) => {
    if (node.type === 'decl') {
      return `${node.prop}:${normalizeCssRuleDeduplicationValue(node.value)}:${node.important ? '1' : '0'}`
    }
    if (node.type === 'comment') {
      return ''
    }
    return normalizeCssRuleDeduplicationValue(node.toString())
  }).filter(Boolean)
  const selectors = (rule.selectors?.length ? rule.selectors : [rule.selector])
    .map(normalizeCssRuleDeduplicationSelector)
  return [
    parents.reverse().join('|'),
    selectors.join(','),
    declarations.join(';'),
  ].join('\n')
}

export function deduplicateGeneratedCssRules(css: string) {
  if (!css) {
    return css
  }
  try {
    const root = postcss.parse(css)
    const seen = new Set<string>()
    root.walkRules((rule) => {
      const key = createRuleDeduplicationKey(rule)
      if (seen.has(key)) {
        rule.remove()
        return
      }
      seen.add(key)
    })
    return root.toString()
  }
  catch {
    return css
  }
}
