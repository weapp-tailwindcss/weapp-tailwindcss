import { postcss } from '../postcss-runtime'
import { parseCssImportSpecifier, quoteCssImportSpecifier } from './css-import'

/** 改写请求串；文件查找、包解析与路径规则由调用方提供。 */
export function rewriteCssImportSpecifiers(
  css: string,
  resolve: (specifier: string) => string | null | undefined,
  options: { atRuleNames?: string[], tolerateInvalidCss?: boolean } = {},
) {
  let root: postcss.Root
  try {
    root = postcss.parse(css)
  }
  catch (error) {
    if (options.tolerateInvalidCss) {
      return css
    }
    throw error
  }
  const names = new Set(options.atRuleNames ?? ['import'])
  let changed = false
  root.walkAtRules((rule) => {
    if (!names.has(rule.name)) {
      return
    }
    const parsed = parseCssImportSpecifier(rule.params)
    if (!parsed) {
      return
    }
    const replacement = resolve(parsed.specifier)
    if (!replacement) {
      return
    }
    rule.params = rule.params.replace(parsed.raw, () => quoteCssImportSpecifier(replacement, parsed.quote))
    changed = true
  })
  return changed ? root.toString() : css
}
