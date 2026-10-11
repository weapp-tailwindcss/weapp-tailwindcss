import type { Node, Selector } from 'postcss-selector-parser'
import selectorParser from 'postcss-selector-parser'
import { postcss } from '../postcss-runtime'
import { removeEmptyAtRules } from './coverage'
import { collectCssRuleDeclarationRecords, collectCssRuleDeclarations, getCssRuleStructuralKeyWithSelectorKey, MINI_PROGRAM_PREFLIGHT_SELECTOR_KEY, MINI_PROGRAM_PREFLIGHT_SELECTOR_KEYS, MINI_PROGRAM_THEME_SCOPE_SELECTOR_KEY, MINI_PROGRAM_THEME_SCOPE_SELECTOR_KEYS, normalizeCssDeclarationKey } from './structure'

function normalizeSimpleMiniProgramSelectorNode(node: Node) {
  if (node.type === 'tag') {
    const value = node.value.toLowerCase()
    if (value === 'view' || value === 'text' || value === 'page' || value === 'wx-root-portal-content') {
      return value
    }
    return undefined
  }
  if (node.type === 'class') {
    const value = node.value.toLowerCase()
    return value === 'tw-root' ? '.tw-root' : undefined
  }
  if (node.type === 'pseudo') {
    if (node.nodes && node.nodes.length > 0) {
      return undefined
    }
    const value = node.value.toLowerCase()
    if (value === ':before' || value === '::before') {
      return '::before'
    }
    if (value === ':after' || value === '::after') {
      return '::after'
    }
    if (value === ':host') {
      return ':host'
    }
  }
  return undefined
}

function normalizeSimpleMiniProgramSelector(selector: Selector) {
  if (selector.nodes.length !== 1) {
    return undefined
  }
  return normalizeSimpleMiniProgramSelectorNode(selector.nodes[0])
}

function collectMiniProgramSelectorSet(selector: string) {
  // preflight 和 theme 都要求多个独立选择器；单一选择器无需建立 selector AST。
  if (!selector.includes(',')) {
    return undefined
  }
  try {
    const selectorSet = new Set<string>()
    const ast = selectorParser().astSync(selector)
    for (const child of ast.nodes) {
      const key = normalizeSimpleMiniProgramSelector(child)
      if (!key || selectorSet.has(key)) {
        return undefined
      }
      selectorSet.add(key)
    }
    return selectorSet
  }
  catch {
    return undefined
  }
}

function isSameSelectorSet(actual: Set<string> | undefined, expected: Set<string>) {
  return actual?.size === expected.size
    && [...expected].every(key => actual.has(key))
}

function getMiniProgramPreflightRuleStructuralKey(rule: postcss.Rule) {
  if (!isSameSelectorSet(collectMiniProgramSelectorSet(rule.selector), MINI_PROGRAM_PREFLIGHT_SELECTOR_KEYS)) {
    return undefined
  }
  return getCssRuleStructuralKeyWithSelectorKey(rule, MINI_PROGRAM_PREFLIGHT_SELECTOR_KEY)
}

function getMiniProgramThemeScopeRuleStructuralKey(rule: postcss.Rule) {
  if (!isSameSelectorSet(collectMiniProgramSelectorSet(rule.selector), MINI_PROGRAM_THEME_SCOPE_SELECTOR_KEYS)) {
    return undefined
  }
  return getCssRuleStructuralKeyWithSelectorKey(rule, MINI_PROGRAM_THEME_SCOPE_SELECTOR_KEY)
}

export function mergeMiniProgramPreflightRuleDeclarations(baseCss: string, css: string) {
  try {
    const baseRoot = postcss.parse(baseCss)
    const root = postcss.parse(css)
    const baseRuleRecords = collectCssRuleDeclarationRecords(baseRoot, getMiniProgramPreflightRuleStructuralKey)
    let changedBase = false
    let changedCss = false

    root.walkRules((rule) => {
      const key = getMiniProgramPreflightRuleStructuralKey(rule)
      if (!key) {
        return
      }
      const records = baseRuleRecords.get(key)
      const targetRecord = records?.[0]
      if (!targetRecord) {
        return
      }
      const existingProps = new Set(records.flatMap(record => [...record.props]))
      for (const decl of collectCssRuleDeclarations(rule)) {
        const prop = decl.prop.trim()
        if (existingProps.has(prop)) {
          continue
        }
        targetRecord.rule.append(decl.clone())
        targetRecord.keys.add(normalizeCssDeclarationKey(decl))
        targetRecord.props.add(prop)
        existingProps.add(prop)
        changedBase = true
      }
      rule.remove()
      changedCss = true
    })

    if (!changedBase && !changedCss) {
      return { baseCss, css, changed: false }
    }
    removeEmptyAtRules(root)
    return {
      baseCss: changedBase ? baseRoot.toString() : baseCss,
      css: changedCss ? root.toString().trim() : css,
      changed: true,
    }
  }
  catch {
    return { baseCss, css, changed: false }
  }
}

export function mergeMiniProgramThemeScopeRuleDeclarations(baseCss: string, css: string) {
  try {
    const baseRoot = postcss.parse(baseCss)
    const root = postcss.parse(css)
    const baseRuleRecords = collectCssRuleDeclarationRecords(baseRoot, getMiniProgramThemeScopeRuleStructuralKey)
    let changedBase = false
    let changedCss = false

    root.walkRules((rule) => {
      const key = getMiniProgramThemeScopeRuleStructuralKey(rule)
      if (!key) {
        return
      }
      const records = baseRuleRecords.get(key)
      const targetRecord = records?.[0]
      if (!targetRecord) {
        return
      }
      const incomingDeclarations = collectCssRuleDeclarations(rule)
      if (incomingDeclarations.length === 0) {
        return
      }
      const existingKeys = new Set(records.flatMap(record => [...record.keys]))
      const existingProps = new Set(records.flatMap(record => [...record.props]))
      const hasConflictingOverride = incomingDeclarations.some((decl) => {
        const prop = decl.prop.trim()
        return existingProps.has(prop) && !existingKeys.has(normalizeCssDeclarationKey(decl))
      })
      if (hasConflictingOverride) {
        return
      }
      for (const decl of incomingDeclarations) {
        const declarationKey = normalizeCssDeclarationKey(decl)
        if (existingKeys.has(declarationKey)) {
          continue
        }
        targetRecord.rule.append(decl.clone())
        targetRecord.keys.add(declarationKey)
        targetRecord.props.add(decl.prop.trim())
        existingKeys.add(declarationKey)
        existingProps.add(decl.prop.trim())
        changedBase = true
      }
      rule.remove()
      changedCss = true
    })

    if (!changedBase && !changedCss) {
      return { baseCss, css, changed: false }
    }
    removeEmptyAtRules(root)
    return {
      baseCss: changedBase ? baseRoot.toString() : baseCss,
      css: changedCss ? root.toString().trim() : css,
      changed: true,
    }
  }
  catch {
    return { baseCss, css, changed: false }
  }
}
