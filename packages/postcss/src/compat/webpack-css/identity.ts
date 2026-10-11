import postcss from 'postcss'
import { hasBundlerGeneratedCssMarker } from '../../utils/generated-css-marker'
import { hasTailwindGeneratedCss, hasTailwindGeneratedCssMarkers } from '../tailwindcss-v4/user-css/markers'

export function collectWebpackAssetUserCssMarkers(source: string) {
  const markers = new Set<string>()
  for (const match of source.matchAll(/\.((?:\\.|[_a-z\u00A0-\uFFFF-])(?:\\.|[\w\u00A0-\uFFFF-])*)/gi)) {
    markers.add(`class:${match[1]}`)
  }
  for (const match of source.matchAll(/@(?:-[\w-]+-)?keyframes\s+((?:\\.|[-\w\u00A0-\uFFFF])+)/gi)) {
    markers.add(`keyframes:${match[1]}`)
  }
  try {
    const root = postcss.parse(source)
    root.walkRules((rule) => {
      for (const selector of rule.selectors) {
        if (!/(?:^|[^\w-])\.[_a-z\u00A0-\uFFFF\\-]/i.test(selector)) {
          markers.add(`selector:${selector.trim().replace(/\s+/g, ' ')}`)
        }
      }
      rule.walkDecls((decl) => {
        if (decl.prop.startsWith('--')) {
          markers.add(`custom-property:${decl.prop}`)
        }
      })
    })
    root.walkAtRules('font-face', (rule) => {
      rule.walkDecls('font-family', (decl) => {
        markers.add(`font-face:${decl.value.trim()}`)
      })
    })
  }
  catch {
    // 保留原始生成 CSS，继续交给 finalize 处理声明级兼容降级。
  }
  return markers
}

export function collectWebpackCssRuleIdentityMarkers(source: string) {
  const markers = new Set<string>()
  try {
    const root = postcss.parse(source)
    root.walkRules((rule) => {
      for (const selector of rule.selectors) {
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

export function unescapeCssIdentifier(value: string) {
  return value.replace(/\\([0-9a-f]{1,6}\s?|.)/gi, (_match, escaped: string) => {
    const hex = escaped.trim()
    if (/^[0-9a-f]+$/i.test(hex)) {
      return String.fromCodePoint(Number.parseInt(hex, 16))
    }
    return escaped
  })
}

export function collectGeneratedCssClassCandidates(source: string) {
  const candidates = new Set<string>()
  if (
    hasBundlerGeneratedCssMarker(source)
    || (!hasTailwindGeneratedCss(source) && !hasTailwindGeneratedCssMarkers(source))
  ) {
    return candidates
  }
  try {
    const root = postcss.parse(source)
    root.walkRules((rule) => {
      for (const selector of rule.selectors) {
        for (const match of selector.matchAll(/\.((?:\\.|[\w\u00A0-\uFFFF-])(?:\\.|[\w\u00A0-\uFFFF-])*)/g)) {
          const candidate = unescapeCssIdentifier(match[1]!)
          candidates.add(candidate)
        }
      }
    })
  }
  catch {
  }
  return candidates
}

export function hasAdditionalWebpackAssetUserCssMarkers(
  rawSource: string,
  generatorRawSource: string,
) {
  const rawMarkers = collectWebpackAssetUserCssMarkers(rawSource)
  if (rawMarkers.size === 0) {
    return false
  }
  const generatorMarkers = collectWebpackAssetUserCssMarkers(generatorRawSource)
  for (const marker of rawMarkers) {
    if (!generatorMarkers.has(marker)) {
      return true
    }
  }
  return false
}
