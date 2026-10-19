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

export function matchGeneratedDeclaration(rules: NativeGeneratedRule[], expected: ExpectedDeclaration) {
  return rules.flatMap(rule => rule.declarations.map(actual => ({ actual, variables: rule.variables })))
    .find(({ actual, variables }) => actual.property === expected.property
      && (!expected.important || actual.important)
      && (expected.value === undefined || (actual.value !== undefined
        && normalizeValue(actual.property, actual.value, variables) === normalizeValue(expected.property, expected.value, variables))))
    ?.actual
}

export { styleContains } from '../../examples/react-native-expo/src/compatibility/protocol'
