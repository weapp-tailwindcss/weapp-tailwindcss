import type { ElementNode } from '@vue/compiler-dom'
import type MagicString from 'magic-string'
import type { CssPreflightOptions } from '@/types'
import { NodeTypes } from '@vue/compiler-dom'
import {
  createUniAppXBorderPreflight,
  UNI_APP_X_BORDER_PREFLIGHT_CLASS,
} from '@weapp-tailwindcss/postcss/transform'

export {
  createUniAppXBorderPreflight,
  hoistUniAppXBorderPreflight,
} from '@weapp-tailwindcss/postcss/transform'

export const BORDER_PREFLIGHT_CLASS = UNI_APP_X_BORDER_PREFLIGHT_CLASS

export function resolveUniAppXBorderPreflightOptions(
  options: { cssPreflight?: CssPreflightOptions, cssPreflightRange?: 'all' },
  isWeb: boolean,
) {
  const borderPreflight = isWeb ? undefined : createUniAppXBorderPreflight(options.cssPreflight)
  return borderPreflight ? { borderPreflight, borderPreflightRange: options.cssPreflightRange } : {}
}

export function shouldInjectBorderPreflight(node: ElementNode, range?: 'all') {
  return range === 'all'
    ? !['template', 'slot', 'block'].includes(node.tag)
    : node.tag === 'view' || node.tag === 'text'
}

/** 在既有 class 转换完成后插入基础类，保持 utility 与动态绑定的原始顺序。 */
export function injectBorderPreflightClass(ms: MagicString, node: ElementNode, offset: number) {
  const attribute = node.props.find(prop => prop.type === NodeTypes.ATTRIBUTE && prop.name === 'class')
  if (attribute?.type === NodeTypes.ATTRIBUTE) {
    if (attribute.value) {
      if (attribute.value.content.split(/\s+/).includes(BORDER_PREFLIGHT_CLASS)) {
        return
      }
      const start = offset + attribute.value.loc.start.offset
      const quoted = /^["']/.test(attribute.value.loc.source)
      if (quoted) {
        ms.prependRight(start + 1, `${BORDER_PREFLIGHT_CLASS} `)
      }
      else {
        ms.prependRight(start, `"${BORDER_PREFLIGHT_CLASS} `)
        ms.appendLeft(offset + attribute.value.loc.end.offset, '"')
      }
    }
    else {
      ms.appendLeft(offset + attribute.loc.end.offset, `="${BORDER_PREFLIGHT_CLASS}"`)
    }
    return
  }
  ms.appendLeft(offset + node.loc.start.offset + node.tag.length + 1, ` class="${BORDER_PREFLIGHT_CLASS}"`)
}
