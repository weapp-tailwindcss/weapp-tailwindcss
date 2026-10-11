import type { AtRule } from 'postcss'
import { splitCandidateTokens } from '@weapp-tailwindcss/engine'
import { escape } from '@weapp-tailwindcss/escape'
import postcss from 'postcss'
import { parseUniAppXStyleSource } from '../syntax/parse'

const CLASS_SELECTOR_PREFIX_RE = /^\.((?:\\[^\n\r\f]|[\w-])+)(?=$|[.:#[])/
const STRING_STYLE_PROPERTIES = new Set(['lineHeight', 'line-height'])

type StyleDeclarations = Record<string, string | number>
export type CssClassStyleValue = Record<string, Record<string, StyleDeclarations>>

export function normalizeUniAppXStyleProperty(prop: string) {
  return prop.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase())
}

export function normalizeUniAppXStyleValue(prop: string, value: string | number) {
  const keepString = STRING_STYLE_PROPERTIES.has(prop)
  if (typeof value === 'number') {
    return keepString ? String(value) : value
  }
  const trimmed = value.trim()
  if (!keepString && /^-?\d+(?:\.\d+)?px$/.test(trimmed)) {
    return Number(trimmed.slice(0, -2))
  }
  return trimmed.replace(/\s*,\s*/g, ',')
}

function unescapeCssClassSelector(className: string) {
  return className.replace(/\\([^\n\r\f0-9a-f])/gi, '$1')
}

function assignClassStyleValue(
  result: CssClassStyleValue,
  className: string,
  declarations: StyleDeclarations,
) {
  const unescapedClassName = unescapeCssClassSelector(className)
  result[className] = { '': declarations }
  result[unescapedClassName] = { '': declarations }
  result[escape(unescapedClassName)] = { '': declarations }
}

/** 把 CSS 规则编译成 Harmony/UTS 可消费的 class -> 声明对象。 */
export function cssToClassStyleValue(source: string): CssClassStyleValue | undefined {
  let root: postcss.Root
  try {
    root = postcss.parse(source)
  }
  catch {
    return
  }
  const result: CssClassStyleValue = {}
  root.walkRules((rule) => {
    const selectors = rule.selectors ?? []
    for (const selector of selectors) {
      const match = selector.trim().match(CLASS_SELECTOR_PREFIX_RE)
      if (!match?.[1]) {
        continue
      }
      const declarations: StyleDeclarations = {}
      rule.walkDecls((decl) => {
        declarations[normalizeUniAppXStyleProperty(decl.prop)] = normalizeUniAppXStyleValue(decl.prop, decl.value)
      })
      if (Object.keys(declarations).length > 0) {
        assignClassStyleValue(result, match[1], declarations)
      }
    }
  })
  return Object.keys(result).length > 0 ? result : undefined
}

/** 从 SCSS/CSS 源码收集 `@apply` 工具类。 */
export function collectCssApplyUtilities(source: string) {
  const utilities = new Set<string>()
  let root: postcss.Root
  try {
    root = parseUniAppXStyleSource(source)
  }
  catch {
    return utilities
  }
  root.walkAtRules('apply', (rule) => {
    for (const utility of splitCandidateTokens(rule.params)) {
      utilities.add(utility)
    }
  })
  return utilities
}

/** 把 `@apply` 规则展开成已有 utility 声明。 */
export function expandCssApplySourcesToStyleValue(
  source: string,
  utilityStyles: CssClassStyleValue,
): CssClassStyleValue | undefined {
  let root: postcss.Root
  try {
    root = parseUniAppXStyleSource(source)
  }
  catch {
    return
  }
  const result: CssClassStyleValue = {}
  root.walkRules((rule) => {
    const applyRules = rule.nodes?.filter((node): node is AtRule => node.type === 'atrule' && node.name === 'apply') ?? []
    if (applyRules.length === 0) {
      return
    }
    const selectors = rule.selectors ?? [rule.selector]
    for (const selector of selectors) {
      const className = selector.trim().match(CLASS_SELECTOR_PREFIX_RE)?.[1]
      if (!className) {
        continue
      }
      const declarations: StyleDeclarations = {}
      for (const applyRule of applyRules) {
        for (const utility of splitCandidateTokens(applyRule.params)) {
          const utilityDeclarations = utilityStyles[utility]?.[''] ?? utilityStyles[escape(utility)]?.['']
          if (utilityDeclarations) {
            Object.assign(declarations, utilityDeclarations)
          }
        }
      }
      if (Object.keys(declarations).length > 0) {
        assignClassStyleValue(result, className, declarations)
      }
    }
  })
  return Object.keys(result).length > 0 ? result : undefined
}
