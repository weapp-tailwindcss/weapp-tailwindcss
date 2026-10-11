import type { Input, Node, Position, Root } from 'postcss'
import { fingerprintOptions } from './fingerprint'

const traversalFields = new Set(['parent', 'nodes', 'source', 'raws', 'lastEach', 'indexes', 'rawCache', 'proxyCache'])

interface FieldsSnapshot {
  keys: string[]
  values: unknown[]
}

interface InputSnapshot {
  input: Input
  css: string
  file: string | undefined
  hasBOM: boolean
  map: string | undefined
}

interface NodeSnapshot {
  fields: FieldsSnapshot
  raws: FieldsSnapshot
  children: number | undefined
  source?: { input: number, start: Position | undefined, end: Position | undefined }
}

export interface RootCacheSnapshot {
  nodes: NodeSnapshot[]
  inputs: InputSnapshot[]
}

function captureFields(value: object, shapes: Map<string, string[]>, ignored?: ReadonlySet<string>): FieldsSnapshot {
  const ownKeys: string[] = []
  for (const key in value) {
    if (Object.hasOwn(value, key) && !ignored?.has(key)) {
      ownKeys.push(key)
    }
  }
  const shape = JSON.stringify(ownKeys)
  const keys = shapes.get(shape) ?? ownKeys
  shapes.set(shape, keys)
  const values = keys.map((key) => {
    const entry = (value as Record<string, unknown>)[key]
    return entry !== null && typeof entry === 'object' ? { fingerprint: fingerprintOptions(entry) } : entry
  })
  return { keys, values }
}

function matchesFields(snapshot: FieldsSnapshot, value: object, ignored?: ReadonlySet<string>) {
  let size = 0
  for (const key in value) {
    if (Object.hasOwn(value, key) && !ignored?.has(key)) {
      size++
    }
  }
  if (size !== snapshot.keys.length) {
    return false
  }
  for (let index = 0; index < size; index++) {
    const key = snapshot.keys[index]!
    if (!Object.hasOwn(value, key)) {
      return false
    }
    const entry = (value as Record<string, unknown>)[key]
    const previous = snapshot.values[index]
    if (previous !== null && typeof previous === 'object') {
      if (fingerprintOptions(entry) !== (previous as { fingerprint: string }).fingerprint) {
        return false
      }
    }
    else if (!Object.is(entry, previous)) {
      return false
    }
  }
  return true
}

function inputMap(input: Input) {
  return input.map ? JSON.stringify((input.toJSON() as { map?: unknown }).map) : undefined
}

function childrenCount(node: Node) {
  return 'nodes' in node && Array.isArray(node.nodes) ? node.nodes.length : undefined
}

function samePosition(left: Position | undefined, right: Position | undefined) {
  return Boolean(left) === Boolean(right) && left?.offset === right?.offset && left?.line === right?.line && left?.column === right?.column
}

/** 未命中时保存语义与来源快照；命中检查不再为整棵 AST 构造 JSON 字符串。 */
export function captureRootCacheSnapshot(root: Root): RootCacheSnapshot {
  const snapshot: RootCacheSnapshot = { nodes: [], inputs: [] }
  const inputIds = new Map<Input, number>()
  const shapes = new Map<string, string[]>()
  const capture = (node: Node) => {
    let source: NodeSnapshot['source']
    if (node.source) {
      const input = node.source.input
      let id = inputIds.get(input)
      if (id === undefined) {
        id = inputIds.size
        inputIds.set(input, id)
        snapshot.inputs.push({ input, css: input.css, file: input.file, hasBOM: input.hasBOM, map: inputMap(input) })
      }
      source = { input: id, start: node.source.start ? { ...node.source.start } : undefined, end: node.source.end ? { ...node.source.end } : undefined }
    }
    snapshot.nodes.push({ fields: captureFields(node, shapes, traversalFields), raws: captureFields(node.raws, shapes), children: childrenCount(node), ...(source ? { source } : {}) })
  }
  capture(root)
  root.walk(capture)
  return snapshot
}

/** 返回本轮 Input 绑定；结构、语义字段、来源或映射不同均不得复用。 */
export function matchRootCacheSnapshot(snapshot: RootCacheSnapshot, root: Root) {
  const inputIds = new Map<Input, number>()
  const bindings = new Map<Input, Input>()
  let index = 0
  let matched = true
  const compare = (node: Node): false | undefined => {
    const previous = snapshot.nodes[index++]
    if (!previous || previous.children !== childrenCount(node) || !matchesFields(previous.fields, node, traversalFields) || !matchesFields(previous.raws, node.raws)
      || Boolean(previous.source) !== Boolean(node.source)) {
      matched = false
      return false
    }
    if (node.source && previous.source) {
      const input = node.source.input
      let id = inputIds.get(input)
      if (id === undefined) {
        id = inputIds.size
        inputIds.set(input, id)
        const old = snapshot.inputs[id]
        if (!old || old.css !== input.css || old.file !== input.file || old.hasBOM !== input.hasBOM || old.map !== inputMap(input)) {
          matched = false
          return false
        }
        if (old.input !== input) {
          bindings.set(old.input, input)
        }
      }
      if (id !== previous.source.input || !samePosition(previous.source.start, node.source.start) || !samePosition(previous.source.end, node.source.end)) {
        matched = false
        return false
      }
    }
  }
  if (compare(root) !== false) {
    root.walk(compare)
  }
  return matched && index === snapshot.nodes.length ? bindings : undefined
}

export function cloneRootWithCurrentSources(cached: Root, bindings?: ReadonlyMap<Input, Input>) {
  const cloned = cached.clone()
  if (!bindings?.size) {
    return cloned
  }
  const rebind = (node: Node) => {
    const source = node.source
    const input = source && bindings.get(source.input)
    if (source && input) {
      node.source = { ...source, input }
    }
  }
  rebind(cloned)
  cloned.walk(rebind)
  return cloned
}
