import type { ExpectedDeclaration } from '@weapp-tailwindcss/test-catalog'
import { postcss } from '../../packages/postcss/src/postcss-runtime'

export interface NativeGeneratedRule {
  classes: string[]
  declarations: ExpectedDeclaration[]
  variables: Record<string, string>
}

export function generatedRules(css: string) {
  const root = postcss.parse(css)
  const globalVariables: Record<string, string> = {}
  root.walkRules((rule) => {
    if (!/:root|:host/.test(rule.selector)) {
      return
    }
    rule.walkDecls((decl) => {
      if (decl.prop.startsWith('--')) {
        globalVariables[decl.prop] = decl.value
      }
    })
  })
  const rules: NativeGeneratedRule[] = []
  root.walkRules((rule) => {
    const classes = [...rule.selector.matchAll(/\.((?:\\.|[^\s.#:[>+~])+)/g)].map(match => match[1]
      .replace(/\\([0-9a-f]{1,6})\s?/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
      .replace(/\\(.)/g, '$1'))
    const declarations: ExpectedDeclaration[] = []
    const variables = { ...globalVariables }
    rule.walkDecls((decl) => {
      declarations.push({ property: decl.prop, value: decl.value, ...(decl.important ? { important: true } : {}) })
      if (decl.prop.startsWith('--')) {
        variables[decl.prop] = decl.value
      }
    })
    rules.push({ classes, declarations, variables })
  })
  return rules
}

function normalizeValue(property: string, value: string, variables: Record<string, string>) {
  let resolved = value.trim()
  for (let pass = 0; pass < 12 && resolved.includes('var('); pass++) {
    const next = resolved.replace(/var\((--[\w-]+)(?:,([^()]*))?\)/g, (original, key: string, fallback: string | undefined) => variables[key] ?? fallback?.trim() ?? original)
    if (next === resolved) {
      break
    }
    resolved = next
  }
  resolved = resolved.replace(/(-?(?:\d+(?:\.\d+)?|\.\d+))rem\b/g, (_, value: string) => `${Number(value) * 16}px`)
  resolved = resolved.replace(/^calc\(\s*(-?[\d.]+)\s*\/\s*([\d.]+)\s*\*\s*([\d.]+)%\s*\)$/i, (original, numerator: string, denominator: string, percentage: string) => Number(denominator) > 0 ? `${Number(numerator) / Number(denominator) * Number(percentage)}%` : original)
  // 黑色与透明色混合只有 alpha 变化，此处用固定数学语义独立验证，不调用被测转换器。
  resolved = resolved.replace(/^color-mix\(in (?:srgb|oklab),\s*#(?:000|000000)\s+([\d.]+)%,\s*transparent\)$/i, (original, percentage: string) => Number(percentage) >= 0 && Number(percentage) <= 100 ? `rgba(0,0,0,${Number(percentage) / 100})` : original)
  for (let pass = 0; pass < 8 && resolved.includes('calc('); pass++) {
    const next = resolved.replace(/calc\(\s*(-?[\d.]+)(px|%)?\s*\*\s*(-?[\d.]+)\s*\)/g, (_, left: string, unit = '', right: string) => `${Number(left) * Number(right)}${unit}`)
    if (next === resolved) {
      break
    }
    resolved = next
  }
  if (property === 'opacity' && resolved.endsWith('%')) {
    resolved = String(Number.parseFloat(resolved) / 100)
  }
  return resolved.toLowerCase().replace(/\s+/g, '').replace(/#ffffff\b/g, '#fff').replace(/#000000\b/g, '#000')
}

/** 作者选择器只允许显式登记的指令夹具；普通候选仍须由生成器精确确认。 */
export function generatedCandidatePresent(candidate: string, classSet: readonly string[], rules: readonly NativeGeneratedRule[]) {
  const authored = new Set(['lynx-at-variant', 'lynx-applied', 'lynx-reference'])
  return classSet.includes(candidate) || (authored.has(candidate) && rules.some(rule => rule.classes.includes(candidate) && rule.declarations.length > 0))
}

export function matchGeneratedDeclaration(rules: NativeGeneratedRule[], expected: ExpectedDeclaration) {
  return rules.flatMap(rule => rule.declarations.map(actual => ({ actual, variables: rule.variables })))
    .find(({ actual, variables }) => actual.property === expected.property
      && (!expected.important || actual.important)
      && (expected.value === undefined || (actual.value !== undefined
        && normalizeValue(actual.property, actual.value, variables) === normalizeValue(expected.property, expected.value, variables))))
    ?.actual
}

export { styleContains } from '../../examples/react-native-expo/src/compatibility/protocol'
