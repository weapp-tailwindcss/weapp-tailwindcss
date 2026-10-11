import { createCssSourceOrderAppend } from '../../generator-plugin/local-imports'
import { filterExistingCssRules, mergeCoveredCssRuleDeclarations } from '../../vite-css-rules'

interface ProcessedCssSource {
  css: string
  processed: boolean
}

export function composeProcessedCssSources(
  ...sources: Array<ProcessedCssSource | undefined>
): ProcessedCssSource | undefined {
  const parts = sources.filter((source): source is ProcessedCssSource =>
    source !== undefined && source.css.trim().length > 0)
  if (parts.length === 0) {
    return undefined
  }
  let css = ''
  const usedParts: ProcessedCssSource[] = []
  for (const source of parts) {
    const merged = css.trim().length > 0
      ? mergeCoveredCssRuleDeclarations(css, source.css)
      : undefined
    if (merged?.changed) {
      css = merged.baseCss
    }
    const nextCss = css.trim().length > 0
      ? filterExistingCssRules(css, merged?.css ?? source.css)
      : source.css
    const hasNextCss = nextCss.trim().length > 0
    if (!hasNextCss) {
      continue
    }
    css = createCssSourceOrderAppend(css, nextCss)
    usedParts.push(source)
  }
  return {
    css,
    processed: usedParts.every(source => source.processed),
  }
}
