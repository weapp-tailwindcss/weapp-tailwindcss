import type { AtRule, Helpers, Plugin, PluginCreator, Rule } from 'postcss'
import { registerPurePluginPreparation } from '../plugin-cache-policy'
import { ifdef, ifdefAtRule, ifndef, ifndefAtRule, matchCustomPropertyFromValue, parseConditionalAtRuleParam } from './constants'

const IFDEF_ENDIF_RE = /#(?:ifn?def|endif)/
const CONDITIONAL_COMMENT_SPACING = ' '
export const CSS_MACRO_POSTCSS_PLUGIN_NAME = 'postcss-weapp-tw-css-macro-plugin'

export interface Options {}

function cloneConditionalNodes(atRule: AtRule) {
  let nodes = (atRule.nodes ?? []).map(node => node.clone())

  while (nodes.length === 1) {
    const node = nodes[0]
    if (node?.type !== 'rule' || node.selector.trim() !== '&') {
      break
    }
    nodes = (node.nodes ?? []).map(child => child.clone())
  }

  return nodes
}

const implementation: Plugin = {
  postcssPlugin: CSS_MACRO_POSTCSS_PLUGIN_NAME,
  prepare() {
    function replaceAtRuleWithConditionalComments(
      atRule: AtRule,
      helper: Helpers,
      comment: ReturnType<typeof ifdef>,
    ) {
      const hasPreviousNode = Boolean(atRule.prev())
      const clonedNodes = cloneConditionalNodes(atRule)
      const startComment = helper.comment({
        raws: {
          left: CONDITIONAL_COMMENT_SPACING,
          right: CONDITIONAL_COMMENT_SPACING,
        },
        text: comment.start,
      })
      const endComment = helper.comment({
        raws: {
          left: CONDITIONAL_COMMENT_SPACING,
          right: CONDITIONAL_COMMENT_SPACING,
        },
        text: comment.end,
      })
      const nextNodes = [
        startComment,
        ...clonedNodes,
        endComment,
      ]
      atRule.replaceWith(nextNodes)

      startComment.raws.before = hasPreviousNode ? '\n' : ''
      startComment.raws['after'] = '\n'
      if (clonedNodes[0]) {
        clonedNodes[0].raws.before = '\n'
      }
      endComment.raws.before = '\n'
      endComment.raws['after'] = '\n'

      const nextNode = endComment?.next()
      if (nextNode) {
        nextNode.raws.before = '\n'
      }
    }

    function replaceNestedAtRuleWithConditionalRule(
      atRule: AtRule,
      helper: Helpers,
      comment: ReturnType<typeof ifdef>,
    ) {
      if (atRule.parent?.type !== 'rule') {
        return false
      }

      const parentRule = atRule.parent as Rule
      const clonedNodes = cloneConditionalNodes(atRule)
      const conditionalRule = parentRule.clone()
      conditionalRule.removeAll()
      conditionalRule.append(...clonedNodes)

      const startComment = helper.comment({
        raws: {
          left: CONDITIONAL_COMMENT_SPACING,
          right: CONDITIONAL_COMMENT_SPACING,
        },
        text: comment.start,
      })
      const endComment = helper.comment({
        raws: {
          left: CONDITIONAL_COMMENT_SPACING,
          right: CONDITIONAL_COMMENT_SPACING,
        },
        text: comment.end,
      })
      const nextNodes = [
        startComment,
        conditionalRule,
        endComment,
      ]
      const hasPreviousNode = Boolean(parentRule.prev())

      atRule.remove()
      if ((parentRule.nodes?.length ?? 0) === 0) {
        parentRule.replaceWith(nextNodes)
      }
      else {
        parentRule.after(nextNodes)
      }

      startComment.raws.before = hasPreviousNode ? '\n' : ''
      startComment.raws['after'] = '\n'
      conditionalRule.raws.before = '\n'
      endComment.raws.before = '\n'
      endComment.raws['after'] = '\n'

      const nextNode = endComment.next()
      if (nextNode) {
        nextNode.raws.before = '\n'
      }

      return true
    }

    return {
      AtRule(atRule, helper) {
        if (atRule.name === ifdefAtRule || atRule.name === ifndefAtRule) {
          const text = parseConditionalAtRuleParam(atRule.params)
          const comment = atRule.name === ifndefAtRule ? ifndef(text) : ifdef(text)
          if (replaceNestedAtRuleWithConditionalRule(atRule, helper, comment)) {
            return
          }
          replaceAtRuleWithConditionalComments(atRule, helper, comment)
          return
        }

        if (atRule.name === 'media') {
          const values: string[] = []
          matchCustomPropertyFromValue(atRule.params, (arr) => {
            const value = arr[1]
            if (value) {
              values.push(value)
            }
          })
          if (values.length > 0) {
            const isNegative = atRule.params.includes('not')
            const text = values.join(' ')
            const comment = isNegative ? ifndef(text) : ifdef(text)
            if (replaceNestedAtRuleWithConditionalRule(atRule, helper, comment)) {
              return
            }
            replaceAtRuleWithConditionalComments(atRule, helper, comment)
          }
        }
      },
      CommentExit(comment) {
        if (IFDEF_ENDIF_RE.test(comment.text)) {
          comment.raws.left = CONDITIONAL_COMMENT_SPACING
          comment.raws.right = CONDITIONAL_COMMENT_SPACING
        }
      },
    }
  },
}

registerPurePluginPreparation(CSS_MACRO_POSTCSS_PLUGIN_NAME, implementation.prepare!)
const creator: PluginCreator<Options> = () => ({ ...implementation })

creator.postcss = true

export default creator
