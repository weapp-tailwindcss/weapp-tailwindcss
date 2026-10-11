import { postcss } from '../../postcss-runtime'
import { parseCssImportSpecifier } from '../../syntax/index'

function normalizeTailwindImportSpecifier(params: string) {
  return parseCssImportSpecifier(params)?.specifier.replaceAll('\\', '/')
}

export function isTailwindV4CssImportParam(params: string) {
  const specifier = normalizeTailwindImportSpecifier(params)
  return specifier === 'tailwindcss'
    || specifier === 'tailwindcss4'
    || specifier?.startsWith('tailwindcss/') === true
    || specifier?.startsWith('tailwindcss4/') === true
    || specifier?.endsWith('/tailwindcss/index.css') === true
}

export function isTailwindV4PreflightImportParam(params: string) {
  const specifier = normalizeTailwindImportSpecifier(params)
  return specifier === 'tailwindcss'
    || specifier === 'tailwindcss4'
    || specifier === 'tailwindcss/preflight'
    || specifier === 'tailwindcss/preflight.css'
    || specifier === 'tailwindcss4/preflight'
    || specifier === 'tailwindcss4/preflight.css'
    || specifier?.endsWith('/tailwindcss/index.css') === true
    || specifier?.endsWith('/tailwindcss/preflight.css') === true
}

export function includesTailwindV4PreflightDirective(css: string) {
  try {
    const root = postcss.parse(css)
    let includesPreflight = false
    root.walkAtRules('import', (rule) => {
      includesPreflight ||= isTailwindV4PreflightImportParam(rule.params)
    })
    root.walkAtRules('tailwind', (rule) => {
      includesPreflight ||= rule.params.trim() === 'base'
    })
    return includesPreflight
  }
  catch {
    return /@import\s+(?:url\(\s*)?["']?tailwindcss4?(?:\/(?:preflight(?:\.css)?|index\.css))?["')\s;]/.test(css)
      || /@tailwind\s+base\b/.test(css)
  }
}
