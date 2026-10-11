import type { Node } from 'postcss-value-parser'
import postcss from 'postcss'
import valueParser from 'postcss-value-parser'
import { getCssCustomPropertyName } from '../utils/css-custom-property'
import { COLOR_MIX_NAME, MODERN_COLOR_FUNCTION_NAMES, PLACEHOLDER_PREFIX } from './color-mix/constants'
import { hasUnsupportedModernColorFunction, isDisplayP3ColorFunction, isModernColorSyntaxFunction } from './color-mix/modern'
import { normalizeStandaloneColorFunction } from './color-mix/parse'
import { tryResolveColorMix } from './color-mix/resolve'
import { isTailwindcssV4ThemeVariable } from './tailwindcss-v4/variables'

export interface DynamicColorMixAlphaProtection {
  css: string
  restore: (css: string) => string
}

export interface DynamicColorMixAlphaProtectionOptions {
  customPropertyValues?: ReadonlyMap<string, string> | undefined
}

export interface ModernColorValueNormalization {
  value: string
  changed: boolean
  hasUnsupported: boolean
}

const DYNAMIC_VAR_FALLBACK_PLACEHOLDER_PREFIX = '__weapp_tw_var_fallback_'

function getStandaloneDynamicVarWithFallback(value: string) {
  const parsed = valueParser(value)
  const nodes = parsed.nodes.filter(node => node.type !== 'space' && node.type !== 'comment')
  const variable = nodes.length === 1 ? nodes[0] : undefined
  if (variable?.type !== 'function' || variable.value.toLowerCase() !== 'var') {
    return undefined
  }
  const comma = variable.nodes.findIndex(node => node.type === 'div' && node.value === ',')
  const property = comma < 0
    ? undefined
    : getCssCustomPropertyName(valueParser.stringify(variable.nodes.slice(0, comma)))
  if (!property || isTailwindcssV4ThemeVariable(property)) {
    return undefined
  }
  return variable
}

/**
 * 保护带 fallback 的作者 CSS 变量，避免兼容插件把它错误静态化。
 */
export function protectDynamicVarFallbacks(css: string): DynamicColorMixAlphaProtection {
  if (!css.includes('var(') || !css.includes(',')) {
    return {
      css,
      restore: value => value,
    }
  }

  const replacements = new Map<string, string>()
  let root: postcss.Root
  try {
    root = postcss.parse(css)
  }
  catch {
    return {
      css,
      restore: value => value,
    }
  }

  root.walkDecls((decl) => {
    if (!getStandaloneDynamicVarWithFallback(decl.value)) {
      return
    }
    const placeholder = `${DYNAMIC_VAR_FALLBACK_PLACEHOLDER_PREFIX}${replacements.size}__`
    replacements.set(placeholder, decl.value)
    decl.value = placeholder
  })

  if (replacements.size === 0) {
    return {
      css,
      restore: value => value,
    }
  }

  return {
    css: root.toString(),
    restore(value) {
      let restored = value
      for (const [placeholder, replacement] of replacements) {
        restored = restored.split(placeholder).join(replacement)
      }
      return restored
    },
  }
}

export function normalizeModernColorValue(
  value: string,
  customPropertyValues: ReadonlyMap<string, string> = new Map(),
): ModernColorValueNormalization {
  if (!hasUnsupportedModernColorFunction(value)) {
    return {
      value,
      changed: false,
      hasUnsupported: false,
    }
  }

  const parsed = valueParser(value)
  let changed = false

  parsed.walk((node) => {
    if (node.type !== 'function') {
      return
    }

    const name = node.value.toLowerCase()
    const source = valueParser.stringify(node)
    let normalized: string | undefined
    if (
      MODERN_COLOR_FUNCTION_NAMES.has(name)
      || (name === 'color' && isDisplayP3ColorFunction(source))
      || isModernColorSyntaxFunction(source)
    ) {
      normalized = normalizeStandaloneColorFunction(source)
    }
    else if (name === COLOR_MIX_NAME) {
      normalized = tryResolveColorMix(node, customPropertyValues)?.value
    }

    if (!normalized) {
      return
    }

    const mutableNode = node as unknown as Node & { nodes?: Node[] }
    mutableNode.type = 'word'
    mutableNode.value = normalized
    delete mutableNode.nodes
    changed = true
  })

  const nextValue = changed ? parsed.toString() : value
  return {
    value: nextValue,
    changed,
    hasUnsupported: hasUnsupportedModernColorFunction(nextValue),
  }
}

function createPlaceholder(index: number) {
  return `${PLACEHOLDER_PREFIX}${index}__`
}

function unwrapProtectedSupports(cssRoot: postcss.Root) {
  cssRoot.walkAtRules('supports', (atRule) => {
    if (!atRule.nodes || !atRule.toString().includes(PLACEHOLDER_PREFIX)) {
      return
    }
    atRule.replaceWith(atRule.nodes)
  })
}

export function protectDynamicColorMixAlpha(
  css: string,
  options: DynamicColorMixAlphaProtectionOptions = {},
): DynamicColorMixAlphaProtection {
  if (!css.includes(COLOR_MIX_NAME)) {
    return {
      css,
      restore: value => value,
    }
  }

  const replacements = new Map<string, string>()
  const root = postcss.parse(css)
  const customPropertyValues = new Map(options.customPropertyValues)
  let changed = false

  root.walkDecls((decl) => {
    if (decl.prop.startsWith('--') && !decl.value.includes(COLOR_MIX_NAME)) {
      customPropertyValues.set(decl.prop, decl.value.trim())
    }
  })

  root.walkDecls((decl) => {
    if (!decl.value.includes(COLOR_MIX_NAME)) {
      return
    }

    const parsed = valueParser(decl.value)
    let mutated = false

    parsed.walk((node) => {
      if (node.type !== 'function' || node.value.toLowerCase() !== COLOR_MIX_NAME) {
        return
      }
      const resolved = tryResolveColorMix(node, customPropertyValues)
      if (resolved) {
        if (resolved.deferred) {
          const placeholder = createPlaceholder(replacements.size)
          replacements.set(placeholder, resolved.value)
          const mutableNode = node as unknown as Node & { nodes?: Node[] }
          mutableNode.type = 'word'
          mutableNode.value = placeholder
          delete mutableNode.nodes
          mutated = true
          return
        }
        const mutableNode = node as unknown as Node & { nodes?: Node[] }
        mutableNode.type = 'word'
        mutableNode.value = resolved.value
        delete mutableNode.nodes
        mutated = true
      }
    })

    if (mutated) {
      decl.value = parsed.toString()
      changed = true
    }
  })

  if (replacements.size > 0) {
    unwrapProtectedSupports(root)
  }

  return {
    css: changed ? root.toString() : css,
    restore(value) {
      let restored = value
      for (const [placeholder, replacement] of replacements) {
        restored = restored.split(placeholder).join(replacement)
      }
      return restored
    },
  }
}
