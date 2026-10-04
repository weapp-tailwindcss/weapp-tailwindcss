import type { IJsHandlerOptions } from '../../types'
import type { SourceAnalysis } from './types'
import { LRUCache } from 'lru-cache'
import { walk } from 'oxc-walker'
import { loadNativeCompiler } from '../../native'
import { parseOxcSync } from '../oxc-parser'
import { isClassContextLiteral } from './class-context'
import { getParserLang, getParserSourceType } from './parser-options'

export type { LiteralSpan } from './types'

const MAX_ANALYSIS_BYTES = 2 * 1024 * 1024
const analysisCache = new LRUCache<string, SourceAnalysis>({ max: 128, maxSize: MAX_ANALYSIS_BYTES })

function cacheAnalysis(key: string, analysis: SourceAnalysis) {
  const size = analysis.literals.reduce((total, literal) => total + 104 + literal.value.length * 2, key.length * 2)
  if (size <= MAX_ANALYSIS_BYTES) {
    analysisCache.set(key, analysis, { size })
  }
  return analysis
}

function isConditionTestLiteral(node: object, ancestors: readonly object[]) {
  let current = node

  for (let index = ancestors.length - 1; index >= 0; index--) {
    const parent = ancestors[index] as { type?: string, test?: unknown }
    if (parent.type === 'ConditionalExpression') {
      return parent.test === current
    }
    if (
      parent.type === 'BinaryExpression'
      || parent.type === 'CallExpression'
      || parent.type === 'LogicalExpression'
      || parent.type === 'MemberExpression'
      || parent.type === 'UnaryExpression'
    ) {
      current = parent
      continue
    }
    return false
  }

  return false
}

/** 只缓存与 classSet 无关的字面量事实；完整 AST 在本次解析后释放。 */
export function getOxcSourceAnalysis(rawSource: string, options: IJsHandlerOptions): SourceAnalysis | undefined {
  const lang = getParserLang(options)
  const sourceType = getParserSourceType(options)
  const preserveParens = options.babelParserOptions?.createParenthesizedExpressions === true
  // 加载检查必须先于缓存，required 模式不能命中先前的 JS 回退结果。
  const compiler = loadNativeCompiler()
  const key = `${compiler ? 'native' : 'oxc'}:${lang}:${sourceType}:${preserveParens}:${rawSource}`
  const cached = analysisCache.get(key)
  if (cached) {
    return cached
  }
  if (compiler) {
    // null 表示语义不支持；原生执行异常直接上抛，不能伪装为兼容回退。
    const analysis = compiler.analyzeJs(rawSource, lang, sourceType, preserveParens)
    if (analysis !== null) {
      return cacheAnalysis(key, analysis)
    }
  }
  try {
    const result = parseOxcSync(options.filename ?? 'weapp-tailwindcss.js', rawSource, {
      sourceType,
      lang,
      // 与 Babel 的括号节点选项保持一致，避免改变条件测试的父节点链。
      preserveParens,
    })
    if (!result || !result.program || result.errors.length > 0) {
      return undefined
    }
    const analysis: SourceAnalysis = {
      literals: [],
      // 当前模块图不沿 CommonJS require 建图，ESM 声明仍交给 Babel。
      hasModuleDeclarations: false,
      hasTaggedTemplate: false,
    }
    let requiresBabel = false
    const ancestors: object[] = []
    walk(result.program, {
      enter(node) {
        // Oxc 在 script 模式下仍可能接受 ESM；交给 Babel 执行调用方的语法约束。
        if (sourceType === 'script' && (node.type === 'ImportDeclaration' || node.type.startsWith('Export'))) {
          requiresBabel = true
        }
        if (node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration'
          || (node.type === 'ExportNamedDeclaration' && node.source !== null)) {
          analysis.hasModuleDeclarations = true
        }
        if (node.type === 'TaggedTemplateExpression') {
          analysis.hasTaggedTemplate = true
        }
        if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'eval') {
          requiresBabel = true
        }
        const value = node.type === 'Literal' && typeof node.value === 'string' && typeof node.raw === 'string'
          ? node.value
          : node.type === 'TemplateElement' ? node.value.raw : undefined
        const parent = ancestors.at(-1) as { type?: string, directive?: unknown, expression?: unknown } | undefined
        const isDirective = parent?.type === 'ExpressionStatement'
          && typeof parent.directive === 'string' && parent.expression === node
        // JSX 实体由 Babel 解码，避免在快速路径重复维护 HTML 实体解析规则。
        if (parent?.type === 'JSXAttribute' && value?.includes('&')) {
          requiresBabel = true
        }
        if (!isDirective && value !== undefined && typeof node.start === 'number' && typeof node.end === 'number' && node.start < node.end) {
          // TS ESTree 的 quasi 包含边界标点，统一正文区间后再排除空片段。
          const start = node.start + (node.type === 'TemplateElement' && (lang === 'ts' || lang === 'tsx') ? 1 : 0)
          const end = node.end - (node.type === 'TemplateElement' && (lang === 'ts' || lang === 'tsx') ? node.tail ? 1 : 2 : 0)
          if (start < end) {
            analysis.literals.push({
              kind: node.type === 'TemplateElement' ? 'template' : 'string',
              start,
              end,
              value,
              isConditionTest: isConditionTestLiteral(node, ancestors),
              classContext: isClassContextLiteral(node, ancestors),
            })
          }
        }
        ancestors.push(node)
      },
      leave() {
        ancestors.pop()
      },
    })
    if (requiresBabel) {
      return undefined
    }
    return cacheAnalysis(key, analysis)
  }
  catch {
    return undefined
  }
}
