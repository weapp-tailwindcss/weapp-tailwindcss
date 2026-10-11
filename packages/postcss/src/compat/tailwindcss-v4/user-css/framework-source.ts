import { postcss } from '../../../postcss-runtime'
import { stripTailwindSourceMediaFragments, stripUnmatchedTailwindSourceMediaCloseFragments } from './source-fragments'

export function normalizeFrameworkProcessedUserCss(source: string) {
  if (!source.includes('source(')) {
    return source
  }
  try {
    const root = postcss.parse(source)
    root.walkAtRules('media', (rule) => {
      if (/^source\(/.test(rule.params)) {
        rule.replaceWith(...rule.nodes ?? [])
      }
    })
    return root.toString()
  }
  catch {
    return stripUnmatchedTailwindSourceMediaCloseFragments(stripTailwindSourceMediaFragments(source))
  }
}
