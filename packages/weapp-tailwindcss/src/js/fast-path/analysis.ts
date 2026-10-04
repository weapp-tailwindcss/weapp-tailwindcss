import type { IJsHandlerOptions } from '../../types'
import { LRUCache } from 'lru-cache'
import { walk } from 'oxc-walker'
import { parseOxcSync } from '../oxc-parser'

export interface LiteralSpan {
  kind: 'string' | 'template'
  start: number
  end: number
  value: string
  isConditionTest: boolean
}

interface SourceAnalysis {
  literals: LiteralSpan[]
  hasModuleDeclarations: boolean
  hasTaggedTemplate: boolean
}

const MAX_ANALYSIS_BYTES = 2 * 1024 * 1024
const analysisCache = new LRUCache<string, SourceAnalysis>({ max: 128, maxSize: MAX_ANALYSIS_BYTES })

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

function getParserLang(filename?: string) {
  if (filename?.endsWith('.ts') || filename?.endsWith('.mts') || filename?.endsWith('.cts')) {
    return 'ts'
  }
  if (filename?.endsWith('.tsx')) {
    return 'tsx'
  }
  if (filename?.endsWith('.jsx')) {
    return 'jsx'
  }
  return 'js'
}

/** 只缓存与 classSet 无关的字面量事实；完整 AST 在本次解析后释放。 */
export function getOxcSourceAnalysis(rawSource: string, options: IJsHandlerOptions): SourceAnalysis | undefined {
  const lang = getParserLang(options.filename)
  const sourceType = options.babelParserOptions?.sourceType === 'script' ? 'script' : 'module'
  const preserveParens = options.babelParserOptions?.createParenthesizedExpressions === true
  const key = `${lang}:${sourceType}:${preserveParens}:${rawSource}`
  const cached = analysisCache.get(key)
  if (cached) {
    return cached
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
    let size = key.length * 2
    let requiresBabel = false
    const ancestors: object[] = []
    walk(result.program, {
      enter(node) {
        if (node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration'
          || (node.type === 'ExportNamedDeclaration' && node.source !== null)) {
          analysis.hasModuleDeclarations = true
        }
        if (node.type === 'TaggedTemplateExpression') {
          analysis.hasTaggedTemplate = true
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
          analysis.literals.push({
            kind: node.type === 'TemplateElement' ? 'template' : 'string',
            start: node.start,
            end: node.end,
            value,
            isConditionTest: isConditionTestLiteral(node, ancestors),
          })
          size += 104 + value.length * 2
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
    if (size <= MAX_ANALYSIS_BYTES) {
      analysisCache.set(key, analysis, { size })
    }
    return analysis
  }
  catch {
    return undefined
  }
}
