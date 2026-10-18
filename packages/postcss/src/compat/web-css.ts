import type { Node } from 'postcss-value-parser'
import type { WebCssCompatFeatures, WebCssCompatOptions, WebCssCompatUserOptions } from '../types'
import postcss from 'postcss'
import postcssPresetEnv from 'postcss-preset-env'
import selectorParser from 'postcss-selector-parser'
import valueParser from 'postcss-value-parser'
import { internalCssSelectorReplacer } from '../shared'
import { normalizeModernColorValue } from './color-mix'
import { removeUnsupportedCascadeLayers } from './mini-program-css/at-rules'
import { normalizeTailwindcssV4GradientPosition, normalizeTailwindcssV4InfinityCalcValue } from './tailwindcss-v4'

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

const cssWideKeywords = new Set(['initial', 'inherit', 'unset', 'revert', 'revert-layer'])

interface CustomPropertyValues {
  values: Map<string, string>
}

function isRootScopeSelector(selector: string) {
  return postcss.list.comma(selector).every((part) => {
    const normalized = part.trim()
    return normalized === ':root' || normalized === ':host'
  })
}

/**
 * 收集可以安全在 use-site 静态化的作者变量。
 *
 * 只有顶层纯 `:root`/`:host` 规则中的单一值才具备全局稳定性。局部、条件、
 * 混合 selector、`!important` 以及重复冲突声明都必须保留原生变量级联，避免
 * 在颜色兼容阶段提前删除运行时主题覆盖。
 */
function collectCustomPropertyValues(root: postcss.Root): CustomPropertyValues {
  const candidates = new Map<string, string>()
  const dynamic = new Set<string>()

  root.walkDecls((decl) => {
    if (!decl.prop.startsWith('--') || decl.prop.startsWith('--tw-')) {
      return
    }

    const rule = decl.parent?.type === 'rule' ? decl.parent : undefined
    const value = decl.value.trim()
    const isStableDeclaration = !!rule
      && rule.parent === root
      && isRootScopeSelector(rule.selector)
      && !decl.important
      && !cssWideKeywords.has(value.toLowerCase())

    if (!isStableDeclaration) {
      dynamic.add(decl.prop)
      return
    }

    const previous = candidates.get(decl.prop)
    if (previous && previous !== value) {
      dynamic.add(decl.prop)
      return
    }
    candidates.set(decl.prop, value)
  })

  for (const property of dynamic) {
    candidates.delete(property)
  }

  // 别名只有在其完整依赖链也静态可解析时才可参与 use-site 替换。
  const values = new Map<string, string>()
  for (const property of candidates.keys()) {
    const value = resolveStaticCustomPropertyValue(property, candidates)
    if (value !== undefined) {
      values.set(property, value)
    }
  }

  return { values }
}

interface RegisteredCustomProperty {
  initialValue?: string | undefined
}

function collectRegisteredCustomPropertyFallbacks(root: postcss.Root) {
  const registeredProperties = new Map<string, RegisteredCustomProperty>()
  root.walkAtRules('property', (atRule) => {
    const propertyName = atRule.params.trim().split(/\s+/, 1)[0]
    if (propertyName?.startsWith('--')) {
      const existing = registeredProperties.get(propertyName) ?? {}
      atRule.walkDecls('initial-value', (decl) => {
        existing.initialValue = decl.value.trim()
      })
      registeredProperties.set(propertyName, existing)
    }
    atRule.remove()
  })
  return registeredProperties
}

const tailwindUnregisteredInitialFallbackCustomProperties = new Set([
  '--tw-gradient-position',
  '--tw-gradient-stops',
  '--tw-gradient-via-stops',
  '--tw-leading',
  '--tw-font-weight',
  '--tw-tracking',
])

function insertRegisteredCustomPropertyFallbackRule(
  root: postcss.Root,
  registeredProperties: ReadonlyMap<string, RegisteredCustomProperty>,
) {
  const declarations: postcss.Declaration[] = []
  for (const [prop, registration] of registeredProperties) {
    if (!registration.initialValue || registration.initialValue === 'initial') {
      continue
    }
    declarations.push(postcss.decl({
      prop,
      value: registration.initialValue,
    }))
  }

  if (declarations.length === 0) {
    return
  }

  root.prepend(postcss.rule({
    selector: '*, ::before, ::after, ::backdrop',
    nodes: declarations,
  }))
}

function removeInitialFallbackDeclarations(
  root: postcss.Root,
  registeredProperties: ReadonlyMap<string, RegisteredCustomProperty>,
) {
  root.walkDecls((decl) => {
    if (
      ((registeredProperties.has(decl.prop) && !registeredProperties.get(decl.prop)?.initialValue)
        || tailwindUnregisteredInitialFallbackCustomProperties.has(decl.prop))
      && decl.value.trim() === 'initial'
    ) {
      decl.remove()
    }
  })
}

function unwrapThemeAtRules(root: postcss.Root) {
  root.walkAtRules('theme', (atRule) => {
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

function getCustomPropertyReference(node: Node) {
  if (node.type !== 'function' || node.value.toLowerCase() !== 'var') {
    return undefined
  }
  return node.nodes.find(child => child.type === 'word' && child.value.startsWith('--'))?.value
}

function replaceValueParserNode(node: Node, value: string) {
  const mutableNode = node as Node & { nodes?: Node[] }
  mutableNode.type = 'word'
  mutableNode.value = value
  delete mutableNode.nodes
}

function resolveStaticCustomPropertyValue(
  property: string,
  customPropertyValues: ReadonlyMap<string, string>,
  resolving: ReadonlySet<string> = new Set(),
): string | undefined {
  const value = customPropertyValues.get(property)
  if (value === undefined || resolving.has(property)) {
    return undefined
  }

  const nextResolving = new Set(resolving)
  nextResolving.add(property)
  const parsed = valueParser(value)
  let unresolved = false
  parsed.walk((node) => {
    const referencedProperty = getCustomPropertyReference(node)
    if (!referencedProperty) {
      return
    }
    const referencedValue = resolveStaticCustomPropertyValue(referencedProperty, customPropertyValues, nextResolving)
    if (referencedValue === undefined) {
      unresolved = true
      return
    }
    replaceValueParserNode(node, referencedValue)
  })
  return unresolved ? undefined : parsed.toString()
}

function resolveCustomPropertyVarValue(
  value: string,
  customPropertyValues: ReadonlyMap<string, string>,
) {
  if (!value.includes('var(')) {
    return value
  }

  const parsed = valueParser(value)
  let changed = false
  parsed.walk((node) => {
    const property = getCustomPropertyReference(node)
    if (!property) {
      return
    }
    const customPropertyValue = customPropertyValues.get(property)
    if (customPropertyValue === undefined) {
      return
    }
    replaceValueParserNode(node, customPropertyValue)
    changed = true
  })
  return changed ? parsed.toString() : value
}

function usesResolvableTailwindColorVariable(
  value: string,
  customPropertyValues: ReadonlyMap<string, string>,
) {
  if (!value.includes('var(')) {
    return false
  }

  const parsed = valueParser(value)
  let usesColorVariable = false
  parsed.walk((node) => {
    if (node.type !== 'function' || node.value.toLowerCase() !== 'var') {
      return
    }
    const property = getCustomPropertyReference(node)
    if (property?.startsWith('--color-') && customPropertyValues.has(property)) {
      usesColorVariable = true
    }
  })
  return usesColorVariable
}

function normalizeModernColorDeclarations(root: postcss.Root, features: Required<WebCssCompatFeatures>) {
  if (!features.oklch && !features.colorFunctions) {
    return
  }
  const customPropertyValues = collectCustomPropertyValues(root).values
  root.walkDecls((decl) => {
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

function normalizeTailwindcssV4GradientPositionDeclarations(root: postcss.Root) {
  root.walkDecls('--tw-gradient-position', (decl) => {
    const normalized = normalizeTailwindcssV4GradientPosition(decl.value)
    if (normalized) {
      decl.value = normalized
      return
    }

    if (normalized === decl.value.trim()) {
      return
    }

    const parent = decl.parent
    if (parent?.type !== 'rule') {
      decl.value = 'to bottom'
      return
    }

    const backgroundImageDecl = parent.nodes.find((node): node is postcss.Declaration => {
      return node.type === 'decl' && node.prop === 'background-image'
    })
    if (/^radial-gradient\(/i.test(backgroundImageDecl?.value ?? '')) {
      decl.value = 'at center'
      return
    }
    if (/^conic-gradient\(/i.test(backgroundImageDecl?.value ?? '')) {
      decl.value = 'from 0deg'
      return
    }
    decl.value = 'to bottom'
  })
}

function normalizeTailwindcssV4InfinityCalcDeclarations(root: postcss.Root) {
  root.walkDecls((decl) => {
    const normalized = normalizeTailwindcssV4InfinityCalcValue(decl.value)
    if (normalized !== decl.value) {
      decl.value = normalized
    }
  })
}

function removeEmptyAtRules(root: postcss.Root) {
  root.walkAtRules((atRule) => {
    if (atRule.nodes && atRule.nodes.length === 0) {
      atRule.remove()
    }
  })
}

function insertWebkitBackgroundClipText(root: postcss.Root) {
  root.walkDecls('background-clip', (decl) => {
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
    if (normalized.features.theme) {
      unwrapThemeAtRules(root)
    }
    if (normalized.features.property) {
      const registeredProperties = collectRegisteredCustomPropertyFallbacks(root)
      insertRegisteredCustomPropertyFallbackRule(root, registeredProperties)
      removeInitialFallbackDeclarations(root, registeredProperties)
    }
    if (normalized.features.supports) {
      removeModernColorSupports(root)
    }
    if (normalized.features.nesting) {
      transformCssNesting(root)
    }
    normalizeTailwindcssV4GradientPositionDeclarations(root)
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
