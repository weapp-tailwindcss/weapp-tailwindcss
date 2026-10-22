import type { WebCssCompatUserOptions } from '../types'
import postcss from 'postcss'
import { normalizeWebCssCompatOptions } from './web-css'
import { collectRegisteredCustomPropertyFallbacks, insertRegisteredCustomPropertyFallbackRule } from './web-css-registrations'

export interface WebCssPropertyFallbackEdit {
  start: number
  text: string
}

/** 在最终资产边界规划插入；同批资产的冲突或条件注册共同否决合成资格。 */
export function collectWebCssPropertyFallbackEdits(sources: readonly string[], options: WebCssCompatUserOptions | undefined): WebCssPropertyFallbackEdit[][] {
  const normalized = normalizeWebCssCompatOptions(options)
  if (!normalized.features.property) {
    return sources.map(() => [])
  }
  try {
    const roots = sources.map(css => postcss.parse(css))
    const registrations = roots.map(root => collectRegisteredCustomPropertyFallbacks(root))
    const combined: ReturnType<typeof collectRegisteredCustomPropertyFallbacks> = new Map()
    for (const registered of registrations) {
      for (const [property, signature] of registered) {
        if (!combined.has(property) || !signature) {
          combined.set(property, signature)
        }
      }
    }
    return roots.map((root, index) => {
      const sourceOffset = sources[index]!.length - root.source!.input.css.length
      const local = registrations[index]!
      for (const property of local.keys()) {
        local.set(property, combined.get(property))
      }
      insertRegisteredCustomPropertyFallbackRule(root, local, !normalized.features.layer)
      const grouped = new Map<number, string>()
      for (const [nodeIndex, node] of root.nodes.entries()) {
        if (node.source) {
          continue
        }
        const anchor = root.nodes.slice(nodeIndex + 1).find(next => next.source?.start?.offset !== undefined)
        const offset = anchor?.source?.start?.offset
        const start = offset === undefined ? sources[index]!.length : offset + sourceOffset
        const text = `${node.toString()}${node.type === 'atrule' && !node.nodes ? ';' : ''}\n`
        grouped.set(start, (grouped.get(start) ?? '\n') + text)
      }
      return [...grouped].map(([start, text]) => ({ start, text }))
    })
  }
  catch {
    // 无法完整分析同批注册时不猜测默认值，保留原始资产。
    return sources.map(() => [])
  }
}

/** 保留完整资产的原始字节布局，只插入本次分析确认安全的默认值。 */
export function finalizeWebCssPropertyFallbacks(sources: readonly string[], options: WebCssCompatUserOptions | undefined): string[] {
  const edits = collectWebCssPropertyFallbackEdits(sources, options)
  return sources.map((source, index) => {
    let css = source
    for (const edit of edits[index]!.toSorted((a, b) => b.start - a.start)) {
      css = css.slice(0, edit.start) + edit.text + css.slice(edit.start)
    }
    return css
  })
}
