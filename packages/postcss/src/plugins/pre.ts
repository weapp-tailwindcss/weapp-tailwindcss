// 预处理阶段插件：重写选择器、清理不兼容规则并注入变量
import type { AtRule, Declaration, Plugin, PluginCreator, Rule } from 'postcss'
import type { IStyleHandlerOptions } from '../types'
import { defu } from '@weapp-tailwindcss/shared'
import { consumeCascadeLayers } from '../compat/mini-program-css/cascade-layers'
import {
  isTailwindcssV4,
  isTailwindcssV4DisplayP3Declaration,
  isTailwindcssV4DisplayP3Media,
  isTailwindcssV4DisplayP3Supports,
  isTailwindcssV4LinearGradientSupports,
  isTailwindcssV4ModernCheck,
  usesTailwindcssV4ContentVariable,
} from '../compat/tailwindcss-v4'
import { postcssPlugin } from '../constants'
import { commonChunkPreflight } from '../mp'
import { ruleTransformSync } from '../selectorParser'
import { createStableRuleTransformer } from '../selectorParser/rule-transformer'
import { isSelectorTransformOptionsStable } from '../selectorParser/rule-transformer/options'

export type PostcssWeappTailwindcssRenamePlugin = PluginCreator<IStyleHandlerOptions>

const MEDIA_HOVER_NAME_RE = /media\(\s*hover\s*:\s*hover\s*\)/
const MEDIA_HOVER_PARAMS_RE = /\(\s*hover\s*:\s*hover\s*\)/
const COLOR_MIX_RE = /color-mix/

// isAtMediaHover 用于识别 hover 媒体查询并将其展开
function isAtMediaHover(atRule: AtRule) {
  return (
    MEDIA_HOVER_NAME_RE.test(atRule.name)
    || (atRule.name === 'media' && MEDIA_HOVER_PARAMS_RE.test(atRule.params))
  )
}

function removeAtRuleAndEmptyAncestors(atRule: AtRule) {
  let parent = atRule.parent
  atRule.remove()

  while (parent?.type === 'atrule' && (!parent.nodes || parent.nodes.length === 0)) {
    const nextParent = parent.parent
    parent.remove()
    parent = nextParent
  }
}

function removeDeclarationAndEmptyRule(decl: Declaration) {
  const parent = decl.parent
  decl.remove()
  if (parent?.type === 'rule' && parent.nodes.length === 0) {
    removeRuleAndEmptyAncestors(parent)
  }
}

function removeRuleAndEmptyAncestors(rule: Rule) {
  let parent = rule.parent
  rule.remove()

  while (parent?.type === 'atrule' && (!parent.nodes || parent.nodes.length === 0)) {
    const nextParent = parent.parent
    parent.remove()
    parent = nextParent
  }
}

// @supports ((-webkit-hyphens: none) and (not (margin-trim: inline))) or ((-moz-orient: inline) and (not (color: rgb(from red r g b)))) {
//   @layer base {
//     *, :before, :after, ::backdrop {
//       --tw-font-weight: initial;
//     }
//   }
// }
// (((-webkit-hyphens:none)) and (not (margin-trim:inline))) or ((-moz-orient:inline) and (not (color:rgb(from red r g b))))

// @layer properties {
//   @supports ((-webkit-hyphens: none) and (not (margin-trim: inline))) or ((-moz-orient: inline) and (not (color:rgb(from red r g b)))) {
//     *, ::before, ::after, ::backdrop {
//       --tw-shadow: 0 0 #0000;
//       --tw-shadow-color: initial;
//       --tw-shadow-alpha: 100%;
//       --tw-inset-shadow: 0 0 #0000;
//       --tw-inset-shadow-color: initial;
//       --tw-inset-shadow-alpha: 100%;
//       --tw-ring-color: initial;
//       --tw-ring-shadow: 0 0 #0000;
//       --tw-inset-ring-color: initial;
//       --tw-inset-ring-shadow: 0 0 #0000;
//       --tw-ring-inset: initial;
//       --tw-ring-offset-width: 0px;
//       --tw-ring-offset-color: #fff;
//       --tw-ring-offset-shadow: 0 0 #0000;
//       --tw-blur: initial;
//       --tw-brightness: initial;
//       --tw-contrast: initial;
//       --tw-grayscale: initial;
//       --tw-hue-rotate: initial;
//       --tw-invert: initial;
//       --tw-opacity: initial;
//       --tw-saturate: initial;
//       --tw-sepia: initial;
//       --tw-drop-shadow: initial;
//       --tw-drop-shadow-color: initial;
//       --tw-drop-shadow-alpha: 100%;
//       --tw-drop-shadow-size: initial;
//       --tw-content: "";
//     }
//   }
// }
const postcssWeappTailwindcssPrePlugin: PostcssWeappTailwindcssRenamePlugin = (
  options,
) => {
  const opts = defu(options, { isMainChunk: true })
  const transformRule = isSelectorTransformOptionsStable(options)
    ? createStableRuleTransformer(opts)
    : (rule: Rule) => ruleTransformSync(rule, opts)

  const p: Plugin = {
    postcssPlugin,
    Rule(rule) {
      // 统一通过 selectorParser 做兼容性替换
      transformRule(rule)
    },
    AtRule(atRule) {
      if (isAtMediaHover(atRule)) {
        if (atRule.nodes) {
          atRule.replaceWith(atRule.nodes)
        }
        else {
          atRule.remove()
        }
      }
      // 参考：https://github.com/sonofmagic/weapp-tailwindcss/issues/631
      // 参考：https://github.com/sonofmagic/weapp-tailwindcss/issues/632
      // 参考：https://developer.mozilla.org/zh-CN/docs/Web/CSS/color_value/color-mix
      else if (atRule.name === 'supports') {
        if (COLOR_MIX_RE.test(atRule.params)) {
          removeAtRuleAndEmptyAncestors(atRule)
        }
        else if (isTailwindcssV4LinearGradientSupports(atRule)) {
          removeAtRuleAndEmptyAncestors(atRule)
        }
        else if (isTailwindcssV4DisplayP3Supports(atRule)) {
          removeAtRuleAndEmptyAncestors(atRule)
        }
      }
      else if (isTailwindcssV4DisplayP3Media(atRule)) {
        removeAtRuleAndEmptyAncestors(atRule)
      }
    },
    Declaration(decl) {
      if (isTailwindcssV4DisplayP3Declaration(decl)) {
        removeDeclarationAndEmptyRule(decl)
      }
    },
  }
  if (opts.isMainChunk) {
    p.Once = (root) => {
      root.walkAtRules((atRule) => {
        // 针对 Tailwindcss V4.1.2 的处理
        if (atRule.name === 'layer') {
          if (atRule.params === 'properties') {
            if (atRule.first?.type === 'atrule' && isTailwindcssV4ModernCheck(atRule.first)) {
              atRule.first.replaceWith(atRule.first.nodes ?? [])
            }
          }
        }
        // 针对 Tailwindcss V4.1.1 的处理
        else if (isTailwindcssV4ModernCheck(atRule)) {
          if (atRule.first?.type === 'atrule' && atRule.first.name === 'layer') {
            atRule.replaceWith(atRule.first)
          }
        }
      })
      consumeCascadeLayers(root)
      let contentVariableUsedInRoot = isTailwindcssV4(opts)
        ? usesTailwindcssV4ContentVariable(root)
        : undefined
      // 状态只属于本轮 Once；注入后按需重算，不跨 Root 或处理请求缓存。
      const contentUsage = {
        read: () => contentVariableUsedInRoot ??= usesTailwindcssV4ContentVariable(root),
        invalidate: () => { contentVariableUsedInRoot = undefined },
      }
      root.walkRules((rule) => {
        commonChunkPreflight(rule, opts, contentUsage)
      })
    }
  }
  return p
}

postcssWeappTailwindcssPrePlugin.postcss = true

export { postcssWeappTailwindcssPrePlugin }
