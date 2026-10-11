import type { AttributeNode, DirectiveNode, ParentNode } from '@vue/compiler-dom'
import type { SourceDescription, SourceMapInput } from 'rollup'
import type { CreateJsHandlerOptions, ICustomAttributesEntities, JsHandler } from '@/types'
import { NodeTypes, parse as parseTemplate } from '@vue/compiler-dom'
import { isUniAppXStyleSourceEmpty, normalizeUniAppXImportantApplyForSass } from '@weapp-tailwindcss/postcss/transform'
import MagicString from 'magic-string'
import { generateCode, replaceWxml } from '@/wxml'
import { createAttributeMatcher } from '@/wxml/custom-attributes'
import { injectBorderPreflightClass, shouldInjectBorderPreflight } from './border-preflight'
import {
  UniAppXComponentLocalStyleCollector,
} from './component-local-style'
import {
  shouldEnableComponentLocalStyle,
  shouldEnablePageLocalStyle,
} from './local-style-matcher'

type UniAppXTransformResult = Pick<SourceDescription, 'code' | 'map'>

interface SfcBlock {
  content: string
  start: number
  end: number
  attrs: string
}

interface ParsedSfc {
  template?: SfcBlock & { ast?: ParentNode }
  script?: SfcBlock
  scriptSetup?: SfcBlock
  styles: SfcBlock[]
  errors: unknown[]
}

function traverse(node: ParentNode, visitor: (node: ParentNode) => void): void {
  visitor(node)
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      if (child && typeof child === 'object' && 'type' in child) {
        traverse(child as ParentNode, visitor)
      }
    }
  }
}

function updateStaticAttribute(ms: MagicString, prop: AttributeNode, offset: number, preserveClassNames: boolean) {
  if (!prop.value) {
    return
  }
  const start = offset + prop.value.loc.start.offset + 1
  const end = offset + prop.value.loc.end.offset - 1
  if (start < end) {
    const content = prop.value.content
    ms.update(start, end, preserveClassNames ? content : replaceWxml(content))
  }
}

function updateStaticAttributeWithLocalStyle(
  ms: MagicString,
  prop: AttributeNode,
  offset: number,
  collector: UniAppXComponentLocalStyleCollector,
  deep: boolean,
  content = prop.value?.content,
) {
  if (!prop.value) {
    return
  }
  const start = offset + prop.value.loc.start.offset + 1
  const end = offset + prop.value.loc.end.offset - 1
  if (start < end) {
    ms.update(start, end, collector.collectAndRewriteStaticClass(content ?? '', { deep }))
  }
}

function updateDirectiveExpression(
  ms: MagicString,
  prop: DirectiveNode,
  offset: number,
  jsHandler: JsHandler,
  runtimeSet?: Set<string>,
) {
  if (prop.exp?.type !== NodeTypes.SIMPLE_EXPRESSION) {
    return
  }
  const expression = prop.exp.content
  const start = offset + prop.exp.loc.start.offset
  const end = offset + prop.exp.loc.end.offset
  if (start >= end) {
    return
  }
  const generated = generateCode(expression, {
    jsHandler,
    runtimeSet,
    wrapExpression: true,
  })
  ms.update(start, end, generated)
}

function updateDirectiveExpressionWithLocalStyle(
  ms: MagicString,
  prop: DirectiveNode,
  offset: number,
  jsHandler: JsHandler,
  collector: UniAppXComponentLocalStyleCollector,
  deep: boolean,
  runtimeSet?: Set<string>,
) {
  if (prop.exp?.type !== NodeTypes.SIMPLE_EXPRESSION) {
    return
  }
  const expression = prop.exp.content
  const start = offset + prop.exp.loc.start.offset
  const end = offset + prop.exp.loc.end.offset
  if (start >= end) {
    return
  }
  collector.collectRuntimeClasses(expression, {
    deep,
    wrapExpression: true,
  })
  const generated = generateCode(expression, {
    jsHandler,
    runtimeSet,
    wrapExpression: true,
  })
  ms.update(start, end, collector.rewriteTransformedCode(generated, { wrapExpression: true }))
}

interface TransformUVueOptions {
  componentMatcher?: (id: string) => boolean
  customAttributesEntities?: ICustomAttributesEntities
  disabledDefaultTemplateHandler?: boolean
  enableComponentLocalStyle?: boolean
  enablePageLocalStyle?: boolean
  pageMatcher?: (id: string) => boolean
  native?: boolean
  localStyleVariants?: boolean
  borderPreflight?: string
  borderPreflightRange?: 'all'
  webCustomAttributeDeep?: boolean
  onWebLocalStyleRules?: (rules: string) => void
}

function shouldEnableLocalStyle(id: string, options: TransformUVueOptions) {
  if (options.enableComponentLocalStyle && shouldEnableComponentLocalStyle(id, options.componentMatcher)) {
    return true
  }
  if (options.enablePageLocalStyle && shouldEnablePageLocalStyle(id, options.pageMatcher)) {
    return true
  }
  return false
}

function shouldHandleAttribute(
  tag: string,
  attrName: string,
  disabledDefaultTemplateHandler: boolean,
  matchCustomAttribute?: ReturnType<typeof createAttributeMatcher>,
) {
  const lowerName = attrName.toLowerCase()
  const shouldHandleDefault = !disabledDefaultTemplateHandler && lowerName === 'class'
  const shouldHandleCustom = matchCustomAttribute?.(tag, attrName) ?? false
  return {
    shouldHandleDefault,
    shouldHandleCustom,
    shouldHandle: shouldHandleDefault || shouldHandleCustom,
  }
}

const defaultCreateJsHandlerOptions: CreateJsHandlerOptions = {
  babelParserOptions: {
    plugins: [
      'typescript',
    ],
  },
}
const UVUE_NVUE_RE = /\.(?:uvue|nvue)(?:\?.*)?$/
const SFC_BLOCK_RE = /<(template|script|style)\b([^>]*)>/gi
const SCRIPT_SETUP_RE = /(?:^|\s)setup(?:\s|=|$)/
const STYLE_SCOPED_RE = /(?:^|\s)scoped(?:\s|=|$)/i

function findSfcBlockEnd(code: string, type: string, contentStart: number) {
  const closeTag = new RegExp(`<\\/${type}\\s*>`, 'gi')
  if (type !== 'template') {
    const match = closeTag.exec(code.slice(contentStart))
    return match
      ? {
          blockEnd: contentStart + match.index + match[0].length,
          contentEnd: contentStart + match.index,
        }
      : undefined
  }

  const tag = new RegExp(`<\\/?${type}\\b[^>]*>`, 'gi')
  tag.lastIndex = contentStart
  let depth = 1
  let match = tag.exec(code)
  while (match) {
    if (match[0].startsWith('</')) {
      depth -= 1
    }
    else if (!match[0].trimEnd().endsWith('/>')) {
      depth += 1
    }
    if (depth === 0) {
      return {
        blockEnd: tag.lastIndex,
        contentEnd: match.index,
      }
    }
    match = tag.exec(code)
  }
}

function parseSfc(code: string): ParsedSfc {
  const descriptor: ParsedSfc = { errors: [], styles: [] }

  for (const match of code.matchAll(SFC_BLOCK_RE)) {
    const type = match[1]!
    const attrs = match[2] ?? ''
    const blockStart = match.index ?? 0
    const contentStart = blockStart + match[0].length
    const blockBoundary = findSfcBlockEnd(code, type, contentStart)
    if (!blockBoundary) {
      descriptor.errors.push(new Error(`未闭合的 ${type} SFC 块`))
      continue
    }
    const { contentEnd } = blockBoundary
    const content = code.slice(contentStart, contentEnd)
    const block: SfcBlock = {
      content,
      start: contentStart,
      end: contentEnd,
      attrs,
    }

    if (type === 'template' && !descriptor.template) {
      try {
        descriptor.template = {
          ...block,
          ast: parseTemplate(content) as ParentNode,
        }
      }
      catch (error) {
        descriptor.errors.push(error)
        descriptor.template = block
      }
      continue
    }

    if (type === 'script') {
      if (SCRIPT_SETUP_RE.test(attrs)) {
        descriptor.scriptSetup ??= block
      }
      else {
        descriptor.script ??= block
      }
      continue
    }

    if (type === 'style') {
      descriptor.styles.push(block)
    }
  }

  return descriptor
}

export function transformUVue(
  code: string,
  id: string,
  jsHandler: JsHandler,
  runtimeSet?: Set<string>,
  options: TransformUVueOptions = {},
): undefined | UniAppXTransformResult {
  if (!UVUE_NVUE_RE.test(id)) {
    return
  }
  const { customAttributesEntities, disabledDefaultTemplateHandler = false } = options
  const isWeb = Boolean(options.onWebLocalStyleRules)
  // Web 生成器保留原始类名；只让局部样式收集器消费候选，JS handler 继续处理模块引用。
  const jsRuntimeSet = isWeb ? new Set<string>() : runtimeSet
  const matchCustomAttribute = createAttributeMatcher(customAttributesEntities)
  const ms = new MagicString(code)
  const descriptor = parseSfc(code)
  if (options.native || options.onWebLocalStyleRules) {
    for (const style of descriptor.styles) {
      const normalized = normalizeUniAppXImportantApplyForSass(style.content)
      if (normalized !== style.content) {
        ms.update(style.start, style.end, normalized)
      }
    }
  }
  const localStyleCollector = shouldEnableLocalStyle(id, options)
    ? new UniAppXComponentLocalStyleCollector(id, runtimeSet, options.localStyleVariants, isWeb)
    : undefined
  if (descriptor.errors.length === 0) {
    if (descriptor.template?.ast) {
      const templateOffset = descriptor.template.start
      traverse(descriptor.template.ast, (node) => {
        if (node.type !== NodeTypes.ELEMENT) {
          return
        }
        const tag = node.tag
        for (const prop of node.props) {
          if (prop.type === NodeTypes.ATTRIBUTE) {
            const { shouldHandle, shouldHandleCustom, shouldHandleDefault } = shouldHandleAttribute(
              tag,
              prop.name,
              disabledDefaultTemplateHandler,
              matchCustomAttribute,
            )
            if (!shouldHandle) {
              continue
            }
            if (localStyleCollector) {
              updateStaticAttributeWithLocalStyle(
                ms,
                prop,
                templateOffset,
                localStyleCollector,
                options.webCustomAttributeDeep === true && shouldHandleCustom,
              )
            }
            else {
              updateStaticAttribute(ms, prop, templateOffset, isWeb)
            }
            if (shouldHandleDefault) {
              continue
            }
          }
          else if (
            prop.type === NodeTypes.DIRECTIVE
            && prop.name === 'bind'
            && prop.arg?.type === NodeTypes.SIMPLE_EXPRESSION
            && prop.arg.isStatic
          ) {
            const attrName = prop.arg.content
            const { shouldHandle, shouldHandleCustom } = shouldHandleAttribute(
              tag,
              attrName,
              disabledDefaultTemplateHandler,
              matchCustomAttribute,
            )
            if (!shouldHandle) {
              continue
            }
            if (localStyleCollector) {
              updateDirectiveExpressionWithLocalStyle(
                ms,
                prop,
                templateOffset,
                jsHandler,
                localStyleCollector,
                options.webCustomAttributeDeep === true && shouldHandleCustom,
                jsRuntimeSet,
              )
            }
            else {
              updateDirectiveExpression(ms, prop, templateOffset, jsHandler, jsRuntimeSet)
            }
          }
        }
        if (options.borderPreflight && shouldInjectBorderPreflight(node, options.borderPreflightRange)) {
          injectBorderPreflightClass(ms, node, templateOffset)
        }
      })
      if (options.borderPreflight && !descriptor.styles.some(style => style.content.includes(options.borderPreflight!))) {
        ms.prepend(`<style>\n${options.borderPreflight}\n</style>\n`)
      }
    }

    if (descriptor.script && descriptor.script.start < descriptor.script.end) {
      localStyleCollector?.collectRuntimeClasses(descriptor.script.content)
      const { code } = jsHandler(descriptor.script.content, jsRuntimeSet ?? new Set(), defaultCreateJsHandlerOptions)
      ms.update(
        descriptor.script.start,
        descriptor.script.end,
        localStyleCollector ? localStyleCollector.rewriteTransformedCode(code) : code,
      )
    }
    if (descriptor.scriptSetup && descriptor.scriptSetup.start < descriptor.scriptSetup.end) {
      localStyleCollector?.collectRuntimeClasses(descriptor.scriptSetup.content)
      const { code } = jsHandler(descriptor.scriptSetup.content, jsRuntimeSet ?? new Set(), defaultCreateJsHandlerOptions)
      ms.update(
        descriptor.scriptSetup.start,
        descriptor.scriptSetup.end,
        localStyleCollector ? localStyleCollector.rewriteTransformedCode(code) : code,
      )
    }

    const scopedStyle = [...descriptor.styles].reverse().find(style => STYLE_SCOPED_RE.test(style.attrs)
      && (!options.onWebLocalStyleRules || !isUniAppXStyleSourceEmpty(style.content)))
    if (localStyleCollector && options.onWebLocalStyleRules && descriptor.template) {
      // 所有 Web 载体都需要回放缓存；HMR 可能绕过主模块直接重编译样式请求。
      options.onWebLocalStyleRules(localStyleCollector.hasStyles()
        ? localStyleCollector.toStyleRules({ web: true })
        : '')
    }
    if (localStyleCollector?.hasStyles() && scopedStyle && !options.onWebLocalStyleRules) {
      const separator = scopedStyle.content.endsWith('\n') ? '' : '\n'
      ms.appendLeft(scopedStyle.end, `${separator}${localStyleCollector.toStyleRules({ native: options.native === true })}`)
    }
    else if (localStyleCollector?.hasStyles() && !scopedStyle) {
      // 新增的局部样式块会单独进入预处理器，important utility 统一使用中间标记。
      ms.append(`\n${localStyleCollector.toStyleBlock({
        native: options.native || Boolean(options.onWebLocalStyleRules),
        web: Boolean(options.onWebLocalStyleRules),
      })}`)
    }
  }
  const result: UniAppXTransformResult = {
    code: ms.toString(),
    map: null,
  }

  Object.defineProperty(result, 'map', {
    configurable: true,
    enumerable: true,
    get() {
      return ms.generateMap() as SourceMapInput
    },
  })
  return result
}
