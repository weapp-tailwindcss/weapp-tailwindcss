import type { FinalizeMiniProgramCssOptions } from './finalize-options'
import postcss from 'postcss'
import { isDisplayP3Declaration } from './color-gamut'
import {
  isEmptyTwContentDeclaration,
  isMiniProgramThemeVariableRule,
  usesTwContentVariable,
} from './predicates'
import { normalizeMiniProgramThemeScopeSelector } from './selectors'

export function collectThemeVariableRule(root: postcss.Root, options: FinalizeMiniProgramCssOptions = {}) {
  const themeRules: postcss.Rule[] = []
  const declarations = new Map<string, postcss.Declaration[]>()
  const shouldPreserveContentInit = usesTwContentVariable(root)

  for (const node of root.nodes ?? []) {
    if (!isMiniProgramThemeVariableRule(node)) {
      continue
    }

    themeRules.push(node)
    node.walkDecls((decl) => {
      if (isDisplayP3Declaration(decl)) {
        return
      }
      if (decl.prop.startsWith('--tw-')) {
        return
      }
      if (!shouldPreserveContentInit && isEmptyTwContentDeclaration(decl)) {
        return
      }
      const values = declarations.get(decl.prop) ?? []
      const previous = values.at(-1)
      // 保留不同值的级联历史，后续 cssCalc 必须能识别多入口主题冲突。
      if (!previous || previous.value !== decl.value || previous.important !== decl.important) {
        values.push(decl.clone())
      }
      declarations.set(decl.prop, values)
    })
  }

  for (const rule of themeRules) {
    rule.remove()
  }

  if (declarations.size === 0) {
    return
  }

  const rule = postcss.rule({
    selector: normalizeMiniProgramThemeScopeSelector(options.cssSelectorReplacement?.root),
  })
  for (const decl of declarations.values()) {
    rule.append(...decl)
  }
  return rule
}
