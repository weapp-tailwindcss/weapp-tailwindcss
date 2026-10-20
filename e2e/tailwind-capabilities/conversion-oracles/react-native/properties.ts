import { reviewedNativeColor, reviewedNativeNumber } from './values'

type Entry = readonly [property: string, value: string | number]
export type NativeLiteralMapping = { entries: readonly Entry[] } | { rejectedProperty: string }

/** 独立冻结 RN 0.81 Layout Props；不能从产品属性表、manifest 或执行结果生成。 */
const keywords: Readonly<Record<string, readonly [string, readonly string[]]>> = {
  'display': ['display', ['flex', 'none', 'contents']],
  'position': ['position', ['relative', 'absolute', 'static']],
  'flex-direction': ['flexDirection', ['row', 'row-reverse', 'column', 'column-reverse']],
  'flex-wrap': ['flexWrap', ['wrap', 'nowrap', 'wrap-reverse']],
  'align-items': ['alignItems', ['flex-start', 'flex-end', 'center', 'stretch', 'baseline']],
  'align-self': ['alignSelf', ['auto', 'flex-start', 'flex-end', 'center', 'stretch', 'baseline']],
  'align-content': ['alignContent', ['flex-start', 'flex-end', 'center', 'stretch', 'space-between', 'space-around', 'space-evenly']],
  'justify-content': ['justifyContent', ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly']],
}

const dimensions: Readonly<Record<string, string>> = {
  'width': 'width',
  'height': 'height',
  'min-width': 'minWidth',
  'min-height': 'minHeight',
  'max-width': 'maxWidth',
  'max-height': 'maxHeight',
  'top': 'top',
  'right': 'right',
  'bottom': 'bottom',
  'left': 'left',
  'flex-basis': 'flexBasis',
  'margin-top': 'marginTop',
  'margin-right': 'marginRight',
  'margin-bottom': 'marginBottom',
  'margin-left': 'marginLeft',
  'margin-inline': 'marginHorizontal',
  'margin-block': 'marginVertical',
  'padding-top': 'paddingTop',
  'padding-right': 'paddingRight',
  'padding-bottom': 'paddingBottom',
  'padding-left': 'paddingLeft',
  'padding-inline': 'paddingHorizontal',
  'padding-block': 'paddingVertical',
}

const numbers: Readonly<Record<string, string>> = {
  'flex': 'flex',
  'flex-grow': 'flexGrow',
  'flex-shrink': 'flexShrink',
  'z-index': 'zIndex',
  'gap': 'gap',
  'font-size': 'fontSize',
  'letter-spacing': 'letterSpacing',
  'border-width': 'borderWidth',
  'border-radius': 'borderRadius',
}

const colors: Readonly<Record<string, string>> = {
  'color': 'color',
  'background-color': 'backgroundColor',
  'border-color': 'borderColor',
  'border-top-color': 'borderTopColor',
  'border-right-color': 'borderRightColor',
  'border-bottom-color': 'borderBottomColor',
  'border-left-color': 'borderLeftColor',
  'text-decoration-color': 'textDecorationColor',
}

/** 这是当前静态编码器的明确限制，不能解释为 RN 宿主永远不支持相应效果。 */
const rejected: Readonly<Record<string, string>> = {
  'filter': 'filter',
  'backdrop-filter': 'backdropFilter',
  'background-image': 'backgroundImage',
  'cursor': 'cursor',
  'user-select': 'userSelect',
  'appearance': 'appearance',
  'white-space': 'whiteSpace',
  'object-fit': 'objectFit',
  'list-style-type': 'listStyleType',
  'outline': 'outline',
}

export function reviewedNativeDeclaration(property: string, value: string): NativeLiteralMapping | undefined {
  const keyword = keywords[property]
  if (keyword && /^[\w -]+$/.test(value)) {
    return keyword[1].includes(value) ? { entries: [[keyword[0], value]] } : { rejectedProperty: keyword[0] }
  }
  if (rejected[property] && !/var\(/.test(value)) {
    return { rejectedProperty: rejected[property]! }
  }
  if (property === 'opacity') {
    const match = /^(\d+(?:\.\d+)?|\.\d+)(%)?$/.exec(value)
    const number = match ? Number(match[1]) / (match[2] ? 100 : 1) : undefined
    return number !== undefined && number >= 0 && number <= 1 ? { entries: [['opacity', number]] } : undefined
  }
  if (colors[property]) {
    const color = reviewedNativeColor(value)
    return color ? { entries: [[colors[property]!, color]] } : undefined
  }
  if (dimensions[property] || numbers[property]) {
    const parsed = reviewedNativeNumber(value, Boolean(dimensions[property]))
    if (parsed === undefined) {
      return undefined
    }
    if (Number.parseFloat(String(parsed)) < 0 && !/^(?:margin-|top$|right$|bottom$|left$|z-index$|letter-spacing$)/.test(property)) {
      return undefined
    }
    if (['flex', 'flex-grow', 'flex-shrink', 'z-index'].includes(property) && !/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) {
      return undefined
    }
    if (property === 'z-index' && !Number.isInteger(parsed)) {
      return undefined
    }
    return { entries: [[dimensions[property] ?? numbers[property]!, parsed]] }
  }
  if (property === 'margin' || property === 'padding') {
    const single = reviewedNativeNumber(value, true)
    const parts = single === undefined ? value.split(/\s+/).map(part => reviewedNativeNumber(part, true)) : [single]
    if (!parts.length || parts.length > 4 || parts.some(part => part === undefined || (property === 'padding' && Number.parseFloat(String(part)) < 0))) {
      return undefined
    }
    const [top, right = top, bottom = top, left = right] = parts as Array<string | number>
    return { entries: ['Top', 'Right', 'Bottom', 'Left'].map((side, index) => [`${property}${side}`, [top!, right!, bottom!, left!][index]!] as const) }
  }
  return undefined
}
