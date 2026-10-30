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
/** 本实验分支停用跨调用复用，仅用于隔离缓存对自然 GC 时序的影响。 */
export function analyzeCssSourceDirectives(source: string, options: TailwindCssDirectiveAnalysisOptions) {
  if (!source.includes('@')) {
    return emptyAnalysis
  }
  return analyzeTailwindCssDirectives(postcss.parse(source), options)
}
