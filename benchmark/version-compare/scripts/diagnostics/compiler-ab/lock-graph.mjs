import assert from 'node:assert/strict'

const withoutPeers = value => value.split('(')[0]
const packageName = id => id.slice(0, id.lastIndexOf('@'))
const patchHash = value => value.match(/^[^(]+\(patch_hash=([^()]+)\)/)?.[1]
const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value
const stable = value => JSON.stringify(ordered(value))
const fields = ['dependencies', 'optionalDependencies']
const compilerIds = allowed => new Set([...allowed].filter(id => packageName(id) === 'webpack'))

function externalAxisReference(child, allowed) {
  if (packageName(child.id) === 'webpack') return { axis: 'webpack' }
  // 配套 override 仅作用于编译器闭包；普通 consumer 不能借此改绑配套版本。
  return { fixedAxis: { id: child.id, patchHash: patchHash(child.key), peers: peerContext(child.key, compilerIds(allowed), false) } }
}

function target(lock, name, reference) {
  if (/^(?:link:|file:|workspace:)/.test(reference)) return { local: reference }
  const key = Object.hasOwn(lock.snapshots, reference) ? reference : `${name}@${reference}`
  assert.ok(Object.hasOwn(lock.snapshots, key), `非编译器引用缺少准确 snapshot：${name} -> ${reference}`)
  return { key, id: withoutPeers(key) }
}

function peerContext(key, allowed, ignoreOpaque) {
  let offset = key.indexOf('(')
  if (offset < 0) return ''
  function group() {
    assert.equal(key[offset++], '(')
    const start = offset
    while (offset < key.length && !['(', ')'].includes(key[offset])) offset += 1
    const identity = key.slice(start, offset)
    let children = ''
    while (key[offset] === '(') children += group()
    assert.equal(key[offset++], ')', `peer context 无效：${key}`)
    if (allowed.has(identity)) return `(<compiler-axis:${packageName(identity)}>)`
    if (ignoreOpaque && /^[a-f\d]{32,64}$/i.test(identity)) return '(<opaque-peer-context>)'
    return `(${identity}${children})`
  }
  let result = ''
  while (offset < key.length) result += group()
  return result
}

function graph(lock, allowed, side) {
  const nodes = []
  const byKey = new Map()
  for (const [key, value] of Object.entries(lock.snapshots)) {
    if (allowed.has(withoutPeers(key))) continue
    const node = { key, id: withoutPeers(key), side, edges: [], value, reachesAxis: false }
    nodes.push(node)
    byKey.set(key, node)
  }
  const parents = new Map(nodes.map(node => [node, []]))
  const pending = []
  for (const node of nodes) {
    for (const field of fields) {
      for (const [name, reference] of Object.entries(node.value[field] ?? {})) {
        const child = target(lock, name, reference)
        const edge = { name: `${field}:${name}` }
        if (child.local) edge.local = child.local
        else if (allowed.has(child.id)) {
          Object.assign(edge, externalAxisReference(child, allowed))
          if (edge.axis && !node.reachesAxis) { node.reachesAxis = true; pending.push(node) }
        }
        else {
          edge.node = byKey.get(child.key)
          assert.ok(edge.node)
          parents.get(edge.node).push(node)
        }
        node.edges.push(edge)
      }
    }
    node.edges.sort((a, b) => a.name.localeCompare(b.name, 'en'))
  }
  while (pending.length) {
    for (const parent of parents.get(pending.pop())) {
      if (!parent.reachesAxis) { parent.reachesAxis = true; pending.push(parent) }
    }
  }
  for (const node of nodes) {
    const metadata = Object.fromEntries(Object.entries(node.value).filter(([field]) => !fields.includes(field)))
    node.label = stable({ id: node.id, patchHash: patchHash(node.key), metadata, peers: peerContext(node.key, compilerIds(allowed), node.reachesAxis) })
  }
  return { lock, nodes, byKey, side }
}

function assign(nodes, signatures) {
  const identifiers = new Map([...new Set(signatures)].sort().map((signature, index) => [signature, index]))
  nodes.forEach((node, index) => { node.color = identifiers.get(signatures[index]) })
  return identifiers.size
}

function edgeSignature(edge) {
  return edge.node ? { name: edge.name, node: edge.node.color } : { name: edge.name, local: edge.local, axis: edge.axis, fixedAxis: edge.fixedAxis }
}

function normalizeSnapshots({ nodes }) {
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

function normalizeImporters({ lock, byKey, side }, allowed, compilerAxis) {
  const normalizeReference = (name, reference) => {
    const child = target(lock, name, reference)
    if (child.local) return { local: child.local }
    return allowed.has(child.id) ? externalAxisReference(child, allowed) : { node: byKey.get(child.key).color }
  }
  return Object.fromEntries(Object.entries(lock.importers).map(([key, value]) => [key,
    Object.fromEntries(Object.entries(value).map(([field, entries]) => [field,
      ['dependencies', 'devDependencies', 'optionalDependencies'].includes(field)
        ? Object.fromEntries(Object.entries(entries).map(([name, entry]) => [name, {
            ...entry,
            ...(key === compilerAxis.projectRelative && name === 'webpack' && entry.specifier === compilerAxis.versions[side]
              && withoutPeers(entry.version) === compilerAxis.versions[side] ? { specifier: '<target-compiler-manifest>' } : {}),
            version: normalizeReference(name, entry.version),
          }]))
        : entries,
    ])),
  ]))
}

/** 联合细分两侧 snapshot 图；仅编译器轴可变，保留边名、其余 peer 绑定和完整 metadata。 */
export function auditNonAxisGraph(current, previous, allowed, compilerAxis) {
  const left = graph(current, allowed, 'current')
  const right = graph(previous, allowed, 'previous')
  const nodes = [...left.nodes, ...right.nodes]
  let count = assign(nodes, nodes.map(node => node.label))
  let stablePartition = nodes.length === 0
  for (let round = 0; round < Math.min(nodes.length + 1, 256); round += 1) {
    const next = assign(nodes, nodes.map(node => stable({ previous: node.color, edges: node.edges.map(edgeSignature) })))
    if (next === count) { stablePartition = true; break }
    count = next
  }
  assert.ok(stablePartition, '锁图细分超过 256 轮，无法确认 peer 传播边界')
  assert.deepEqual(normalizeSnapshots(left), normalizeSnapshots(right), '非编译器依赖边或 peer 绑定发生漂移')
  assert.deepEqual(normalizeImporters(left, allowed, compilerAxis), normalizeImporters(right, allowed, compilerAxis), '非编译器 importer 发生漂移')
}
