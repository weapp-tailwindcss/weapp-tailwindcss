import type { RuntimeEntryType } from './runtime-snapshot'
import { createCssRuntimeAffectingSignature } from '@weapp-tailwindcss/postcss/transform'
import { Parser } from 'htmlparser2'
import { babelParse } from '@/js/babel/parse'
import { tryCreateJsRuntimeAffectingSignature } from './runtime-affecting-signature/js'

const JS_RUNTIME_AFFECTING_TEXT_HINT_RE = /["'`/]/
const JS_INCOMPLETE_TRAILING_OPERATOR_RE = /(?:=>|[=+\-*%&|^!~?:,.({[\]])\s*$/
const JS_AST_IGNORED_KEYS = new Set([
  'comments',
  'errors',
  'extra',
  'innerComments',
  'leadingComments',
  'loc',
  'tokens',
  'trailingComments',
])

interface AstNode {
  type: string
  [key: string]: unknown
}

function isAstNode(value: unknown): value is AstNode {
  return Boolean(value && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string')
}

function createHtmlRuntimeAffectingSignature(source: string) {
  try {
    const parts: string[] = []

    const parser = new Parser(
      {
        onattribute(name, value) {
          parts.push(`a:${name}=${value}`)
        },
        oncomment(data) {
          parts.push(`c:${data}`)
        },
        ontext(data) {
          const value = data.trim()
          if (value.length > 0) {
            parts.push(`t:${value}`)
          }
        },
      },
      {
        xmlMode: true,
      },
    )

    parser.write(source)
    parser.end()

    return parts.join('\n')
  }
  catch {
    return source
  }
}

function createJsRuntimeAffectingSignature(source: string) {
  if (
    !JS_RUNTIME_AFFECTING_TEXT_HINT_RE.test(source)
    && !JS_INCOMPLETE_TRAILING_OPERATOR_RE.test(source)
  ) {
    return ''
  }

  const fastSignature = tryCreateJsRuntimeAffectingSignature(source)
  if (fastSignature !== undefined) {
    return fastSignature
  }

  try {
    const ast = babelParse(source, {
      cache: true,
      cacheKey: 'st:unambiguous',
      plugins: ['jsx', 'typescript'],
      sourceType: 'unambiguous',
    })
    const parts: string[] = []

    const stack: AstNode[] = [ast as unknown as AstNode]
    while (stack.length > 0) {
      const node = stack.pop()!
      if (node.type === 'StringLiteral' && typeof node['value'] === 'string') {
        parts.push(`s:${node['value']}`)
      }
      else if (
        node.type === 'TemplateElement'
        && node['value']
        && typeof node['value'] === 'object'
        && 'raw' in node['value']
        && typeof node['value'].raw === 'string'
      ) {
        parts.push(`t:${node['value'].raw}`)
      }
      else if (node.type === 'JSXText' && typeof node['value'] === 'string') {
        const value = node['value'].trim()
        if (value.length > 0) {
          parts.push(`x:${value}`)
        }
      }

      const children: AstNode[] = []
      for (const [key, value] of Object.entries(node)) {
        if (JS_AST_IGNORED_KEYS.has(key)) {
          continue
        }
        if (Array.isArray(value)) {
          for (const item of value) {
            if (isAstNode(item)) {
              children.push(item)
            }
          }
        }
        else if (isAstNode(value)) {
          children.push(value)
        }
      }
      for (let index = children.length - 1; index >= 0; index--) {
        stack.push(children[index]!)
      }
    }

    const comments = (ast as unknown as { comments?: Array<{ value?: unknown }> }).comments
    if (Array.isArray(comments)) {
      for (const comment of comments) {
        if (typeof comment?.value === 'string' && comment.value.length > 0) {
          parts.push(`c:${comment.value}`)
        }
      }
    }

    return parts.join('\n')
  }
  catch {
    // 解析失败时退回原始源码，宁可多刷新也不要漏刷新。
    return source
  }
}

export function createRuntimeAffectingSourceSignature(source: string, type: RuntimeEntryType) {
  if (type === 'html') {
    return createHtmlRuntimeAffectingSignature(source)
  }

  if (type === 'js') {
    return createJsRuntimeAffectingSignature(source)
  }

  if (type === 'css') {
    return createCssRuntimeAffectingSignature(source)
  }

  return source
}
