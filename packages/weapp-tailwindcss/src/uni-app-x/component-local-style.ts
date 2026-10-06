import type { NodePath } from '@babel/traverse'
import type { StringLiteral, TemplateElement } from '@babel/types'
import { splitCandidateTokens } from '@weapp-tailwindcss/engine'
import { UNI_APP_X_IMPORTANT_APPLY_MARKER, UNI_APP_X_LOCAL_UTILITY_MARKER } from '@weapp-tailwindcss/postcss/transform'
import MagicString from 'magic-string'
import { analyzeSource, babelParse } from '@/js/babel'
import { isClassContextLiteralPath } from '@/js/class-context'
import { JsTokenUpdater } from '@/js/JsTokenUpdater'
import { replaceWxml } from '@/wxml'
import {
  collectClassBindingNames,
  collectClassBindingRoots,
  isClassBindingLiteralPath,
} from './component-local-style-binding'

interface RewriteCodeOptions {
  deep?: boolean
  wrapExpression?: boolean
}

const EXPRESSION_WRAPPER_PREFIX = '(\n'
const EXPRESSION_WRAPPER_SUFFIX = '\n)'

function createStableHash(input: string) {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function extractLiteralValue(path: NodePath<StringLiteral | TemplateElement>) {
  if (path.isStringLiteral()) {
    return {
      literal: path.node.value,
      offset: 1,
    }
  }
  return {
    literal: typeof path.node.value === 'string' ? path.node.value : path.node.value.raw,
    offset: 0,
  }
}

function createAlias(fileId: string, utility: string, index: number) {
  return `wtu-${createStableHash(`${fileId}:${utility}`)}-${index.toString(36)}`
}

function serializeApplyUtility(utility: string, options: { native?: boolean, web?: boolean } = {}) {
  const importantSuffix = options.native
    ? UNI_APP_X_IMPORTANT_APPLY_MARKER
    : options.web
      ? '!'
      : '#{\'!\'}'
  if (utility.startsWith('!') && !utility.startsWith('\\!')) {
    return `${utility.slice(1)}${importantSuffix}`
  }
  if (!utility.endsWith('!') || utility.endsWith('\\!')) {
    return utility
  }
  return `${utility.slice(0, -1)}${importantSuffix}`
}

function isRuntimeCandidate(candidate: string, runtimeSet?: Set<string>) {
  if (!runtimeSet || runtimeSet.size === 0) {
    return false
  }
  return runtimeSet.has(candidate) || runtimeSet.has(replaceWxml(candidate))
}

export function hasTopLevelVariant(candidate: string) {
  let bracketDepth = 0
  let parenthesisDepth = 0
  let quote = ''
  let escaped = false
  for (const char of candidate) {
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (quote) {
      if (char === quote) {
        quote = ''
      }
      continue
    }
    if (char === '"' || char === '\'') {
      quote = char
      continue
    }
    if (char === '[') {
      bracketDepth += 1
      continue
    }
    if (char === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1)
      continue
    }
    if (char === '(') {
      parenthesisDepth += 1
      continue
    }
    if (char === ')') {
      parenthesisDepth = Math.max(0, parenthesisDepth - 1)
      continue
    }
    if (char === ':' && bracketDepth === 0 && parenthesisDepth === 0) {
      return true
    }
  }
  return false
}

export class UniAppXComponentLocalStyleCollector {
  private aliasByUtility = new Map<string, string>()
  private aliasByLookup = new Map<string, string>()
  private classBindingNames = new Set<string>()
  private deepUtilities = new Set<string>()

  constructor(
    private readonly fileId: string,
    private readonly runtimeSet?: Set<string>,
    private readonly includeVariants = false,
    private readonly preserveClassNames = false,
  ) {}

  private runtimeClassName(utility: string) {
    return this.preserveClassNames ? utility : replaceWxml(utility)
  }

  private ensureAlias(utility: string) {
    const cached = this.aliasByUtility.get(utility)
    if (cached) {
      return cached
    }
    const alias = createAlias(this.fileId, utility, this.aliasByUtility.size)
    this.aliasByUtility.set(utility, alias)
    // 局部变体补充页面级层叠，同时保留全局变体类的既有运行时身份。
    const replacement = hasTopLevelVariant(utility) ? `${this.runtimeClassName(utility)} ${alias}` : alias
    this.aliasByLookup.set(utility, replacement)
    this.aliasByLookup.set(replaceWxml(utility), replacement)
    return alias
  }

  private rewriteLiteral(literal: string) {
    const candidates = splitCandidateTokens(literal)
    if (candidates.length === 0) {
      return literal
    }
    let rewritten = literal
    for (const candidate of candidates) {
      if (!isRuntimeCandidate(candidate, this.runtimeSet)) {
        continue
      }
      if (!this.includeVariants && hasTopLevelVariant(candidate)) {
        rewritten = rewritten.replace(candidate, this.runtimeClassName(candidate))
      }
      else {
        this.ensureAlias(candidate)
        rewritten = rewritten.replace(candidate, this.aliasByLookup.get(candidate)!)
      }
    }
    return rewritten
  }

  collectAndRewriteStaticClass(literal: string, options: RewriteCodeOptions = {}) {
    const rewritten = this.rewriteLiteral(literal)
    if (options.deep) {
      for (const candidate of splitCandidateTokens(literal)) {
        if (this.aliasByUtility.has(candidate)) {
          this.deepUtilities.add(candidate)
        }
      }
    }
    return rewritten
  }

  collectRuntimeClasses(rawSource: string, options: RewriteCodeOptions = {}) {
    const wrapped = options.wrapExpression
      ? `${EXPRESSION_WRAPPER_PREFIX}${rawSource}${EXPRESSION_WRAPPER_SUFFIX}`
      : rawSource

    try {
      const ast = babelParse(wrapped, {
        plugins: ['typescript'],
        sourceType: options.wrapExpression ? 'module' : 'unambiguous',
      })
      if (options.wrapExpression) {
        collectClassBindingNames(ast, this.classBindingNames)
      }
      const classBindingRoots = options.wrapExpression
        ? undefined
        : collectClassBindingRoots(ast, this.classBindingNames)
      const analysis = analyzeSource(ast, {}, undefined, false)
      for (const path of analysis.targetPaths) {
        const { literal } = extractLiteralValue(path)
        const candidates = splitCandidateTokens(literal)
        const classContext = options.wrapExpression
          || isClassContextLiteralPath(path)
          || isClassBindingLiteralPath(path, classBindingRoots)
        for (const candidate of candidates) {
          if (!candidate || !classContext || !isRuntimeCandidate(candidate, this.runtimeSet)) {
            continue
          }
          if (this.includeVariants || !hasTopLevelVariant(candidate)) {
            this.ensureAlias(candidate)
            if (options.deep) {
              this.deepUtilities.add(candidate)
            }
          }
        }
      }
    }
    catch {
      // 收集失败时保持现有转换链路，避免影响源码输出。
    }
  }

  rewriteTransformedCode(rawSource: string, options: RewriteCodeOptions = {}) {
    if (this.aliasByLookup.size === 0) {
      return rawSource
    }

    const wrapped = options.wrapExpression
      ? `${EXPRESSION_WRAPPER_PREFIX}${rawSource}${EXPRESSION_WRAPPER_SUFFIX}`
      : rawSource

    try {
      const ast = babelParse(wrapped, {
        plugins: ['typescript'],
        sourceType: options.wrapExpression ? 'module' : 'unambiguous',
      })
      const classBindingRoots = options.wrapExpression
        ? undefined
        : collectClassBindingRoots(ast, this.classBindingNames)
      const analysis = analyzeSource(ast, {}, undefined, false)
      if (analysis.targetPaths.length === 0) {
        return rawSource
      }
      const updater = new JsTokenUpdater()
      for (const path of analysis.targetPaths) {
        if (
          !options.wrapExpression
          && !isClassContextLiteralPath(path)
          && !isClassBindingLiteralPath(path, classBindingRoots)
        ) {
          continue
        }
        const { literal, offset } = extractLiteralValue(path)
        const candidates = splitCandidateTokens(literal)
        if (candidates.length === 0) {
          continue
        }
        let rewritten = literal
        let mutated = false
        for (const candidate of candidates) {
          const alias = this.aliasByLookup.get(candidate)
          if (!alias) {
            continue
          }
          const replaced = rewritten.replace(candidate, alias)
          if (replaced !== rewritten) {
            rewritten = replaced
            mutated = true
          }
        }
        if (!mutated || typeof path.node.start !== 'number' || typeof path.node.end !== 'number') {
          continue
        }
        updater.addToken({
          start: path.node.start + offset,
          end: path.node.end - offset,
          value: rewritten,
          path,
        })
      }
      if (updater.length === 0) {
        return rawSource
      }
      const ms = new MagicString(wrapped)
      updater.updateMagicString(ms)
      if (options.wrapExpression) {
        ms.remove(0, EXPRESSION_WRAPPER_PREFIX.length)
        ms.remove(wrapped.length - EXPRESSION_WRAPPER_SUFFIX.length, wrapped.length)
      }
      return ms.toString()
    }
    catch {
      return rawSource
    }
  }

  hasStyles() {
    return this.aliasByUtility.size > 0
  }

  toStyleBlock(options: { native?: boolean, web?: boolean } = {}) {
    if (!this.hasStyles()) {
      return ''
    }
    return `<style scoped>\n${this.toStyleRules(options)}</style>\n`
  }

  toStyleRules(options: { native?: boolean, web?: boolean } = {}) {
    if (!this.hasStyles()) {
      return ''
    }
    const lines: string[] = []
    for (const [utility, alias] of this.aliasByUtility) {
      // Vue scoped 编译会额外注入作用域类或属性，
      // 重新抬高特异性；使用 :global 保持局部 alias 的单类选择器特异性。
      const localSelector = options.web ? `:global(.${alias})` : `.${alias}`
      const selector = this.deepUtilities.has(utility)
        ? `${localSelector}, :deep(.${alias})`
        : localSelector
      lines.push(`/*${UNI_APP_X_LOCAL_UTILITY_MARKER} */`)
      lines.push(`${selector} {`)
      lines.push(`  @apply ${serializeApplyUtility(utility, options)};`)
      lines.push('}')
    }
    return `${lines.join('\n')}\n`
  }
}
