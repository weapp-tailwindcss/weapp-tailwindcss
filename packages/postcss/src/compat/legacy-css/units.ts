import postcss from 'postcss'
import { normalizeCompatSelectors } from './selectors'

const CSS_LENGTH_UNIT_RE = /(?:^|[\s(,])[-+]?(?:\d+|\d*\.\d+)(?:px|rem)\b/i
const RPX_UNIT_RE = /(?:^|[\s(,])[-+]?(?:\d+|\d*\.\d+)rpx\b/i

function createLegacyDeclarationValueMap(css: string) {
  const values = new Map<string, string>()
  const root = postcss.parse(css)
  root.walkRules((rule) => {
    if (!rule.selectors || rule.selectors.length === 0) {
      return
    }
    for (const selector of rule.selectors) {
      const normalizedSelectors = normalizeCompatSelectors(selector)
      rule.walkDecls((decl) => {
        if (RPX_UNIT_RE.test(decl.value)) {
          for (const normalizedSelector of normalizedSelectors) {
            values.set(`${normalizedSelector}\n${decl.prop}`, decl.value)
          }
        }
      })
    }
  })
  return values
}

export function inheritLegacyUnitConvertedDeclarations(css: string, legacyCss: string) {
  try {
    const legacyValues = createLegacyDeclarationValueMap(legacyCss)
    if (legacyValues.size === 0) {
      return css
    }

    const root = postcss.parse(css)
    let changed = false
    root.walkRules((rule) => {
      if (!rule.selectors || rule.selectors.length === 0) {
        return
      }
      const selectors = rule.selectors
        .flatMap(selector => normalizeCompatSelectors(selector))
      if (selectors.length === 0) {
        return
      }

      rule.walkDecls((decl) => {
        if (!CSS_LENGTH_UNIT_RE.test(decl.value)) {
          return
        }
        for (const selector of selectors) {
          const legacyValue = legacyValues.get(`${selector}\n${decl.prop}`)
          if (legacyValue && legacyValue !== decl.value) {
            decl.value = legacyValue
            changed = true
            return
          }
        }
      })
    })

    return changed ? root.toString() : css
  }
  catch {
    return css
  }
}
