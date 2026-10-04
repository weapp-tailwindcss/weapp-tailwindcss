import type { IJsHandlerOptions } from '../../../src/types'
import MagicString from 'magic-string'
import { parseSync } from 'oxc-parser'
import { walk } from 'oxc-walker'
import { jsStringEscape } from '../../../src/js/js-string-escape'
import { transformLiteralText } from '../../../src/js/literal-transform'

export interface ParseConfig {
  lang: 'js' | 'jsx' | 'ts' | 'tsx'
  sourceType: 'script' | 'module'
  preserveParens: boolean
}

interface Literal {
  kind: 'string' | 'template'
  start: number
  end: number
  value: string
  isConditionTest: boolean
}

interface Analysis {
  literals: Literal[]
  hasModuleDeclarations: boolean
  hasTaggedTemplate: boolean
}

/** 对照继续消费生产 literal-transform，独立验证 Rust 替换算法而非复写该算法。 */
export function analyzeReference(source: string, config: ParseConfig): Analysis | undefined {
  const result = parseSync(`fixture.${config.lang}`, source, { ...config, experimentalRawTransfer: true })
  if (result.errors.length > 0) {
    return undefined
  }
  const analysis: Analysis = { literals: [], hasModuleDeclarations: false, hasTaggedTemplate: false }
  const ancestors: any[] = []
  let unsupported = false
  walk(result.program, {
    enter(node: any) {
      const parent = ancestors.at(-1)
      if (['ImportDeclaration', 'ExportAllDeclaration', 'ExportNamedDeclaration', 'ExportDefaultDeclaration'].includes(node.type) && config.sourceType === 'script') {
        unsupported = true
      }
      if (node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration' || (node.type === 'ExportNamedDeclaration' && node.source !== null)) {
        analysis.hasModuleDeclarations = true
      }
      if (node.type === 'TaggedTemplateExpression') {
        analysis.hasTaggedTemplate = true
      }
      const value = node.type === 'Literal' && typeof node.value === 'string' && typeof node.raw === 'string'
        ? node.value
        : node.type === 'TemplateElement' ? node.value.raw : undefined
      if (parent?.type === 'JSXAttribute' && value?.includes('&')) {
        unsupported = true
      }
      const directive = parent?.type === 'ExpressionStatement' && typeof parent.directive === 'string' && parent.expression === node
      if (!directive && value !== undefined && node.start < node.end) {
        let current = node
        let isConditionTest = false
        for (let index = ancestors.length - 1; index >= 0; index--) {
          const ancestor = ancestors[index]
          if (ancestor.type === 'ConditionalExpression') {
            isConditionTest = ancestor.test === current
            break
          }
          if (!['BinaryExpression', 'CallExpression', 'LogicalExpression', 'MemberExpression', 'UnaryExpression'].includes(ancestor.type)) {
            break
          }
          current = ancestor
        }
        analysis.literals.push({ kind: node.type === 'TemplateElement' ? 'template' : 'string', start: node.start, end: node.end, value, isConditionTest })
      }
      ancestors.push(node)
    },
    leave() { ancestors.pop() },
  })
  return unsupported ? undefined : analysis
}

export function transformReference(source: string, analysis: Analysis, options: IJsHandlerOptions): string | undefined {
  if (source.includes('eval(') || (source.includes('weapp-tw') && source.includes('ignore'))
    || (options.moduleGraph && analysis.hasModuleDeclarations)
    || (options.ignoreTaggedTemplateExpressionIdentifiers?.length && analysis.hasTaggedTemplate)) {
    return undefined
  }
  const output = new MagicString(source)
  for (const literal of analysis.literals) {
    if (literal.isConditionTest) {
      continue
    }
    const transformed = transformLiteralText(literal.value, options, false)
    if (!transformed) {
      continue
    }
    let { start, end } = literal
    if (literal.kind === 'string') {
      start++
      end--
      if (start < end && transformed !== source.slice(start, end)) {
        output.update(start, end, jsStringEscape(transformed))
      }
    }
    else {
      start += source[start] === '`' || source[start] === '}' ? 1 : 0
      end -= source[end - 1] === '`' ? 1 : source[end - 1] === '{' ? 2 : 0
      if (start < end && transformed !== literal.value) {
        output.update(start, end, transformed)
      }
    }
  }
  return output.toString()
}
