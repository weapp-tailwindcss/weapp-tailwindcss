import { postcss } from '../postcss-runtime'
import { collectCssRuleDeclarationKeys, collectCssRuleDeclarationRecords, collectCssRuleDeclarations, getCssRuleStructuralKey, isCoveredByBaseVarFallbackDeclaration, isEquivalentVarFallbackDeclaration, normalizeCssDeclarationKey, normalizeCssForContainment, parseVarReferenceValue } from './structure'

export function isCssRuleCoveredByDeclarations(
  rule: postcss.Rule,
  baseRuleDeclarationKeys: Map<string, Set<string>>,
) {
  const key = getCssRuleStructuralKey(rule)
  if (!key) {
    return false
  }
  const baseDeclarations = baseRuleDeclarationKeys.get(key)
  if (!baseDeclarations) {
    return false
  }
  const declarations = collectCssRuleDeclarationKeys(rule)
  return declarations.size > 0
    && collectCssRuleDeclarations(rule).every(decl =>
      baseDeclarations.has(normalizeCssDeclarationKey(decl))
      || isEquivalentVarFallbackDeclaration(decl, baseDeclarations)
      || isCoveredByBaseVarFallbackDeclaration(decl, baseDeclarations),
    )
}

function removeDuplicateLeadingComment(rule: postcss.Rule, targetRule: postcss.Rule) {
  const comment = rule.prev()
  const targetComment = targetRule.prev()
  if (
    comment?.type === 'comment'
    && targetComment?.type === 'comment'
    && normalizeCssForContainment(comment.text) === normalizeCssForContainment(targetComment.text)
  ) {
    comment.remove()
  }
}

export function dedupeCoveredCssRules(css: string) {
  try {
    const root = postcss.parse(css)
    const recordsByParent = new WeakMap<postcss.Container, Map<string, postcss.Rule>>()
    let changed = false

    root.walkRules((rule) => {
      const key = getCssRuleStructuralKey(rule)
      const incomingDeclarations = collectCssRuleDeclarations(rule)
      if (!key || incomingDeclarations.length === 0 || !rule.parent) {
        return
      }
      let records = recordsByParent.get(rule.parent)
      if (!records) {
        records = new Map()
        recordsByParent.set(rule.parent, records)
      }
      const targetRule = records.get(key)
      if (targetRule) {
        const incomingKeys = collectCssRuleDeclarationKeys(rule)
        const targetCovered = collectCssRuleDeclarations(targetRule).every(decl =>
          incomingKeys.has(normalizeCssDeclarationKey(decl))
          || isEquivalentVarFallbackDeclaration(decl, incomingKeys)
          || isCoveredByBaseVarFallbackDeclaration(decl, incomingKeys),
        )
        if (targetCovered) {
          removeDuplicateLeadingComment(targetRule, rule)
          targetRule.remove()
          changed = true
        }
      }
      records.set(key, rule)
    })

    return changed ? root.toString() : css
  }
  catch {
    return css
  }
}

export function mergeCoveredCssRuleDeclarations(baseCss: string, css: string) {
  try {
    const baseRoot = postcss.parse(baseCss)
    const root = postcss.parse(css)
    const baseRuleRecords = collectCssRuleDeclarationRecords(baseRoot)
    let changedBase = false
    let changedCss = false

    root.walkRules((rule) => {
      const key = getCssRuleStructuralKey(rule)
      const records = key ? baseRuleRecords.get(key) : undefined
      if (!records || records.length === 0) {
        return
      }
      const incomingDeclarations = collectCssRuleDeclarations(rule)
      if (incomingDeclarations.length === 0) {
        return
      }
      const baseKeys = new Set(records.flatMap(record => [...record.keys]))
      const coveredDeclarations = incomingDeclarations.filter(decl => baseKeys.has(normalizeCssDeclarationKey(decl)))
      if (coveredDeclarations.length === 0) {
        return
      }
      const missingDeclarations = incomingDeclarations.filter(decl => !baseKeys.has(normalizeCssDeclarationKey(decl)))
      if (missingDeclarations.length === 0) {
        rule.remove()
        changedCss = true
        return
      }

      const baseProps = new Set(records.flatMap(record => [...record.props]))
      const mergeableFallbacks = new Map<postcss.Declaration, postcss.Declaration>()
      const conflictingDeclarations = missingDeclarations.filter((decl) => {
        if (!baseProps.has(decl.prop.trim())) {
          return false
        }
        const matchingVariable = incomingDeclarations.find(candidate =>
          candidate.prop.startsWith('--')
          && candidate.important === decl.important
          && normalizeCssForContainment(candidate.value) === normalizeCssForContainment(decl.value),
        )
        if (!matchingVariable) {
          return true
        }
        const targetDeclaration = records
          .flatMap(record => collectCssRuleDeclarations(record.rule))
          .find(candidate =>
            candidate.prop.trim() === decl.prop.trim()
            && candidate.important === decl.important
            && parseVarReferenceValue(candidate.value) === matchingVariable.prop.trim(),
          )
        if (!targetDeclaration) {
          return true
        }
        mergeableFallbacks.set(decl, targetDeclaration)
        return false
      })
      if (conflictingDeclarations.length > 0) {
        return
      }

      const targetRecord = records[0]
      if (!targetRecord) {
        return
      }
      for (const decl of missingDeclarations) {
        const fallbackTarget = mergeableFallbacks.get(decl)
        if (fallbackTarget) {
          fallbackTarget.before(decl.clone())
        }
        else {
          targetRecord.rule.append(decl.clone())
        }
        targetRecord.keys.add(normalizeCssDeclarationKey(decl))
        targetRecord.props.add(decl.prop.trim())
      }
      rule.remove()
      changedBase = true
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

export function removeEmptyAtRules(root: postcss.Root) {
  const atRules: postcss.AtRule[] = []
  root.walkAtRules((atRule) => {
    atRules.push(atRule)
  })
  // walkAtRules 先访问父节点；反向清理才能在子节点移除后判断祖先是否为空。
  for (const atRule of atRules.reverse()) {
    if (atRule.nodes && atRule.nodes.every(node => node.type === 'comment')) {
      atRule.remove()
    }
  }
}
