import type { WebCssCompatUserOptions } from '../types'
import postcss from 'postcss'
import { getCssCustomPropertyName } from '../utils/css-custom-property'
import { normalizeWebCssCompatOptions } from './web-css'
import { normalizeWebGradientPositions } from './web-css-gradients'
import { collectRegisteredCustomPropertyFallbacks } from './web-css-registrations'

export interface WebCssGradientEdit {
  start: number
  end: number
  text: string
}

/** 在完整资产上分析渐变消费，仅返回精确文本编辑以保留构建器已有的来源映射。 */
export function collectWebCssGradientEdits(css: string, options?: WebCssCompatUserOptions): WebCssGradientEdit[] {
  const normalized = normalizeWebCssCompatOptions(options)
  if (normalized.preset !== 'legacy-web' && !Object.values(normalized.features).some(Boolean)) {
    return []
  }
  try {
    const root = postcss.parse(css)
    const inputOffset = root.source?.input.hasBOM ? 1 : 0
    const originals = new Map<postcss.Declaration, string>()
    root.walkDecls((decl) => {
      if (getCssCustomPropertyName(decl.prop) === '--tw-gradient-position') {
        originals.set(decl, decl.toString())
      }
    })
    if (originals.size === 0) {
      return []
    }
    normalizeWebGradientPositions(root, collectRegisteredCustomPropertyFallbacks(root))
    const edits: WebCssGradientEdit[] = []
    for (const [decl, before] of originals) {
      const after = decl.toString()
      const sourceOffset = decl.source?.start?.offset
      if (before === after || sourceOffset === undefined) {
        continue
      }
      const offset = inputOffset + sourceOffset
      if (css.slice(offset, offset + before.length) !== before) {
        continue
      }
      let start = 0
      while (start < before.length && start < after.length && before[start] === after[start]) {
        start++
      }
      let end = before.length
      let replacementEnd = after.length
      while (end > start && replacementEnd > start && before[end - 1] === after[replacementEnd - 1]) {
        end--
        replacementEnd--
      }
      edits.push({ start: offset + start, end: offset + end, text: after.slice(start, replacementEnd) })
    }
    return edits
  }
  catch {
    return []
  }
}
