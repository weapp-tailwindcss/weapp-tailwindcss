import type { Root } from 'postcss'
import { isTailwindCssImport, parseImportSourceParam } from '../syntax/css-import'
import { collectCssInlineSourceCandidates } from './inline-source'
import { parseConfigParam, parseSourceFileParam } from './params'

/** 只提取来源指令；默认扫描策略与配置加载由调用层决定。 */
export function describeCssSources(root: Root, isSourceImport = isTailwindCssImport) {
  const imports: Array<{ none?: boolean, sourcePath?: string | undefined }> = []
  const sources: Array<{ sourcePath: string, negated: boolean }> = []
  const configs: string[] = []
  root.walkAtRules((rule) => {
    if (rule.name === 'import' && isSourceImport(rule.params)) {
      imports.push(parseImportSourceParam(rule.params) ?? {})
    }
    else if (rule.name === 'source') {
      const source = parseSourceFileParam(rule.params)
      if (source) {
        sources.push(source)
      }
    }
    else if (rule.name === 'config') {
      const config = parseConfigParam(rule.params)
      if (config) {
        configs.push(config)
      }
    }
  })
  return { imports, sources, configs, inlineCandidates: collectCssInlineSourceCandidates(root) }
}
