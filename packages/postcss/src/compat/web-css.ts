import type { WebCssCompatFeatures, WebCssCompatOptions, WebCssCompatUserOptions } from '../types'
import postcss from 'postcss'
import postcssPresetEnv from 'postcss-preset-env'
import selectorParser from 'postcss-selector-parser'
import { internalCssSelectorReplacer } from '../shared'
import { getCssCalcVariableReferences, isCssPropertyRegistration } from '../utils/css-custom-property'
import { normalizeModernColorValue } from './color-mix'
import { removeUnsupportedCascadeLayers } from './mini-program-css/at-rules'
import { normalizeTailwindcssV4InfinityCalcValue } from './tailwindcss-v4'
import { collectCustomPropertyValues, resolveCustomPropertyVarValue, usesResolvableTailwindColorVariable } from './web-css-custom-properties'
import { normalizeWebGradientPositions } from './web-css-gradients'
import { collectRegisteredCustomPropertyFallbacks, insertRegisteredCustomPropertyFallbackRule } from './web-css-registrations'

export interface NormalizedWebCssCompatOptions {
  preset: 'off' | 'legacy-web'
  features: Required<WebCssCompatFeatures>
}

const disabledFeatures: Required<WebCssCompatFeatures> = {
  theme: false,
  layer: false,
  property: false,
  nesting: false,
  oklch: false,
  colorFunctions: false,
  supports: false,
}

const legacyWebFeatures: Required<WebCssCompatFeatures> = {
  theme: true,
  layer: true,
  property: true,
  nesting: true,
  oklch: true,
  colorFunctions: true,
  supports: true,
}

function normalizeWebCssCompatOptionsObject(options: WebCssCompatOptions): NormalizedWebCssCompatOptions {
  const preset = options.preset ?? 'legacy-web'
  const presetFeatures = preset === 'legacy-web' ? legacyWebFeatures : disabledFeatures
  return {
    preset,
    features: {
      ...presetFeatures,
      ...options.features,
    },
  }
}

export function normalizeWebCssCompatOptions(options: WebCssCompatUserOptions | undefined): NormalizedWebCssCompatOptions {
  if (options === true) {
    return normalizeWebCssCompatOptionsObject({ preset: 'legacy-web' })
  }
  if (!options) {
    return {
      preset: 'off',
      features: disabledFeatures,
    }
  }
  return normalizeWebCssCompatOptionsObject(options)
}

function isWebCssCompatEnabled(options: NormalizedWebCssCompatOptions) {
  return Object.values(options.features).some(Boolean)
}

function unwrapThemeAtRules(root: postcss.Root) {
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

function normalizeModernColorDeclarations(root: postcss.Root, features: Required<WebCssCompatFeatures>) {
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

function removeModernColorSupports(root: postcss.Root) {
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

function normalizeTailwindcssV4InfinityCalcDeclarations(root: postcss.Root) {
  root.walkDecls((decl) => {
    if (isCssPropertyRegistration(decl)) {
      return
    }
    const normalized = normalizeTailwindcssV4InfinityCalcValue(decl.value)
    if (normalized !== decl.value) {
      decl.value = normalized
    }
  })
}

function removeEmptyAtRules(root: postcss.Root) {
  root.walkAtRules((atRule) => {
    if (!isCssPropertyRegistration(atRule) && atRule.nodes && atRule.nodes.length === 0) {
      atRule.remove()
    }
  })
}

function insertWebkitBackgroundClipText(root: postcss.Root) {
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

function transformCssNesting(root: postcss.Root) {
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

export function transformWebCssCompat(
  css: string,
  options: WebCssCompatUserOptions | undefined,
) {
  const normalized = normalizeWebCssCompatOptions(options)
  if (!isWebCssCompatEnabled(normalized) && normalized.preset !== 'legacy-web') {
    return css
  }

  try {
    const root = postcss.parse(css)
    const registeredProperties = collectRegisteredCustomPropertyFallbacks(root)
    if (normalized.features.theme) {
      unwrapThemeAtRules(root)
    }
    if (normalized.features.property) {
      insertRegisteredCustomPropertyFallbackRule(root, registeredProperties, !normalized.features.layer)
    }
    if (normalized.features.supports) {
      removeModernColorSupports(root)
    }
    if (normalized.features.nesting) {
      transformCssNesting(root)
    }
    normalizeWebGradientPositions(root, registeredProperties)
    normalizeTailwindcssV4InfinityCalcDeclarations(root)
    normalizeModernColorDeclarations(root, normalized.features)
    if (normalized.preset === 'legacy-web') {
      insertWebkitBackgroundClipText(root)
    }
    if (normalized.features.layer) {
      removeUnsupportedCascadeLayers(root)
    }
    removeEmptyAtRules(root)
    return root.toString()
  }
  catch {
    return css
  }
}

export function transformWebCssSafeSelectors(
  css: string,
  options?: { escapeMap?: Record<string, string> | undefined } | undefined,
) {
  try {
    const root = postcss.parse(css)
    root.walkRules((rule) => {
      if (!rule.selector.includes('.')) {
        return
      }
      rule.selector = selectorParser((selectors) => {
        selectors.walkClasses((node) => {
          node.value = internalCssSelectorReplacer(node.value, options)
        })
      }).processSync(rule.selector)
    })
    return root.toString()
  }
  catch {
    return css
  }
}
