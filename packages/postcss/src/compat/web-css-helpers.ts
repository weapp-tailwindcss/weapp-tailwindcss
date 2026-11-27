import type { CssCompatAction, WebCssCompatFeatures } from '../types'
import type { NormalizedWebCssCompatPolicy, unsupportedTargets } from './web-css-policy'
import postcssCalc from '@weapp-tailwindcss/postcss-calc'
import postcss from 'postcss'
import postcssPresetEnv from 'postcss-preset-env'
import valueParser from 'postcss-value-parser'
import { getCssCalcVariableReferences, isCssPropertyRegistration } from '../utils/css-custom-property'
import { normalizeModernColorValue } from './color-mix'
import { normalizeTailwindcssV4InfinityCalcValue } from './tailwindcss-v4'
import { collectCustomPropertyValues, resolveCustomPropertyVarValue, usesResolvableTailwindColorVariable } from './web-css-custom-properties'

const LEGACY_WEB_TYPED_DIVISION_RE = /calc\(\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*\/\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*\)/gi
const LEGACY_WEB_FALLBACK_SELECTOR_RE = /:not\(\s*#\\#\s*\)/gi

export function unwrapThemeAtRules(root: postcss.Root) {
  root.walkAtRules('theme', (atRule) => {
    if (isCssPropertyRegistration(atRule)) {
      return
    }
    if (atRule.nodes && atRule.nodes.length > 0) {
      const rootNodes: postcss.ChildNode[] = []
      const hoistedNodes: postcss.ChildNode[] = []
      for (const node of atRule.nodes) {
        if (node.type === 'decl' || node.type === 'comment') {
          rootNodes.push(node.clone())
        }
        else {
          hoistedNodes.push(node.clone())
        }
      }
      const replacements: postcss.ChildNode[] = [
        ...(rootNodes.length > 0
          ? [postcss.rule({
              selector: ':root',
              nodes: rootNodes,
            })]
          : []),
        ...hoistedNodes,
      ]
      atRule.replaceWith(...replacements)
    }
    else {
      atRule.remove()
    }
  })
}

export function normalizeModernColorDeclarations(root: postcss.Root, features: Required<WebCssCompatFeatures>) {
  if (!features.oklch && !features.colorFunctions) {
    return
  }
  const referencedProperties = new Set<string>()
  root.walkDecls((decl) => {
    for (const property of getCssCalcVariableReferences(decl.value).values()) {
      referencedProperties.add(property)
    }
  })
  let customPropertyValues: Map<string, string> = new Map()
  while (true) {
    const collected = collectCustomPropertyValues(root, referencedProperties)
    customPropertyValues = collected.values
    const previousSize = referencedProperties.size
    for (const dependency of collected.dependencies) {
      referencedProperties.add(dependency)
    }
    if (referencedProperties.size === previousSize) {
      break
    }
  }
  root.walkDecls((decl) => {
    if (isCssPropertyRegistration(decl)) {
      return
    }
    const value = resolveCustomPropertyVarValue(decl.value, customPropertyValues)
    const normalized = normalizeModernColorValue(value, customPropertyValues)
    if (!normalized.changed) {
      if (value !== decl.value && usesResolvableTailwindColorVariable(decl.value, customPropertyValues)) {
        decl.value = value
      }
      return
    }
    if (!features.colorFunctions && !/oklch|oklab/i.test(value)) {
      return
    }
    decl.value = normalized.value
  })
}

export function removeModernColorSupports(root: postcss.Root) {
  root.walkAtRules('supports', (atRule) => {
    let containsRegistration = isCssPropertyRegistration(atRule)
    atRule.walkAtRules((child) => {
      containsRegistration ||= isCssPropertyRegistration(child)
    })
    if (containsRegistration) {
      return
    }
    if (!/color-mix|oklch|oklab|lab|lch|display-p3/i.test(atRule.params)) {
      return
    }
    if (atRule.nodes && atRule.nodes.length > 0) {
      atRule.replaceWith(...atRule.nodes)
    }
    else {
      atRule.remove()
    }
  })
}

function normalizeLegacyWebTypedDivisionValue(value: string) {
  if (!value.includes('calc(') || !value.includes('/')) {
    return value
  }

  return value.replace(LEGACY_WEB_TYPED_DIVISION_RE, (match, numerator: string, denominator: string) => {
    const divisor = Number(denominator)
    if (divisor === 0) {
      return match
    }

    const quotient = Number(numerator) / divisor
    if (!Number.isFinite(quotient)) {
      return match
    }

    return Number(quotient.toPrecision(15)).toString()
  })
}

export function normalizeTailwindcssV4InfinityCalcDeclarations(root: postcss.Root, normalizeCalc: boolean, normalizeTypedDivision: boolean) {
  root.walkDecls((decl) => {
    if (normalizeCalc && !isCssPropertyRegistration(decl)) {
      const normalized = normalizeTailwindcssV4InfinityCalcValue(decl.value)
      if (normalized !== decl.value) {
        decl.value = normalized
      }
    }
    if (normalizeTypedDivision) {
      decl.value = normalizeLegacyWebTypedDivisionValue(decl.value)
    }
  })
}

export function nodeLocation(node: postcss.Node, file: string | undefined) {
  return {
    file,
    line: node.source?.start?.line,
    column: node.source?.start?.column,
  }
}

export function hasNestedRules(root: postcss.Root) {
  let found = false
  root.walkRules((rule) => {
    if (rule.nodes?.some(node => node.type === 'rule' || (node.type === 'atrule' && node.nodes))) {
      found = true
    }
  })
  return found
}

export function removeDeclarations(root: postcss.Root, predicate: (decl: postcss.Declaration) => boolean) {
  root.walkDecls((decl) => {
    if (predicate(decl)) {
      decl.remove()
    }
  })
}

export function removeAtRules(root: postcss.Root, name: string, predicate?: (atRule: postcss.AtRule) => boolean) {
  root.walkAtRules(name, (atRule) => {
    if (!predicate || predicate(atRule)) {
      atRule.remove()
    }
  })
}

export function actionFor(policy: NormalizedWebCssCompatPolicy, feature: Parameters<typeof unsupportedTargets>[0]) {
  return policy.actions[feature]
}

export function transformedFeatures(policy: NormalizedWebCssCompatPolicy): Required<WebCssCompatFeatures> {
  return {
    theme: actionFor(policy, 'theme') === 'lower',
    layer: actionFor(policy, 'layers') === 'lower',
    property: actionFor(policy, 'property') === 'lower',
    nesting: actionFor(policy, 'nesting') === 'lower',
    oklch: actionFor(policy, 'oklch') === 'lower',
    colorFunctions: actionFor(policy, 'colorFunctions') === 'lower',
    supports: actionFor(policy, 'supports') === 'lower',
  }
}

export function lowerLegacyWebFallbackSpecificity(root: postcss.Root, guard: NormalizedWebCssCompatPolicy['specificityGuard']) {
  root.walkRules((rule) => {
    if (!rule.selector.includes(':not(') || !rule.selector.includes('#\\#')) {
      return
    }

    rule.selector = rule.selector.replace(LEGACY_WEB_FALLBACK_SELECTOR_RE, (match, offset: number, selector: string) => {
      if (guard === 'legacy' || /:where\(\s*$/i.test(selector.slice(0, offset))) {
        return match
      }
      if (guard === 'none') {
        return ''
      }
      return `:where(${match})`
    })
  })
}

export function removeEmptyAtRules(root: postcss.Root) {
  root.walkAtRules((atRule) => {
    if (!isCssPropertyRegistration(atRule) && atRule.nodes && atRule.nodes.length === 0) {
      atRule.remove()
    }
  })
}

export function insertWebkitBackgroundClipText(root: postcss.Root) {
  root.walkDecls('background-clip', (decl) => {
    if (isCssPropertyRegistration(decl)) {
      return
    }
    if (decl.value.trim().toLowerCase() !== 'text') {
      return
    }
    const parent = decl.parent
    if (!parent || !('nodes' in parent)) {
      return
    }
    const hasWebkitFallback = parent.nodes.some((node) => {
      return node.type === 'decl'
        && node.prop.toLowerCase() === '-webkit-background-clip'
        && node.value.trim().toLowerCase() === 'text'
    })
    if (!hasWebkitFallback) {
      decl.cloneBefore({ prop: '-webkit-background-clip' })
    }
  })
}

export function transformCssNesting(root: postcss.Root) {
  postcss([
    postcssPresetEnv({
      stage: false,
      autoprefixer: false,
      features: {
        'nesting-rules': true,
      },
    }),
  ]).process(root, {
    from: undefined,
  }).sync()
}

export function containsCalcFunction(value: string) {
  let found = false
  valueParser(value).walk((node) => {
    if (node.type === 'function' && node.value.toLowerCase() === 'calc') {
      found = true
    }
  })
  return found
}

export function containsTypedDivision(value: string) {
  let found = false
  valueParser(value).walk((node) => {
    if (node.type === 'function' && node.value.toLowerCase() === 'calc'
      && node.nodes?.some(child => child.type === 'div' && child.value === '/')) {
      found = true
    }
  })
  return found
}

export function normalizeStaticCalcDeclarations(root: postcss.Root, typedDivisionAction: CssCompatAction, onlyTypedDivision = false) {
  postcss([postcssCalc({
    preserve: false,
    filterDeclaration: declaration => !isCssPropertyRegistration(declaration)
      && (!onlyTypedDivision || containsTypedDivision(declaration.value))
      && !/var\(/i.test(declaration.value)
      && !(typedDivisionAction !== 'lower' && containsTypedDivision(declaration.value)),
  })]).process(root, { from: undefined }).sync()
}
