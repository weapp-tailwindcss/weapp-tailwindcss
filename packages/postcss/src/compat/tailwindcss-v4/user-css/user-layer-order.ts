import { postcss } from '../../../postcss-runtime'

const USER_LAYER_COMPONENTS_START = '/*! weapp-tailwindcss layer components start */'
const USER_LAYER_COMPONENTS_END = '/*! weapp-tailwindcss layer components end */'
function appendCss(base: string, extra: string) {
  if (!base) {
    return extra
  }
  if (!extra) {
    return base
  }
  if (/\s$/.test(base) || /^\s/.test(extra)) {
    return `${base}${extra}`
  }
  return `${base}\n${extra}`
}

function removeFirstCssOccurrence(css: string, chunk: string) {
  const trimmed = chunk.trim()
  if (!trimmed) {
    return css
  }
  const index = css.indexOf(trimmed)
  if (index === -1) {
    return css
  }
  return appendCss(css.slice(0, index).trimEnd(), css.slice(index + trimmed.length).trimStart())
}

function collectSelectorsFromCss(css: string) {
  const selectors = new Set<string>()
  try {
    postcss.parse(css).walkRules((rule) => {
      for (const selector of rule.selectors ?? [rule.selector]) {
        const normalized = selector.trim()
        if (normalized) {
          selectors.add(normalized)
        }
      }
    })
  }
  catch {
  }
  return selectors
}

function normalizeRuleValue(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function createRuleKey(rule: postcss.Rule) {
  const parents: string[] = []
  let parent = rule.parent
  while (parent && parent.type !== 'root') {
    if (parent.type === 'atrule') {
      parents.push(`${parent.name}:${normalizeRuleValue(parent.params)}`)
    }
    parent = parent.parent
  }
  const selectors = (rule.selectors ?? [rule.selector])
    .map(selector => normalizeRuleValue(selector))
    .join(',')
  const declarations = (rule.nodes ?? [])
    .filter(node => node.type === 'decl')
    .map(node => `${node.prop}:${normalizeRuleValue(node.value)}:${node.important ? '1' : '0'}`)
    .join(';')
  return `${parents.reverse().join('|')}\n${selectors}\n${declarations}`
}

function collectRuleKeysFromCss(css: string) {
  const keys = new Set<string>()
  try {
    postcss.parse(css).walkRules((rule) => {
      keys.add(createRuleKey(rule))
    })
  }
  catch {
  }
  return keys
}

function matchesLayerSelector(selector: string, layerSelector: string) {
  if (selector === layerSelector) {
    return true
  }
  if (!selector.startsWith(layerSelector)) {
    return false
  }
  const next = selector[layerSelector.length]
  return next === ':' || next === '['
}

function removeCssRulesForSelectors(css: string, layerCss: string) {
  const selectors = [...collectSelectorsFromCss(layerCss)]
  if (selectors.length === 0) {
    return css
  }
  try {
    const root = postcss.parse(css)
    root.walkRules((rule) => {
      const ruleSelectors = rule.selectors ?? [rule.selector]
      if (ruleSelectors.some(selector => selectors.some(layerSelector => matchesLayerSelector(selector.trim(), layerSelector)))) {
        rule.remove()
      }
    })
    return root.toString()
  }
  catch {
    return removeFirstCssOccurrence(css, layerCss)
  }
}

function removeExactCssRules(css: string, duplicateCss: string) {
  const duplicateKeys = collectRuleKeysFromCss(duplicateCss)
  if (duplicateKeys.size === 0) {
    return css
  }
  try {
    const root = postcss.parse(css)
    root.walkRules((rule) => {
      if (duplicateKeys.has(createRuleKey(rule))) {
        rule.remove()
      }
    })
    return root.toString()
  }
  catch {
    return css
  }
}

export function wrapUserLayerComponentsCss(css: string) {
  return css.trim().length > 0
    ? `${USER_LAYER_COMPONENTS_START}\n${css}\n${USER_LAYER_COMPONENTS_END}`
    : css
}

export function extractMarkedUserLayerComponentsCss(css: string) {
  const layers: string[] = []
  let rest = ''
  let cursor = 0

  while (cursor < css.length) {
    const startIndex = css.indexOf(USER_LAYER_COMPONENTS_START, cursor)
    if (startIndex === -1) {
      rest += css.slice(cursor)
      break
    }

    rest += css.slice(cursor, startIndex)
    const contentStart = startIndex + USER_LAYER_COMPONENTS_START.length
    const endIndex = css.indexOf(USER_LAYER_COMPONENTS_END, contentStart)
    if (endIndex === -1) {
      rest += css.slice(startIndex)
      break
    }

    const layerCss = css.slice(contentStart, endIndex).trim()
    if (layerCss) {
      layers.push(layerCss)
    }
    cursor = endIndex + USER_LAYER_COMPONENTS_END.length
  }

  return {
    layers,
    rest,
  }
}

function isGeneratedInfrastructureRule(rule: postcss.Rule) {
  const declarations = (rule.nodes ?? []).filter(node => node.type === 'decl')
  if (declarations.length === 0) {
    return false
  }
  if (declarations.every(declaration => declaration.prop.startsWith('--'))) {
    return true
  }
  const selectors = (rule.selectors ?? [rule.selector]).map(selector => selector.trim())
  const isMiniProgramPreflightSelector = selectors.length > 0 && selectors.every(selector =>
    selector === 'view'
    || selector === 'text'
    || selector === '::before'
    || selector === '::after',
  )
  if (!isMiniProgramPreflightSelector) {
    return false
  }
  const declarationMap = new Map(declarations.map(declaration => [declaration.prop, declaration.value]))
  return declarationMap.get('box-sizing') === 'border-box'
    && declarationMap.has('border')
}

// 用户 layer 应位于生成的 theme/preflight 之后、其他分层或未分层规则之前。
function findLayerInsertionIndex(css: string) {
  try {
    const root = postcss.parse(css)
    let insertionIndex = -1
    root.walkRules((rule) => {
      if (insertionIndex !== -1 || isGeneratedInfrastructureRule(rule)) {
        return
      }
      let topLevelNode: postcss.ChildNode = rule
      while (topLevelNode.parent && topLevelNode.parent.type !== 'root') {
        topLevelNode = topLevelNode.parent as postcss.ChildNode
      }
      const offset = topLevelNode.source?.start?.offset
      if (typeof offset === 'number') {
        insertionIndex = css.lastIndexOf('\n', Math.max(0, offset - 1)) + 1
      }
    })
    return insertionIndex
  }
  catch {
    return -1
  }
}

export function reorderMarkedUserLayerComponentsCss(css: string) {
  if (!css.includes(USER_LAYER_COMPONENTS_START)) {
    return css
  }

  const { layers, rest } = extractMarkedUserLayerComponentsCss(css)
  if (layers.length === 0) {
    return rest
  }

  const layerCss = layers.join('\n')
  const restWithoutLayerDuplicates = removeExactCssRules(rest, layerCss)
  const insertionIndex = findLayerInsertionIndex(restWithoutLayerDuplicates)
  if (insertionIndex === -1) {
    return appendCss(restWithoutLayerDuplicates, layerCss)
  }

  return appendCss(
    appendCss(restWithoutLayerDuplicates.slice(0, insertionIndex), layerCss),
    restWithoutLayerDuplicates.slice(insertionIndex),
  )
}

export function mergeMarkedUserLayerComponentsCss(baseCss: string, markedCss: string) {
  if (!markedCss.includes(USER_LAYER_COMPONENTS_START)) {
    return {
      css: baseCss,
      merged: false,
    }
  }

  const { layers } = extractMarkedUserLayerComponentsCss(markedCss)
  if (layers.length === 0) {
    return {
      css: baseCss,
      merged: false,
    }
  }

  const layerCss = layers.join('\n')
  const baseWithoutLayers = removeCssRulesForSelectors(baseCss, layerCss)
  return {
    css: reorderMarkedUserLayerComponentsCss(appendCss(baseWithoutLayers, wrapUserLayerComponentsCss(layerCss))),
    merged: true,
  }
}
