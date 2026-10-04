// selector 规则级处理器，负责重写选择器并规整相关声明
import type { Rule } from 'postcss'
import type { Root, Selector, SyncProcessor } from 'postcss-selector-parser'
import type { IStyleHandlerOptions } from '../types'
import type { CachedSelectorTransformResult, TransformContext } from './rule-transformer/types'
import psp from 'postcss-selector-parser'
import { composeIsPseudo } from '../shared'
import { createNativeSelectorRuleTransformer } from './native-rule'
import { handleClassNode, handleCombinatorNode, handleSelectorNode, handleTagOrAttribute, handleUniversalNode } from './rule-transformer/nodes'
import { resolveSelectorTransformOptions } from './rule-transformer/options'
import { handlePseudoNode, shouldRemoveEmptyFunctionalPseudo } from './rule-transformer/pseudos'
import { getUnsupportedPseudoClassSet } from './rule-transformer/unsupported-pseudos'
import {
  isNotLastChildPseudo,
  normalizeSpacingDeclarations,
} from './spacing'
import {
  normalizeTransformOptions,
} from './utils'

export type RuleTransformer = (rule: Rule) => void

const ruleTransformCache = new WeakMap<IStyleHandlerOptions, { options: IStyleHandlerOptions, transform: RuleTransformer }>()

const SELECTOR_TRANSFORM_OPTIONS = normalizeTransformOptions()
const SIMPLE_SELECTOR_FAST_PATH = /^[#.][\w-]+(?:\s+[#.][\w-]+)*$/

function canSkipRuleTransform(rule: Rule) {
  const selector = rule.selector.trim()
  if (!selector) {
    return false
  }

  // Fast path: pure #id/.class descendant selectors are already valid in weapp
  // and never require escape/pseudo/combinator rewrites.
  return SIMPLE_SELECTOR_FAST_PATH.test(selector)
}

// transformSelectors 会遍历选择器 AST 并触发各类节点处理逻辑
function transformSelectors(selectors: Root, context: TransformContext) {
  selectors.walk((node, index) => {
    const parent = node.parent?.type === 'selector'
      ? node.parent as Selector
      : undefined

    switch (node.type) {
      case 'class':
        handleClassNode(node, context)
        break
      case 'universal':
        handleUniversalNode(node, context)
        break
      case 'selector':
        handleSelectorNode(node, context)
        break
      case 'pseudo':
        if (!isNotLastChildPseudo(node)) {
          handlePseudoNode(node, index, context, parent)
        }
        break
      case 'combinator':
        handleCombinatorNode(node, index, context)
        break
      case 'tag':
      case 'attribute':
        handleTagOrAttribute(node, context)
        break
      default:
        break
    }
  })

  if (context.requiresSpacingNormalization) {
    normalizeSpacingDeclarations(context.rule)
  }

  selectors.walk((node) => {
    if (shouldRemoveEmptyFunctionalPseudo(node)) {
      node.remove()
      return
    }

    if (node.type === 'selector' && node.length === 0) {
      node.remove()
    }
  })

  if (selectors.length === 0) {
    context.rule.remove()
  }
}

// createRuleTransformer 结合上下文执行器与 parser，生成可复用的规则转换函数
function createRuleTransformer(options: IStyleHandlerOptions): RuleTransformer {
  let context: TransformContext | undefined
  const selectorResultCache = new Map<string, CachedSelectorTransformResult>()
  const selectorResultCacheLimit = 50000
  const rootReplacement = options.cssSelectorReplacement?.root
    ? composeIsPseudo(options.cssSelectorReplacement.root)
    : undefined
  const universalReplacement = options.cssSelectorReplacement?.universal
    ? composeIsPseudo(options.cssSelectorReplacement.universal)
    : undefined
  const selectorReplacerOptions = options.escapeMap
    ? { escapeMap: options.escapeMap }
    : undefined
  const unsupportedPseudoClasses = getUnsupportedPseudoClassSet(options)
  const nativeTransform = createNativeSelectorRuleTransformer(options, rootReplacement, universalReplacement)

  function writeSelectorResultCache(selector: string, result: CachedSelectorTransformResult) {
    if (selectorResultCache.size >= selectorResultCacheLimit) {
      selectorResultCache.clear()
    }
    selectorResultCache.set(selector, result)
  }

  const transform: SyncProcessor = (selectors) => {
    if (!context) {
      return
    }
    transformSelectors(selectors, context)
  }

  const parser = psp(transform)

  return (rule: Rule) => {
    const sourceSelector = rule.selector
    if (!sourceSelector) {
      return
    }

    const cached = selectorResultCache.get(sourceSelector)
    if (cached) {
      if (cached.action === 'remove') {
        rule.remove()
      }
      else if (cached.action === 'update' && cached.selector && cached.selector !== sourceSelector) {
        rule.selector = cached.selector
      }
      return
    }

    if (canSkipRuleTransform(rule)) {
      writeSelectorResultCache(sourceSelector, { action: 'keep' })
      return
    }

    const native = nativeTransform(sourceSelector)
    if (native !== undefined) {
      rule.selector = native.selector
      if (native.spacing) {
        normalizeSpacingDeclarations(rule)
      }
      if (native.remove) {
        rule.remove()
        writeSelectorResultCache(sourceSelector, { action: 'remove' })
      }
      else if (!native.spacing) {
        writeSelectorResultCache(sourceSelector, { action: 'update', selector: native.selector })
      }
      return
    }

    context = {
      options,
      requiresSpacingNormalization: false,
      rule,
      rootReplacement,
      universalReplacement,
      selectorReplacerOptions,
      unsupportedPseudoClasses,
    }

    let wasRemoved = false
    let requiresSpacingNormalization = false

    try {
      parser.transformSync(rule, SELECTOR_TRANSFORM_OPTIONS)
    }
    finally {
      const currentContext = context
      wasRemoved = rule.parent == null
      requiresSpacingNormalization = currentContext?.requiresSpacingNormalization === true
      context = undefined
    }

    if (wasRemoved) {
      writeSelectorResultCache(sourceSelector, { action: 'remove' })
      return
    }

    if (requiresSpacingNormalization) {
      return
    }

    const transformedSelector = rule.selector
    if (transformedSelector === sourceSelector) {
      writeSelectorResultCache(sourceSelector, { action: 'keep' })
    }
    else {
      writeSelectorResultCache(sourceSelector, {
        action: 'update',
        selector: transformedSelector,
      })
    }
  }
}

// ruleTransformSync 提供同步的规则转换入口，并基于配置缓存转换器
export function ruleTransformSync(rule: Rule, options: IStyleHandlerOptions) {
  let cached = ruleTransformCache.get(options)
  const snapshot = resolveSelectorTransformOptions(options, cached?.options)
  if (!cached || snapshot !== cached.options) {
    cached = { options: snapshot, transform: createRuleTransformer(snapshot) }
    ruleTransformCache.set(options, cached)
  }
  cached.transform(rule)
}
