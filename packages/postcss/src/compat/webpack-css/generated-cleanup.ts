import postcss from 'postcss'
import { removeTailwindV4GeneratedUserCssArtifacts } from '../tailwindcss-v4/user-css/generated-cleanup'

const WEBPACK_TAILWIND_GENERATED_LAYER_NAMES = new Set(['theme', 'base', 'utilities'])

export function stripTrailingLineWhitespace(source: string) {
  return source.replace(/[ \t]+$/gm, '')
}
const WEBPACK_TAILWIND_UTILITY_RULE_MARKER_RE = /(?:^|[^\w-])\.[^,{]{0,512}(?:\\:|\\\[|\\#)/
const WEBPACK_TAILWIND_UTILITY_PREFIX_RE = /^\.(?:-?(?:bg|text|border|ring|shadow|drop-shadow|[pmwhz]|px|py|pt|pr|pb|pl|mx|my|mt|mr|mb|ml|min-w|min-h|max-w|max-h|flex|grid|inline|block|hidden|rounded|opacity|translate|scale|rotate|skew|top|right|bottom|left|inset|gap|font|leading|tracking|underline|container)(?:[\-\\{]|$)|\\\[)/
const WEBPACK_TAILWIND_BANNER_RE = /tailwindcss v4\./
const WEBPACK_TAILWIND_PREFLIGHT_SELECTORS = new Set(['*', ':after', ':before', '::after', '::before', '::backdrop', 'view', 'text'])
const WEBPACK_TAILWIND_PREFLIGHT_PROPS = new Set(['box-sizing', 'border', 'border-width', 'border-style', 'border-color', 'margin', 'padding'])
const WEBPACK_TAILWIND_THEME_TOKEN_RE = /^--(?:tw-|color-|spacing|breakpoint-|container-|text-|font-|tracking-|leading-|radius-|shadow-|inset-shadow-|drop-shadow-|ease-|animate-|blur-|perspective-|aspect-|default-)/

export function parseWebpackCssLayerNames(params: string) {
  return params
    .split(',')
    .map(name => name.trim())
    .filter(Boolean)
}

export function removeWebpackTailwindGeneratedAssetCss(source: string) {
  const cleaned = removeTailwindV4GeneratedUserCssArtifacts(source)
  try {
    const root = postcss.parse(cleaned)
    let changed = false
    let removingBannerPrefix = false
    for (const node of [...root.nodes]) {
      if (node.type === 'comment' && WEBPACK_TAILWIND_BANNER_RE.test(node.text)) {
        node.remove()
        changed = true
        removingBannerPrefix = true
        continue
      }
      if (!removingBannerPrefix) {
        continue
      }
      if (isWebpackTailwindGeneratedPrefixNode(node)) {
        node.remove()
        changed = true
        continue
      }
      removingBannerPrefix = false
    }
    root.walkAtRules('layer', (rule) => {
      const names = parseWebpackCssLayerNames(rule.params)
      const hasGeneratedLayerName = names.some(name => WEBPACK_TAILWIND_GENERATED_LAYER_NAMES.has(name))
      const isLayerDeclaration = rule.nodes === undefined
      const shouldRemoveLayer = isLayerDeclaration
        ? hasGeneratedLayerName
        : names.length > 0 && names.every(name => WEBPACK_TAILWIND_GENERATED_LAYER_NAMES.has(name))
      if (shouldRemoveLayer && isLayerDeclaration) {
        rule.remove()
        changed = true
        return
      }
      if (shouldRemoveLayer) {
        for (const child of [...rule.nodes ?? []]) {
          if (isWebpackTailwindGeneratedLayerNode(child, names)) {
            child.remove()
            changed = true
          }
        }
        if (rule.nodes?.length === 0) {
          rule.remove()
          changed = true
        }
      }
    })
    root.walkRules((rule) => {
      if (rule.parent?.type === 'atrule' && rule.parent.name === 'layer') {
        return
      }
      const selector = rule.selector.trim()
      if (
        WEBPACK_TAILWIND_UTILITY_RULE_MARKER_RE.test(selector)
        || isWebpackTailwindGeneratedPreflightRule(rule)
      ) {
        rule.remove()
        changed = true
      }
    })
    root.walkComments((comment) => {
      if (WEBPACK_TAILWIND_BANNER_RE.test(comment.text)) {
        comment.remove()
        changed = true
      }
    })
    root.walkAtRules((rule) => {
      if (rule.nodes !== undefined && rule.nodes.length === 0) {
        rule.remove()
        changed = true
      }
    })
    return changed ? root.toString() : cleaned
  }
  catch {
    return cleaned
  }
}

function isWebpackTailwindGeneratedPrefixNode(node: postcss.ChildNode): boolean {
  if (node.type === 'rule') {
    return isWebpackTailwindGeneratedRule(node, ['theme', 'base', 'utilities'], true)
  }
  if (node.type !== 'atrule') {
    return false
  }
  const names = node.name === 'layer'
    ? parseWebpackCssLayerNames(node.params)
    : []
  if (
    node.name === 'property'
    && node.params.trim().startsWith('--tw-')
  ) {
    return true
  }
  if (
    names.length > 0
    && names.every(name => WEBPACK_TAILWIND_GENERATED_LAYER_NAMES.has(name))
  ) {
    if (node.nodes === undefined) {
      return true
    }
    return node.nodes.length > 0 && node.nodes.every(child => isWebpackTailwindGeneratedLayerNode(child, names))
  }
  if (node.nodes === undefined || node.nodes.length === 0) {
    return false
  }
  return node.nodes.every(child => isWebpackTailwindGeneratedPrefixNode(child))
}

function isWebpackTailwindGeneratedLayerNode(node: postcss.ChildNode, layerNames: string[]): boolean {
  if (node.type === 'rule') {
    return isWebpackTailwindGeneratedRule(node, layerNames, false)
  }
  if (node.type !== 'atrule') {
    return false
  }
  if (node.name === 'property' && node.params.trim().startsWith('--tw-')) {
    return true
  }
  if (node.nodes === undefined || node.nodes.length === 0) {
    return false
  }
  return node.nodes.every(child => isWebpackTailwindGeneratedLayerNode(child, layerNames))
}

function isWebpackTailwindGeneratedRule(rule: postcss.Rule, layerNames: string[], includePrefix: boolean): boolean {
  const selectors = rule.selectors ?? [rule.selector]
  if (selectors.every(selector => isWebpackTailwindGeneratedUtilitySelector(selector.trim(), includePrefix))) {
    return true
  }
  if (selectors.every(selector => isWebpackTailwindGeneratedUtilitySelector(selector.trim(), true))) {
    return true
  }
  if (layerNames.includes('theme') && isWebpackTailwindGeneratedThemeRule(rule)) {
    return true
  }
  if (layerNames.includes('base') && isWebpackTailwindGeneratedPreflightRule(rule)) {
    return true
  }
  return false
}

function isWebpackTailwindGeneratedThemeRule(rule: postcss.Rule): boolean {
  const declarations = (rule.nodes ?? []).filter((node): node is postcss.Declaration => node.type === 'decl')
  return declarations.length > 0
    && declarations.every(decl =>
      WEBPACK_TAILWIND_THEME_TOKEN_RE.test(decl.prop)
      || decl.value.includes('--theme('),
    )
}

function isWebpackTailwindGeneratedPreflightRule(rule: postcss.Rule): boolean {
  const selectors = rule.selectors ?? [rule.selector]
  const declarations = (rule.nodes ?? []).filter((node): node is postcss.Declaration => node.type === 'decl')
  return selectors.length > 0
    && declarations.length > 0
    && selectors.every((selector) => {
      const normalized = selector.trim().replace(/\s+/g, ' ')
      return WEBPACK_TAILWIND_PREFLIGHT_SELECTORS.has(normalized)
    })
    && declarations.every(decl => WEBPACK_TAILWIND_PREFLIGHT_PROPS.has(decl.prop))
}

export function isOnlyWebpackTailwindGeneratedPreflightCss(source: string): boolean {
  try {
    const root = postcss.parse(source)
    const nodes = root.nodes ?? []
    return nodes.length > 0
      && nodes.every((node) => {
        if (node.type === 'rule') {
          return isWebpackTailwindGeneratedPreflightRule(node)
        }
        return node.type === 'atrule' && (node.nodes === undefined || node.nodes.length === 0)
      })
  }
  catch {
    return false
  }
}

function isWebpackTailwindGeneratedUtilitySelector(selector: string, includePrefix: boolean): boolean {
  return WEBPACK_TAILWIND_UTILITY_RULE_MARKER_RE.test(selector)
    || (includePrefix && WEBPACK_TAILWIND_UTILITY_PREFIX_RE.test(selector))
}
