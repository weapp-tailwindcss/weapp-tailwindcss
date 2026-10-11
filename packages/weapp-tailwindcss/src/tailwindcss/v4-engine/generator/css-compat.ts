import type { TailwindV4GenerateTarget, TailwindV4ResolvedSource } from '../types'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { insertTailwindThemeCss, parseCssImportSpecifier, postcss, removeTailwindV4PreflightImports, removeUnsupportedThemeVendorKeyframes } from '@weapp-tailwindcss/postcss/transform'
import { createTailwindV4DefaultColorThemeCss } from '../tailwind-v4-default-colors'

const require = createRequire(import.meta.url)
const tailwindThemeCssCache = new Map<string, string>()

function readCachedCss(file: string) {
  const cached = tailwindThemeCssCache.get(file)
  if (cached !== undefined) {
    return cached
  }
  const css = readFileSync(file, 'utf8')
  tailwindThemeCssCache.set(file, css)
  return css
}

function resolveTailwindV4ThemeCssFromImport(css: string) {
  const root = postcss.parse(css)
  let resolved: string | undefined
  root.walkAtRules('import', (rule) => {
    if (resolved) {
      return
    }
    const specifier = parseCssImportSpecifier(rule.params)?.specifier
    if (!specifier || !path.isAbsolute(specifier) || path.basename(specifier) !== 'index.css') {
      return
    }
    const themeCss = path.join(path.dirname(specifier), 'theme.css')
    if (existsSync(themeCss)) {
      resolved = themeCss
    }
  })
  return resolved
}

function resolveTailwindV4ThemeCssFromBase(base: string) {
  try {
    const requireFromBase = createRequire(path.join(base, 'package.json'))
    return requireFromBase.resolve('tailwindcss/theme.css')
  }
  catch {
    try {
      return require.resolve('tailwindcss/theme.css')
    }
    catch {
      return undefined
    }
  }
}

function resolveTailwindV4DefaultThemeCss(source: TailwindV4ResolvedSource) {
  try {
    const themeCss = resolveTailwindV4ThemeCssFromImport(source.css)
      ?? resolveTailwindV4ThemeCssFromBase(source.base)
    return themeCss ? readCachedCss(themeCss) : createTailwindV4DefaultColorThemeCss()
  }
  catch {
    return createTailwindV4DefaultColorThemeCss()
  }
}

function applyMiniProgramTailwindV4DefaultColorCss(css: string, source: TailwindV4ResolvedSource) {
  const themeCss = resolveTailwindV4DefaultThemeCss(source)
  return insertTailwindThemeCss(css, themeCss)
}

export function createCompatibleSource(
  source: TailwindV4ResolvedSource,
  target: TailwindV4GenerateTarget,
) {
  const filteredSourceCss = target === 'weapp'
    ? removeTailwindV4PreflightImports(source.css)
    : source.css
  const sourceCss = target === 'weapp'
    ? applyMiniProgramTailwindV4DefaultColorCss(filteredSourceCss, source)
    : filteredSourceCss
  const compatibleSourceCss = removeUnsupportedThemeVendorKeyframes(sourceCss)
  return compatibleSourceCss === source.css ? source : { ...source, css: compatibleSourceCss }
}
