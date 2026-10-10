import type { AtRule } from 'postcss'
import type { Layer } from './model'
import type { Reporter } from './reporter'
import { tokenize, TokenType } from '@csstools/css-tokenizer'
import { atRuleName } from './names'

interface Definition { node: AtRule, layer: Layer }
interface Definitions {
  all: Definition[]
  unknown: Definition[]
  named: Map<string, Definition[]>
}

const namedTypes = new Set(['keyframes', 'property', 'counter-style', 'font-palette-values', 'position-try'])

function identity(node: AtRule, type: string) {
  if (!namedTypes.has(type)) {
    return undefined
  }
  const tokens = tokenize({ css: node.params }).filter(token => ![TokenType.Whitespace, TokenType.Comment, TokenType.EOF].includes(token[0]))
  const token = tokens[0]
  if (tokens.length === 1 && token && (token[0] === TokenType.Ident || (type === 'keyframes' && token[0] === TokenType.String))) {
    return token[4].value
  }
  return undefined
}

/** 两个不同层的代表足以判断后续定义是否跨层，不做 descriptor 成对扫描。 */
function remember(definitions: Definition[], definition: Definition) {
  if (definitions.length < 2 && !definitions.some(item => item.layer === definition.layer)) {
    definitions.push(definition)
  }
}

export function createDescriptorRegistry(reporter: Reporter) {
  const types = new Map<string, Definitions>()
  return (node: AtRule, layer: Layer) => {
    const type = atRuleName(node).replace(/^-(?:webkit|moz|o)-keyframes$/, 'keyframes')
    let definitions = types.get(type)
    if (!definitions) {
      definitions = { all: [], unknown: [], named: new Map() }
      types.set(type, definitions)
    }
    const name = identity(node, type)
    const named = name === undefined ? [] : definitions.named.get(name) ?? []
    const candidates = name === undefined ? definitions.all : [...named, ...definitions.unknown]
    const previous = candidates.find(item => item.layer !== layer)
    if (previous) {
      reporter.warn(node, 'LAYER_DESCRIPTOR_ORDER', `跨层 @${node.name} ${node.params} 的命名语义需单独验证。`, '消除跨层同名或身份不明确的定义，或在支持原生 layer 的目标使用 preserve。', { related: previous.node, layer: layer.label })
    }
    const definition = { node, layer }
    remember(definitions.all, definition)
    if (name === undefined) {
      remember(definitions.unknown, definition)
    }
    else {
      remember(named, definition)
      definitions.named.set(name, named)
    }
  }
}
