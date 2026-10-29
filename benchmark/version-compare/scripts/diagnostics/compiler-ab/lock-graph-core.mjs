import assert from 'node:assert/strict'

export const withoutPeers = value => value.split('(')[0]
export const packageName = id => id.slice(0, id.lastIndexOf('@'))
export const patchHash = value => value.match(/^[^(]+\(patch_hash=([^()]+)\)/)?.[1]
const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value
export const stable = value => JSON.stringify(ordered(value))
export const compilerIds = allowed => new Set([...allowed].filter(id => packageName(id) === 'webpack'))

export function target(lock, name, reference) {
  const key = Object.hasOwn(lock.snapshots, reference) ? reference : `${name}@${reference}`
  if (/^(?:link:|workspace:)/.test(reference) || (reference.startsWith('file:') && !Object.hasOwn(lock.snapshots, key))) return { local: reference }
  assert.ok(Object.hasOwn(lock.snapshots, key), `非编译器引用缺少准确 snapshot：${name} -> ${reference}`)
  return { key, id: withoutPeers(key) }
}

export function peerContext(key, allowed, ignoreOpaque, optionalCliConsumers, transitiveCli = false, rootMappings) {
  let offset = key.indexOf('(')
  if (offset < 0) return ''
  function group(parentIdentity, root = false) {
    assert.equal(key[offset++], '(')
    const start = offset
    while (offset < key.length && !['(', ')'].includes(key[offset])) offset += 1
    const identity = key.slice(start, offset)
    let children = ''
    while (key[offset] === '(') children += group(identity)
    assert.equal(key[offset++], ')', `peer context 无效：${key}`)
    if (root && rootMappings?.has(identity)) return `(${rootMappings.get(identity)}${children})`
    if ((optionalCliConsumers?.has(parentIdentity) || (root && transitiveCli)) && identity.startsWith('webpack-cli@')) return ''
    if (allowed.has(identity)) return `(<compiler-axis:${packageName(identity)}>)`
    if (ignoreOpaque && /^[a-f\d]{32,64}$/i.test(identity)) return '(<opaque-peer-context>)'
    return `(${identity}${children})`
  }
  let result = ''
  while (offset < key.length) result += group(withoutPeers(key), true)
  return result
}

/** 仅在准确 consumer 的 peer group 内去掉可选 CLI 身份，保留其它嵌套上下文。 */
export function optionalCliContextKey(key, consumers) {
  return withoutPeers(key) + peerContext(key, new Set(), false, consumers)
}

export function assign(nodes, signatures) {
  const identifiers = new Map([...new Set(signatures)].sort().map((signature, index) => [signature, index]))
  nodes.forEach((node, index) => { node.color = identifiers.get(signatures[index]) })
  return identifiers.size
}

export function edgeSignature(edge) {
  return edge.node ? { name: edge.name, node: edge.node.color } : { name: edge.name, local: edge.local, axis: edge.axis, fixedAxis: edge.fixedAxis }
}

export function normalizeSnapshots({ nodes }) {
  const result = new Map()
  const opaque = new Map()
  for (const node of nodes) {
    const colors = result.get(node.id) ?? new Set()
    colors.add(node.color)
    result.set(node.id, colors)
    if (node.label.includes('<opaque-peer-context>')) {
      const keys = opaque.get(node.color) ?? new Set()
      keys.add(node.key)
      opaque.set(node.color, keys)
    }
  }
  // 多个不透明上下文若无法从依赖图区分，不能推断它们可以互换。
  for (const keys of opaque.values()) assert.equal(keys.size, 1, `不透明 peer context 存在歧义：${[...keys].join(', ')}`)
  return Object.fromEntries([...result].sort().map(([id, colors]) => [id, [...colors].sort((a, b) => a - b)]))
}

/** 精确规范化已列出的根 peer，嵌套 peer 身份保持不变。 */
export function rootPeerContextKey(key, mappings) {
  return withoutPeers(key) + peerContext(key, new Set(), false, undefined, false, mappings)
}
