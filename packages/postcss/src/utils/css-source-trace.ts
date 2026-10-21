import { postcss } from '../postcss-runtime'
import { readSelectorClasses } from './css-selector-classes'

export interface CssTokenSource {
  token: string
  sources: string[]
}

export type CssTokenSourceMap = Map<string, CssTokenSource>

const CSS_SOURCE_TRACE_COMMENT_RE = /^\s*(?:!\s*)?tokens:\s*/i

/** 同时读取历史普通注释和经过压缩的重要追踪注释。 */
export function readCssSourceTraceComment(text: string) {
  const match = CSS_SOURCE_TRACE_COMMENT_RE.exec(text)
  return match ? text.slice(match[0].length).trim() : undefined
}

/** 删除或迁移宿主时仅处理完整生成协议，保留作者 tokens 说明。 */
export function isCssSourceTraceComment(text: string) {
  const trace = readCssSourceTraceComment(text)
  return trace !== undefined && trace.split(' | ').every((entry) => {
    const delimiter = entry.indexOf('<=')
    return delimiter > 0 && Boolean(entry.slice(0, delimiter).trim()) && Boolean(entry.slice(delimiter + 2).trim())
  })
}

/** 来源属于紧邻的宿主；合并声明时同步迁移，删除时不能漂到下一节点。 */
export function removeCssRuleWithSourceTrace(rule: postcss.Rule, target?: postcss.Rule) {
  const comments: postcss.Comment[] = []
  let previous = rule.prev()
  while (previous?.type === 'comment' && isCssSourceTraceComment(previous.text)) {
    comments.unshift(previous)
    previous = previous.prev()
  }
  const targetTraces = new Set<string>()
  previous = target?.prev()
  while (previous?.type === 'comment' && isCssSourceTraceComment(previous.text)) {
    targetTraces.add(readCssSourceTraceComment(previous.text)!)
    previous = previous.prev()
  }
  let transferred = false
  for (const comment of comments) {
    const trace = readCssSourceTraceComment(comment.text)!
    if (target?.parent && !targetTraces.has(trace)) {
      target.before(comment)
      targetTraces.add(trace)
      transferred = true
    }
    else {
      comment.remove()
    }
  }
  rule.remove()
  return transferred
}

export function isTailwindGeneratedContainerTraceComment(text: string) {
  const trace = readCssSourceTraceComment(text.toLowerCase())
  return trace !== undefined && /^container\s*<=\s*<tailwind generated>\s*$/i.test(trace)
}

/** 只读取真实 CSS 注释，避免压缩到同一行的多个追踪互相吞并。 */
export function collectCssTokenSourcePaths(css: string) {
  const sources = new Set<string>()
  if (!/tokens:/i.test(css)) {
    return sources
  }
  try {
    postcss.parse(css).walkComments((comment) => {
      const trace = readCssSourceTraceComment(comment.text)
      if (trace === undefined) {
        return
      }
      for (const entry of trace.split(' | ')) {
        const delimiter = entry.indexOf('<=')
        if (delimiter < 0) {
          continue
        }
        for (const source of entry.slice(delimiter + 2).split(',')) {
          const file = source.trim()
          if (file && file !== '<tailwind generated>') {
            sources.add(file)
          }
        }
      }
    })
  }
  catch {
    // 不完整 CSS 不提供来源证据，调用方继续使用构建图中的来源关系。
  }
  return sources
}

function collectRuleSourceTokens(rule: postcss.Rule, tokenSources: CssTokenSourceMap) {
  const tokens = new Map<string, CssTokenSource>()
  for (const node of readSelectorClasses(rule.selector)) {
    const source = tokenSources.get(node.value) ?? tokenSources.get(node.raw)
    if (source) {
      tokens.set(source.token, source)
    }
  }
  return tokens
}

function removeTracedTailwindGeneratedContainerRules(root: postcss.Root) {
  root.walkRules((rule) => {
    if (!rule.selectors || rule.selectors.length !== 1 || rule.selectors[0] !== '.container') {
      return
    }
    const previous = rule.prev()
    if (previous?.type !== 'comment' || !isTailwindGeneratedContainerTraceComment(previous.text)) {
      return
    }
    previous.remove()
    rule.remove()
  })
}

function normalizeTraceCommentBefore(value: string | undefined) {
  return value?.includes('\n') ? value : '\n'
}

function traceText(tokens: Map<string, CssTokenSource>) {
  const lines = [...tokens.values()].map(({ token, sources }) => {
    return `${token} <= ${sources.length > 0 ? sources.join(', ') : '<tailwind generated>'}`
  })
  return `! tokens: ${lines.join(' | ')}`
}

/** 仅提供注释的精确编辑范围，交由构建器保留原 CSS 正文及映射。 */
export function collectCssTokenSourceTraceEdits(css: string, tokenSources: CssTokenSourceMap | undefined) {
  const edits: Array<{ start: number, end: number, text: string }> = []
  if (!tokenSources?.size) {
    return edits
  }
  let root: postcss.Root
  try {
    root = postcss.parse(css)
  }
  catch {
    return edits
  }
  // PostCSS Input 会剥除 BOM，构建器的 Source 仍包含原始前缀。
  const sourceOffset = css.length - root.source!.input.css.length
  const stale = new Set<postcss.Comment>()
  root.walkComments((comment) => {
    if (isCssSourceTraceComment(comment.text)) {
      stale.add(comment)
    }
  })
  root.walkRules((rule) => {
    const tokens = collectRuleSourceTokens(rule, tokenSources)
    const start = rule.source?.start?.offset
    if (tokens.size === 0 || start === undefined) {
      return
    }
    const text = `/*${traceText(tokens)} */`
    const previous = rule.prev()
    if (previous?.type === 'comment' && stale.has(previous)) {
      stale.delete(previous)
      if (previous.toString() !== text) {
        edits.push({ start: previous.source!.start!.offset! + sourceOffset, end: previous.source!.end!.offset! + sourceOffset, text })
      }
    }
    else {
      const indent = rule.raws.before?.match(/[^\S\r\n]*$/)?.[0] ?? ''
      edits.push({ start: start + sourceOffset, end: start + sourceOffset, text: `${text}\n${indent}` })
    }
  })
  for (const comment of stale) {
    edits.push({ start: comment.source!.start!.offset! + sourceOffset, end: comment.source!.end!.offset! + sourceOffset, text: '' })
  }
  return edits
}

export function annotateCssTokenSources(
  css: string,
  tokenSources: CssTokenSourceMap,
) {
  if (!tokenSources.size) {
    return css
  }

  try {
    const root = postcss.parse(css)
    root.walkComments((comment) => {
      if (isCssSourceTraceComment(comment.text)) {
        comment.remove()
      }
    })
    root.walkRules((rule) => {
      const tokens = collectRuleSourceTokens(rule, tokenSources)
      if (tokens.size === 0 || !rule.parent) {
        return
      }
      const comment = postcss.comment({ text: traceText(tokens) })
      // 压缩器按紧邻 /* 的 ! 保留显式开启的来源证据。
      comment.raws.left = ''
      comment.raws.before = normalizeTraceCommentBefore(rule.raws.before)
      rule.raws.before = '\n'
      rule.parent.insertBefore(rule, comment)
    })
    removeTracedTailwindGeneratedContainerRules(root)
    return root.toString()
  }
  catch {
    return css
  }
}
