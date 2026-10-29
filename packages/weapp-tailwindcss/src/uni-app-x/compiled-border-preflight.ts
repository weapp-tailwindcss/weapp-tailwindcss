import type { Expression } from '@babel/types'
import type { CssPreflightOptions } from '@/types'
import { postcss } from '@weapp-tailwindcss/postcss/transform'
import { Parser } from 'htmlparser2'
import MagicString from 'magic-string'
import { parseExpression } from '@/babel'
import { Tokenizer } from '@/wxml/Tokenizer'
import { BORDER_PREFLIGHT_CLASS, createUniAppXBorderPreflight } from './border-preflight'

/** 只授权当前组件确实拥有的基础规则，不借用其他组件或全局样式。 */
export function hasCompiledBorderPreflight(css: string, options?: CssPreflightOptions) {
  if (options === false || (options && !createUniAppXBorderPreflight(options))) {
    return false
  }
  if (!css.includes(BORDER_PREFLIGHT_CLASS)) {
    return false
  }
  const selectors = new Set([`.${BORDER_PREFLIGHT_CLASS}`, `.${BORDER_PREFLIGHT_CLASS}.${BORDER_PREFLIGHT_CLASS}`])
  return postcss.parse(css).nodes.some(node => node.type === 'rule' && selectors.has(node.selector)
    && node.nodes.some(child => child.type === 'decl' && (child.prop === 'border' || child.prop.startsWith('border-'))))
}

function hasStaticReset(value: string) {
  if (!value.includes(BORDER_PREFLIGHT_CLASS)) {
    return false
  }
  const includesReset = (value: string) => value.split(/\s+/).includes(BORDER_PREFLIGHT_CLASS)
  const containsLiteral = (expression: Expression): boolean => expression.type === 'StringLiteral'
    ? includesReset(expression.value)
    : expression.type === 'ArrayExpression' && expression.elements.some(item => item && item.type !== 'SpreadElement' && containsLiteral(item))
  for (const token of new Tokenizer().run(value)) {
    if (token.expressions.length === 0 && includesReset(token.value)) {
      return true
    }
    for (const expression of token.expressions) {
      try {
        if (containsLiteral(parseExpression(expression.value.slice(2, -2)))) {
          return true
        }
      }
      catch {
        // 未知绑定保留原文，并添加独立静态基础类。
      }
    }
  }
  return false
}

/** 在框架完成 HTML 标签映射后，按实际小程序宿主补齐基础类。 */
export function injectCompiledBorderPreflight(source: string, range?: 'all') {
  const ms = new MagicString(source)
  let tagEnd = 0
  let eligible = false
  let hasClass = false
  let rawTextDepth = 0
  const scriptTags = new Set(['wxs', 'sjs', 'import-sjs', 'filter'])
  const declarationTags = new Set(['template', 'slot', 'block', 'import', 'include', ...scriptTags])
  const parser = new Parser({
    onopentagname(tag) {
      tagEnd = parser.startIndex + tag.length + 1
      eligible = rawTextDepth === 0 && (range === 'all' ? !declarationTags.has(tag) : tag === 'view' || tag === 'text')
      if (rawTextDepth > 0 || scriptTags.has(tag)) {
        rawTextDepth++
      }
      hasClass = false
    },
    onattribute(name, value, quote) {
      if (!eligible || name !== 'class') {
        return
      }
      hasClass = true
      if (hasStaticReset(value)) {
        return
      }
      const start = parser.startIndex + name.length
      if (quote === undefined) {
        ms.appendLeft(start, `="${BORDER_PREFLIGHT_CLASS}"`)
      }
      else if (quote === null) {
        const raw = source.slice(parser.startIndex, parser.endIndex)
        const valueStart = parser.startIndex + raw.indexOf('=') + 1
        ms.prependRight(valueStart, `"${BORDER_PREFLIGHT_CLASS} `)
        const valueEnd = parser.endIndex - (source[parser.endIndex - 1] === '/' ? 1 : 0)
        ms.appendLeft(valueEnd, '"')
      }
      else {
        const raw = source.slice(parser.startIndex, parser.endIndex)
        ms.prependRight(parser.startIndex + raw.indexOf(quote) + 1, `${BORDER_PREFLIGHT_CLASS}${value ? ' ' : ''}`)
      }
    },
    onopentag() {
      if (eligible && !hasClass) {
        ms.appendLeft(tagEnd, ` class="${BORDER_PREFLIGHT_CLASS}"`)
      }
    },
    onclosetag() {
      if (rawTextDepth > 0) {
        rawTextDepth--
      }
    },
  }, { xmlMode: true, decodeEntities: false })
  parser.end(source)
  return ms.toString()
}
