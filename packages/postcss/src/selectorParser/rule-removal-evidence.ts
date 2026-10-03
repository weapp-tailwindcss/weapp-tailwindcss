import selectorParser from 'postcss-selector-parser'
import { postcss } from '../postcss-runtime'
import { decodeCssIdentifier, getCssAtRulePrelude } from '../utils/css-custom-property'

/** 验证显式平台负向契约，检查全部规则，包括无法从空参考规则反推身份的别名。 */
export function assertCssConditionsRemoved(css: string, conditions: readonly ('supports' | 'hover')[]) {
  if (conditions.length === 0) {
    return
  }
  const root = postcss.parse(css)
  if (conditions.includes('supports')) {
    root.walkAtRules((rule) => {
      if (getCssAtRulePrelude(rule).name.toLowerCase() === 'supports') {
        throw new Error('expected platform to remove @supports rules, including safe aliases')
      }
    })
  }
  if (conditions.includes('hover')) {
    root.walkRules((rule) => {
      selectorParser().astSync(rule.selector).walkPseudos((pseudo) => {
        if (decodeCssIdentifier(pseudo.value.slice(1))?.toLowerCase() === 'hover') {
          throw new Error('expected platform to remove :hover selectors, including safe aliases')
        }
      })
    })
  }
}
