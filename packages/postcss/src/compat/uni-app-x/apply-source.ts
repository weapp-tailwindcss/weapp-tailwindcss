import type { Root } from '../../postcss-runtime'
import { postcss } from '../../postcss-runtime'
import { parseUniAppXStyleSource } from '../../syntax/index'

export function createUniAppXHarmonyApplyGeneratorSource(
  applyStyleSources: string[],
) {
  return applyStyleSources.map((source) => {
    let root: Root
    try {
      root = parseUniAppXStyleSource(source)
    }
    catch {
      return source
    }
    root.walkAtRules('reference', (rule) => {
      const match = rule.params.match(/^(['"])(.+?)\1/)
      if (match?.[2]?.startsWith('.')) {
        rule.remove()
      }
    })
    return root.toString()
  }).join('\n')
}

export function collectCssReferenceDirectives(source: string) {
  const references = new Set<string>()
  try {
    postcss.parse(source).walkAtRules('reference', (rule) => {
      const reference = rule.toString()
      references.add(reference.endsWith(';') ? reference : `${reference};`)
    })
  }
  catch {
  }
  return references
}
