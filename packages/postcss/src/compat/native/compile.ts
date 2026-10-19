import type { AtRule, Declaration, Rule } from 'postcss'
import type { CompileNativeStylesheetOptions, NativeCompilerWarning, NativeCssStylesheet, NativeStyleRule } from './types'
import { postcss } from '../../postcss-runtime'
import { nativeVariableDefinition } from './context'
import { expandDeclaration, propertyName, relativeLineHeight } from './properties'
import { collectNativeVariables, nativeRuleVariables } from './scope'
import { atRuleVariant, nativeSelectorCandidates, unsupportedVariant, variantForClass } from './selectors'
import { parseNativeBoxShadow } from './shadow'
import { resolveNativeVariables } from './variables'

function ancestors(node: Rule | Declaration) {
  const result: AtRule[] = []
  let current = node.parent
  while (current && current.type !== 'root') {
    if (current.type === 'atrule') {
      result.unshift(current)
    }
    current = current.parent
  }
  return result
}

function addWarning(warnings: NativeCompilerWarning[], warning: NativeCompilerWarning) {
  if (!warnings.some(item => item.message === warning.message && item.property === warning.property && item.className === warning.className)) {
    warnings.push(warning)
  }
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
  const customProperties: Record<'normal' | 'important', NonNullable<NativeStyleRule['customProperties']>> = { normal: {}, important: {} }
  const boxShadows: Partial<Record<'normal' | 'important', NonNullable<NativeStyleRule['boxShadowExpression']>>> = {}
  const transforms: Partial<Record<'normal' | 'important', NonNullable<NativeStyleRule['transformExpression']>>> = {}
  const variables = nativeRuleVariables(rule, inherited)
  rule.each((decl) => {
    if (decl.type !== 'decl') {
      return
    }
    const property = propertyName(decl.prop)
    const important = decl.important || /!important\s*$/i.test(decl.value)
    const value = decl.value.replace(/\s*!important\s*$/i, '')
    const kind = important ? 'important' : 'normal'
    if (decl.prop.startsWith('--')) {
      customProperties[kind][decl.prop] = nativeVariableDefinition(value, inherited)
      return
    }
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
    if (property === 'boxShadow') {
      if (value.includes('var(') || /currentcolor/i.test(value)) {
        boxShadows[kind] = nativeVariableDefinition(value, inherited)
      }
      else {
        delete boxShadows[kind]
      }
    }
    if (property === 'transform') {
      if (value.includes('var(')) {
        transforms[kind] = nativeVariableDefinition(value, inherited)
      }
      else {
        delete transforms[kind]
      }
    }
    const expanded = expandDeclaration(property, value, variables)
    if (!expanded || Object.values(expanded).includes(undefined)) {
      if (property === 'boxShadow' && parseNativeBoxShadow(resolveNativeVariables(value, variables) ?? value, '#000000') !== undefined) {
        boxShadows[kind] = nativeVariableDefinition(value, inherited)
        return
      }
      addWarning(warnings, { className, property, message: `不支持将 ${decl.prop}: ${value} 编译为 React Native style` })
      return
    }
    if (property === 'lineHeight') {
      delete lineHeights[kind]
    }
    Object.assign(styles[kind], expanded)
  })
  const variant = {
    ...variantForClass(className),
    ...ancestors(rule).reduce((result, node) => ({ ...result, ...atRuleVariant(node) }), {}),
  }
  return (['normal', 'important'] as const)
    .filter(kind => Object.keys(styles[kind]).length > 0 || lineHeights[kind] !== undefined || Object.keys(customProperties[kind]).length > 0 || boxShadows[kind] !== undefined || transforms[kind] !== undefined)
    .map(kind => ({
      style: styles[kind],
      ...(Object.keys(customProperties[kind]).length ? { customProperties: customProperties[kind] } : {}),
      ...(boxShadows[kind] ? { boxShadowExpression: boxShadows[kind] } : {}),
      ...(transforms[kind] ? { transformExpression: transforms[kind] } : {}),
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
    for (const { className, supported } of nativeSelectorCandidates(rule, allowed)) {
      if (!supported && !unsupportedVariant(className)) {
        addWarning(warnings, { className, property: 'selector', message: `不支持将选择器 ${rule.selector} 编译为 React Native 条件样式` })
      }
      else {
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
