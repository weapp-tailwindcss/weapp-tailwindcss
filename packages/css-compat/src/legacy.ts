import type { AtRule, ChildNode, Comment, Container, Root } from 'postcss'
import postcss from 'postcss'

interface LayerPath {
  key: string
  segments: string[]
}

interface LayerBucket extends LayerPath {
  nodes: ChildNode[]
}

const LAYER_PATH_SEPARATOR = '\u0001'
const LAYER_INSERTION_ANCHOR = '__weapp_tailwindcss_layer_anchor__'

function splitLayerNames(params: string) {
  return params
    .split(',')
    .map(name => name.trim())
    .filter(Boolean)
}

function splitLayerPath(name: string) {
  return name
    .split('.')
    .map(segment => segment.trim())
    .filter(Boolean)
}

function createLayerPath(segments: string[]): LayerPath {
  return {
    key: segments.join(LAYER_PATH_SEPARATOR),
    segments,
  }
}

function isContainer(node: ChildNode): node is ChildNode & Container {
  return 'nodes' in node && Array.isArray(node.nodes)
}

function cloneWrapper(node: ChildNode & Container, children: ChildNode[]) {
  const wrapper = node.clone({ nodes: [] }) as ChildNode & Container
  wrapper.append(...children)
  return wrapper
}

function wrapLayerNodes(atRule: AtRule, nodes: ChildNode[], root: Root) {
  let wrapped = nodes
  let parent: AtRule['parent'] | Root['parent'] = atRule.parent

  while (parent && parent !== root) {
    if (parent.type !== 'atrule' || parent.name !== 'layer') {
      if (isContainer(parent as ChildNode)) {
        wrapped = [cloneWrapper(parent as ChildNode & Container, wrapped)]
      }
    }
    parent = parent.parent
  }

  return wrapped
}

function removeEmptyLayerAncestors(node: AtRule, root: Root) {
  let parent = node.parent
  node.remove()
  while (parent && parent !== root && parent.type === 'atrule' && parent.nodes?.length === 0) {
    const nextParent = parent.parent
    parent.remove()
    parent = nextParent
  }
}

function isLayerDescendant(candidate: string[], parent: string[]) {
  return candidate.length > parent.length && parent.every((segment, index) => candidate[index] === segment)
}

function findParentLayerPath(atRule: AtRule, paths: WeakMap<AtRule, LayerPath>) {
  let parent: AtRule['parent'] | Root['parent'] = atRule.parent
  while (parent) {
    if (parent.type === 'atrule' && parent.name === 'layer') {
      return paths.get(parent)?.segments ?? []
    }
    parent = parent.parent
  }
  return []
}

function createLayerInsertionAnchor(root: Root, atRule: AtRule) {
  let topLevelNode: ChildNode = atRule
  while (topLevelNode.parent && topLevelNode.parent !== root) {
    topLevelNode = topLevelNode.parent as ChildNode
  }
  const anchor = postcss.comment({ text: LAYER_INSERTION_ANCHOR })
  topLevelNode.before(anchor)
  return anchor
}

function insertLayeredNodes(root: Root, anchor: Comment, nodes: ChildNode[]) {
  if (!anchor.parent) {
    root.append(nodes)
    return
  }
  if (nodes.length === 0) {
    anchor.remove()
    return
  }
  anchor.replaceWith(nodes)
}

/**
 * 按 cascade layer 声明顺序重排规则并移除 `@layer` 语法。
 *
 * 该转换只模拟 layer 的顺序语义，不通过提高选择器权重模拟完整 specificity 规则。
 */
export function consumeCascadeLayers(root: Root) {
  const layerAtRules: AtRule[] = []
  const paths = new WeakMap<AtRule, LayerPath>()
  const siblingOrders = new Map<string, Map<string, number>>()
  const buckets = new Map<string, LayerBucket>()
  const topLayerOccurrences = new Map<string, AtRule>()
  let anonymousLayerIndex = 0

  const registerPath = (segments: string[], occurrence: AtRule) => {
    let parentKey = ''
    for (const [index, segment] of segments.entries()) {
      let siblings = siblingOrders.get(parentKey)
      if (!siblings) {
        siblings = new Map()
        siblingOrders.set(parentKey, siblings)
      }
      if (!siblings.has(segment)) {
        siblings.set(segment, siblings.size)
      }
      if (index === 0 && !topLayerOccurrences.has(segment)) {
        topLayerOccurrences.set(segment, occurrence)
      }
      parentKey = parentKey ? `${parentKey}${LAYER_PATH_SEPARATOR}${segment}` : segment
    }

    const path = createLayerPath(segments)
    if (!buckets.has(path.key)) {
      buckets.set(path.key, { ...path, nodes: [] })
    }
    return path
  }

  root.walkAtRules('layer', (atRule) => {
    layerAtRules.push(atRule)
    const parentLayer = findParentLayerPath(atRule, paths)
    const names = splitLayerNames(atRule.params)

    if (!atRule.nodes) {
      for (const name of names) {
        registerPath([...parentLayer, ...splitLayerPath(name)], atRule)
      }
      return
    }

    const ownSegments = names[0]
      ? splitLayerPath(names[0])
      : [`\u0000anonymous-${anonymousLayerIndex++}`]
    paths.set(atRule, registerPath([...parentLayer, ...ownSegments], atRule))
  })

  if (layerAtRules.length === 0) {
    return
  }
  const insertionAnchors = new Map<string, Comment>()
  for (const [segment, occurrence] of topLayerOccurrences) {
    insertionAnchors.set(segment, createLayerInsertionAnchor(root, occurrence))
  }

  for (const atRule of [...layerAtRules].reverse()) {
    if (!atRule.parent) {
      continue
    }
    const path = paths.get(atRule)
    if (!path || !atRule.nodes) {
      removeEmptyLayerAncestors(atRule, root)
      continue
    }

    const nodes = atRule.nodes.map(node => node.clone())
    if (nodes.length > 0) {
      buckets.get(path.key)?.nodes.unshift(...wrapLayerNodes(atRule, nodes, root))
    }
    removeEmptyLayerAncestors(atRule, root)
  }

  const compareBuckets = (left: LayerBucket, right: LayerBucket) => {
    if (isLayerDescendant(left.segments, right.segments)) {
      return -1
    }
    if (isLayerDescendant(right.segments, left.segments)) {
      return 1
    }

    const size = Math.min(left.segments.length, right.segments.length)
    let parentKey = ''
    for (let index = 0; index < size; index++) {
      const leftSegment = left.segments[index]!
      const rightSegment = right.segments[index]!
      if (leftSegment !== rightSegment) {
        const siblings = siblingOrders.get(parentKey)
        return (siblings?.get(leftSegment) ?? 0) - (siblings?.get(rightSegment) ?? 0)
      }
      parentKey = parentKey
        ? `${parentKey}${LAYER_PATH_SEPARATOR}${leftSegment}`
        : leftSegment
    }
    return left.segments.length - right.segments.length
  }

  const bucketsByTopLayer = new Map<string, LayerBucket[]>()
  for (const bucket of buckets.values()) {
    const topLayer = bucket.segments[0]
    if (!topLayer || bucket.nodes.length === 0) {
      continue
    }
    const group = bucketsByTopLayer.get(topLayer) ?? []
    group.push(bucket)
    bucketsByTopLayer.set(topLayer, group)
  }

  for (const [segment, anchor] of insertionAnchors) {
    const layeredNodes = (bucketsByTopLayer.get(segment) ?? [])
      .sort(compareBuckets)
      .flatMap(bucket => bucket.nodes)
    insertLayeredNodes(root, anchor, layeredNodes)
  }
}
