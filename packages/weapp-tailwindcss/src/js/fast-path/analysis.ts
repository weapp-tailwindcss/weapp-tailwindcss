import type { IJsHandlerOptions } from '../../types'
import type { SourceAnalysis } from './types'
import { LRUCache } from 'lru-cache'
import { walk } from 'oxc-walker'
import { loadNativeCompiler, nativeCompilerConfigured } from '../../native'
import { parseOxcSync } from '../oxc-parser'
import { isClassContextChild } from './class-context'
import { getParserLang, getParserSourceType } from './parser-options'

export type { LiteralSpan } from './types'

const CONDITION_TEST_CHAIN_TYPES = new Set([
  'BinaryExpression',
  'CallExpression',
  'LogicalExpression',
  'MemberExpression',
  'UnaryExpression',
])

// 只有命中这些词时，字面量才可能进入 Babel 的 class 上下文。
// 没有提示时跳过逐节点的上下文判断，避免为普通生成代码付出遍历成本。
const CLASS_CONTEXT_HINT_RE = /class|\b(?:cn|clsx|classnames|twmerge|cva|tv|cx)\b|\br\s*\(/iu

function hasClassContextHint(source: string) {
  return CLASS_CONTEXT_HINT_RE.test(source)
}

const MAX_ANALYSIS_BYTES = 2 * 1024 * 1024
const analysisCache = new LRUCache<string, SourceAnalysis>({ max: 128, maxSize: MAX_ANALYSIS_BYTES })

function cacheAnalysis(key: string, analysis: SourceAnalysis) {
  const size = analysis.literals.reduce((total, literal) => total + 104 + literal.value.length * 2, key.length * 2)
  if (size <= MAX_ANALYSIS_BYTES) {
    analysisCache.set(key, analysis, { size })
  }
  return analysis
}

/** 只缓存与 classSet 无关的字面量事实；完整 AST 在本次解析后释放。 */
export function getOxcSourceAnalysis(rawSource: string, options: IJsHandlerOptions): SourceAnalysis | undefined {
  const lang = getParserLang(options)
  const sourceType = getParserSourceType(options)
  const preserveParens = options.babelParserOptions?.createParenthesizedExpressions === true
  // 加载检查必须先于缓存，required 模式不能命中先前的 JS 回退结果。
  const compiler = nativeCompilerConfigured ? loadNativeCompiler() : undefined
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
    // 只在进入条件测试链时保存上下文。为每个 AST 节点压入一个布尔值会让生成代码的
    // 普通遍历产生大量无用数组操作；条件链之外的节点始终保持 false。
    const conditionContextStack: { node: object, previous: boolean }[] | undefined = rawSource.includes('?') ? [] : undefined
    let conditionTestContext = false
    // classContext 只会影响带斜杠的 utility；普通生成 JS 无需维护这条上下文链。
    const classContextHint = rawSource.includes('/') && hasClassContextHint(rawSource)
    // 只记录当前上下文边界节点；普通 AST 节点不再各自分配一个布尔栈项。
    let classContextNode: object | undefined
    walk(result.program, {
      enter(node, parent) {
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
        const parentNode = parent as { type?: string, directive?: unknown, expression?: unknown } | null
        if (conditionContextStack) {
          const nextConditionTestContext = parentNode?.type === 'ConditionalExpression'
            ? parentNode.test === node
            : conditionTestContext && parentNode?.type !== undefined && CONDITION_TEST_CHAIN_TYPES.has(parentNode.type)
          // 只有上下文状态发生变化时才需要保存恢复点。状态保持为 true 的
          // 条件链节点可以直接继承父状态；若其子树离开条件链，离开节点
          // 时通过这个边界恢复父状态，避免为整棵测试表达式分配栈项。
          if (nextConditionTestContext !== conditionTestContext) {
            conditionContextStack.push({ node, previous: conditionTestContext })
          }
          conditionTestContext = nextConditionTestContext
        }
        else {
          conditionTestContext = false
        }
        const classContextParent = parentNode?.type === 'Property'
          || parentNode?.type === 'JSXAttribute'
          || parentNode?.type === 'CallExpression'
        const classContext = classContextNode !== undefined
          || (classContextHint && classContextParent && isClassContextChild(node, parentNode))
        if (classContextNode === undefined && classContext) {
          classContextNode = node
        }
        const isDirective = parentNode?.type === 'ExpressionStatement'
          && typeof parentNode.directive === 'string' && parentNode.expression === node
        // JSX 实体由 Babel 解码，避免在快速路径重复维护 HTML 实体解析规则。
        if (parentNode?.type === 'JSXAttribute' && value?.includes('&')) {
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
              isConditionTest: conditionTestContext,
              classContext,
            })
          }
        }
      },
      leave(node) {
        if (conditionContextStack) {
          const last = conditionContextStack[conditionContextStack.length - 1]
          if (last?.node === node) {
            conditionContextStack.pop()
            conditionTestContext = last.previous
          }
        }
        if (classContextNode === node) {
          classContextNode = undefined
        }
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
