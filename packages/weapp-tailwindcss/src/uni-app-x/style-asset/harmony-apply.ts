import { createUniAppXHarmonyApplyCssExpander } from '@weapp-tailwindcss/postcss/transform'

const SFC_STYLE_BLOCK_RE = /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi

export function expandUniAppXHarmonyApplyStyles(source: string, generatedCss: string) {
  if (!source.includes('@apply')) {
    return source
  }
  const expand = createUniAppXHarmonyApplyCssExpander(generatedCss)
  if (!expand) {
    return source
  }
  return source.replace(SFC_STYLE_BLOCK_RE, (_block, open: string, styleSource: string, close: string) => {
    return `${open}${expand(styleSource)}${close}`
  })
}
