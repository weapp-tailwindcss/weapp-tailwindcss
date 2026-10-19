/** 已审查的字面量输入；默认 WXSS 兼容改写另由 compatibility.ts 冻结，不推断设备渲染能力。 */
export const literalPropertyRules: Readonly<Record<string, RegExp | readonly string[]>> = {
  'display': ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'table', 'inline-table', 'table-caption', 'table-cell', 'table-column', 'table-column-group', 'table-footer-group', 'table-header-group', 'table-row-group', 'table-row', 'flow-root', 'contents', 'list-item', 'none'],
  'position': ['static', 'relative', 'absolute', 'fixed', 'sticky'],
  'visibility': ['visible', 'hidden', 'collapse'],
  'box-sizing': ['border-box', 'content-box'],
  'isolation': ['isolate', 'auto'],
  'pointer-events': ['none', 'auto'],
  'appearance': ['none', 'auto'],
  'resize': ['none', 'both', 'horizontal', 'vertical'],
  'cursor': ['alias', 'all-scroll', 'auto', 'cell', 'col-resize', 'context-menu', 'copy', 'crosshair', 'default', 'e-resize', 'ew-resize', 'grab', 'grabbing', 'help', 'move', 'n-resize', 'ne-resize', 'nesw-resize', 'no-drop', 'none', 'not-allowed', 'ns-resize', 'nw-resize', 'nwse-resize', 'pointer', 'progress', 'row-resize', 's-resize', 'se-resize', 'sw-resize', 'text', 'vertical-text', 'w-resize', 'wait', 'zoom-in', 'zoom-out'],
  'user-select': ['none', 'text', 'all', 'auto'],
  '-webkit-user-select': ['none', 'text', 'all', 'auto'],
  'touch-action': ['auto', 'none', 'manipulation'],
  'will-change': ['auto', 'scroll-position', 'contents', 'transform'],
  'flex': /^(?:\d+(?:\.\d+)?|\.\d+|auto|none|0 auto)$/,
  'flex-direction': ['row', 'row-reverse', 'column', 'column-reverse'],
  'flex-wrap': ['wrap', 'wrap-reverse', 'nowrap'],
  'flex-grow': /^(?:\d+(?:\.\d+)?|\.\d+)$/,
  'flex-shrink': /^(?:\d+(?:\.\d+)?|\.\d+)$/,
  'align-items': ['normal', 'stretch', 'center', 'flex-start', 'flex-end', 'baseline', 'last baseline', 'safe center', 'safe flex-end'],
  'align-content': ['normal', 'stretch', 'center', 'flex-start', 'flex-end', 'space-between', 'space-around', 'space-evenly', 'baseline', 'last baseline', 'safe center', 'safe flex-end'],
  'align-self': ['auto', 'stretch', 'center', 'flex-start', 'flex-end', 'baseline', 'last baseline', 'safe center', 'safe flex-end'],
  'justify-content': ['normal', 'stretch', 'center', 'flex-start', 'flex-end', 'space-between', 'space-around', 'space-evenly', 'safe center', 'safe flex-end'],
  'justify-items': ['normal', 'stretch', 'center', 'start', 'end', 'baseline', 'safe center', 'safe end'],
  'justify-self': ['auto', 'normal', 'stretch', 'center', 'start', 'end', 'flex-start', 'flex-end', 'safe center', 'safe flex-end'],
  'place-content': ['normal', 'stretch', 'center', 'start', 'end', 'space-between', 'space-around', 'space-evenly', 'baseline', 'safe center', 'safe end'],
  'place-items': ['normal', 'stretch', 'center', 'start', 'end', 'baseline', 'safe center', 'safe end'],
  'place-self': ['auto', 'normal', 'stretch', 'center', 'start', 'end', 'safe center', 'safe end'],
  'grid-auto-flow': ['row', 'column', 'dense', 'row dense', 'column dense'],
  'grid-auto-columns': ['auto', 'min-content', 'max-content'],
  'grid-auto-rows': ['auto', 'min-content', 'max-content'],
  'grid-template-columns': ['none', 'subgrid'],
  'grid-template-rows': ['none', 'subgrid'],
  'grid-column': ['auto'],
  'grid-row': ['auto'],
  'grid-column-start': /^(?:auto|-?[1-9]\d*)$/,
  'grid-column-end': /^(?:auto|-?[1-9]\d*)$/,
  'grid-row-start': /^(?:auto|-?[1-9]\d*)$/,
  'grid-row-end': /^(?:auto|-?[1-9]\d*)$/,
  'columns': /^(?:auto|[1-9]\d*)$/,
  'aspect-ratio': ['auto', '1 / 1'],
  'order': /^(?:-?\d+|initial|inherit|unset)$/,
  'z-index': /^(?:-?\d+|auto|initial|inherit|unset)$/,
  'opacity': /^(?:0(?:\.\d+)?|1(?:\.0+)?|\.\d+|(?:[1-9]?\d(?:\.\d+)?|100(?:\.0+)?|\.\d+)%)$/,
  'font-style': ['normal', 'italic'],
  'font-weight': /^(?:[1-9]\d{0,2}|1000|normal|bold)$/,
  'font-stretch': ['ultra-condensed', 'extra-condensed', 'condensed', 'semi-condensed', 'normal', 'semi-expanded', 'expanded', 'extra-expanded', 'ultra-expanded', '50%', '75%', '90%', '95%', '100%', '105%', '110%', '125%', '150%', '200%'],
  'font-variant-numeric': ['normal'],
  'text-transform': ['uppercase', 'lowercase', 'capitalize', 'none'],
  'text-align': ['left', 'right', 'center', 'justify', 'start', 'end'],
  'vertical-align': ['baseline', 'top', 'middle', 'bottom', 'text-top', 'text-bottom', 'sub', 'super'],
  'text-decoration-line': ['none', 'underline', 'overline', 'line-through'],
  'text-decoration-style': ['solid', 'double', 'dotted', 'dashed', 'wavy'],
  'text-overflow': ['clip', 'ellipsis'],
  'white-space': ['normal', 'nowrap', 'pre', 'pre-line', 'pre-wrap', 'break-spaces'],
  'text-wrap': ['wrap', 'nowrap', 'balance', 'pretty'],
  'overflow-wrap': ['normal', 'break-word', 'anywhere'],
  'word-break': ['normal', 'break-all', 'keep-all'],
  'hyphens': ['none', 'manual', 'auto'],
  '-webkit-hyphens': ['none', 'manual', 'auto'],
  'tab-size': /^(?:\d+(?:\.\d+)?|\.\d+)$/,
  'content': ['none'],
  'object-fit': ['contain', 'cover', 'fill', 'none', 'scale-down'],
  'object-position': ['top', 'bottom', 'left', 'right', 'center', 'left top', 'left bottom', 'right top', 'right bottom'],
  'background-attachment': ['fixed', 'local', 'scroll'],
  'background-origin': ['border-box', 'padding-box', 'content-box'],
  'background-clip': ['border-box', 'padding-box', 'content-box', 'text'],
  'background-position': ['top', 'bottom', 'left', 'right', 'center', 'left top', 'left bottom', 'right top', 'right bottom'],
  'background-size': ['auto', 'contain', 'cover'],
  'background-repeat': ['repeat', 'no-repeat', 'repeat-x', 'repeat-y', 'round', 'space'],
  'border-collapse': ['collapse', 'separate'],
  'border-style': ['none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset'],
  'border-top-style': ['none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset'],
  'border-right-style': ['none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset'],
  'border-bottom-style': ['none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset'],
  'border-left-style': ['none', 'hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset'],
  'outline-style': ['none', 'auto', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset'],
  'box-decoration-break': ['slice', 'clone'],
  '-webkit-box-decoration-break': ['slice', 'clone'],
  'table-layout': ['auto', 'fixed'],
  'caption-side': ['top', 'bottom'],
  'list-style-position': ['inside', 'outside'],
  'list-style-type': ['none', 'disc', 'decimal'],
  'list-style-image': ['none'],
  'break-before': ['auto', 'avoid', 'all', 'avoid-page', 'page', 'left', 'right', 'column'],
  'break-after': ['auto', 'avoid', 'all', 'avoid-page', 'page', 'left', 'right', 'column'],
  'break-inside': ['auto', 'avoid', 'avoid-page', 'avoid-column'],
  'overflow': ['auto', 'hidden', 'clip', 'visible', 'scroll'],
  'overflow-x': ['auto', 'hidden', 'clip', 'visible', 'scroll'],
  'overflow-y': ['auto', 'hidden', 'clip', 'visible', 'scroll'],
  'float': ['left', 'right', 'none'],
  'clear': ['left', 'right', 'both', 'none'],
  'scroll-behavior': ['auto', 'smooth'],
  'scroll-snap-align': ['start', 'end', 'center', 'none'],
  'scroll-snap-stop': ['normal', 'always'],
  'scroll-snap-type': ['none'],
  'scrollbar-width': ['auto', 'thin', 'none'],
  'scrollbar-gutter': ['auto', 'stable', 'stable both-edges'],
  'overscroll-behavior': ['auto', 'contain', 'none'],
  'overscroll-behavior-x': ['auto', 'contain', 'none'],
  'overscroll-behavior-y': ['auto', 'contain', 'none'],
  'backface-visibility': ['visible', 'hidden'],
  'transform-style': ['flat', 'preserve-3d'],
  'transform-box': ['content-box', 'border-box', 'fill-box', 'stroke-box', 'view-box'],
  'transform-origin': ['top', 'bottom', 'left', 'right', 'center', 'left top', 'left bottom', 'right top', 'right bottom', '0', '100%', '0 0', '100% 0', '0 100%', '100% 100%'],
  'perspective-origin': ['top', 'bottom', 'left', 'right', 'center', 'left top', 'left bottom', 'right top', 'right bottom', '0', '100%', '0 0', '100% 0', '0 100%', '100% 100%'],
  'perspective': ['none'],
  'rotate': ['none'],
  'scale': ['none'],
  'translate': ['none'],
  'clip-path': ['none'],
  'text-shadow': ['none'],
  'field-sizing': ['fixed', 'content'],
  'contain': ['none', 'strict', 'content'],
  'content-visibility': ['visible', 'hidden', 'auto'],
  'transition-property': ['all', 'none', 'opacity', 'box-shadow', 'transform'],
  'transition-timing-function': ['linear'],
  'transition-behavior': ['normal', 'allow-discrete'],
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
  if (/^(?:inset|top|right|bottom|left|margin(?:-(?:top|right|bottom|left))?)$/.test(property)) {
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
