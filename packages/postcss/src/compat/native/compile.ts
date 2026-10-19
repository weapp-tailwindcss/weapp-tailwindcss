/* eslint-disable style/max-statements-per-line */

import type { AtRule, Declaration, Rule } from 'postcss'
import type { CompileNativeStylesheetOptions, NativeCompilerWarning, NativeCssStylesheet, NativeStyleRule } from './types'
import { postcss } from '../../postcss-runtime'
import { expandDeclaration, propertyName, relativeLineHeight } from './properties'
import { collectNativeVariables, nativeRuleVariables } from './scope'
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

function addWarning(warnings: NativeCompilerWarning[], warning: NativeCompilerWarning) {
  if (!warnings.some(item => item.message === warning.message && item.property === warning.property && item.className === warning.className)) { warnings.push(warning) }
}

function compileRule(rule: Rule, className: string, inherited: Record<string, string>, warnings: NativeCompilerWarning[], order: number, options: CompileNativeStylesheetOptions) {
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
  const lineHeights: Partial<Record<'normal' | 'important', number>> = {}
  const variables = nativeRuleVariables(rule, inherited)
  rule.each((decl) => {
    if (decl.type !== 'decl') { return }
    if (decl.prop.startsWith('--')) { return }
    const property = propertyName(decl.prop)
    const important = decl.important || /!important\s*$/i.test(decl.value)
    const value = decl.value.replace(/\s*!important\s*$/i, '')
    const kind = important ? 'important' : 'normal'
    if (property === 'boxShadow' && options.boxShadow === false) {
      addWarning(warnings, { className, property, message: '当前宿主已禁用现代 boxShadow，无法保留多层、spread 与 inset 阴影语义' })
      return
    }
    if (property === 'lineHeight') {
      const multiplier = relativeLineHeight(value, variables)
      if (multiplier !== undefined) {
        lineHeights[kind] = multiplier
        delete styles[kind].lineHeight
        return
      }
    }
    const expanded = expandDeclaration(property, value, variables)
    if (!expanded || Object.values(expanded).includes(undefined)) {
      addWarning(warnings, { className, property, message: `不支持将 ${decl.prop}: ${value} 编译为 React Native style` })
      return
    }
    if (property === 'lineHeight') { delete lineHeights[kind] }
    Object.assign(styles[kind], expanded)
  })
  const variant = {
    ...variantForClass(className),
    ...ancestors(rule).reduce((result, node) => ({ ...result, ...atRuleVariant(node) }), {}),
  }
  return (['normal', 'important'] as const)
    .filter(kind => Object.keys(styles[kind]).length > 0 || lineHeights[kind] !== undefined)
    .map(kind => ({
      style: styles[kind],
      ...(lineHeights[kind] === undefined ? {} : { lineHeightMultiplier: lineHeights[kind] }),
      ...variant,
      important: kind === 'important' || undefined,
      order,
    } satisfies NativeStyleRule))
}

export function compileNativeCss(css: string, options: CompileNativeStylesheetOptions = {}): NativeCssStylesheet {
  const root = postcss.parse(css)
  const variables = collectNativeVariables(root)
  const allowed = options.classSet ? new Set(options.classSet) : undefined
  const rules: Record<string, NativeStyleRule[]> = {}
  const warnings: NativeCompilerWarning[] = []
  let order = 0

  root.walkRules((rule) => {
    if (options.ignorePreflight !== false && (rule.selector.includes(':root') || rule.selector.includes('*') || rule.selector.includes('::'))) { return }
    for (const selector of rule.selectors) {
      for (const className of walkClasses(selector)) {
        if (allowed && !allowed.has(className)) { continue }
        const compiled = compileRule(rule, className, variables, warnings, order++, options)
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
