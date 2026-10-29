import assert from 'node:assert/strict'
import { assign, compilerIds, edgeSignature, normalizeSnapshots, patchHash, peerContext, stable, target } from './lock-graph-core.mjs'
import { compilerBindingAuthority } from './lock-authority.mjs'
import { auditSnapshotProvenance } from './lock-provenance.mjs'

const fields = ['dependencies', 'optionalDependencies']

function importerGraph(lock, project, side, allowed, axis) {
  const nodes = [], byState = new Map(), roots = [], attachments = new Set(), parents = new Set(axis.parents)
  const fixed = child => ({ fixedAxis: { id: child.id, patchHash: patchHash(child.key), peers: peerContext(child.key, new Set(), false) } })
  function reference(name, value, authority, consumer) {
    const child = target(lock, name, value)
    if (child.local) return { local: child.local }
    if (allowed.has(child.id)) {
      if (child.id.startsWith('webpack@')) {
        authority = compilerBindingAuthority(lock, consumer, child, authority, axis, name)
        const attachment = `${authority}:${child.key}`
        if (!attachments.has(attachment)) {
          attachments.add(attachment)
          for (const field of fields) for (const [name, value] of Object.entries(lock.snapshots[child.key][field] ?? {})) {
            const companion = target(lock, name, value)
            if (authority && allowed.has(companion.id)) continue
            const merge = axis.optionalEsbuildMerge
            if (authority && merge && side === 'current' && project === axis.projectRelative && child.key === merge.current.compilerKey && name === 'terser-webpack-plugin') {
              assert.equal(companion.key, merge.current.terserKey, '可选 esbuild 配套入口身份不符')
              continue
            }
            roots.push({ field: `<${authority ? 'axis' : child.id}-compiler-${field}>`, name, reference: reference(name, value, authority, child.id) })
          }
        }
        if (authority) return { axis: 'webpack' }
      }
      return fixed(child)
    }
    authority ||= parents.has(child.id)
    const state = `${authority}:${child.key}`
    let node = byState.get(state)
    if (!node) {
      node = { key: child.key, id: child.id, side, authority, value: lock.snapshots[child.key], edges: [], reachesAxis: false }
      byState.set(state, node)
      nodes.push(node)
    }
    return { node }
  }
  for (const [field, entries] of Object.entries(lock.importers[project])) {
    if (!['dependencies', 'devDependencies', 'optionalDependencies'].includes(field)) { roots.push({ field, value: entries }); continue }
    for (const [name, entry] of Object.entries(entries)) {
      const spec = { ...entry }
      delete spec.version
      if (project === axis.projectRelative && name === 'webpack') {
        assert.equal(spec.specifier, axis.versions[side], '目标 manifest 必须是准确编译器版本')
        assert.equal(entry.version.split('(')[0], axis.versions[side], '目标必须实际解析准确编译器')
        spec.specifier = '<target-compiler-manifest>'
      }
      roots.push({ field, name, spec, reference: reference(name, entry.version, project === axis.projectRelative, `<importer:${project}>`) })
    }
  }
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]
    for (const field of fields) for (const [name, value] of Object.entries(node.value[field] ?? {})) node.edges.push({ name: `${field}:${name}`, ...reference(name, value, node.authority, node.id) })
    node.edges.sort((a, b) => a.name.localeCompare(b.name, 'en'))
  }
  const ancestors = new Map(nodes.map(node => [node, []])), pending = []
  for (const node of nodes) for (const edge of node.edges) {
    if (edge.node) ancestors.get(edge.node).push(node)
    if (edge.axis && !node.reachesAxis) { node.reachesAxis = true; pending.push(node) }
  }
  while (pending.length) for (const parent of ancestors.get(pending.pop())) if (!parent.reachesAxis) { parent.reachesAxis = true; pending.push(parent) }
  for (const node of nodes) {
    const metadata = Object.fromEntries(Object.entries(node.value).filter(([field]) => !fields.includes(field)))
    node.label = stable({ id: node.id, patchHash: patchHash(node.key), metadata, peers: peerContext(node.key, node.authority ? compilerIds(allowed) : new Set(), node.reachesAxis) })
  }
  return { nodes, roots }
}

/** 每个 importer 独立保留真实绑定与不透明上下文守卫；授权只能由目标 manifest 或精确父包路径传入。 */
export function auditImporterGraphs(current, previous, allowed, axis) {
  assert.deepEqual(Object.keys(current.importers).sort(), Object.keys(previous.importers).sort(), 'importer 集合不得变化')
  const importers = []
  for (const project of Object.keys(current.importers)) {
    const left = importerGraph(current, project, 'current', allowed, axis), right = importerGraph(previous, project, 'previous', allowed, axis)
    const nodes = [...left.nodes, ...right.nodes]
    let count = assign(nodes, nodes.map(node => node.label)), complete = nodes.length === 0
    for (let round = 0; round < Math.min(256, nodes.length + 1); round++) {
      const next = assign(nodes, nodes.map(node => stable({ previous: node.color, edges: node.edges.map(edgeSignature) })))
      if (next === count) { complete = true; break }
      count = next
    }
    assert.ok(complete, `importer 锁图细分超过上限：${project}`)
    assert.deepEqual(normalizeSnapshots(left), normalizeSnapshots(right), `importer 的非轴边、metadata 或 peer 绑定漂移：${project}`)
    const entries = graph => [...new Set(graph.roots.map(root => stable(root.reference ? { ...root, reference: edgeSignature(root.reference) } : root)))].sort()
    assert.deepEqual(entries(left), entries(right), `importer 的直接引用或编译器配套附着边漂移：${project}`)
    importers.push({ project, currentStates: left.nodes.length, previousStates: right.nodes.length })
  }
  return { importers, provenance: auditSnapshotProvenance(current, previous, allowed, axis) }
}
