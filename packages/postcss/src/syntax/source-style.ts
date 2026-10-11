import { postcss } from '../postcss-runtime'

const SOURCE_STYLE_NON_CSS_SYNTAX_RE = /(?:^|\n)\s*(?:\/\/|\$[\w-]+\s*:|@(?:use|forward|mixin|include|function)\b)/

export function canProcessSourceStyleAsCss(source: string, file: string) {
  if (SOURCE_STYLE_NON_CSS_SYNTAX_RE.test(source)) {
    return false
  }
  try {
    postcss.parse(source, { from: file })
    return true
  }
  catch {
    return false
  }
}
