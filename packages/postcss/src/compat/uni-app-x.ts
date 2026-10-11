// Uni-app X 兼容性相关的辅助方法，集中复用特殊处理逻辑
import type { Result as PostcssResult, Rule } from 'postcss'
import type { Node, Pseudo } from 'postcss-selector-parser'
import type { IStyleHandlerOptions } from '../types'
import { splitCandidateTokens } from '@weapp-tailwindcss/engine'
import postcss from 'postcss'
import { parseScssSource, stringifyScssSource } from '../syntax/parse'

/** native Sass 可解析、PostCSS 阶段再还原的 important utility 标记。 */
export const UNI_APP_X_IMPORTANT_APPLY_MARKER = '__weapp_tw_important__'

const UNI_APP_X_BASE_CARRIER_SELECTORS = new Set([
  '*',
  'view',
  'text',
  '::before',
  '::after',
  ':before',
  ':after',
  '::backdrop',
])
const REQUIRED_TW_VAR_RE = /var\(\s*(--tw-[\w-]+)\s*\)/g
const CLASS_SELECTOR_RE = /\.[\w-]+/
const SELECTOR_WHITESPACE_RE = /\s+/g

function rewriteImportantApplyUtility(utility: string, marker: string) {
  if (utility.startsWith('!') && !utility.startsWith('\\!')) {
    return `${utility.slice(1)}${marker}`
  }
  if (utility.endsWith('!') && !utility.endsWith('\\!')) {
    return `${utility.slice(0, -1)}${marker}`
  }
  return utility
}

function rewriteApplyParams(params: string, marker: string) {
  const candidates = splitCandidateTokens(params)
  if (candidates.length === 0) {
    return params
  }
  let result = params
  for (const candidate of candidates) {
    const rewritten = rewriteImportantApplyUtility(candidate, marker)
    if (rewritten !== candidate) {
      result = result.replace(candidate, rewritten)
    }
  }
  return result
}

/** 将 Sass 不可直接解析的 important utility 改写成跨预处理器中间形式。 */
export function normalizeUniAppXImportantApplyForSass(css: string) {
  try {
    // postcss.parse 不读取 syntax 选项；必须直接使用 SCSS parser 保留行内注释和插值。
    const root = parseScssSource(css)
    let changed = false
    root.walkAtRules('apply', (rule) => {
      const params = rewriteApplyParams(rule.params, UNI_APP_X_IMPORTANT_APPLY_MARKER)
      if (params !== rule.params) {
        rule.params = params
        changed = true
      }
    })
    return changed ? stringifyScssSource(root) : css
  }
  catch {
    return css
  }
}

/** 在 Tailwind/PostCSS 处理前还原 native important utility 标记。 */
export function restoreUniAppXImportantApplyMarker(css: string) {
  if (!css.includes(UNI_APP_X_IMPORTANT_APPLY_MARKER)) {
    return css
  }
  try {
    const root = postcss.parse(css)
    let changed = false
    root.walkAtRules('apply', (rule) => {
      if (!rule.params.includes(UNI_APP_X_IMPORTANT_APPLY_MARKER)) {
        return
      }
      rule.params = rule.params.split(UNI_APP_X_IMPORTANT_APPLY_MARKER).join('!')
      changed = true
    })
    return changed ? root.toString() : css
  }
  catch {
    return css
  }
}

interface TwDefaultDeclaration {
  prop: string
  value: string
  important: boolean
}

export function isUniAppXEnabled(options?: Pick<IStyleHandlerOptions, 'uniAppX'>) {
  return Boolean(options?.uniAppX)
}

function normalizeSelector(selector: string) {
  return selector.replace(SELECTOR_WHITESPACE_RE, '').toLowerCase()
}

function isBaseCarrierSelector(selector: string) {
  return UNI_APP_X_BASE_CARRIER_SELECTORS.has(normalizeSelector(selector))
}

function isBaseCarrierRule(rule: Rule) {
  return Array.isArray(rule.selectors)
    && rule.selectors.length > 0
    && rule.selectors.every(isBaseCarrierSelector)
}

function hasClassSelector(rule: Rule) {
  return Array.isArray(rule.selectors) && rule.selectors.some(selector => CLASS_SELECTOR_RE.test(selector))
}

function collectRequiredTwVars(value: string) {
  const result = new Set<string>()
  for (const match of value.matchAll(REQUIRED_TW_VAR_RE)) {
    const variableName = match[1]
    if (variableName) {
      result.add(variableName)
    }
  }
  return result
}

function extractUniAppXBaseDefaults(result: PostcssResult) {
  const defaults = new Map<string, TwDefaultDeclaration>()
  result.root.walkRules((rule) => {
    if (!isBaseCarrierRule(rule)) {
      return
    }
    rule.walkDecls((decl) => {
      if (!decl.prop.startsWith('--tw-') || defaults.has(decl.prop)) {
        return
      }
      defaults.set(decl.prop, {
        prop: decl.prop,
        value: decl.value,
        important: decl.important,
      })
    })
    rule.remove()
  })
  return defaults
}

function injectUniAppXBaseDefaults(
  result: PostcssResult,
  defaults: Map<string, TwDefaultDeclaration>,
) {
  if (defaults.size === 0) {
    return
  }

  result.root.walkRules((rule) => {
    if (!hasClassSelector(rule)) {
      return
    }

    const declaredProps = new Set<string>()
    const requiredProps = new Set<string>()

    rule.walkDecls((decl) => {
      declaredProps.add(decl.prop)
      for (const variableName of collectRequiredTwVars(decl.value)) {
        requiredProps.add(variableName)
      }
    })

    const prependDecls: TwDefaultDeclaration[] = []
    for (const variableName of requiredProps) {
      if (declaredProps.has(variableName)) {
        continue
      }
      const declaration = defaults.get(variableName)
      if (declaration) {
        prependDecls.push(declaration)
      }
    }

    for (const declaration of prependDecls.reverse()) {
      rule.prepend(postcss.decl({
        prop: declaration.prop,
        value: declaration.value,
        important: declaration.important,
      }))
    }
  })
}

export function applyUniAppXBaseCompatibility(
  result: PostcssResult,
  options?: Pick<IStyleHandlerOptions, 'uniAppX'>,
) {
  if (!isUniAppXEnabled(options)) {
    return result
  }

  const defaults = extractUniAppXBaseDefaults(result)
  injectUniAppXBaseDefaults(result, defaults)
  if (defaults.size === 0) {
    return result
  }
  return result.root.toResult(result.opts)
}

export function stripUnsupportedPseudoForUniAppX(node: Pseudo, enabled: boolean) {
  if (!enabled) {
    return
  }
  // :host 仍需保留给 root 变量作用域，避免在 post 阶段被重复移除/追加导致死循环。
  if (node.value === ':host') {
    return
  }
  node.remove()
}

export function stripUnsupportedNodeForUniAppX(
  node: Node,
  options: Pick<IStyleHandlerOptions, 'uniAppX'>,
): boolean {
  if (!isUniAppXEnabled(options)) {
    return false
  }
  if (node.type === 'attribute' || node.type === 'pseudo') {
    node.remove()
    return true
  }
  return false
}

export function shouldRemoveEmptyRuleForUniAppX(
  rule: Rule,
  options: Pick<IStyleHandlerOptions, 'uniAppX'>,
) {
  return isUniAppXEnabled(options) && rule.nodes.length === 0
}
