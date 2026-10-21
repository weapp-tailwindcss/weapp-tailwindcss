import type { Node } from 'postcss-value-parser'
import postcss from 'postcss'
import valueParser from 'postcss-value-parser'
import { getCssAtRulePrelude, getCssCustomPropertyName } from '../utils/css-custom-property'
import { COLOR_MIX_NAME, MODERN_COLOR_FUNCTION_NAMES } from './color-mix/constants'
import { hasUnsupportedModernColorFunction, hasUnsupportedModernColorNodes, isDisplayP3ColorFunction, isModernColorSyntaxNode, mayHaveModernColorFunction } from './color-mix/modern'
import { normalizeStandaloneColorFunction } from './color-mix/parse'
import { tryResolveColorMix } from './color-mix/resolve'
import { lowerStaticColorMixSupports } from './color-mix/supports'
import { isTailwindcssV4ThemeVariable } from './tailwindcss-v4/variables'
import { collectCustomPropertyValues } from './web-css-custom-properties'

export interface DynamicColorMixAlphaProtection {
  css: string
  restore: (css: string) => string
}

export interface DynamicColorMixAlphaProtectionOptions {
  customPropertyValues?: ReadonlyMap<string, string> | undefined
  lowerStaticSupports?: boolean | undefined
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
  if (!mayHaveModernColorFunction(value)) {
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
    let normalized: string | undefined
    if (
      MODERN_COLOR_FUNCTION_NAMES.has(name)
      || (name === 'color' && isDisplayP3ColorFunction(valueParser.stringify(node)))
      || isModernColorSyntaxNode(node)
    ) {
      normalized = normalizeStandaloneColorFunction(valueParser.stringify(node))
    }
    else if (name === COLOR_MIX_NAME) {
      normalized = tryResolveColorMix(node, customPropertyValues)?.value
    }

    if (!normalized) {
      // 未证明等价的 mix 保留完整语法，不能只改写其内部颜色。
      return name === COLOR_MIX_NAME ? false : undefined
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
    // 转换器可能保留动态 alpha 子树，必须按实际输出重新验证。
    hasUnsupported: changed ? hasUnsupportedModernColorFunction(nextValue) : hasUnsupportedModernColorNodes(parsed),
  }
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

  const root = postcss.parse(css)
  const customPropertyValues = new Map(options.customPropertyValues)
  let changed = false

  root.walkDecls((decl) => {
    const property = getCssCustomPropertyName(decl.prop)
    if (property) {
      customPropertyValues.delete(property)
    }
  })
  root.walkAtRules((rule) => {
    const prelude = getCssAtRulePrelude(rule)
    const property = prelude.name.toLowerCase() === 'property' && getCssCustomPropertyName(prelude.params)
    if (property) {
      customPropertyValues.delete(property)
    }
  })
  for (const [property, value] of collectCustomPropertyValues(root).values) {
    customPropertyValues.set(property, value)
  }

  if (options.lowerStaticSupports) {
    changed = lowerStaticColorMixSupports(root, customPropertyValues)
  }

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
      if (!resolved) {
        // 保留完整表达式，后续依赖收集仍须能看见变量引用。
        return false
      }
      const mutableNode = node as unknown as Node & { nodes?: Node[] }
      mutableNode.type = 'word'
      mutableNode.value = resolved.value
      delete mutableNode.nodes
      mutated = true
    })

    if (mutated) {
      decl.value = parsed.toString()
      changed = true
    }
  })

  return {
    css: changed ? root.toString() : css,
    restore: value => value,
  }
}
