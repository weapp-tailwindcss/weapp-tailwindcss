/** 已审查的默认 WXSS 管线字面量保留合同；不推断设备渲染能力。 */
export const literalPropertyRules: Readonly<Record<string, RegExp | readonly string[]>> = {
  'display': ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'table', 'inline-table', 'table-caption', 'table-cell', 'table-column', 'table-column-group', 'table-footer-group', 'table-header-group', 'table-row-group', 'table-row', 'flow-root', 'contents', 'list-item', 'none'],
  'position': ['static', 'relative', 'absolute', 'fixed', 'sticky'],
  'visibility': ['visible', 'hidden', 'collapse'],
  'box-sizing': ['border-box', 'content-box'],
  'isolation': ['isolate', 'auto'],
  'pointer-events': ['none', 'auto'],
  'flex-direction': ['row', 'row-reverse', 'column', 'column-reverse'],
  'flex-wrap': ['wrap', 'wrap-reverse', 'nowrap'],
  'flex-grow': /^(?:\d+(?:\.\d+)?|\.\d+)$/,
  'flex-shrink': /^(?:\d+(?:\.\d+)?|\.\d+)$/,
  'align-items': ['normal', 'stretch', 'center', 'flex-start', 'flex-end', 'baseline', 'last baseline', 'safe center', 'safe flex-end'],
  'align-content': ['normal', 'stretch', 'center', 'flex-start', 'flex-end', 'space-between', 'space-around', 'space-evenly', 'baseline', 'last baseline'],
  'align-self': ['auto', 'stretch', 'center', 'flex-start', 'flex-end', 'baseline', 'last baseline'],
  'justify-content': ['normal', 'stretch', 'center', 'flex-start', 'flex-end', 'space-between', 'space-around', 'space-evenly'],
  'justify-items': ['normal', 'stretch', 'center', 'start', 'end', 'baseline'],
  'justify-self': ['auto', 'normal', 'stretch', 'center', 'start', 'end'],
  'order': /^(?:-?\d+|initial|inherit|unset)$/,
  'z-index': /^(?:-?\d+|auto|initial|inherit|unset)$/,
  'opacity': /^(?:0(?:\.\d+)?|1(?:\.0+)?|\.\d+)$/,
  'font-style': ['normal', 'italic'],
  'font-weight': /^(?:[1-9]\d{0,2}|1000|normal|bold)$/,
  'text-transform': ['uppercase', 'lowercase', 'capitalize', 'none'],
  'text-align': ['left', 'right', 'center', 'justify'],
  'vertical-align': ['baseline', 'top', 'middle', 'bottom', 'text-top', 'text-bottom', 'sub', 'super'],
  'text-decoration-line': ['none', 'underline', 'overline', 'line-through'],
  'text-decoration-style': ['solid', 'double', 'dotted', 'dashed', 'wavy'],
  'text-overflow': ['clip', 'ellipsis'],
  'white-space': ['normal', 'nowrap', 'pre', 'pre-line', 'pre-wrap', 'break-spaces'],
  'object-fit': ['contain', 'cover', 'fill', 'none', 'scale-down'],
  'background-attachment': ['fixed', 'local', 'scroll'],
  'background-origin': ['border-box', 'padding-box', 'content-box'],
  'background-clip': ['border-box', 'padding-box', 'content-box'],
  'background-repeat': ['repeat', 'no-repeat', 'repeat-x', 'repeat-y', 'round', 'space'],
  'border-collapse': ['collapse', 'separate'],
  'table-layout': ['auto', 'fixed'],
  'list-style-position': ['inside', 'outside'],
  'list-style-type': ['none', 'disc', 'decimal'],
  'overflow-x': ['auto', 'hidden', 'clip', 'visible', 'scroll'],
  'overflow-y': ['auto', 'hidden', 'clip', 'visible', 'scroll'],
  'float': ['left', 'right', 'none'],
  'clear': ['left', 'right', 'both', 'none'],
  'scroll-behavior': ['auto', 'smooth'],
  'scroll-snap-align': ['start', 'end', 'center', 'none'],
  'scroll-snap-stop': ['normal', 'always'],
  'overscroll-behavior-x': ['auto', 'contain', 'none'],
  'overscroll-behavior-y': ['auto', 'contain', 'none'],
  'backface-visibility': ['visible', 'hidden'],
  'transform-style': ['flat', 'preserve-3d'],
  'transition-delay': /^\d+(?:\.\d+)?m?s$/,
  'transition-duration': /^\d+(?:\.\d+)?m?s$/,
  'animation': ['none'],
  'background-image': ['none'],
  'transform': ['none'],
}

const dimension = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%|vw|vh|vmin|vmax|dvw|dvh|svw|svh|lvw|lvh|ch)?$/
const nonnegativeDimension = /^(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%|vw|vh|vmin|vmax|dvw|dvh|svw|svh|lvw|lvh|ch)?$/
const color = /^(?:#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|transparent|currentColor|inherit|black|white)$/i

/** 保留默认单位；这里没有 rem2rpx、逻辑方向推断或变量求值。 */
export function reviewedLiteralValue(property: string, value: string): boolean {
  const rule = literalPropertyRules[property]
  if (rule) {
    return rule instanceof RegExp ? rule.test(value) : rule.includes(value)
  }
  if (/^(?:width|height|min-width|max-width|min-height|max-height|flex-basis)$/.test(property)) {
    return nonnegativeDimension.test(value) || ['auto', 'none', 'min-content', 'max-content', 'fit-content'].includes(value)
  }
  if (/^(?:top|right|bottom|left|margin(?:-(?:top|right|bottom|left))?)$/.test(property)) {
    return value === 'auto' || dimension.test(value)
  }
  if (/^(?:padding(?:-(?:top|right|bottom|left))?|gap|row-gap|column-gap|font-size|line-height|text-decoration-thickness|stroke-width)$/.test(property)) {
    return nonnegativeDimension.test(value) || (property === 'line-height' && value === 'normal')
  }
  if (/^(?:text-indent|letter-spacing|outline-offset|text-underline-offset|scroll-margin(?:-(?:top|right|bottom|left))?)$/.test(property)) {
    return dimension.test(value) || (property === 'text-underline-offset' && value === 'auto')
  }
  if (/^(?:border(?:-(?:top|right|bottom|left))?-width|outline-width|scroll-padding(?:-(?:top|right|bottom|left))?)$/.test(property)) {
    return nonnegativeDimension.test(value)
  }
  if (/^border(?:-(?:top-left|top-right|bottom-left|bottom-right))?-radius$/.test(property)) {
    // 极大圆角会进入独立的兼容钳制路径，不在字面量合同内。
    return nonnegativeDimension.test(value) && Number.parseFloat(value) <= 9999
  }
  if (/^(?:color|background-color|border(?:-(?:top|right|bottom|left))?-color|outline-color|text-decoration-color|caret-color|accent-color|fill|stroke)$/.test(property)) {
    return color.test(value) || (['fill', 'stroke', 'accent-color'].includes(property) && ['none', 'auto'].includes(value))
  }
  return false
}
