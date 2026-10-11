import postcss from 'postcss'
import { removeUnsupportedCascadeLayers } from '../mini-program-css'
import { hasTailwindApplyDirective, hasTailwindRootDirectives, hasTailwindSourceDirectives, parseImportRequest } from '../tailwindcss-v4/user-css/directives'
import { hasTailwindGeneratedCss, hasTailwindGeneratedCssMarkers } from '../tailwindcss-v4/user-css/markers'
import { collectWebpackCssRuleIdentityMarkers } from './identity'

export function hasWebpackTailwindSourceDirectives(source: string | undefined) {
  return Boolean(source)
    && (
      hasTailwindRootDirectives(source!, { importFallback: true })
      || hasTailwindSourceDirectives(source!, { importFallback: true })
      || hasTailwindApplyDirective(source!)
      || hasTailwindGeneratedCss(source!)
      || hasTailwindGeneratedCssMarkers(source!)
    )
}

export function isWebpackTailwindImportRequest(request: string | undefined) {
  return request === 'tailwindcss'
    || request === 'tailwindcss4'
    || request?.startsWith('tailwindcss/')
    || request?.startsWith('tailwindcss4/')
    || request === 'weapp-tailwindcss'
    || request?.startsWith('weapp-tailwindcss/')
}

export function removeWebpackGeneratorNonTailwindImports(source: string | undefined) {
  if (!source?.includes('@import')) {
    return source
  }
  try {
    const root = postcss.parse(source)
    let changed = false
    root.walkAtRules('import', (rule) => {
      const request = parseImportRequest(rule.params)
      if (isWebpackTailwindImportRequest(request)) {
        return
      }
      rule.remove()
      changed = true
    })
    return changed ? root.toString() : source
  }
  catch {
    return source
  }
}

export function removeWebpackUserCssFallbackImports(source: string) {
  if (!source.includes('@import')) {
    return source
  }
  try {
    const root = postcss.parse(source)
    let changed = false
    root.walkAtRules('import', (rule) => {
      rule.remove()
      changed = true
    })
    return changed ? root.toString() : source
  }
  catch {
    return source
  }
}

export function normalizeWebpackUserCssFallbackSource(source: string) {
  const withoutImports = removeWebpackUserCssFallbackImports(source)
  if (!withoutImports.includes('@layer')) {
    return withoutImports
  }
  try {
    const root = postcss.parse(withoutImports)
    removeUnsupportedCascadeLayers(root)
    return root.toString()
  }
  catch {
    return withoutImports
  }
}

export function isWebpackCssSourceRepresentedInAsset(
  rawSource: string,
  sourceCss: string | undefined,
) {
  if (!sourceCss || !hasWebpackTailwindSourceDirectives(sourceCss)) {
    return false
  }
  const sourceMarkers = collectWebpackCssRuleIdentityMarkers(sourceCss)
  if (sourceMarkers.size === 0) {
    return false
  }
  const rawMarkers = collectWebpackCssRuleIdentityMarkers(rawSource)
  for (const marker of sourceMarkers) {
    if (!rawMarkers.has(marker)) {
      return false
    }
  }
  return true
}
