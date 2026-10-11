import postcss from 'postcss'
import { removeTailwindSourceDirectives } from '../tailwindcss-v4/user-css/directives'
import { removeTailwindV4GeneratorAtRules, stripTailwindSourceMediaFragments } from '../tailwindcss-v4/user-css/source-fragments'

function hasWebpackClassSelector(selector: string) {
  return /(?:^|[^\w-])\.[_a-z\u00A0-\uFFFF\\-]/i.test(selector)
}

function isWebpackKeyframesRule(rule: postcss.Rule) {
  let parent = rule.parent as postcss.Container | undefined
  while (parent) {
    if (parent.type === 'atrule' && (parent as postcss.AtRule).name.endsWith('keyframes')) {
      return true
    }
    parent = parent.parent as postcss.Container | undefined
  }
  return false
}

export function collectWebpackBareSelectorUserCss(source: string) {
  try {
    const normalizedSource = removeTailwindSourceDirectives(
      stripTailwindSourceMediaFragments(
        removeTailwindV4GeneratorAtRules(source),
      ),
      { importFallback: true },
    )
    const root = postcss.parse(normalizedSource)
    let changed = false
    root.walkAtRules((rule) => {
      if (rule.name === 'import' || rule.name === 'font-face' || rule.name.endsWith('keyframes')) {
        rule.remove()
        changed = true
      }
    })
    root.walkRules((rule) => {
      if (
        isWebpackKeyframesRule(rule)
        || rule.selectors.some(selector => hasWebpackClassSelector(selector))
      ) {
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
    return changed ? root.toString() : normalizedSource
  }
  catch {
    return ''
  }
}
