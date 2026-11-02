import { NodeTypes, parse } from '@vue/compiler-dom'
import { extractSvelteStyleBlocks } from './svelte'

export interface SfcBlock {
  type: string
  attrs: string
  attributes: Record<string, string | true>
  content: string
  start: number
  end: number
  blockStart: number
  blockEnd: number
  selfClosing: boolean
}

export interface SfcStyleBlock {
  attrs: string
  index: number
  scoped: boolean
  source: string
  src?: string | true
  lang?: string
}

/** 仅以顶层块建立 SFC 边界，内容与位置均保留原文。 */
export function parseVueLikeSfc(source: string) {
  const errors: unknown[] = []
  const root = parse(source, { parseMode: 'sfc', comments: true, onError: error => errors.push(error) })
  const blocks: SfcBlock[] = []
  let complete = true
  for (const node of root.children) {
    if (node.type === NodeTypes.COMMENT || (node.type === NodeTypes.TEXT && !node.content.trim())) {
      continue
    }
    if (node.type !== NodeTypes.ELEMENT) {
      complete = false
      continue
    }
    const start = node.innerLoc?.start.offset ?? node.loc.end.offset
    const end = node.innerLoc?.end.offset ?? start
    const attrsEnd = node.isSelfClosing ? node.loc.end.offset - 2 : start - 1
    const attributes: Record<string, string | true> = Object.create(null)
    for (const prop of node.props) {
      if (prop.type === NodeTypes.ATTRIBUTE) {
        attributes[prop.name] = prop.value?.content ?? true
      }
    }
    blocks.push({
      type: node.tag,
      attrs: source.slice(node.loc.start.offset + node.tag.length + 1, attrsEnd),
      attributes,
      content: source.slice(start, end),
      start,
      end,
      blockStart: node.loc.start.offset,
      blockEnd: node.loc.end.offset,
      selfClosing: node.isSelfClosing === true,
    })
  }
  return { blocks, errors, complete: complete && errors.length === 0 && blocks.length > 0 }
}

export function isSfcSourceFile(filename: string) {
  return /\.(?:vue|uvue|nvue|mpx|svelte)$/i.test(filename.replace(/[?#].*$/, ''))
}

/** 按明确的源码格式选择解析器；Svelte 保留独立适配。 */
export function extractSfcStyleBlocks(source: string, filename: string): SfcStyleBlock[] {
  if (/\.svelte$/i.test(filename.replace(/[?#].*$/, ''))) {
    return extractSvelteStyleBlocks(source)
  }
  const parsed = parseVueLikeSfc(source)
  if (!parsed.complete) {
    return []
  }
  // 与 Vue 原生描述符的 ignoreEmpty 默认契约一致；src 空块仍占索引。
  return parsed.blocks.filter(block => block.type === 'style'
    && (block.content.trim().length > 0 || block.attributes['src'] !== undefined)).map((block, index) => ({
    attrs: block.attrs,
    index,
    scoped: block.attributes['scoped'] !== undefined,
    source: block.content,
    ...(block.attributes['src'] === undefined ? {} : { src: block.attributes['src'] }),
    ...(typeof block.attributes['lang'] === 'string' ? { lang: block.attributes['lang'] } : {}),
  }))
}
