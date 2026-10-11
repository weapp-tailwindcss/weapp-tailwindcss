import { postcss } from '../../../../postcss-runtime'
import { extractConfigRequestFromSource, extractTailwindSourceForPostcssFallback } from './fallback'
import { hasGeneratedCssArtifacts, hasPreprocessorOnlySyntax, isTailwindGenerationDirective, normalizeTailwindImportAtRules, parseConfigRequest, resolveConfigPath } from './shared'

export function resolveCssEntrySource(
  rawSource: string,
  base: string,
  options: { removeConfig?: boolean, importFallback?: boolean } = {},
) {
  try {
    const root = postcss.parse(rawSource)
    const normalizedImports = normalizeTailwindImportAtRules(root, options)
    let found = false
    let config: string | undefined
    let configRequest: string | undefined
    let removedConfig = false
    const removeConfig = options.removeConfig ?? true
    const ignoreLayer = hasGeneratedCssArtifacts(rawSource)
    root.walk((node) => {
      if (isTailwindGenerationDirective(node, { ...options, ignoreLayer })) {
        found = true
      }
      if (node.type === 'atrule' && node.name === 'config') {
        const configPath = parseConfigRequest(node.params)
        if (configPath && !config) {
          configRequest = configPath
          config = resolveConfigPath(base, configPath)
        }
        if (removeConfig) {
          node.remove()
          removedConfig = true
        }
      }
    })
    if (!found) {
      return undefined
    }
    if (hasPreprocessorOnlySyntax(rawSource)) {
      const css = extractTailwindSourceForPostcssFallback(rawSource, { ...options, removeConfig })
      if (css) {
        return {
          css,
          config,
          configRequest,
          base,
        }
      }
    }
    return {
      css: removedConfig || normalizedImports ? root.toString() : rawSource,
      config,
      configRequest,
      base,
    }
  }
  catch {
    const css = extractTailwindSourceForPostcssFallback(rawSource, options)
    const configRequest = extractConfigRequestFromSource(rawSource)
    const config = configRequest ? resolveConfigPath(base, configRequest) : undefined
    return css
      ? {
          css,
          config,
          configRequest,
          base,
        }
      : undefined
  }
}
