import type { Rule } from 'postcss'
import { escape } from '@weapp-tailwindcss/escape'
import postcss from 'postcss'

const CLASS_SELECTOR_RE = /(?:^|[^\w-])\.[_a-z\u00A0-\uFFFF\\-]/i
const MINI_PROGRAM_THEME_SCOPE_SELECTORS = new Set([':host', 'page', '.tw-root', 'wx-root-portal-content'])
const SPECIFICITY_PLACEHOLDER_RE = /:not\(#(?:\\#|n)\)/g
const SELECTOR_CACHE_LIMIT = 64
const LEGACY_PSEUDO_ELEMENTS = ['before', 'after', 'first-letter', 'first-line'] as const
const generatedSelectorCache = new Map<string, Set<string>>()

function setGeneratedSelectorCache(css: string, selectors: Set<string>) {
  if (generatedSelectorCache.size >= SELECTOR_CACHE_LIMIT) {
    const firstKey = generatedSelectorCache.keys().next().value
    if (firstKey !== undefined) {
      generatedSelectorCache.delete(firstKey)
    }
  }
  generatedSelectorCache.set(css, selectors)
}

function normalizeCompatSelector(selector: string) {
  return selector
    .replace(SPECIFICITY_PLACEHOLDER_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
}

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

function isClassSelectorTerminator(char: string) {
  return /[\s>+~#,.:()[\]]/.test(char)
}

function unescapeSimpleCssIdent(value: string) {
  return value.replaceAll(/\\(.)/g, '$1')
}

function escapeCompatSelectorClasses(selector: string) {
  let result = ''
  let index = 0
  let changed = false
  while (index < selector.length) {
    const char = selector[index]
    if (char !== '.') {
      result += char
      index += 1
      continue
    }

    let end = index + 1
    let className = ''
    while (end < selector.length) {
      const current = selector[end]
      if (current === undefined) {
        break
      }
      if (current === '\\' && end + 1 < selector.length) {
        const escaped = selector[end + 1]
        if (escaped === undefined) {
          break
        }
        className += current + escaped
        end += 2
        continue
      }
      if (isClassSelectorTerminator(current)) {
        break
      }
      className += current
      end += 1
    }

    if (className.includes('\\')) {
      result += `.${escape(unescapeSimpleCssIdent(className))}`
      changed = true
    }
    else {
      result += `.${className}`
    }
    index = end
  }
  return changed ? result : selector
}

export function normalizeCompatSelectors(selector: string) {
  const normalized = normalizeCompatSelector(selector)
  if (!normalized) {
    return []
  }
  const selectors = new Set([normalized])
  const escaped = normalizeCompatSelector(escapeCompatSelectorClasses(normalized))
  if (escaped) {
    selectors.add(escaped)
  }
  return [...selectors]
}

function normalizeCssSelector(selector: string) {
  return normalizeLegacyPseudoElements(selector).trim().replace(/\s+/g, '')
}

function getCompatSelectorKeys(selector: string) {
  return normalizeCompatSelectors(selector).map(normalizeCssSelector)
}

export function getRuleCompatSelectorKeys(rule: Rule) {
  return (rule.selectors?.length ? rule.selectors : [rule.selector])
    .flatMap(selector => getCompatSelectorKeys(selector))
}

function hasClassSelector(selector: string) {
  return CLASS_SELECTOR_RE.test(selector)
}

function getNormalizedSelectorList(selector: string) {
  return selector.split(',').map(normalizeCssSelector).filter(Boolean)
}

function isMiniProgramThemeScopeSelector(selector: string) {
  const selectors = getNormalizedSelectorList(selector)
  return selectors.length > 0
    && selectors.every(item => MINI_PROGRAM_THEME_SCOPE_SELECTORS.has(item))
}

export function hasUtilityClassSelector(selector: string) {
  return hasClassSelector(selector) && !isMiniProgramThemeScopeSelector(selector)
}

export function isCustomPropertyOnlyRule(rule: Rule) {
  let hasDeclaration = false
  let allCustomProperties = true

  rule.each((node) => {
    if (node.type !== 'decl') {
      return
    }
    hasDeclaration = true
    if (!node.prop.startsWith('--')) {
      allCustomProperties = false
    }
  })

  return hasDeclaration && allCustomProperties
}

export function isPseudoContentInitRule(rule: Rule) {
  let hasDeclaration = false
  let onlyContentVariable = true

  rule.each((node) => {
    if (node.type !== 'decl') {
      return
    }
    hasDeclaration = true
    if (node.prop !== '--tw-content') {
      onlyContentVariable = false
    }
  })

  return hasDeclaration && onlyContentVariable
}

export function collectGeneratedSelectors(css: string) {
  const cached = generatedSelectorCache.get(css)
  if (cached) {
    return cached
  }

  const selectors = new Set<string>()
  try {
    const root = postcss.parse(css)
    root.walkRules((rule) => {
      if (isCustomPropertyOnlyRule(rule) && !isPseudoContentInitRule(rule) && !hasUtilityClassSelector(rule.selector)) {
        return
      }
      for (const selector of getRuleCompatSelectorKeys(rule)) {
        selectors.add(selector)
      }
    })
  }
  catch {
    return selectors
  }
  setGeneratedSelectorCache(css, selectors)
  return selectors
}
