/* eslint-disable style/max-statements-per-line */

import valueParser from 'postcss-value-parser'
import { parseNativeBoxShadow } from './shadow'
import { parseNativeTransform } from './transform'
import { isColor, normalizeColor, parseNumber, resolveVariables } from './values'
import { resolveNativeVariables } from './variables'

const COLOR_PROPERTIES = new Set(['color', 'backgroundColor', 'borderColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'shadowColor', 'textDecorationColor'])
const NUMERIC_PROPERTIES = new Set([
  'aspectRatio',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderRadius',
  'borderRightWidth',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderTopWidth',
  'borderWidth',
  'bottom',
  'elevation',
  'flex',
  'flexBasis',
  'flexGrow',
  'flexShrink',
  'fontSize',
  'gap',
  'height',
  'left',
  'letterSpacing',
  'lineHeight',
  'margin',
  'marginBottom',
  'marginHorizontal',
  'marginLeft',
  'marginRight',
  'marginTop',
  'marginVertical',
  'maxHeight',
  'maxWidth',
  'minHeight',
  'minWidth',
  'opacity',
  'padding',
  'paddingBottom',
  'paddingHorizontal',
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'paddingVertical',
  'right',
  'top',
  'width',
  'zIndex',
])
const STRING_PROPERTIES = new Set([
  'alignContent',
  'alignItems',
  'alignSelf',
  'borderStyle',
  'direction',
  'display',
  'flexDirection',
  'flexWrap',
  'fontFamily',
  'fontStyle',
  'fontWeight',
  'justifyContent',
  'overflow',
  'position',
  'textAlign',
  'textDecorationLine',
  'textDecorationStyle',
  'textTransform',
  'writingDirection',
])
/** RN 0.81 布局 API 的封闭枚举；CSS 独有关键字必须诊断，不能静默透传。 */
const LAYOUT_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  display: ['flex', 'none', 'contents'],
  position: ['relative', 'absolute', 'static'],
  flexDirection: ['row', 'column', 'row-reverse', 'column-reverse'],
  flexWrap: ['wrap', 'nowrap', 'wrap-reverse'],
  alignItems: ['flex-start', 'flex-end', 'center', 'stretch', 'baseline'],
  alignSelf: ['auto', 'flex-start', 'flex-end', 'center', 'stretch', 'baseline'],
  alignContent: ['flex-start', 'flex-end', 'center', 'stretch', 'space-between', 'space-around', 'space-evenly'],
  justifyContent: ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly'],
}
const SHORTHANDS = {
  margin: ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'],
  padding: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'],
} as const
const UNSUPPORTED_PROPERTIES = new Set([
  'filter',
  'backdropFilter',
  'animation',
  'transition',
  'textShadow',
  'backgroundImage',
  'appearance',
  'content',
  'cursor',
  'userSelect',
  'whiteSpace',
  'objectFit',
  'listStyleType',
  'outline',
])

export function propertyName(property: string) {
  const logical = {
    'padding-inline': 'paddingHorizontal',
    'padding-inline-start': 'paddingLeft',
    'padding-inline-end': 'paddingRight',
    'padding-block': 'paddingVertical',
    'padding-block-start': 'paddingTop',
    'padding-block-end': 'paddingBottom',
    'margin-inline': 'marginHorizontal',
    'margin-inline-start': 'marginLeft',
    'margin-inline-end': 'marginRight',
    'margin-block': 'marginVertical',
    'margin-block-start': 'marginTop',
    'margin-block-end': 'marginBottom',
  } as Record<string, string>
  return logical[property] ?? property.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

function splitValue(value: string) {
  const parts: string[] = []
  let current = ''
  for (const node of valueParser(value).nodes) {
    if (node.type === 'space' || node.type === 'comment') {
      if (current) { parts.push(current); current = '' }
    }
    else {
      current += valueParser.stringify(node)
    }
  }
  if (current) { parts.push(current) }
  return parts
}

export function relativeLineHeight(value: string, variables: Record<string, string>) {
  const resolved = resolveNativeVariables(value, variables)?.trim()
  const match = resolved?.match(/^(\d+(?:\.\d+)?|\.\d+)(em|%)?$/)
  if (!match) { return undefined }
  const number = Number(match[1])
  return match[2] === '%' ? number / 100 : number
}

function parseValue(property: string, value: string, variables: Record<string, string>) {
  const trimmed = resolveNativeVariables(value.trim(), variables)
  if (trimmed === undefined) { return undefined }
  if (UNSUPPORTED_PROPERTIES.has(property)) { return undefined }
  if (trimmed.includes('linear-gradient(') || trimmed.includes('url(')) { return undefined }
  if (COLOR_PROPERTIES.has(property)) {
    const color = resolveVariables(trimmed, variables)
    return isColor(color) ? normalizeColor(color) : undefined
  }
  if (NUMERIC_PROPERTIES.has(property)) {
    const number = parseNumber(trimmed, variables)
    if (property === 'opacity' && typeof number === 'string' && number.endsWith('%')) {
      return Number.parseFloat(number) / 100
    }
    return number
  }
  if (property === 'transform') { return parseNativeTransform(trimmed) }
  if (property === 'boxShadow') { return parseNativeBoxShadow(trimmed) }
  if (LAYOUT_KEYWORDS[property] && !LAYOUT_KEYWORDS[property]!.includes(trimmed)) { return undefined }
  return STRING_PROPERTIES.has(property) ? trimmed : undefined
}

export function expandDeclaration(property: string, value: string, variables: Record<string, string>) {
  if (property === 'margin' || property === 'padding') {
    const parts = splitValue(value).map(item => parseNumber(item, variables))
    if (!parts.length || parts.length > 4 || parts.includes(undefined)) { return undefined }
    const values = parts as Array<string | number>
    const [top, right = top, bottom = top, left = right] = values
    return Object.fromEntries(SHORTHANDS[property].map((key, index) => [key, [top, right, bottom, left][index]]))
  }
  if (property === 'border') {
    const width = splitValue(value).find(item => /^\d/.test(item))
    const color = splitValue(value).find(item => isColor(item))
    return {
      ...(width ? { borderWidth: parseNumber(width, variables) } : {}),
      ...(color ? { borderColor: color } : {}),
    }
  }
  const parsed = parseValue(property, value, variables)
  return parsed === undefined ? undefined : { [property]: parsed }
}
