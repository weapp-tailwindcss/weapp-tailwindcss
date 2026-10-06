import type { IJsHandlerOptions } from '../../types'
import { LRUCache } from 'lru-cache'
import { walk } from 'oxc-walker'
import { loadOxcParser } from '../oxc-parser'

export interface LiteralSpan {
  kind: 'string' | 'template'
  start: number
  end: number
  value: string
}

interface SourceAnalysis {
  literals: LiteralSpan[]
  hasModuleDeclarations: boolean
  hasTaggedTemplate: boolean
}

interface OxcAstNode {
  type: string
  test?: unknown
}

const CONDITION_TEST_CHAIN_TYPES = new Set([
  'BinaryExpression',
  'CallExpression',
  'LogicalExpression',
  'MemberExpression',
  'UnaryExpression',
])

/** 与 Babel handler 保持一致，跳过条件表达式 test 中的字面量。 */
function isConditionTestLiteral(node: OxcAstNode, ancestors: OxcAstNode[]) {
  let current = node

  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const parent = ancestors[index]
    if (parent.type === 'ConditionalExpression') {
      return parent.test === current
    }
    if (CONDITION_TEST_CHAIN_TYPES.has(parent.type)) {
      current = parent
      continue
    }
    return false
  }

  return false
}

const MAX_ANALYSIS_BYTES = 2 * 1024 * 1024
const analysisCache = new LRUCache<string, SourceAnalysis>({ max: 128, maxSize: MAX_ANALYSIS_BYTES })

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
  const parser = loadOxcParser()
  if (!parser) {
    return undefined
  }
  const lang = getParserLang(options.filename)
  const sourceType = options.babelParserOptions?.sourceType === 'script' ? 'script' : 'module'
  const key = `${lang}:${sourceType}:${rawSource}`
  const cached = analysisCache.get(key)
  if (cached) {
    return cached
  }
  try {
    const result = parser.parseSync(options.filename ?? 'weapp-tailwindcss.js', rawSource, { sourceType, lang })
    if (!result.program || result.errors.length > 0) {
      return undefined
    }
    const analysis: SourceAnalysis = {
      literals: [],
      // 当前模块图不沿 CommonJS require 建图，ESM 声明仍交给 Babel。
      hasModuleDeclarations: false,
      hasTaggedTemplate: false,
    }
    let size = key.length * 2
    const ancestors: OxcAstNode[] = []
    walk(result.program, {
      enter(node) {
        ancestors.push(node)
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
        if (value === undefined || typeof node.start !== 'number' || typeof node.end !== 'number' || node.start >= node.end) {
          return
        }
        if (isConditionTestLiteral(node, ancestors.slice(0, -1))) {
          return
        }
        analysis.literals.push({
          kind: node.type === 'TemplateElement' ? 'template' : 'string',
          start: node.start,
          end: node.end,
          value,
        })
        size += 96 + value.length * 2
      },
      leave() {
        ancestors.pop()
      },
    })
    if (size <= MAX_ANALYSIS_BYTES) {
      analysisCache.set(key, analysis, { size })
    }
    return analysis
  }
  catch {
    return undefined
  }
}
