import type { IStyleHandlerOptions } from '../../../types'
import { postcss } from '../../../postcss-runtime'
import { selectorContainsPseudoClass } from '../../../selectorParser/pseudo'
import { removeUnsupportedCascadeLayers, removeUnsupportedMiniProgramAtRules } from '../../mini-program-css'
import { removeTailwindSourceMediaBlocks, terminateTailwindSourceAtRulesBeforeNextDirective } from './at-rules'
import { removeTailwindV4GeneratorAtRulesFallback, TAILWIND_V4_GENERATOR_AT_RULES } from './generated-cleanup'

export function removeTailwindV4GeneratorAtRules(source: string) {
  try {
    const root = postcss.parse(source)
    let changed = false
    root.walkAtRules((rule) => {
      if (rule.name === 'media' && /^source\(/.test(rule.params.trim())) {
        rule.remove()
        changed = true
        return
      }
      if (!TAILWIND_V4_GENERATOR_AT_RULES.has(rule.name)) {
        return
      }
      rule.remove()
      changed = true
    })
    return changed ? root.toString() : source
  }
  catch {
    return removeTailwindV4GeneratorAtRulesFallback(source)
  }
}

export function isCommentOnlyCss(source: string) {
  try {
    const root = postcss.parse(source)
    return root.nodes.length > 0 && root.nodes.every(node => node.type === 'comment')
  }
  catch {
    return false
  }
}

export interface RemoveMiniProgramInteractiveSelectorsOptions {
  active?: boolean | undefined
  hover?: boolean | undefined
  focus?: boolean | undefined
}

export function removeMiniProgramInteractiveSelectors(
  source: string,
  options: RemoveMiniProgramInteractiveSelectorsOptions = { active: true, hover: true },
) {
  const removeActive = options.active === true
  const removeHover = options.hover === true
  const removeFocus = options.focus === true
  const unsupportedPseudoClasses = [
    ...(removeActive ? [':active'] : []),
    ...(removeHover ? [':hover'] : []),
    ...(removeFocus ? [':focus'] : []),
  ]
  if (
    unsupportedPseudoClasses.length === 0
    || (!source.includes(':active') && !source.includes(':hover') && !source.includes(':focus'))
  ) {
    return source
  }
  try {
    const root = postcss.parse(source)
    let changed = false
    root.walkRules((rule) => {
      const selectors = rule.selectors ?? [rule.selector]
      const keptSelectors = selectors.filter((selector) => {
        if (!unsupportedPseudoClasses.some(pseudoClass => selector.includes(pseudoClass))) {
          return true
        }
        return !selectorContainsPseudoClass(selector, unsupportedPseudoClasses)
      })
      if (keptSelectors.length === selectors.length) {
        return
      }
      changed = true
      if (keptSelectors.length === 0) {
        rule.remove()
        return
      }
      rule.selectors = keptSelectors
    })
    root.walk((node) => {
      if ('nodes' in node && node.nodes?.length === 0) {
        node.remove()
        changed = true
      }
    })
    return changed ? root.toString() : source
  }
  catch {
    return source
  }
}

export function removeMiniProgramHoverSelectors(source: string, enabled: boolean | undefined = true) {
  return removeMiniProgramInteractiveSelectors(source, { hover: enabled })
}

export function removeProcessedMiniProgramUnsupportedCss(
  source: string,
  options: Partial<IStyleHandlerOptions>,
) {
  return removeMiniProgramInteractiveSelectors(
    removeUnsupportedMiniProgramAtRules(source),
    {
      active: options.cssRemoveActivePseudoClass ?? true,
      hover: options.cssRemoveHoverPseudoClass ?? true,
      focus: options.cssRemoveFocusPseudoClass ?? true,
    },
  )
}

export function unwrapMiniProgramCascadeLayers(source: string) {
  if (!source.includes('@layer')) {
    return source
  }
  try {
    const root = postcss.parse(source)
    removeUnsupportedCascadeLayers(root)
    return root.toString()
  }
  catch {
    return source
  }
}

function hasClassSelector(selector: string) {
  return /(?:^|[^\w-])\.[_a-z\u00A0-\uFFFF\\-]/i.test(selector)
}

export function collectBareSelectorUserCss(source: string, transformedCss?: string) {
  try {
    const root = postcss.parse(source)
    const representedSelectors = new Set<string>()
    const rootSelectors = new Set([':root', ':host', 'page', '.tw-root', 'wx-root-portal-content'])
    const selectorKey = (rule: postcss.Rule, selector: string) => {
      const context: string[] = []
      let parent = rule.parent
      while (parent && parent.type !== 'root') {
        if (parent.type === 'atrule') {
          context.unshift(`@${parent.name} ${parent.params}`)
        }
        parent = parent.parent
      }
      return JSON.stringify([...context, rootSelectors.has(selector.trim()) ? ':root' : selector.trim()])
    }
    if (transformedCss !== undefined) {
      postcss.parse(transformedCss).walkRules((rule) => {
        for (const selector of rule.selectors) {
          representedSelectors.add(selectorKey(rule, selector))
        }
      })
    }
    let changed = false
    root.walkAtRules('import', (rule) => {
      rule.remove()
      changed = true
    })
    root.walkRules((rule) => {
      const selectors = rule.selectors?.length ? rule.selectors : [rule.selector]
      if (selectors.some(selector => hasClassSelector(selector))
        || selectors.every(selector => representedSelectors.has(selectorKey(rule, selector)))) {
        rule.remove()
        changed = true
      }
    })
    root.walkAtRules((rule) => {
      if (rule.nodes !== undefined && rule.nodes.length === 0) {
        rule.remove()
        changed = true
      }
    })
    return changed ? root.toString() : source
  }
  catch {
    return ''
  }
}

export function stripTailwindSourceMediaFragments(source: string) {
  let removedSourceMediaStart = false
  return terminateTailwindSourceAtRulesBeforeNextDirective(removeTailwindSourceMediaBlocks(source))
    .split(/\r?\n/)
    .filter((line) => {
      if (/^\s*@media\s+source\([^)]*\)\s*\{\s*$/.test(line)) {
        removedSourceMediaStart = true
        return false
      }
      if (/^\s*\}\s*\/\*\s*source\([^)]*\)\s*\*\/\s*$/.test(line)) {
        return false
      }
      if (removedSourceMediaStart && /^\s*\}\s*$/.test(line)) {
        removedSourceMediaStart = false
        return false
      }
      return true
    })
    .join('\n')
}

function stripLeadingTailwindSourceMediaCloseFragment(source: string) {
  return source.replace(/^\s*\}\s*(?:\n|$)/, '')
}

export function stripUnmatchedTailwindSourceMediaCloseFragments(source: string) {
  try {
    postcss.parse(source)
    return source
  }
  catch {
    return stripLeadingTailwindSourceMediaCloseFragment(source)
      .replace(/\s*\}\s*$/, '')
  }
}
