import type { Root, Rule } from 'postcss'
import type { Root as SelectorRoot } from 'postcss-selector-parser'
import type { Reporter } from './reporter'
import { tokenize, TokenType } from '@csstools/css-tokenizer'
import selectorParser from 'postcss-selector-parser'
import { atRuleName } from './names'

export const atomicAtRules = /^(?:(?:-\w+-)?keyframes|font-face|property|counter-style|font-feature-values|font-palette-values|page|position-try|view-transition)$/i

export function validateInput(root: Root, reporter: Reporter) {
  let hasLayers = false
  const selectors = new WeakMap<Rule, SelectorRoot>()
  root.walkComments((node) => {
    if (/^\s*#(?:if|else|endif)\b/i.test(node.text)) {
      reporter.fail(node, 'LAYER_PREPROCESSOR', '输入仍包含条件编译控制注释。', '先运行预处理条件编译，再编译 layer。')
    }
  })
  root.walkAtRules((node) => {
    const name = atRuleName(node)
    let ancestor = node.parent
    while (ancestor && ancestor.type !== 'root') {
      if (ancestor.type === 'rule') {
        reporter.fail(node, 'LAYER_NESTING', '样式规则中仍包含嵌套 at-rule。', '先展开 CSS nesting，包括条件中的直接声明。')
      }
      ancestor = ancestor.parent
    }
    if (name === 'layer') {
      hasLayers = true
      let parent = node.parent
      while (parent && parent.type !== 'root') {
        if (parent.type === 'rule' || (parent.type === 'atrule' && atomicAtRules.test(atRuleName(parent)))) {
          reporter.fail(node, 'LAYER_NESTING', 'layer 不能嵌在样式规则或 descriptor 中。', '先展开 CSS nesting，并将 layer 放到规则或 descriptor 外。')
        }
        parent = parent.parent
      }
    }
    if (name === 'import' && tokenize({ css: node.params }).some(token =>
      (token[0] === TokenType.Ident || token[0] === TokenType.Function) && token[4].value.toLowerCase() === 'layer')) {
      reporter.fail(node, 'LAYER_IMPORT', '输入仍包含未展开的 layer import。', '调用 import processor 展开输入；内核不会读取文件。')
    }
  })
  root.walkDecls((node) => {
    if (tokenize({ css: node.value }).some(token => token[0] === TokenType.Ident && token[4].value.toLowerCase() === 'revert-layer')) {
      reporter.fail(node, 'LAYER_REVERT', 'revert-layer 无法通过顺序展开保留语义。', '改为显式值，或在支持原生 layer 的目标使用 preserve。')
    }
  })
  root.walkRules((rule) => {
    let parent = rule.parent
    while (parent && parent.type !== 'root') {
      if (parent.type === 'rule') {
        reporter.fail(rule, 'LAYER_NESTING', '输入仍包含嵌套样式规则。', '在 layer 编译前展开 CSS nesting。')
      }
      parent = parent.parent
    }
    let ast: SelectorRoot
    try {
      ast = selectorParser().astSync(rule.selector)
    }
    catch {
      return reporter.fail(rule, 'LAYER_SELECTOR_UNKNOWN', `无法解析选择器：${rule.selector}`, '先将选择器转换为可解析的 CSS，或使用 preserve。')
    }
    ast.walkNesting(() => reporter.fail(rule, 'LAYER_NESTING', '输入仍包含 nesting selector。', '在 layer 编译前展开 CSS nesting。'))
    selectors.set(rule, ast)
  })
  return { hasLayers, selectors }
}
