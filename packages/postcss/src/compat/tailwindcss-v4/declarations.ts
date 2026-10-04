import type { Declaration } from 'postcss'
import { normalizeV4VariableFallbacks } from './declarations/variable-fallbacks'
import { normalizeTailwindcssV4GradientDirectionDeclaration, normalizeTailwindcssV4GradientPosition, normalizeTailwindcssV4InfinityCalcValue } from './gradients'
import { CLAMP_PX, RADIUS_THRESHOLD, RADIUS_VALUE_RE, SCIENTIFIC_NOTATION_RE } from './variables'

// 对 Tailwind v4 生成的声明做兼容处理，返回是否发生变更
export function normalizeTailwindcssV4Declaration(decl: Declaration): boolean {
  let changed = false
  if (decl.prop === '--tw-gradient-via-stops' && decl.value.trim() === 'initial') {
    decl.remove()
    return true
  }
  const normalizedVariableFallbacks = normalizeV4VariableFallbacks(decl.value)
  if (normalizedVariableFallbacks !== decl.value) {
    decl.value = normalizedVariableFallbacks
    changed = true
  }

  if (decl.prop === '--tw-gradient-position') {
    const nextValue = decl.parent?.type === 'rule'
      ? normalizeTailwindcssV4GradientDirectionDeclaration(decl.parent, decl)
      : normalizeTailwindcssV4GradientPosition(decl.value)
    if (nextValue !== decl.value) {
      decl.value = nextValue
      return true
    }
  }

  const normalizedInfinityCalcValue = normalizeTailwindcssV4InfinityCalcValue(decl.value)
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
