import type { CascadeLayerError } from '@weapp-tailwindcss/css-compat/layers'
import type { CssCompatAction, WebCssCompatDiagnostic, WebCssCompatUserOptions } from '../types'
import type { NormalizedWebCssCompatOptions, TransformWebCssCompatProcessing, TransformWebCssCompatResult } from './web-css'
import type { unsupportedTargets } from './web-css-policy'
import { compileCascadeLayers } from '@weapp-tailwindcss/css-compat/layers'
import postcss from 'postcss'
import selectorParser from 'postcss-selector-parser'
import { internalCssSelectorReplacer } from '../shared'
import { WebCssCompatError } from '../types'
import { getCssCalcVariableReferences, isCssPropertyRegistration } from '../utils/css-custom-property'
import { removeUnsupportedCascadeLayers } from './mini-program-css/at-rules'
import { normalizeWebCssCompatOptions } from './web-css'
import { collectCustomPropertyValues, resolveCustomPropertyVarValue } from './web-css-custom-properties'
import { normalizeWebGradientPositions } from './web-css-gradients'
import {
  actionFor,
  containsCalcFunction,
  containsTypedDivision,
  hasNestedRules,
  insertWebkitBackgroundClipText,
  lowerLegacyWebFallbackSpecificity,
  nodeLocation,
  normalizeModernColorDeclarations,
  normalizeStaticCalcDeclarations,
  normalizeTailwindcssV4InfinityCalcDeclarations,
  removeAtRules,
  removeDeclarations,
  removeEmptyAtRules,
  removeModernColorSupports,
  transformCssNesting,
  transformedFeatures,
  unwrapThemeAtRules,
} from './web-css-helpers'
import { actionIsTransforming, createWebCssCompatDiagnostic, normalizeWebCssCompatPolicy, targetsForDiagnostic } from './web-css-policy'
import { withPreservedRegistrationScopes } from './web-css-registration-scopes'
import { collectRegisteredCustomPropertyFallbacks, insertRegisteredCustomPropertyFallbackRule } from './web-css-registrations'
import { hasModernLengthUnit, lowerModernLengthUnitFallbacks, modernLengthUnitsInValue, removeModernLengthUnitDeclarations } from './web-css-units'

function isWebCssCompatEnabled(options: NormalizedWebCssCompatOptions) {
  return Object.values(options.policy.actions).some(actionIsTransforming)
}

export function transformWebCssCompatResult(
  css: string,
  options: WebCssCompatUserOptions | undefined,
  processing: TransformWebCssCompatProcessing = {},
): TransformWebCssCompatResult {
  if (options === false) {
    return { css, diagnostics: [] }
  }
  const baseNormalized = normalizeWebCssCompatOptions(options)
  const normalized: NormalizedWebCssCompatOptions = processing.target
    ? {
        ...baseNormalized,
        policy: normalizeWebCssCompatPolicy(
          options === true
            ? { preset: 'legacy-web' }
            : options && typeof options === 'object'
              ? options
              : { preset: baseNormalized.preset },
          processing.target,
        ),
      }
    : baseNormalized
  const diagnostics: WebCssCompatDiagnostic[] = []
  const diagnosticTargets = normalized.policy.targets?.targets.length
    ? [...normalized.policy.targets.targets]
    : ['unspecified']
  const hasDiagnosticTargets = (normalized.policy.targets?.targets.length ?? 0) > 0
  const hasCapabilityProfile = normalized.policy.capabilities !== undefined
  if (!isWebCssCompatEnabled(normalized) && normalized.preset !== 'legacy-web' && !hasDiagnosticTargets && !hasCapabilityProfile) {
    return { css, diagnostics }
  }

  const emit = (diagnostic: WebCssCompatDiagnostic) => {
    diagnostics.push(diagnostic)
    processing.onDiagnostic?.(diagnostic)
  }
  const report = (
    feature: Parameters<typeof unsupportedTargets>[0],
    action: CssCompatAction,
    node: postcss.Node,
    code: string,
    message: string,
    suggestion?: string,
    severity: 'warning' | 'error' = 'warning',
    context: { atRuleName?: string | undefined, units?: readonly string[] | undefined } = {},
  ) => {
    const targets = targetsForDiagnostic(feature, action, normalized.policy.targets, context, normalized.policy.capabilities)
    if (targets.length === 0) {
      return
    }
    const effectiveSeverity = action === 'error' || normalized.policy.diagnostics === 'error' ? 'error' : severity
    for (const target of targets) {
      const diagnostic = createWebCssCompatDiagnostic({
        code,
        severity: effectiveSeverity,
        feature,
        action,
        ...nodeLocation(node, processing.file),
        message,
        suggestion,
      }, target)
      if (normalized.policy.diagnostics !== 'silent' || effectiveSeverity === 'error') {
        emit(diagnostic)
      }
    }
    if (effectiveSeverity === 'error') {
      throw new WebCssCompatError(diagnostics)
    }
  }

  const present = (
    feature: Parameters<typeof unsupportedTargets>[0],
    node: postcss.Node,
    message: string,
    suggestion?: string,
    context: { atRuleName?: string | undefined, units?: readonly string[] | undefined } = {},
  ) => {
    const action = actionFor(normalized.policy, feature)
    if (action === 'preserve' || action === 'warn' || action === 'error') {
      report(feature, action, node, 'WCC_TARGET_UNSUPPORTED', message, suggestion, action === 'error' ? 'error' : 'warning', context)
    }
  }

  const reportLowerUnsafe = (
    feature: Parameters<typeof unsupportedTargets>[0],
    node: postcss.Node,
    message: string,
    suggestion?: string,
  ) => {
    report(feature, 'lower', node, 'WCC_LOWER_UNSAFE', message, suggestion)
  }

  try {
    const root = postcss.parse(css)
    const registeredProperties = collectRegisteredCustomPropertyFallbacks(root)
    const policy = normalized.policy
    const features = transformedFeatures(policy)
    const themeAction = actionFor(policy, 'theme')
    if (themeAction !== 'lower') {
      root.walkAtRules('theme', (atRule) => {
        if (!isCssPropertyRegistration(atRule)) {
          present('theme', atRule, '检测到 @theme 规则。', '保留原生 @theme，或显式选择 lower。')
          if (themeAction === 'remove') {
            atRule.remove()
          }
        }
      })
    }
    if (themeAction === 'lower') {
      withPreservedRegistrationScopes(root, () => unwrapThemeAtRules(root))
    }
    const propertyAction = actionFor(policy, 'property')
    if (propertyAction === 'remove') {
      removeAtRules(root, 'property')
    }
    if (propertyAction !== 'lower' && propertyAction !== 'remove') {
      root.walkAtRules('property', atRule => present('property', atRule, '检测到 @property 注册规则。', '目标不支持注册属性时选择 lower 或 remove。'))
    }
    if (propertyAction === 'lower' && !processing.deferPropertyFallback) {
      insertRegisteredCustomPropertyFallbackRule(root, registeredProperties, policy.actions.layers !== 'lower')
    }
    const supportsAction = actionFor(policy, 'supports')
    if (supportsAction === 'remove') {
      removeAtRules(root, 'supports', atRule => /color-mix|oklch|oklab|lab|lch|display-p3/i.test(atRule.params))
    }
    if (supportsAction !== 'lower' && supportsAction !== 'remove') {
      root.walkAtRules('supports', (atRule) => {
        if (/color-mix|oklch|oklab|lab|lch|display-p3/i.test(atRule.params)) {
          present('supports', atRule, '检测到现代颜色 @supports 条件。', '保留条件时确认目标支持现代颜色函数。')
        }
      })
    }
    if (supportsAction === 'lower') {
      removeModernColorSupports(root)
    }
    const nestingAction = actionFor(policy, 'nesting')
    if (nestingAction === 'preserve' || nestingAction === 'warn' || nestingAction === 'error') {
      if (hasNestedRules(root)) {
        present('nesting', root, '检测到 CSS nesting 规则。', '选择 lower 展开嵌套，或确认目标支持 nesting。')
      }
    }
    if (nestingAction === 'remove') {
      root.walkRules((rule) => {
        if (rule.nodes?.some(node => node.type === 'rule' || (node.type === 'atrule' && node.nodes))) {
          rule.remove()
        }
      })
    }
    if (nestingAction === 'lower') {
      withPreservedRegistrationScopes(root, () => transformCssNesting(root))
    }
    const legacyColorLowering = normalized.preset === 'legacy-web'
      && !policy.explicit.has('oklch')
      && !policy.explicit.has('colorFunctions')
    if (features.oklch || features.colorFunctions || legacyColorLowering) {
      normalizeWebGradientPositions(root, registeredProperties)
    }
    const variablesAction = actionFor(policy, 'variables')
    if (variablesAction === 'remove') {
      removeDeclarations(root, decl => /var\(/i.test(decl.value) || decl.prop.startsWith('--'))
    }
    if (variablesAction === 'lower') {
      const referenced = new Set<string>()
      root.walkDecls((decl) => {
        for (const property of getCssCalcVariableReferences(decl.value).values()) {
          referenced.add(property)
        }
      })
      let values = collectCustomPropertyValues(root, referenced).values
      for (let pass = 0; pass < 2; pass++) {
        const collected = collectCustomPropertyValues(root, referenced)
        values = collected.values
        for (const dependency of collected.dependencies) {
          referenced.add(dependency)
        }
      }
      root.walkDecls((decl) => {
        const resolved = resolveCustomPropertyVarValue(decl.value, values)
        if (resolved !== decl.value) {
          decl.value = resolved
        }
        if (/var\(/i.test(decl.value)) {
          reportLowerUnsafe('variables', decl, '无法证明 CSS variable 在所有级联路径上具有稳定值。', '保留运行时变量，或为每个目标作用域提供静态值。')
        }
      })
    }
    if (variablesAction === 'preserve' || variablesAction === 'warn' || variablesAction === 'error') {
      root.walkDecls((decl) => {
        if (/var\(/i.test(decl.value) || decl.prop.startsWith('--')) {
          present('variables', decl, '检测到 CSS variables。', '保留运行时变量，或为目标提供静态值。')
        }
      })
    }
    const typedDivisionAction = actionFor(policy, 'typedDivision')
    const calcAction = actionFor(policy, 'calc')
    root.walkDecls((decl) => {
      if (calcAction === 'preserve' || calcAction === 'warn' || calcAction === 'error') {
        if (containsCalcFunction(decl.value)) {
          present('calc', decl, '检测到 calc()。', '保留动态计算，或选择 lower 处理可证明的静态表达式。')
        }
      }
      if (typedDivisionAction === 'preserve' || typedDivisionAction === 'warn' || typedDivisionAction === 'error') {
        if (containsTypedDivision(decl.value)) {
          present('typedDivision', decl, '检测到 typed division。', '保留动态计算，或选择 lower 处理可证明的静态表达式。')
        }
      }
    })
    if (typedDivisionAction === 'remove') {
      removeDeclarations(root, decl => containsTypedDivision(decl.value))
    }
    if (calcAction === 'remove') {
      removeDeclarations(root, decl => containsCalcFunction(decl.value))
    }
    const lowerInfinityCalc = calcAction === 'lower'
      || (normalized.preset === 'legacy-web' && !policy.explicit.has('calc'))
    normalizeTailwindcssV4InfinityCalcDeclarations(root, lowerInfinityCalc, typedDivisionAction === 'lower')
    if (typedDivisionAction === 'lower' && calcAction !== 'lower') {
      normalizeStaticCalcDeclarations(root, 'lower', true)
    }
    if (typedDivisionAction === 'lower') {
      root.walkDecls((decl) => {
        if (containsTypedDivision(decl.value)) {
          reportLowerUnsafe('typedDivision', decl, '无法静态计算包含运行时值的 typed division。', '保留动态除法，或提供可证明为常量的操作数。')
        }
      })
    }
    if (calcAction === 'lower') {
      normalizeStaticCalcDeclarations(root, typedDivisionAction)
      root.walkDecls((decl) => {
        if (containsCalcFunction(decl.value)) {
          reportLowerUnsafe('calc', decl, '无法在不读取运行时变量的情况下静态化 calc()。', '保留动态 calc()，或提供可证明稳定的静态变量值。')
        }
      })
    }
    const lowerSelectors = actionFor(policy, 'selectors') === 'lower'
      || (normalized.preset === 'legacy-web' && !policy.explicit.has('selectors'))
    if (lowerSelectors) {
      lowerLegacyWebFallbackSpecificity(root, policy.specificityGuard)
    }
    if (actionFor(policy, 'selectors') === 'preserve' || actionFor(policy, 'selectors') === 'warn' || actionFor(policy, 'selectors') === 'error') {
      root.walkRules((rule) => {
        if (rule.selector.includes(':not(') && rule.selector.includes('#\\#')) {
          present('selectors', rule, '检测到兼容性选择器 guard。', '选择 lower 生成 :where() guard。')
        }
      })
    }
    if (actionFor(policy, 'selectors') === 'remove') {
      root.walkRules((rule) => {
        if (rule.selector.includes(':not(') && rule.selector.includes('#\\#')) {
          rule.remove()
        }
      })
    }
    const colorFeatures = features
    const oklchAction = actionFor(policy, 'oklch')
    const colorFunctionsAction = actionFor(policy, 'colorFunctions')
    if (oklchAction === 'remove' || colorFunctionsAction === 'remove') {
      removeDeclarations(root, decl => (oklchAction === 'remove' && /oklch|oklab/i.test(decl.value)) || (colorFunctionsAction === 'remove' && /color-mix|lab\(|lch\(|color\(/i.test(decl.value)))
    }
    if (oklchAction === 'preserve' || oklchAction === 'warn' || oklchAction === 'error'
      || colorFunctionsAction === 'preserve' || colorFunctionsAction === 'warn' || colorFunctionsAction === 'error') {
      root.walkDecls((decl) => {
        if (/oklch|oklab/i.test(decl.value)) {
          present('oklch', decl, '检测到 OKLCH 颜色。', '选择 lower 生成静态 fallback。')
        }
        if (/color-mix|lab\(|lch\(|color\(/i.test(decl.value)) {
          present('colorFunctions', decl, '检测到现代颜色函数。', '选择 lower 生成静态 fallback。')
        }
      })
    }
    if (colorFeatures.oklch || colorFeatures.colorFunctions) {
      normalizeModernColorDeclarations(root, colorFeatures)
    }
    if (oklchAction === 'lower' || colorFunctionsAction === 'lower') {
      root.walkDecls((decl) => {
        if (oklchAction === 'lower' && /oklch|oklab/i.test(decl.value)) {
          reportLowerUnsafe('oklch', decl, '无法静态降级依赖动态变量或上下文的 OKLCH 颜色。', '保留现代颜色，或把可证明稳定的颜色变量定义在根作用域。')
        }
        if (colorFunctionsAction === 'lower' && /color-mix|lab\(|lch\(|color\(/i.test(decl.value)) {
          reportLowerUnsafe('colorFunctions', decl, '无法静态降级依赖运行时值的现代颜色函数。', '保留现代颜色函数，或提供可静态解析的颜色参数。')
        }
      })
    }
    if (normalized.preset === 'legacy-web' && !policy.explicit.has('selectors')) {
      insertWebkitBackgroundClipText(root)
    }
    const layerAction = actionFor(policy, 'layers')
    if (layerAction === 'remove') {
      removeAtRules(root, 'layer')
    }
    if (layerAction === 'preserve' || layerAction === 'warn' || layerAction === 'error') {
      root.walkAtRules('layer', atRule => present('layers', atRule, '检测到 CSS cascade layer。', '选择 ordered lower 展平层级，或确认目标支持 @layer。'))
    }
    if (layerAction === 'lower') {
      withPreservedRegistrationScopes(root, () => {
        if (normalized.layersModeExplicit) {
          const compilation = compileCascadeLayers(root, { mode: policy.layersMode, onConflict: policy.layersOnConflict })
          for (const diagnostic of compilation.diagnostics) {
            const source = diagnostic.source
            for (const target of diagnosticTargets) {
              const layerDiagnostic = createWebCssCompatDiagnostic({
                code: diagnostic.code,
                severity: normalized.policy.diagnostics === 'error' ? 'error' : diagnostic.severity,
                feature: 'layers',
                action: 'lower',
                file: source.file ?? processing.file,
                line: source.line,
                column: source.column,
                message: diagnostic.message,
                suggestion: diagnostic.suggestion,
              }, target)
              if (normalized.policy.diagnostics !== 'silent' || layerDiagnostic.severity === 'error') {
                emit(layerDiagnostic)
              }
            }
          }
          if (normalized.policy.diagnostics === 'error' && compilation.diagnostics.length > 0) {
            throw new WebCssCompatError(diagnostics)
          }
        }
        else {
          removeUnsupportedCascadeLayers(root)
        }
      })
    }
    const unitsAction = actionFor(policy, 'units')
    if (unitsAction === 'remove') {
      removeModernLengthUnitDeclarations(root)
    }
    if (unitsAction === 'lower') {
      const lowered = lowerModernLengthUnitFallbacks(root)
      for (const declaration of lowered.approximate) {
        reportLowerUnsafe('units', declaration, '生成了近似的视口单位 fallback，旧浏览器中的可视尺寸可能不同。', '确认该近似可接受，或使用 preserve 并提供运行时兼容样式。')
      }
      for (const declaration of lowered.unsafe) {
        reportLowerUnsafe('units', declaration, '无法在没有视口或容器尺寸的情况下等价转换动态 CSS 单位。', '保留单位，或在上游提供明确的运行时尺寸策略。')
      }
    }
    if (unitsAction === 'preserve' || unitsAction === 'warn' || unitsAction === 'error') {
      root.walkDecls((decl) => {
        if (hasModernLengthUnit(decl.value)) {
          present('units', decl, '检测到目标可能不支持的 CSS 单位。', '选择 lower 转换单位，或保留并确认运行时支持。', { units: modernLengthUnitsInValue(decl.value) })
        }
      })
    }
    for (const [name, action] of Object.entries(policy.atRules)) {
      if (name === 'supports') {
        continue
      }
      root.walkAtRules(name, (atRule) => {
        if (action === 'remove') {
          atRule.remove()
        }
        else if (action === 'warn' || action === 'error' || action === 'preserve') {
          report('atRule', action, atRule, 'WCC_TARGET_UNSUPPORTED', `检测到 @${name} 规则，目标支持状态不确定或不支持。`, '确认目标支持该 at-rule，或选择 lower / remove。', action === 'error' ? 'error' : 'warning', { atRuleName: name })
        }
        else if (action === 'lower') {
          reportLowerUnsafe('atRule', atRule, `无法自动 lower @${name} 规则。`, '改为 preserve 或 remove，避免生成不等价 CSS。')
        }
      })
    }
    removeEmptyAtRules(root)
    return { css: root.toString(), diagnostics }
  }
  catch (error) {
    if ((error as WebCssCompatError)?.name === 'WebCssCompatError') {
      throw error
    }
    if ((error as CascadeLayerError)?.name === 'CascadeLayerError') {
      const layerError = error as CascadeLayerError
      for (const item of layerError.diagnostics) {
        for (const target of diagnosticTargets) {
          const diagnostic = createWebCssCompatDiagnostic({
            code: item.code,
            severity: normalized.policy.diagnostics === 'error' ? 'error' : item.severity,
            feature: 'layers',
            action: 'lower',
            file: item.source.file ?? processing.file,
            line: item.source.line,
            column: item.source.column,
            message: item.message,
            suggestion: item.suggestion,
          }, target)
          if (normalized.policy.diagnostics !== 'silent' || diagnostic.severity === 'error') {
            emit(diagnostic)
          }
        }
      }
      throw new WebCssCompatError(diagnostics)
    }
    const diagnostic = createWebCssCompatDiagnostic({
      code: 'WCC_TRANSFORM_FAILED',
      severity: normalized.policy.diagnostics === 'error' ? 'error' : 'warning',
      feature: 'atRule',
      action: 'lower',
      file: processing.file,
      message: error instanceof Error ? error.message : String(error),
      suggestion: '保留原始 CSS，并为无法证明等价的能力选择 preserve 或 error。',
    }, normalized.policy.targets?.targets[0] ?? 'unspecified')
    if (normalized.policy.diagnostics !== 'silent' || diagnostic.severity === 'error') {
      emit(diagnostic)
    }
    if (diagnostic.severity === 'error') {
      throw new WebCssCompatError(diagnostics)
    }
    return { css, diagnostics }
  }
}

export function transformWebCssCompat(
  css: string,
  options: WebCssCompatUserOptions | undefined,
  processing: TransformWebCssCompatProcessing = {},
) {
  return transformWebCssCompatResult(css, options, processing).css
}

export function transformWebCssSafeSelectors(
  css: string,
  options?: { escapeMap?: Record<string, string> | undefined } | undefined,
) {
  try {
    const root = postcss.parse(css)
    root.walkRules((rule) => {
      if (!rule.selector.includes('.')) {
        return
      }
      rule.selector = selectorParser((selectors) => {
        selectors.walkClasses((node) => {
          node.value = internalCssSelectorReplacer(node.value, options)
        })
      }).processSync(rule.selector)
    })
    return root.toString()
  }
  catch {
    return css
  }
}
