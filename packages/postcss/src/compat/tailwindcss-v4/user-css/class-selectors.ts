import { postcss } from '../../../postcss-runtime'

export function normalizeCssClassSelector(value: string) {
  return value.replace(/\\([^\da-f\r\n])/gi, '$1')
    .replace(/\\([\da-f]{1,6})\s?/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
}

export function collectRawSourceClassSelectors(rawSource: string) {
  const selectors = new Set<string>()
  try {
    const root = postcss.parse(rawSource)
    root.walkRules((rule) => {
      for (const selector of rule.selectors ?? [rule.selector]) {
        for (const match of selector.matchAll(/\.((?:\\.|[_a-z\u00A0-\uFFFF-])(?:\\.|[\w\u00A0-\uFFFF-])*)/gi)) {
          if (match[1]) {
            selectors.add(normalizeCssClassSelector(match[1]))
          }
        }
      }
    })
  }
  catch {
  }
  return selectors
}
