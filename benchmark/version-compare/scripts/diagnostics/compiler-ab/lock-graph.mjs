import assert from 'node:assert/strict'
import { assign, compilerIds, edgeSignature, normalizeSnapshots, packageName, patchHash, peerContext, stable, target, withoutPeers } from './lock-graph-core.mjs'
import { auditImporterGraphs } from './lock-roots.mjs'
export { optionalCliContextKey } from './lock-graph-core.mjs'

const fields = ['dependencies', 'optionalDependencies']

function externalAxisReference(child, allowed) {
  if (packageName(child.id) === 'webpack') return { axis: 'webpack' }
  // 配套 override 仅作用于编译器闭包；普通 consumer 不能借此改绑配套版本。
  return { fixedAxis: { id: child.id, patchHash: patchHash(child.key), peers: peerContext(child.key, compilerIds(allowed), false) } }
}

function graph(lock, allowed, side, optionalCliConsumers) {
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
        if (optionalCliConsumers?.has(node.id) && field === 'optionalDependencies' && name === 'webpack-cli') continue
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
          if (optionalCliConsumers?.has(child.id) && !node.reachesAxis) { node.reachesAxis = true; pending.push(node) }
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
    const transitiveCli = Boolean(optionalCliConsumers && node.reachesAxis && node.value.transitivePeerDependencies?.includes('webpack-cli') && !Object.hasOwn(lock.packages[node.id].peerDependencies ?? {}, 'webpack-cli'))
    if (transitiveCli && metadata.transitivePeerDependencies) {
      metadata.transitivePeerDependencies = metadata.transitivePeerDependencies.filter(name => name !== 'webpack-cli')
      if (!metadata.transitivePeerDependencies.length) delete metadata.transitivePeerDependencies
    }
    node.label = stable({ id: node.id, patchHash: patchHash(node.key), metadata, peers: peerContext(node.key, compilerIds(allowed), node.reachesAxis, optionalCliConsumers, transitiveCli) })
  }
  return { lock, nodes, byKey, side }
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
  if (compilerAxis.projectRelative && compilerAxis.parents) return auditImporterGraphs(current, previous, allowed, compilerAxis)
  const left = graph(current, allowed, 'current', compilerAxis.optionalCliConsumers)
  const right = graph(previous, allowed, 'previous', compilerAxis.optionalCliConsumers)
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
