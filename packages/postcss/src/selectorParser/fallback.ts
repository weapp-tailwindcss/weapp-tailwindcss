// 针对小程序不支持的选择器语法提供兜底清理能力
import type { Rule } from 'postcss'
import type { IStyleHandlerOptions } from '../types'
import type { ParserTransformOptions } from './utils'
import psp from 'postcss-selector-parser'
import { isUniAppXEnabled, stripUnsupportedPseudoForUniAppX } from '../compat/uni-app-x'
import { normalizeTransformOptions } from './utils'

interface CachedFallbackResult {
  action: 'keep' | 'update' | 'remove'
  selector?: string
}

const fallbackRemoveCache = new WeakMap<object, {
  parser: ReturnType<typeof psp>
}>()
const fallbackDefaultKey: object = {}
const FALLBACK_TRANSFORM_OPTIONS = normalizeTransformOptions()
const PLAIN_CLASS_OR_ID = /^[.#][\w-]+$/

function isInsidePseudo(node: psp.Node, pseudoValue: string) {
  let parent = node.parent
  while (parent) {
    if (parent.type === 'pseudo' && parent.value === pseudoValue) {
      return true
    }
    if (parent.type === 'selector' && parent.parent?.type !== 'pseudo') {
      return false
    }
    parent = parent.parent
  }
  return false
}

function removeContainingSelector(node: psp.Node) {
  let parent = node.parent
  let containingSelector: psp.Container | undefined
  while (parent) {
    if (parent.type === 'selector') {
      containingSelector = parent
    }
    parent = parent.parent
  }
  containingSelector?.remove()
}

/**
 * 获取用于小程序兼容性处理的解析器，内部会缓存实例并移除不支持的选择器。
 * 增加了选择器字符串级缓存，避免对相同选择器重复 parse。
 * @returns 带清理规则的解析器实例。
 */
export function getFallbackRemove(_rule?: Rule, options?: IStyleHandlerOptions) {
  const cacheKey = options ?? fallbackDefaultKey
  let entry = fallbackRemoveCache.get(cacheKey)

  if (!entry) {
    const uniAppX = isUniAppXEnabled(options)
    let currentRule: Rule | undefined
    // 选择器字符串级缓存，避免对相同选择器重复 parse + walk
    const selectorCache = new Map<string, CachedFallbackResult>()
    const selectorCacheLimit = 50000

    function writeSelectorCache(selector: string, result: CachedFallbackResult) {
      if (selectorCache.size >= selectorCacheLimit) {
        selectorCache.clear()
      }
      selectorCache.set(selector, result)
    }

    const parser = psp((selectors) => {
      const activeRule = currentRule
      let maybeImportantId = false
      selectors.walk((selector, idx) => {
        if (idx === 0 && (selector.type === 'id' || selector.type === 'class' || selector.type === 'attribute')) {
          maybeImportantId = true
        }
        if (selector.type === 'universal') {
          selector.parent?.remove()
        }
        else if (selector.type === 'pseudo') {
          if (selector.value === ':is') {
            if (maybeImportantId && selector.nodes[0]?.type === 'selector') {
              selector.replaceWith(selector.nodes[0])
            }
            else {
              selector.parent?.remove()
            }
          }
          else if (selector.value === ':not') {
            for (const x of selector.nodes) {
              if (
                x.nodes.length === 1
                && x.nodes[0].type === 'id'
                && x.nodes[0].value === '#'
              ) {
                x.nodes = [
                  psp.tag({
                    value: '#n',
                  }),
                ]
              }
            }
          }
        }
        else if (selector.type === 'attribute') {
          if (selector.attribute === 'hidden') {
            activeRule?.remove()
          }
          else if (isInsidePseudo(selector, ':where')) {
            removeContainingSelector(selector)
          }
        }
      })
      selectors.walk((selector) => {
        if (selector.type === 'pseudo') {
          if (selector.value === ':where') {
            const res = selector.nodes.every(x => x.nodes.length === 0)
            if (res) {
              selector.remove()
            }
          }
          else if (selector.type === 'pseudo') {
            stripUnsupportedPseudoForUniAppX(selector, uniAppX)
          }
        }
      })
    })

    const rawTransformSync = parser.transformSync.bind(parser)

    const transformRule = (targetRule: Rule, transformOptions = FALLBACK_TRANSFORM_OPTIONS) => {
      const sourceSelector = targetRule.selector
      if (!sourceSelector) {
        return
      }
      // 单个未转义 class/id 没有可清理节点，且已是默认 lossless:false 的规范形式。
      if (targetRule.parent && transformOptions === FALLBACK_TRANSFORM_OPTIONS && PLAIN_CLASS_OR_ID.test(sourceSelector)) {
        return
      }

      // 查询选择器字符串级缓存
      if (transformOptions === FALLBACK_TRANSFORM_OPTIONS) {
        const cached = selectorCache.get(sourceSelector)
        if (cached) {
          if (cached.action === 'remove') {
            targetRule.selector = ''
            targetRule.remove()
          }
          else if (cached.action === 'update' && cached.selector && cached.selector !== sourceSelector) {
            targetRule.selector = cached.selector
          }
          return
        }
      }

      currentRule = targetRule
      try {
        rawTransformSync(targetRule, FALLBACK_TRANSFORM_OPTIONS)
        if (targetRule.parent && targetRule.selector.trim().length === 0) {
          targetRule.selector = ''
          targetRule.remove()
        }
      }
      finally {
        currentRule = undefined
      }

      // 写入缓存
      if (transformOptions === FALLBACK_TRANSFORM_OPTIONS) {
        const wasRemoved = targetRule.parent == null
        if (wasRemoved) {
          targetRule.selector = ''
          writeSelectorCache(sourceSelector, { action: 'remove' })
        }
        else if (targetRule.selector === sourceSelector) {
          writeSelectorCache(sourceSelector, { action: 'keep' })
        }
        else {
          writeSelectorCache(sourceSelector, { action: 'update', selector: targetRule.selector })
        }
      }
    }

    parser.transformSync = ((input: unknown, opts?: ParserTransformOptions) => {
      const transformOptions = opts ? normalizeTransformOptions(opts) : FALLBACK_TRANSFORM_OPTIONS

      if (input && typeof input === 'object' && 'type' in (input as Record<string, unknown>)) {
        const maybeRule = input as Record<string, unknown>
        if (maybeRule.type === 'rule') {
          transformRule(input as Rule, transformOptions)
          return undefined
        }
      }
      return rawTransformSync(input as string | Rule, transformOptions)
    }) as typeof parser.transformSync

    entry = {
      parser,
    }
    fallbackRemoveCache.set(cacheKey, entry)
  }

  return entry.parser
}
