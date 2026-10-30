import type { TailwindCssDirectiveAnalysis, TailwindCssDirectiveAnalysisOptions } from '../../../../generator-plugin/directives'
import { analyzeTailwindCssDirectives } from '../../../../generator-plugin/directives'
import { postcss } from '../../../../postcss-runtime'

const emptyAnalysis: TailwindCssDirectiveAnalysis = {
  hasLocalCssImport: false,
  hasTailwindApplyDirective: false,
  hasTailwindNonRootGenerationDirectives: false,
  hasTailwindRootDirectives: false,
  hasTailwindRootImportDirectives: false,
  hasTailwindSourceDirectives: false,
}
const cache = new Map<string, TailwindCssDirectiveAnalysis>()
const maxCharacters = 2_000_000
let characters = 0

/** 仅缓存字符串和布尔结果，避免规划阶段重复解析，也不延长 AST 与来源对象的寿命。 */
export function analyzeCssSourceDirectives(source: string, options: TailwindCssDirectiveAnalysisOptions) {
  if (!source.includes('@')) {
    return emptyAnalysis
  }
  const key = `${options.importFallback ? 1 : 0}${options.ignoreLayer ? 1 : 0}\0${source}`
  const cached = cache.get(key)
  if (cached) {
    cache.delete(key)
    cache.set(key, cached)
    return cached
  }
  const analysis = analyzeTailwindCssDirectives(postcss.parse(source), options)
  if (key.length <= maxCharacters) {
    while (cache.size >= 64 || characters + key.length > maxCharacters) {
      const oldest = cache.keys().next().value!
      cache.delete(oldest)
      characters -= oldest.length
    }
    cache.set(key, analysis)
    characters += key.length
  }
  return analysis
}
