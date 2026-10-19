import type { ExpectedDeclaration } from '../../examples/react-lynx/src/compatibility/types'

const sides = ['top', 'right', 'bottom', 'left'] as const
const corners = ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const
const number = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/
const length = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(px|rem|em|%|vh|vw)?$/

function normalized(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function color(value: string) {
  return value.toLowerCase().replace(/#[\da-f]{3,8}\b/g, (hex) => {
    return hex.length === 4 || hex.length === 5
      ? `#${[...hex.slice(1)].map(character => character.repeat(2)).join('')}`
      : hex
  })
}

function ratio(value: string) {
  const parts = normalized(value).split(/\s*\/\s*/)
  if (parts.length > 2 || parts.some(part => !number.test(part))) {
    return undefined
  }
  const result = Number(parts[0]) / Number(parts[1] ?? 1)
  return Number.isFinite(result) && result >= 0 ? result : undefined
}

function radial(value: string) {
  // 仅登记已验证的两色、百分比中心、circle/farthest-corner 分支。
  const match = normalized(value).match(/^radial-gradient\(circle(?: farthest-corner)? at ([\d.]+)% ([\d.]+)%\s*,\s*(#[\da-f]{3,8})\s*,\s*(#[\da-f]{3,8})\s*\)$/i)
  return match ? `${Number(match[1])}% ${Number(match[2])}%,${color(match[3]!)},${color(match[4]!)}` : undefined
}

function equivalent(property: string, actual: string, expected: string) {
  const left = normalized(actual)
  const right = normalized(expected)
  if (left === right) {
    return true
  }
  if (property === 'aspect-ratio') {
    const actualRatio = ratio(left)
    const expectedRatio = ratio(right)
    // 官方 NumberToString 使用 std::to_string，保留六位小数；容差只覆盖该舍入。
    return actualRatio !== undefined && expectedRatio !== undefined && Math.abs(actualRatio - expectedRatio) <= 0.500001e-6
  }
  if (property === 'background-position') {
    const expanded = (value: string) => value === 'center' ? 'center center' : value
    return expanded(left) === expanded(right)
  }
  if (property === 'background-repeat') {
    const expanded = (value: string) => /^(?:repeat|no-repeat|space|round)$/.test(value) ? `${value} ${value}` : value
    return expanded(left) === expanded(right)
  }
  if (property === 'background-image') {
    const expectedRadial = radial(right)
    return expectedRadial !== undefined && radial(left) === expectedRadial
  }
  if (property === 'color' || property.endsWith('-color')) {
    return color(left) === color(right)
  }
  if (property === 'opacity') {
    const opacity = (value: string) => number.test(value.replace(/%$/, '')) ? Number(value.replace(/%$/, '')) / (value.endsWith('%') ? 100 : 1) : undefined
    const expectedOpacity = opacity(right)
    return expectedOpacity !== undefined && opacity(left) === expectedOpacity
  }
  return false
}

function effective(actual: readonly ExpectedDeclaration[], property: string) {
  const declarations = actual.filter(item => item.property === property)
  return declarations.filter(item => item.important).at(-1) ?? declarations.at(-1)
}

function matchOne(actual: readonly ExpectedDeclaration[], expected: ExpectedDeclaration, checkImportant: boolean) {
  const value = effective(actual, expected.property)
  return value && value.value !== undefined
    && (!checkImportant || !expected.important || value.important === true)
    && (expected.value === undefined || equivalent(expected.property, value.value, expected.value))
    ? value
    : undefined
}

function matchAll(actual: readonly ExpectedDeclaration[], expected: ExpectedDeclaration[], checkImportant: boolean) {
  const evidence = expected.map(item => matchOne(actual, item, checkImportant))
  return evidence.every((item): item is ExpectedDeclaration => item !== undefined) ? evidence : undefined
}

function expandedFour(value: string | undefined) {
  if (value === undefined) {
    return [undefined, undefined, undefined, undefined]
  }
  const values = normalized(value).split(' ')
  if (values.length < 1 || values.length > 4) {
    return undefined
  }
  const [top, right = top, bottom = top, left = right] = values
  return [top, right, bottom, left]
}

function expectedParts(expected: ExpectedDeclaration, properties: string[], values?: Array<string | undefined>) {
  return properties.map((property, index): ExpectedDeclaration => {
    const value = values?.[index]
    return { property, ...(expected.important === undefined ? {} : { important: expected.important }), ...(value === undefined ? {} : { value }) }
  })
}

function fourDeclarations(expected: ExpectedDeclaration) {
  const values = expandedFour(expected.value)
  if (!values) {
    return undefined
  }
  if (expected.property === 'padding' || expected.property === 'margin') {
    return expectedParts(expected, sides.map(side => `${expected.property}-${side}`), values)
  }
  const border = expected.property.match(/^border-(width|color|style)$/)
  if (border) {
    return expectedParts(expected, sides.map(side => `border-${side}-${border[1]}`), values)
  }
  if (expected.property === 'border-radius' && !expected.value?.includes('/')) {
    return expectedParts(expected, corners.map(corner => `border-${corner}-radius`), values)
  }
  return undefined
}

function originMatches(actual: string, expected: string) {
  let components: unknown
  try {
    components = JSON.parse(actual)
  }
  catch {
    return false
  }
  if (!Array.isArray(components) || components.length !== 4 || components.some(value => !Number.isFinite(value))) {
    return false
  }
  const position = normalized(expected).split(' ')
  if (position.length !== 2) {
    return false
  }
  // 固定 0.0.49：PositionAddValue 写 [value, CSSValuePattern]，先 x 后 y。
  // https://github.com/lynx-family/lynx/blob/3f35de1c6150c1b94df165a248e8c76789487318/core/renderer/css/css_value.h#L28
  const units: Record<string, number> = { '': 2, 'px': 5, 'em': 7, 'rem': 8, 'vh': 9, 'vw': 10, '%': 11 }
  return position.every((value, index) => {
    const parsed = value.match(length)
    return parsed && Number(parsed[1]) === components[index * 2] && units[parsed[2] ?? ''] === components[index * 2 + 1]
  })
}

function animationDeclarations(expected: ExpectedDeclaration) {
  const properties = ['name', 'duration', 'timing-function', 'iteration-count', 'delay', 'direction', 'fill-mode', 'play-state'].map(name => `animation-${name}`)
  if (expected.value === undefined) {
    return expectedParts(expected, properties)
  }
  const match = normalized(expected.value).match(/^([\w-]+) ([\d.]+)(ms|s) linear (infinite|\d+(?:\.\d+)?)$/)
  if (!match || !Number.isFinite(Number(match[2]))) {
    return undefined
  }
  // 固定 0.0.49：秒乘 1000；infinite 为 10E8；timing 数组展示为 [linear]。
  // https://github.com/lynx-family/lynx/blob/3f35de1c6150c1b94df165a248e8c76789487318/core/renderer/css/parser/css_string_parser.cc#L2579
  return expectedParts(expected, properties, [match[1], String(Number(match[2]) * (match[3] === 's' ? 1000 : 1)), '[linear]', match[4] === 'infinite' ? '1000000000' : match[4], '0', 'normal', 'none', 'running'])
}

/** 比较有限的已审查编码表示，只返回同一 selector 的实际声明；缺项和未知表示保持失败。 */
export function matchEncodedDeclaration(actual: readonly ExpectedDeclaration[], expected: ExpectedDeclaration, checkImportant = true): ExpectedDeclaration[] | undefined {
  const direct = matchOne(actual, expected, checkImportant)
  if (direct) {
    return [direct]
  }
  const four = fourDeclarations(expected)
  if (four) {
    return matchAll(actual, four, checkImportant)
  }
  if (expected.property === 'gap') {
    const values = expected.value === undefined ? undefined : normalized(expected.value).split(' ')
    if (values && (values.length < 1 || values.length > 2)) {
      return undefined
    }
    return matchAll(actual, expectedParts(expected, ['row-gap', 'column-gap'], values ? [values[0], values[1] ?? values[0]] : undefined), checkImportant)
  }
  if (expected.property === 'flex') {
    const values = expected.value === undefined ? undefined : normalized(expected.value).split(' ')
    if (values && (values.length !== 3 || !number.test(values[0]!) || !number.test(values[1]!))) {
      return undefined
    }
    return matchAll(actual, expectedParts(expected, ['flex-grow', 'flex-shrink', 'flex-basis'], values), checkImportant)
  }
  if (expected.property === 'grid-column' || expected.property === 'grid-row') {
    const span = expected.value?.match(/^span (\d+)\s*\/\s*span \1$/)
    if (expected.value !== undefined && !span) {
      return undefined
    }
    // GridPositionHandler 将 start/end 的 span 写入同一个 grid-*-span 数字属性。
    // https://github.com/lynx-family/lynx/blob/3f35de1c6150c1b94df165a248e8c76789487318/core/renderer/css/parser/grid_position_handler.cc#L32
    const declaration = matchOne(actual, { ...expected, property: `${expected.property}-span`, ...(span ? { value: span[1]! } : {}) }, checkImportant)
    return declaration && /^\d+$/.test(declaration.value!) && Number(declaration.value) > 0 ? [declaration] : undefined
  }
  if (expected.property === 'transform-origin' && expected.value !== undefined) {
    const declaration = effective(actual, expected.property)
    return declaration?.value !== undefined && (!checkImportant || !expected.important || declaration.important)
      && originMatches(declaration.value, expected.value)
      ? [declaration]
      : undefined
  }
  if (expected.property === 'animation') {
    const parts = animationDeclarations(expected)
    return parts && matchAll(actual, parts, checkImportant)
  }
  return undefined
}
