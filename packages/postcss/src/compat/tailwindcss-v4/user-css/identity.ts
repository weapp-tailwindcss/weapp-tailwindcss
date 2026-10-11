import { postcss } from '../../../postcss-runtime'

function collectCssRuleIdentityMarkers(source: string) {
  const markers = new Set<string>()
  try {
    const root = postcss.parse(source)
    root.walkRules((rule) => {
      for (const selector of rule.selectors ?? [rule.selector]) {
        for (const match of selector.matchAll(/\.((?:\\.|[_a-z\u00A0-\uFFFF-])(?:\\.|[\w\u00A0-\uFFFF-])*)/gi)) {
          markers.add(`class:${match[1]}`)
        }
      }
    })
    root.walkAtRules('keyframes', (rule) => {
      if (rule.params) {
        markers.add(`keyframes:${rule.params}`)
      }
    })
  }
  catch {
  }
  return markers
}

export function isCssAlreadyRepresentedByMarkers(css: string, source: string) {
  const sourceMarkers = collectCssRuleIdentityMarkers(source)
  if (sourceMarkers.size === 0) {
    return false
  }
  const cssMarkers = collectCssRuleIdentityMarkers(css)
  for (const marker of sourceMarkers) {
    if (!cssMarkers.has(marker)) {
      return false
    }
  }
  return true
}
