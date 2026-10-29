import assert from 'node:assert/strict'
import { isDeepStrictEqual } from 'node:util'
import { compilerBindingAuthority } from './lock-authority.mjs'
import { target, withoutPeers } from './lock-graph-core.mjs'

const fields = ['dependencies', 'optionalDependencies']

/** 逐 importer 追踪实际 snapshot 身份与授权状态，不从规范化颜色推断来源。 */
export function traceSnapshots(lock, axis) {
  const references = new Map()
  const incoming = new Map(Object.keys(lock.snapshots).map(key => [key, []]))
  const parents = new Set(axis.parents)
  for (const [project, importer] of Object.entries(lock.importers)) {
    const pending = [], seen = new Set()
    function add(name, reference, authority, route, origin) {
      const child = target(lock, name, reference)
      if (child.local) return
      if (Object.hasOwn(origin, 'project')) incoming.get(child.key).push(origin)
      authority ||= parents.has(child.id)
      if (child.id === `webpack@${axis.versions.current}` || child.id === `webpack@${axis.versions.previous}`) authority = compilerBindingAuthority(lock, origin.parent ? withoutPeers(origin.parent) : `<importer:${project}>`, child, authority, axis, name)
      const state = `${authority}:${child.key}`
      if (seen.has(state)) return
      seen.add(state)
      const paths = references.get(child.key) ?? []
      const path = [...route, { name, key: child.key }]
      paths.push({ project, authority, path })
      references.set(child.key, paths)
      pending.push({ child, authority, path })
    }
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) for (const [name, entry] of Object.entries(importer[field] ?? {})) {
      add(name, entry.version, project === axis.projectRelative, [], { project, field, name })
    }
    for (let index = 0; index < pending.length; index++) {
      const { child, authority, path } = pending[index]
      for (const field of fields) for (const [name, reference] of Object.entries(lock.snapshots[child.key][field] ?? {})) {
        add(name, reference, authority, path, { parent: child.key, field, name })
      }
    }
  }
  for (const [parent, value] of Object.entries(lock.snapshots)) for (const field of fields) for (const [name, reference] of Object.entries(value[field] ?? {})) {
    const child = target(lock, name, reference)
    if (!child.local) incoming.get(child.key).push({ parent, field, name })
  }
  // 同一个 snapshot 可被多个 importer 访问；incoming 记录实际边，去掉遍历产生的重复。
  for (const [key, values] of incoming) incoming.set(key, [...new Map(values.map(value => [JSON.stringify(value), value])).values()])
  return { references, incoming }
}

export function auditSnapshotProvenance(current, previous, allowed, axis) {
  const traces = { current: traceSnapshots(current, axis), previous: traceSnapshots(previous, axis) }
  const changes = [], unused = { current: [], previous: [] }, fixedAxisSnapshots = new Set()
  for (const key of new Set([...Object.keys(current.snapshots), ...Object.keys(previous.snapshots)])) {
    const before = current.snapshots[key], after = previous.snapshots[key]
    const left = traces.current.references.get(key) ?? [], right = traces.previous.references.get(key) ?? []
    if (!left.length && before) unused.current.push(key)
    if (!right.length && after) unused.previous.push(key)
    if (allowed.has(withoutPeers(key)) && [...left, ...right].some(route => !route.authority)) {
      assert.deepEqual(before, after, `非轴路径消费的轴包 snapshot 必须逐项原样：${key}`)
      assert.deepEqual(current.packages[withoutPeers(key)], previous.packages[withoutPeers(key)], `非轴路径消费的轴包源码 metadata 必须原样：${key}`)
      fixedAxisSnapshots.add(key)
    }
    if (isDeepStrictEqual(before, after)) continue
    if (!left.length && !right.length) assert.fail(`不可达 snapshot 发生漂移：${key}`)
    const status = !before ? 'added' : !after ? 'removed' : 'changed'
    if (status !== 'changed') {
      const routes = status === 'added' ? right : left
      assert.ok(routes.length && routes.every(route => route.authority), `新增/移除 snapshot 来自未授权路径：${key}`)
    }
    changes.push({ key, status, current: left, previous: right, incoming: { current: traces.current.incoming.get(key) ?? [], previous: traces.previous.incoming.get(key) ?? [] } })
  }
  return { changes, unused, fixedAxisSnapshots: [...fixedAxisSnapshots].sort() }
}
