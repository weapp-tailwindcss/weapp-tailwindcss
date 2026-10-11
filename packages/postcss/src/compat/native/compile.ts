/* eslint-disable style/max-statements-per-line */

import type { AtRule, Declaration, Root, Rule } from 'postcss'
import type { CompileNativeStylesheetOptions, NativeCompilerWarning, NativeCssStylesheet, NativeStyleRule } from './types'
import { postcss } from '../../postcss-runtime'
import { expandDeclaration, propertyName } from './properties'
import { atRuleVariant, unsupportedVariant, variantForClass, walkClasses } from './selectors'

function ancestors(node: Rule | Declaration) {
  const result: AtRule[] = []
  let current = node.parent
  while (current && current.type !== 'root') {
    if (current.type === 'atrule') { result.unshift(current) }
    current = current.parent
  }
  return result
}

function collectVariables(root: Root) {
  const variables: Record<string, string> = {}
  root.walkDecls((decl) => {
    if (decl.prop.startsWith('--')) { variables[decl.prop] = decl.value.trim() }
  })
  return variables
}

function addWarning(warnings: NativeCompilerWarning[], warning: NativeCompilerWarning) {
  if (!warnings.some(item => item.message === warning.message && item.property === warning.property && item.className === warning.className)) { warnings.push(warning) }
}

function compileRule(rule: Rule, className: string, variables: Record<string, string>, warnings: NativeCompilerWarning[], order: number) {
  const unsupported = unsupportedVariant(className)
  if (unsupported) {
    addWarning(warnings, {
      className,
      property: 'variant',
      message: `不支持将 ${unsupported}: 变体编译为 React Native 条件样式`,
    })
    return []
  }
  const styles: Record<'normal' | 'important', Record<string, unknown>> = { normal: {}, important: {} }
  rule.walkDecls((decl) => {
    if (decl.prop.startsWith('--')) { return }
    const property = propertyName(decl.prop)
    const important = decl.important || /!important\s*$/i.test(decl.value)
    const value = decl.value.replace(/\s*!important\s*$/i, '')
    const expanded = expandDeclaration(property, value, variables)
    if (!expanded || Object.values(expanded).includes(undefined)) {
      addWarning(warnings, { className, property, message: `不支持将 ${decl.prop}: ${value} 编译为 React Native style` })
      return
    }
    Object.assign(styles[important ? 'important' : 'normal'], expanded)
  })
  const variant = {
    ...variantForClass(className),
    ...ancestors(rule).reduce((result, node) => ({ ...result, ...atRuleVariant(node) }), {}),
  }
  return (['normal', 'important'] as const)
    .filter(kind => Object.keys(styles[kind]).length > 0)
    .map(kind => ({
      style: styles[kind],
      ...variant,
      important: kind === 'important' || undefined,
      order,
    } satisfies NativeStyleRule))
}

export function compileNativeCss(css: string, options: CompileNativeStylesheetOptions = {}): NativeCssStylesheet {
  const root = postcss.parse(css)
  const variables = collectVariables(root)
  const allowed = options.classSet ? new Set(options.classSet) : undefined
  const rules: Record<string, NativeStyleRule[]> = {}
  const warnings: NativeCompilerWarning[] = []
  let order = 0

  root.walkRules((rule) => {
    if (options.ignorePreflight !== false && (rule.selector.includes(':root') || rule.selector.includes('*') || rule.selector.includes('::'))) { return }
    for (const selector of rule.selectors) {
      for (const className of walkClasses(selector)) {
        if (allowed && !allowed.has(className)) { continue }
        const compiled = compileRule(rule, className, variables, warnings, order++)
        if (compiled.length) {
          const existing = rules[className] ??= []
          existing.push(...compiled)
        }
      }
    }
  })

  return {
    rules,
    variables,
    warnings,
  }
}
