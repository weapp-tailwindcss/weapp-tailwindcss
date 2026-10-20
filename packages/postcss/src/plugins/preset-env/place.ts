import type { Plugin } from 'postcss'
import valueParser from 'postcss-value-parser'

type Kind = 'content' | 'items' | 'self'
type Axis = 'align' | 'justify'

const positions = new Set(['center', 'start', 'end', 'flex-start', 'flex-end'])
const selfPositions = new Set(['self-start', 'self-end'])
const distributions = new Set(['space-between', 'space-around', 'space-evenly'])
const globalValues = new Set(['initial', 'inherit', 'unset', 'revert', 'revert-layer'])

function isPosition(value: string, kind: Kind, axis: Axis) {
  return positions.has(value)
    || (kind !== 'content' && selfPositions.has(value))
    || (axis === 'justify' && (value === 'left' || value === 'right'))
}

function isAlignment(tokens: string[], kind: Kind, axis: Axis) {
  if (tokens.length === 1) {
    const value = tokens[0]!
    return isPosition(value, kind, axis)
      || value === 'normal' || value === 'stretch'
      || (value === 'auto' && kind === 'self')
      || (distributions.has(value) && kind === 'content')
      || (value === 'baseline' && !(axis === 'justify' && kind === 'content'))
      || (value === 'legacy' && axis === 'justify' && kind === 'items')
  }
  if (tokens.length !== 2) {
    return false
  }
  const [first, second] = tokens as [string, string]
  return ((first === 'safe' || first === 'unsafe') && isPosition(second, kind, axis))
    || ((first === 'first' || first === 'last') && second === 'baseline' && !(axis === 'justify' && kind === 'content'))
    || (axis === 'justify' && kind === 'items'
      && ((first === 'legacy' && ['left', 'right', 'center'].includes(second))
        || (second === 'legacy' && ['left', 'right', 'center'].includes(first))))
}

function alignmentPair(value: string, kind: Kind): [string, string] | undefined {
  const nodes = valueParser(value).nodes.filter(node => node.type !== 'space' && node.type !== 'comment')
  // 变量替换可能提供两个完整值组，不能按一个 function token 推断简写边界。
  if (!nodes.length || nodes.some(node => node.type !== 'word')) {
    return undefined
  }
  const tokens = nodes.map(node => node.value.toLowerCase())
  if (tokens.length === 1 && globalValues.has(tokens[0]!)) {
    return [tokens[0]!, tokens[0]!]
  }
  for (const size of [2, 1]) {
    const align = tokens.slice(0, size)
    if (!isAlignment(align, kind, 'align')) {
      continue
    }
    const justify = tokens.slice(size)
    if (justify.length && !isAlignment(justify, kind, 'justify')) {
      continue
    }
    const alignValue = align.join(' ')
    const justifyValue = justify.length
      ? justify.join(' ')
      : kind === 'content' && align.at(-1) === 'baseline' ? 'start' : alignValue
    return [alignValue, justifyValue]
  }
  return undefined
}

/** 按 CSS Alignment 值组补足上游 place 插件的空格拆分边界，沿用 preset-env 的选择和保留设置。 */
export function preservePlaceValueGroups(plugin: Plugin, preserve = true): Plugin {
  return {
    ...plugin,
    Declaration(declaration) {
      const kind = /^place-(content|items|self)$/i.exec(declaration.prop)?.[1]?.toLowerCase() as Kind | undefined
      if (!kind) {
        return
      }
      const pair = alignmentPair(declaration.value, kind)
      if (!pair) {
        return
      }
      declaration.before([
        declaration.clone({ prop: `align-${kind}`, value: pair[0] }),
        declaration.clone({ prop: `justify-${kind}`, value: pair[1] }),
      ])
      if (!preserve) {
        declaration.remove()
      }
    },
  }
}
