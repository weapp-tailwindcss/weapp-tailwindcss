import type { Rule } from 'postcss'
import type { IStyleHandlerOptions } from '../../types'
import { assignRuleSelectors } from '../../utils/selector-guard'

const FALLBACK_PLACEHOLDER_SUFFIXES = [':not(#n)', ':not(#\\#)']
const ROOT_SPECIFICITY_MATCHING_NAMES = ['does-not-exist']

// normalizeSelectorList 将 root/universal 替换配置规范化为数组
function normalizeSelectorList(value?: string | string[] | false) {
  if (value === undefined || value === false) {
    return []
  }
  return Array.isArray(value) ? value.filter(Boolean) : [value]
}

// 读取 preset-env 设置的 specificityMatchingName，供后续清理使用
function getSpecificityMatchingName(options: IStyleHandlerOptions) {
  const feature = options.cssPresetEnv?.features?.['is-pseudo-class']
  if (feature && typeof feature === 'object' && 'specificityMatchingName' in feature) {
    const specificityName = (feature as { specificityMatchingName?: string }).specificityMatchingName
    return typeof specificityName === 'string' && specificityName.length > 0 ? specificityName : undefined
  }
  return undefined
}

function replaceFallbackPlaceholder(selector: string) {
  let output = selector
  for (const suffix of FALLBACK_PLACEHOLDER_SUFFIXES) {
    if (output.includes(suffix)) {
      output = output.split(suffix).join('')
    }
  }
  return output
}

export function createFallbackPlaceholderReplacer() {
  return (code: string) => {
    let output = code
    for (const suffix of FALLBACK_PLACEHOLDER_SUFFIXES) {
      if (output.includes(suffix)) {
        output = output.split(suffix).join('')
      }
    }
    return output
  }
}

export function createFallbackPlaceholderCleaner() {
  return (rule: Rule) => {
    if (!FALLBACK_PLACEHOLDER_SUFFIXES.some(suffix => rule.selector?.includes(suffix))) {
      return
    }
    const selectors = rule.selectors
    let changed = false
    const next = selectors.map((selector) => {
      const updated = replaceFallbackPlaceholder(selector)
      if (updated !== selector) {
        changed = true
      }
      return updated
    })

    changed && assignRuleSelectors(rule, next, {
      phase: 'post',
      reason: 'clean-fallback-placeholder',
    })
  }
}

// createRootSpecificityCleaner 用于删除 root 选择器上多余的 :not() 包裹
export function createRootSpecificityCleaner(options: IStyleHandlerOptions) {
  const specificityMatchingName = getSpecificityMatchingName(options)
  const selectors = normalizeSelectorList(options.cssSelectorReplacement?.root)

  if (selectors.length === 0) {
    return undefined
  }

  const specificityNames = new Set([
    ...ROOT_SPECIFICITY_MATCHING_NAMES,
    ...(specificityMatchingName ? [specificityMatchingName] : []),
  ])
  const targets = selectors
    .map(selector => selector?.trim())
    .filter((selector): selector is string => Boolean(selector?.length))
    .flatMap(selector => [...specificityNames].map(name => ({
      match: `${selector}:not(.${name})`,
      spacedMatch: `${selector} :not(.${name})`,
      replacement: selector,
    })))

  if (!targets.length) {
    return undefined
  }

  return (rule: Rule) => {
    if (!rule.selector?.includes(':not(')) {
      return
    }
    const selectors = rule.selectors
    let changed = false
    const next = selectors.map((selector) => {
      let updated = selector
      for (const target of targets) {
        if (updated.includes(target.match)) {
          updated = updated.split(target.match).join(target.replacement)
        }
        if (updated.includes(target.spacedMatch)) {
          updated = updated.split(target.spacedMatch).join(target.replacement)
        }
      }
      if (updated !== selector) {
        changed = true
      }
      return updated
    })

    changed && assignRuleSelectors(rule, next, {
      phase: 'post',
      reason: 'clean-root-specificity',
    })
  }
}
