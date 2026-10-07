import valueParser from 'postcss-value-parser'
import { loadNativeCssBinding, nativeCssConfigured } from '../../../native/binding'
import { TW_GRADIENT_POSITION_PROPS } from '../variables'

function normalizeTailwindcssV4EmptyVarFallback(value: string) {
  if (!value.includes('var(') || !value.includes('--tw-')) {
    return value
  }

  const parsed = valueParser(value)
  let changed = false

  parsed.walk((node) => {
    if (node.type !== 'function' || node.value.toLowerCase() !== 'var') {
      return
    }

    const firstArg = node.nodes.find(child => child.type !== 'space')
    const lastArg = node.nodes.findLast(child => child.type !== 'space')
    if (
      firstArg?.type !== 'word'
      || !firstArg.value.startsWith('--tw-')
      || lastArg?.type !== 'div'
      || lastArg.value !== ','
      || node.after === ' '
    ) {
      return
    }

    node.after = ' '
    changed = true
  })

  return changed ? parsed.toString() : value
}

function normalizeTailwindcssV4GradientStopsFallback(value: string) {
  if (!value.includes('var(') || !value.includes('--tw-gradient-via-stops')) {
    return value
  }

  const parsed = valueParser(value)
  let changed = false

  function normalizeNodes(nodes: valueParser.Node[]) {
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index]
      if (!node) {
        continue
      }
      if (node.type === 'function' && node.value.toLowerCase() !== 'var') {
        normalizeNodes(node.nodes)
        continue
      }
      if (node.type !== 'function') {
        continue
      }

      const args = node.nodes.filter(child => child.type !== 'space')
      const firstArg = args[0]
      if (
        firstArg?.type !== 'word'
        || firstArg.value !== '--tw-gradient-via-stops'
      ) {
        normalizeNodes(node.nodes)
        continue
      }

      const firstCommaIndex = node.nodes.findIndex(child => child.type === 'div' && child.value === ',')
      if (firstCommaIndex < 0) {
        continue
      }

      const fallbackNodes = node.nodes.slice(firstCommaIndex + 1)
      const splitIndex = fallbackNodes.findIndex(child => child.type === 'div' && child.value === ',')
      if (splitIndex < 0) {
        continue
      }

      const viaFallbackNodes = fallbackNodes.slice(0, splitIndex)
      const stopNodes = fallbackNodes.slice(splitIndex)
      const nextVarNode = {
        ...node,
        nodes: [
          { type: 'word', value: '--tw-gradient-via-stops' },
          { type: 'div', value: ',', before: '', after: ' ' },
          ...viaFallbackNodes,
        ],
        sourceEndIndex: undefined,
        sourceIndex: undefined,
      }
      nodes.splice(index, 1, nextVarNode, ...stopNodes)
      changed = true
      index += stopNodes.length
    }
  }

  normalizeNodes(parsed.nodes)

  return changed ? parsed.toString() : value
}

function normalizeTailwindcssV4GradientPositionFallback(value: string) {
  if (!value.includes('var(') || !value.includes('--tw-gradient-')) {
    return value
  }

  const parsed = valueParser(value)
  let changed = false

  parsed.walk((node) => {
    if (node.type !== 'function' || node.value.toLowerCase() !== 'var') {
      return
    }

    const args = node.nodes.filter(child => child.type !== 'space')
    const firstArg = args[0]
    if (
      firstArg?.type !== 'word'
      || !TW_GRADIENT_POSITION_PROPS.has(firstArg.value)
    ) {
      return
    }
    const commaIndex = args.findIndex(child => child.type === 'div' && child.value === ',')
    const comma = commaIndex === -1 ? undefined : args[commaIndex]
    if (comma) {
      const hasFallback = args.slice(commaIndex + 1).some(child => child.type !== 'space')
      if (!hasFallback && node.after !== ' ') {
        node.after = ' '
        changed = true
      }
      return
    }

    node.nodes.push({
      type: 'div',
      value: ',',
      before: '',
      after: '',
    })
    node.after = ' '
    changed = true
  })

  return changed ? parsed.toString() : value
}

export function normalizeV4VariableFallbacksLegacy(value: string) {
  return normalizeTailwindcssV4GradientPositionFallback(normalizeTailwindcssV4GradientStopsFallback(normalizeTailwindcssV4EmptyVarFallback(value)))
}

/** 三个项目自有兼容阶段在一次原生调用中处理；不完整值继续由原解析器处理。 */
export function normalizeV4VariableFallbacks(value: string) {
  if (!value.includes('var(') || !value.includes('--tw-')) {
    return value
  }
  return (nativeCssConfigured ? loadNativeCssBinding()?.normalizeV4VariableFallbacks(value) : undefined)
    ?? normalizeV4VariableFallbacksLegacy(value)
}
