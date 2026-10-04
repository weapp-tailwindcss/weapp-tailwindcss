import type { Declaration } from 'postcss'
import { loadNativeCssBinding, nativeCssConfigured } from '../../native/binding'
import { normalizeV4VariableFallbacksLegacy } from './declarations/variable-fallbacks'
import { getTailwindcssV4GradientFallback, normalizeTailwindcssV4GradientPositionLegacy, normalizeTailwindcssV4InfinityCalcValueLegacy } from './gradients'
import { CLAMP_PX, RADIUS_THRESHOLD, RADIUS_VALUE_RE, SCIENTIFIC_NOTATION_RE } from './variables'

// 对 Tailwind v4 生成的声明做兼容处理，返回是否发生变更
export function normalizeTailwindcssV4Declaration(decl: Declaration): boolean {
  if (decl.prop === '--tw-gradient-via-stops' && decl.value.trim() === 'initial') {
    decl.remove()
    return true
  }
  const gradientPosition = decl.prop === '--tw-gradient-position'
  const gradientFallback = gradientPosition && decl.parent?.type === 'rule' ? getTailwindcssV4GradientFallback(decl.parent) : undefined
  const native = nativeCssConfigured
    ? loadNativeCssBinding()?.normalizeV4Declaration(decl.value, { gradientPosition, gradientFallback, radius: decl.prop.includes('radius') })
    : undefined
  if (native !== undefined && native !== null) {
    if (native === decl.value) {
      return false
    }
    decl.value = native
    return true
  }
  return normalizeTailwindcssV4DeclarationLegacy(decl, gradientFallback)
}

/** 原生无法处理的输入沿用既有阶段顺序，不再尝试局部原生转换。 */
function normalizeTailwindcssV4DeclarationLegacy(decl: Declaration, gradientFallback?: string): boolean {
  let changed = false
  const normalizedVariableFallbacks = normalizeV4VariableFallbacksLegacy(decl.value)
  if (normalizedVariableFallbacks !== decl.value) {
    decl.value = normalizedVariableFallbacks
    changed = true
  }

  if (decl.prop === '--tw-gradient-position') {
    const nextValue = normalizeTailwindcssV4GradientPositionLegacy(decl.value) || gradientFallback || ''
    if (nextValue !== decl.value) {
      decl.value = nextValue
      return true
    }
  }

  const normalizedInfinityCalcValue = normalizeTailwindcssV4InfinityCalcValueLegacy(decl.value)
  if (normalizedInfinityCalcValue !== decl.value) {
    decl.value = normalizedInfinityCalcValue
    return true
  }

  if (decl.prop.includes('radius')) {
    RADIUS_VALUE_RE.lastIndex = 0
    const next = decl.value.replace(
      RADIUS_VALUE_RE,
      (m, num) => {
        const n = Number(num)
        if (!Number.isFinite(n)) {
          return `${CLAMP_PX}px`
        }
        if (SCIENTIFIC_NOTATION_RE.test(String(num)) || n > RADIUS_THRESHOLD) {
          return `${CLAMP_PX}px`
        }
        return m
      },
    )
    if (next !== decl.value) {
      decl.value = next
      return true
    }
  }

  return changed
}
