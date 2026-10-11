import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import { analyzeCssCalcContext, collectCustomPropertyValues, isCssCalcCustomPropertySelected, mergeCustomPropertyValues } from '@weapp-tailwindcss/postcss/transform'

type GenerationStyleOptions = Partial<IStyleHandlerOptions>

export function hasCssCalcVariables(options?: GenerationStyleOptions) {
  const calc = options?.cssOptions?.cssCalc ?? options?.cssCalc
  const include = Array.isArray(calc) ? calc : calc && typeof calc === 'object' ? calc.includeCustomProperties : undefined
  return calc === true || calc === 'auto' || Boolean(include?.length)
}

export function resolveGenerationStyleContext(
  sourceCss: string,
  generatedCss: string,
  options?: GenerationStyleOptions,
): GenerationStyleOptions | undefined {
  // 完整产物的颜色等兼容处理会读取当前 AST；仅 calc 显式需要变量时额外收集上下文。
  if (!hasCssCalcVariables(options)) {
    return options
  }
  return {
    ...options,
    // 原始声明保留作用域身份，不能把推导值伪装成调用方显式常量。
    customPropertyContextCss: [options?.customPropertyContextCss, sourceCss, generatedCss].filter(Boolean).join('\n'),
  }
}

/** 增量 utility 不带主题声明；兼容转换单独补齐主题值，不能将其升级成 calc 常量。 */
export function resolveIncrementalStyleContext(
  sourceCss: string,
  generatedCss: string,
  options?: GenerationStyleOptions,
): GenerationStyleOptions {
  const customPropertyCompatibilityValues = collectCustomPropertyValues(sourceCss)
  mergeCustomPropertyValues(customPropertyCompatibilityValues, generatedCss)
  return {
    ...resolveGenerationStyleContext(sourceCss, generatedCss, options),
    customPropertyCompatibilityValues,
  }
}

/** 新增候选改变静态变量资格时，需要重算已有规则，不能只追加新 CSS。 */
export function hasChangedCssCalcContext(previousCss: string, nextCss: string, options?: GenerationStyleOptions) {
  if (!hasCssCalcVariables(options)) {
    return false
  }
  const calc = options?.cssOptions?.cssCalc ?? options?.cssCalc
  const include = Array.isArray(calc) ? calc : calc && typeof calc === 'object' ? calc.includeCustomProperties : undefined
  const selected = (name: string) => calc === true || calc === 'auto' || isCssCalcCustomPropertySelected(name, include)
  const values = (css: string) => {
    const context = [options?.customPropertyContextCss, css].filter(Boolean).join('\n')
    return new Map([...analyzeCssCalcContext(context, options?.customPropertyValues ?? (calc && typeof calc === 'object' && !Array.isArray(calc) ? calc.customPropertyValues : undefined)).customPropertyValues].filter(([name]) => selected(name)))
  }
  const previous = values(previousCss)
  const next = values(nextCss)
  return previous.size !== next.size || [...previous].some(([name, value]) => next.get(name) !== value)
}
